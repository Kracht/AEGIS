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

// ── Phase 1: physical time / L1 advection lag ────────────────────────────────
// Upstream solar-wind observations (DSCOVR/ACE at L1, ~1.5e6 km Sun-ward of
// Earth) advect to the bow shock at the bulk solar-wind speed: ~55 min at
// 450 km/s, ~31 min at 800 km/s. Every _recompute() snapshot is pushed onto
// `_history`, and toUniforms() reports the snapshot from `now − l1LagMs(speed)`
// — turning "what L1 saw N min ago" into "what the magnetosphere is seeing
// right now." Consultation decision #3: simple speed-scaled advective lag
// (honest, cheap), not a full loading–unloading substorm model. The simple
// version is enough to kill the "uniform changes → scene responds same frame"
// misconception that Phase 4 will build the causal HUD on top of.
//
// Dst* keeps its own physical τ from Phase 2 (Burton/O'Brien ODE) and is fed
// the *lagged* Bz/speed/pressure here so the ring current responds to what
// the magnetosphere is seeing, not the freshest L1 sample. Flare X-rays are
// light-speed and pass through un-lagged.
const L1_DISTANCE_KM   = 1.5e6;           // Sun–Earth L1 ≈ 1.5 million km
const HISTORY_LIMIT_MS = 90 * 60 * 1000;  // 90 min — covers slowest realistic v_sw
const KP_FILTER_TAU_MS = 5 * 60 * 1000;   // modest aurora-side low-pass on Kp

function l1LagMs(speedKms) {
    const v = Math.min(Math.max(speedKms, 200), 1500);
    return (L1_DISTANCE_KM / v) * 1000;
}

