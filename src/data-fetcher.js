// Live space-weather ingestion from NOAA SWPC (solar wind, Kp, GOES X-ray).
// This is the *wallclock* driver of the shared MagnetosphereModel: it polls
// NOAA, parses the raw L1 series, and feeds assembled samples into the model
// stamped with Date.now(). All the physics (Shue standoff, Burton/O'Brien Dst
// ODE, L1 advection lag, Kp low-pass) lives in magnetosphere-model.js — shared
// byte-for-byte with the curated-storm TimelineSource so live and replay obey
// identical dynamics.

import { MagnetosphereModel } from './magnetosphere-model.js';
import { Hp30Source } from './hp30-source.js';

const BASE = 'https://services.swpc.noaa.gov';

// NOTE (2026-07): SWPC removed the whole /products/solar-wind/ directory
// (mag-2-hour.json, plasma-2-hour.json now 404). The RTSW JSON feeds replace
// them: newest-first array-of-objects, several spacecraft interleaved with
// `active: true` marking the primary source. CORS is open on all of these —
// no proxy needed for NOAA.
const ENDPOINTS = {
    mag:    `${BASE}/json/rtsw/rtsw_mag_1m.json`,
    plasma: `${BASE}/json/rtsw/rtsw_wind_1m.json`,
    kp:     `${BASE}/products/noaa-planetary-k-index.json`,
    xray:   `${BASE}/json/goes/primary/xrays-1-day.json`,
};

const POLL_MS = { mag: 60_000, plasma: 60_000, kp: 180_000, xray: 60_000 };

const STALE_MS = 900_000; // 15 min

// Handles both SWPC formats:
//   Array-of-Arrays: row[0] = string[] headers, rows[1..] = data
//   Array-of-Objects: each element is already a plain object
function parseAoA(rows) {
    if (!Array.isArray(rows) || rows.length < 1) return null;
    const first = rows[0];

    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
        // Array-of-objects: scan from end for first row with any non-null value
        for (let i = rows.length - 1; i >= 0; i--) {
            const obj = rows[i];
            if (obj && Object.values(obj).some(v => v !== null && v !== undefined)) return obj;
        }
        return null;
    }

    // Array-of-arrays: row[0] = headers
    if (!Array.isArray(first) || rows.length < 2) return null;
    for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        const obj = {};
        first.forEach((h, j) => { obj[h] = row[j]; });
        if (first.slice(1).some(h => obj[h] !== null && obj[h] !== undefined)) return obj;
    }
    return null;
}

// RTSW feeds (json/rtsw/*): newest-first rows, spacecraft interleaved.
// Prefer the newest `active: true` row whose required fields are all finite;
// fall back to any usable row so a source handover doesn't blank the model.
function parseRtsw(rows, need) {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
        if (!row || !row.active) continue;
        if (need.every(f => Number.isFinite(row[f]))) return row;
    }
    for (const row of rows) {
        if (row && need.every(f => Number.isFinite(row[f]))) return row;
    }
    return null;
}

// GOES xray: filter for long channel (1–8 Å = 0.1–0.8 nm); handles both row formats
function parseXray(rows) {
    if (!Array.isArray(rows) || rows.length < 1) return null;
    const first = rows[0];

    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
        // Array-of-objects
        for (let i = rows.length - 1; i >= 0; i--) {
            const obj = rows[i];
            if (!obj || obj.flux === null || obj.flux === undefined) continue;
            if (obj.energy && !String(obj.energy).includes('0.1-0.8')) continue;
            return obj;
        }
        // Fallback: any row with flux
        for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i] && rows[i].flux != null) return rows[i];
        }
        return null;
    }

    // Array-of-arrays
    if (!Array.isArray(first) || rows.length < 2) return null;
    const eIdx = first.indexOf('energy');
    for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        if (eIdx >= 0 && row[eIdx] && !String(row[eIdx]).includes('0.1-0.8')) continue;
        const obj = {};
        first.forEach((h, j) => { obj[h] = row[j]; });
        if (obj.flux !== null && obj.flux !== undefined) return obj;
    }
    return parseAoA(rows);
}

export class DataFetcher {
    constructor() {
        this._raw     = {};
        this._model   = new MagnetosphereModel();
        this._hp30    = new Hp30Source();
        this._active  = false;
        this._timers  = [];
        this._everIngested = false;
    }

    start() {
        this._active = true;
        for (const [key, url] of Object.entries(ENDPOINTS)) {
            this._schedule(key, url, POLL_MS[key]);
        }
        this._hp30.start();
    }

    stop() {
        this._active = false;
        this._timers.forEach(clearTimeout);
        this._timers = [];
        this._hp30.stop();
    }

    _schedule(key, url, interval) {
        const run = async () => {
            if (!this._active) return;
            try {
                const r = await fetch(url);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                this._ingest(key, await r.json());
            } catch (e) {
                console.warn(`[DataFetcher] ${key}: ${e.message}`);
            }
            if (this._active) this._timers.push(setTimeout(run, interval));
        };
        run();
    }

    _ingest(key, raw) {
        this._raw[key] =
            key === 'xray'   ? parseXray(raw) :
            key === 'mag'    ? parseRtsw(raw, ['bz_gsm', 'bt']) :
            key === 'plasma' ? parseRtsw(raw, ['proton_speed', 'proton_density']) :
                               parseAoA(raw);

        // Assemble one raw L1 sample from whatever endpoints have reported so
        // far; missing fields fall back to the model's DEFAULTS.
        const m = this._raw.mag    || {};
        const p = this._raw.plasma || {};
        const k = this._raw.kp     || {};
        const x = this._raw.xray   || {};
        const sample = {
            bz:      m.bz_gsm,
            bt:      m.bt,
            bx:      m.bx_gsm,
            by:      m.by_gsm,
            density: p.proton_density,
            speed:   p.proton_speed,
            kp:      k.kp,
            flux:    x.flux,
        };

        this._model.ingest(sample, Date.now());

        if (!this._everIngested) {
            this._everIngested = true;
            console.log('[DataFetcher] first data:', this.toUniforms());
        }
    }

    getAge() {
        return this._model.hasData ? Date.now() - this._model.updateTime : Infinity;
    }

    get isStale() {
        return this.getAge() > STALE_MS;
    }

    // Magnetosphere-frame uniforms + live-provenance fields — call every frame.
    toUniforms() {
        const age = this.getAge();
        return {
            ...this._model.sampleUniforms(Date.now()),
            dataAge: isFinite(age) ? age / 1000 : 0,
            isStale: this.isStale,
            hp30:    this._hp30.valueAt(Date.now()),
        };
    }
}
