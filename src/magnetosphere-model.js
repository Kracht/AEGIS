// AEGIS magnetosphere model — the stateful physics core, time-agnostic.
//
// This is the shared engine behind every DataSource. It takes *raw L1 solar-
// wind samples* and an explicit clock, and produces the magnetosphere-frame
// uniform block the renderer and HUD consume. It deliberately holds no notion
// of wallclock or `Date.now()`: callers advance it with `ingest(sample, nowMs)`
// and query it with `sampleUniforms(nowMs)`, where `nowMs` is whatever clock
// that source runs on — wallclock for the live NOAA poller (DataFetcher), or
// the replay/scrub clock for TimelineSource.
//
// Because both sources push raw samples through *identical* physics — the same
// Shue (1997) standoff, Burton (1975) / O'Brien & McPherron (2000) Dst ODE,
// L1 advection lag and Kp low-pass — the causal sequencing a student sees
// during replay *emerges* from the model rather than being keyframed. That is
// the whole point: the timeline cannot teach a delay the live engine doesn't
// also obey.
//
// State carried here: the Dst* integrator, the Kp filter, and the 90-minute
// history ring used for L1 advection. `reset()` clears all of it — TimelineSource
// calls it on a backward seek before re-integrating from the dataset start
// (the ODE is stateful, so you cannot scrub an integrator backwards in place).

// Physics defaults — quiet solar conditions. Used to fill missing fields in an
// incoming sample (the live poller assembles samples from several endpoints
// that arrive independently).
export const DEFAULTS = {
    bz: -2.0, bt: 5.0, bx: 0.0, by: 0.0,
    density: 5.0, speed: 450.0, pressure: 1.7,
    kp: 2.0, flare: 0.0, r0: 10.5, alpha: 0.58,
    dst: -15.0, dstInject: 0.0, dstDecay: 0.0, dstTau: 10.0,
};

