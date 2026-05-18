// Live space-weather ingestion from NOAA SWPC (solar wind, Kp, GOES X-ray).
// Derives the Shue (1997) magnetopause parameters and solar-wind dynamic
// pressure, and frame-interpolates between polls for smooth visuals.

const BASE = 'https://services.swpc.noaa.gov';

const ENDPOINTS = {
    mag:    `${BASE}/products/solar-wind/mag-2-hour.json`,
    plasma: `${BASE}/products/solar-wind/plasma-2-hour.json`,
    kp:     `${BASE}/products/noaa-planetary-k-index.json`,
    xray:   `${BASE}/json/goes/primary/xrays-1-day.json`,
};

const POLL_MS = { mag: 60_000, plasma: 60_000, kp: 180_000, xray: 60_000 };

const STALE_MS = 900_000; // 15 min

// Physics defaults — quiet solar conditions
const DEFAULTS = {
    bz: -2.0, bt: 5.0, bx: 0.0, by: 0.0,
    density: 5.0, speed: 450.0, pressure: 1.7,
    kp: 2.0, flare: 0.0, r0: 10.5, alpha: 0.58,
    dst: -15.0, dstInject: 0.0, dstDecay: 0.0, dstTau: 10.0,
};

function safeGet(v, fb) {
    if (v === null || v === undefined) return fb;
    const n = Number(v);
    return isFinite(n) ? n : fb;
}

// Dynamic pressure [nPa]: ~1.67e-6 * n[cm^-3] * v[km/s]^2
function computePressure(density, speedKms) {
    return 1.67e-6 * density * speedKms * speedKms;
}

// Shue et al. 1997 — subsolar magnetopause distance [R_E]
function computeR0(bz, pressure) {
    return (11.4 + 0.013 * bz) * Math.pow(Math.max(pressure, 0.01), -1 / 6.6);
}

// Shue et al. 1997 — flaring exponent alpha
function computeAlpha(bz, pressure) {
    return (0.58 - 0.007 * bz) * (1.0 + 0.024 * Math.log(Math.max(pressure, 0.01)));
}

// Map GOES flux [W/m²] to a 0-5+ scale (A=0, B=1, C=2, M=3, X=4, X10=5)
function computeFlare(flux) {
    return Math.max(0, Math.log10(Math.max(flux, 1e-9)) + 9);
}

// ── Ring-current / Dst model ──────────────────────────────────────────────────
// Burton et al. (1975) ring-current equation, parameterised by O'Brien &
// McPherron (2000):  dDst*/dt = Q(VBs) − Dst*/τ(VBs),  then pressure-corrected
//   Dst = Dst* + b·√Pdyn − c.
// This is the storm feedback loop made explicit: an injection term Q (driven by
// the rectified solar-wind electric field) fighting a decay term Dst*/τ.

const DST_EC = 0.49;   // VBs injection threshold [mV/m]
const DST_B  = 7.26;   // pressure-correction coefficient [nT / √nPa]
const DST_C  = 11.0;   // pressure-correction offset [nT]

// Rectified solar-wind electric field [mV/m]: 1e-3 · V[km/s] · max(−Bz,0)[nT]
function vbs(speedKms, bz) {
    return 1e-3 * speedKms * Math.max(-bz, 0);
}
// Ring-current injection rate Q [nT/h] (≤ 0 — drives Dst* downward)
function dstInjectionRate(vbsE) {
    return vbsE > DST_EC ? -4.4 * (vbsE - DST_EC) : 0.0;
}
// Ring-current decay time τ [h]
function dstDecayTime(vbsE) {
    return 2.40 * Math.exp(9.74 / (4.69 + vbsE));
}