// Linearly interpolate every shared numeric field between two snapshots.
function lerpSnap(a, b, u) {
    const out = {};
    for (const k in a) {
        const av = a[k], bv = b[k];
        out[k] = (typeof av === 'number' && typeof bv === 'number') ? lerp(av, bv, u) : bv;
    }
    return out;
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
        this._curr     = { ...DEFAULTS };
        this._updateTime = 0;   // Date.now() of last successful recompute
        this._hasData  = false; // true after first real fetch
        this._active   = false;
        this._timers   = [];
        this._dstStar  = null;  // pressure-uncorrected ring-current term [nT]
        this._dstTime  = 0;     // Date.now() of last Dst integration step
        this._history  = [];    // [{t: ms, snap: {...}}] for L1 advection lag
        this._kpFiltered = null;// τ≈5min low-passed Kp (smooths 3-hourly bin steps)
        this._kpFilterTime = 0;
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
        const kpRaw   = safeGet(k.kp,        DEFAULTS.kp);
        const flux    = safeGet(x.flux,      1e-8); // default: B-class

        const pressure = computePressure(density, speed);
        const r0       = computeR0(bz, pressure);
        const alpha    = computeAlpha(bz, pressure);
        const flare    = computeFlare(flux);

        const tNow = Date.now();

        // Kp low-pass: 3-hourly bin index can jump by 1–2 between polls; ease
        // the transition so the aurora doesn't snap. τ≈5 min wallclock.
        let kp;
        if (this._kpFiltered === null) {
            kp = kpRaw;
        } else {
            const dt = Math.max(tNow - this._kpFilterTime, 0);
            const a  = 1 - Math.exp(-dt / KP_FILTER_TAU_MS);
            kp = this._kpFiltered + a * (kpRaw - this._kpFiltered);
        }
        this._kpFiltered   = kp;
        this._kpFilterTime = tNow;

        // Ring-current Dst — drive Burton/O'Brien with the magnetosphere-frame
        // (i.e. L1-lagged) Bz/speed/pressure so the ring-current response lags
        // L1 by the advection time. On cold start (history still empty), this
        // collapses to the fresh L1 values — fine because we snap to
        // equilibrium below.
        const lag    = l1LagMs(speed);
        const lagged = this._history.length > 0
            ? this._sampleHistory(tNow - lag)
            : { bz, speed, pressure };
        const E   = vbs(lagged.speed, lagged.bz);
        const Q   = dstInjectionRate(E);
        const tau = dstDecayTime(E);
        if (this._dstStar === null) {
            this._dstStar = Q * tau;          // snap to equilibrium — no startup transient
        } else {
            // clamp dt to ≤ 15 min so a slept/stale tab can't take a giant Euler step
            const dtH = Math.min(Math.max((tNow - this._dstTime) / 3.6e6, 0), 0.25);
            this._dstStar += (Q - this._dstStar / tau) * dtH;
        }
        this._dstTime  = tNow;
        const dstDecay = -this._dstStar / tau;                                  // recovery rate [nT/h]
        const dst      = this._dstStar + DST_B * Math.sqrt(Math.max(lagged.pressure, 0)) - DST_C;

        const next = { bz, bt, bx, by, density, speed, pressure, kp, flare, r0, alpha,
                       dst, dstInject: Q, dstDecay, dstTau: tau };

        // Push onto history ring — toUniforms() reads this back at `tNow − lag`.
        this._history.push({ t: tNow, snap: { ...next } });
        while (this._history.length > 1 && tNow - this._history[0].t > HISTORY_LIMIT_MS) {
            this._history.shift();
        }

        this._curr = next;
        this._hasData = true;
        this._updateTime = tNow;

        if (Object.keys(this._raw).length === 1) {
            // Log once when any first endpoint returns
            console.log('[DataFetcher] first data:', this.toUniforms());
        }
    }

    // Linearly interpolate the snapshot history at a target wallclock time.
    // Falls back to the most recent value before history exists; clamps at the
    // ring's edges so cold-start lag queries don't read into defaults.
    _sampleHistory(targetT) {
        const h = this._history;
        if (h.length === 0) return this._curr;
        if (targetT >= h[h.length - 1].t) return h[h.length - 1].snap;
        if (targetT <= h[0].t) return h[0].snap;
        // Linear scan from newest — history is at most ~90 entries (90 min / 60 s).
        for (let i = h.length - 1; i > 0; i--) {
            const b = h[i], a = h[i - 1];
            if (a.t <= targetT && targetT <= b.t) {
                const u = (targetT - a.t) / Math.max(b.t - a.t, 1);
                return lerpSnap(a.snap, b.snap, u);
            }
        }
        return h[h.length - 1].snap;
    }

    getAge() {
        return this._updateTime ? Date.now() - this._updateTime : Infinity;
    }

    get isStale() {
        return this.getAge() > STALE_MS;
    }

    // Returns the magnetosphere-frame uniform object — call every frame.
    // L1-advected quantities (bz, bt, bx, by, density, speed, pressure, r0,
    // alpha) are sampled from the history ring at `now − l1LagMs(speed)`.
    // Earth-frame quantities (Dst*, flare, Kp) pass through from _curr.
    toUniforms() {
        const nowT = Date.now();
        const age  = this._updateTime ? nowT - this._updateTime : Infinity;
        const lag  = this._hasData ? l1LagMs(this._curr.speed) : 0;
        const s    = this._hasData ? this._sampleHistory(nowT - lag) : this._curr;
        return {
            r0:       s.r0,
            alpha:    s.alpha,
            bz:       s.bz,
            bt:       s.bt,
            density:  s.density,
            speed:    s.speed,
            pressure: s.pressure,
            kp:        this._curr.kp,
            flare:     this._curr.flare,
            dst:       this._curr.dst,
            dstInject: this._curr.dstInject,
            dstDecay:  this._curr.dstDecay,
            dstTau:    this._curr.dstTau,
            dataAge:  isFinite(age) ? age / 1000 : 0,
            isStale:  this.isStale,
            lagSeconds: lag / 1000,
        };
    }
}