function safeNum(v, fb) {
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
// 450 km/s, ~31 min at 800 km/s. Every ingest() snapshot is pushed onto the
// history ring, and sampleUniforms() reports the snapshot from
// `now − l1LagMs(speed)` — turning "what L1 saw N min ago" into "what the
// magnetosphere is seeing right now." Consultation decision #3: simple
// speed-scaled advective lag (honest, cheap), not a full loading–unloading
// substorm model.
//
// Dst* keeps its own physical τ (Burton/O'Brien ODE) and is fed the *lagged*
// Bz/speed/pressure here so the ring current responds to what the magnetosphere
// is seeing, not the freshest L1 sample. Flare X-rays are light-speed and pass
// through un-lagged.
const L1_DISTANCE_KM   = 1.5e6;           // Sun–Earth L1 ≈ 1.5 million km
const HISTORY_LIMIT_MS = 90 * 60 * 1000;  // 90 min — covers slowest realistic v_sw
const KP_FILTER_TAU_MS = 5 * 60 * 1000;   // modest aurora-side low-pass on Kp

export function l1LagMs(speedKms) {
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

export class MagnetosphereModel {
    constructor() {
        this.reset();
    }

    // Clear all integrator / filter / history state. Call before re-running a
    // timeline from the start (a stateful ODE cannot be scrubbed backwards).
    reset() {
        this._curr     = { ...DEFAULTS };
        this._hasData  = false;
        this._updateTime = 0;     // nowMs of last ingest
        this._dstStar  = null;    // pressure-uncorrected ring-current term [nT]
        this._dstTime  = 0;       // nowMs of last Dst integration step
        this._history  = [];      // [{t, snap}] for L1 advection lag
        this._kpFiltered = null;  // τ≈5min low-passed Kp
        this._kpFilterTime = 0;
    }

    get hasData()    { return this._hasData; }
    get updateTime() { return this._updateTime; }

    // Advance the model with one raw L1 sample at clock time `nowMs`.
    // `sample` carries physical units; missing fields fall back to DEFAULTS:
    //   { bz, bt, bx, by, density, speed, kp, flux }   (flux in W/m² for GOES)
    // dt for the Kp filter and the Dst Euler step is derived from successive
    // `nowMs` values, so playback speed and wallclock are handled identically.
    ingest(sample, nowMs) {
        const bz      = safeNum(sample.bz,      DEFAULTS.bz);
        const bt      = safeNum(sample.bt,      DEFAULTS.bt);
        const bx      = safeNum(sample.bx,      DEFAULTS.bx);
        const by      = safeNum(sample.by,      DEFAULTS.by);
        const density = safeNum(sample.density, DEFAULTS.density);
        const speed   = safeNum(sample.speed,   DEFAULTS.speed);
        const kpRaw   = safeNum(sample.kp,      DEFAULTS.kp);
        const flux    = safeNum(sample.flux,    1e-8); // default: B-class

        const pressure = computePressure(density, speed);
        const r0       = computeR0(bz, pressure);
        const alpha    = computeAlpha(bz, pressure);
        const flare    = computeFlare(flux);

        // Kp low-pass: 3-hourly bin index can jump by 1–2 between samples; ease
        // the transition so the aurora doesn't snap. τ≈5 min.
        let kp;
        if (this._kpFiltered === null) {
            kp = kpRaw;
        } else {
            const dt = Math.max(nowMs - this._kpFilterTime, 0);
            const a  = 1 - Math.exp(-dt / KP_FILTER_TAU_MS);
            kp = this._kpFiltered + a * (kpRaw - this._kpFiltered);
        }
        this._kpFiltered   = kp;
        this._kpFilterTime = nowMs;

        // Ring-current Dst — drive Burton/O'Brien with the magnetosphere-frame
        // (i.e. L1-lagged) Bz/speed/pressure so the ring-current response lags
        // L1 by the advection time. On cold start (history still empty), this
        // collapses to the fresh L1 values — fine because we snap to
        // equilibrium below.
        const lag    = l1LagMs(speed);
        const lagged = this._history.length > 0
            ? this._sampleHistory(nowMs - lag)
            : { bz, speed, pressure };
        const E   = vbs(lagged.speed, lagged.bz);
        const Q   = dstInjectionRate(E);
        const tau = dstDecayTime(E);
        if (this._dstStar === null) {
            this._dstStar = Q * tau;          // snap to equilibrium — no startup transient
        } else {
            // clamp dt to ≤ 15 min so a slept/stale tab — or a fast scrub —
            // can't take a giant Euler step
            const dtH = Math.min(Math.max((nowMs - this._dstTime) / 3.6e6, 0), 0.25);
            this._dstStar += (Q - this._dstStar / tau) * dtH;
        }
        this._dstTime  = nowMs;
        const dstDecay = -this._dstStar / tau;                                  // recovery rate [nT/h]
        const dst      = this._dstStar + DST_B * Math.sqrt(Math.max(lagged.pressure, 0)) - DST_C;

        const next = { bz, bt, bx, by, density, speed, pressure, kp, flare, r0, alpha,
                       dst, dstInject: Q, dstDecay, dstTau: tau };

        // Push onto history ring — sampleUniforms() reads this back at `now − lag`.
        this._history.push({ t: nowMs, snap: { ...next } });
        while (this._history.length > 1 && nowMs - this._history[0].t > HISTORY_LIMIT_MS) {
            this._history.shift();
        }

        this._curr = next;
        this._hasData = true;
        this._updateTime = nowMs;
    }

    // Linearly interpolate the snapshot history at a target clock time. Falls
    // back to the most recent value before history exists; clamps at the ring's
    // edges so cold-start lag queries don't read into defaults.
    _sampleHistory(targetT) {
        const h = this._history;
        if (h.length === 0) return this._curr;
        if (targetT >= h[h.length - 1].t) return h[h.length - 1].snap;
        if (targetT <= h[0].t) return h[0].snap;
        // Linear scan from newest — history is at most ~90 entries.
        for (let i = h.length - 1; i > 0; i--) {
            const b = h[i], a = h[i - 1];
            if (a.t <= targetT && targetT <= b.t) {
                const u = (targetT - a.t) / Math.max(b.t - a.t, 1);
                return lerpSnap(a.snap, b.snap, u);
            }
        }
        return h[h.length - 1].snap;
    }

    // The magnetosphere-frame uniform block — call every frame with the source's
    // clock. L1-advected quantities (bz, bt, density, speed, pressure, r0,
    // alpha) come from the history ring at `now − l1LagMs(speed)`; Earth-frame
    // quantities (Dst*, flare, Kp) pass through from the latest ingest.
    // `dataAge`/`isStale` provenance is the *source's* job, not the model's.
    sampleUniforms(nowMs) {
        const lag = this._hasData ? l1LagMs(this._curr.speed) : 0;
        const s   = this._hasData ? this._sampleHistory(nowMs - lag) : this._curr;
        return {
            r0:        s.r0,
            alpha:     s.alpha,
            bz:        s.bz,
            bt:        s.bt,
            density:   s.density,
            speed:     s.speed,
            pressure:  s.pressure,
            kp:        this._curr.kp,
            flare:     this._curr.flare,
            dst:       this._curr.dst,
            dstInject: this._curr.dstInject,
            dstDecay:  this._curr.dstDecay,
            dstTau:    this._curr.dstTau,
            lagSeconds: lag / 1000,
        };
    }
}