function lerp(a, b, t) {
    return a + (b - a) * Math.min(Math.max(t, 0), 1);
}

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
        this._raw      = {};
        this._prev     = { ...DEFAULTS };
        this._curr     = { ...DEFAULTS };
        this._updateTime = 0;   // Date.now() of last successful recompute
        this._hasData  = false; // true after first real fetch
        this._active   = false;
        this._timers   = [];
        this._dstStar  = null;  // pressure-uncorrected ring-current term [nT]
        this._dstTime  = 0;     // Date.now() of last Dst integration step
    }

    start() {
        this._active = true;
        for (const [key, url] of Object.entries(ENDPOINTS)) {
            this._schedule(key, url, POLL_MS[key]);
        }
    }

    stop() {
        this._active = false;
        this._timers.forEach(clearTimeout);
        this._timers = [];
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
        this._raw[key] = key === 'xray' ? parseXray(raw) : parseAoA(raw);
        this._recompute();
    }

    _recompute() {
        const m = this._raw.mag    || {};
        const p = this._raw.plasma || {};
        const k = this._raw.kp     || {};
        const x = this._raw.xray   || {};

        const bz      = safeGet(m.bz_gsm,   DEFAULTS.bz);
        const bt      = safeGet(m.bt,        DEFAULTS.bt);
        const bx      = safeGet(m.bx_gsm,   DEFAULTS.bx);
        const by      = safeGet(m.by_gsm,   DEFAULTS.by);
        const density = safeGet(p.density,   DEFAULTS.density);
        const speed   = safeGet(p.speed,     DEFAULTS.speed);
        const kp      = safeGet(k.kp,        DEFAULTS.kp);
        const flux    = safeGet(x.flux,      1e-8); // default: B-class

        const pressure = computePressure(density, speed);
        const r0       = computeR0(bz, pressure);
        const alpha    = computeAlpha(bz, pressure);
        const flare    = computeFlare(flux);

        // Ring-current Dst — integrate dDst*/dt = Q − Dst*/τ in real time.
        const E   = vbs(speed, bz);
        const Q   = dstInjectionRate(E);
        const tau = dstDecayTime(E);
        const tNow = Date.now();
        if (this._dstStar === null) {
            this._dstStar = Q * tau;          // snap to equilibrium — no startup transient
        } else {
            // clamp dt to ≤ 15 min so a slept/stale tab can't take a giant Euler step
            const dtH = Math.min(Math.max((tNow - this._dstTime) / 3.6e6, 0), 0.25);
            this._dstStar += (Q - this._dstStar / tau) * dtH;
        }
        this._dstTime  = tNow;
        const dstDecay = -this._dstStar / tau;                                  // recovery rate [nT/h]
        const dst      = this._dstStar + DST_B * Math.sqrt(Math.max(pressure, 0)) - DST_C;

        const next = { bz, bt, bx, by, density, speed, pressure, kp, flare, r0, alpha,
                       dst, dstInject: Q, dstDecay, dstTau: tau };

        // On first real fetch: snap immediately (no lerp from defaults)
        this._prev = this._hasData ? { ...this._curr } : { ...next };
        this._curr = next;
        this._hasData = true;
        this._updateTime = Date.now();

        if (Object.keys(this._raw).length === 1) {
            // Log once when any first endpoint returns
            console.log('[DataFetcher] first data:', this.toUniforms());
        }
    }

    getAge() {
        return this._updateTime ? Date.now() - this._updateTime : Infinity;
    }

    get isStale() {
        return this.getAge() > STALE_MS;
    }

    // Returns interpolated uniform object — call every frame
    toUniforms() {
        const age = this.getAge();
        // t: 0 immediately after update → 1 after one poll window
        const t = Math.min(age / POLL_MS.mag, 1);
        const l = (a, b) => lerp(a, b, t);
        return {
            r0:       l(this._prev.r0,       this._curr.r0),
            alpha:    l(this._prev.alpha,     this._curr.alpha),
            bz:       l(this._prev.bz,        this._curr.bz),
            speed:    l(this._prev.speed,     this._curr.speed),
            kp:       l(this._prev.kp,        this._curr.kp),
            bt:       l(this._prev.bt,        this._curr.bt),
            density:  l(this._prev.density,   this._curr.density),
            pressure: l(this._prev.pressure,  this._curr.pressure),
            flare:    l(this._prev.flare,     this._curr.flare),
            dst:       l(this._prev.dst,       this._curr.dst),
            dstInject: l(this._prev.dstInject, this._curr.dstInject),
            dstDecay:  l(this._prev.dstDecay,  this._curr.dstDecay),
            dstTau:    this._curr.dstTau,
            dataAge:  isFinite(age) ? age / 1000 : 0,
            isStale:  this.isStale,
        };
    }
}
