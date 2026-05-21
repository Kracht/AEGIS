// TimelineSource — replays a curated instrument-era storm through the shared
// MagnetosphereModel. It implements the same DataSource contract as the live
// NOAA poller (start/stop/toUniforms), so it drops into createDataSource()
// without the renderer or HUD knowing the difference.
//
// The whole point of Phase 4: because the *same* model integrates both the
// live feed and the replay, the causal sequencing a student watches — dayside
// compression, then (minutes later, via the L1 advection lag) the ring-current
// response — emerges from the physics rather than being keyframed. Replay is
// just "feed the model real samples on a clock you control."
//
// Clock handling. toUniforms() is called every animation frame. When playing,
// we advance a storm-time cursor `_playMs` by (wall-clock Δt × speed) and then
// ingest every data sample whose timestamp falls in the newly-crossed interval
// — so fast playback loop-ingests many 5-minute samples per frame (this is the
// sub-stepping that keeps the forward-Euler Dst ODE stable; each model step is
// a real ≤5-minute dt regardless of playback speed). A backward seek can't
// scrub a stateful integrator in place, so it resets the model and re-integrates
// from the dataset start (≤~900 samples — sub-millisecond).

import { MagnetosphereModel } from './magnetosphere-model.js';

const DEFAULT_SPEED = 900;                 // 900× → ~48–72 h storm in 3–5 min
export const SPEEDS = [60, 300, 900, 1800, 3600];

export class TimelineSource {
    constructor(meta) {
        this._meta   = meta;               // { id, name, date, file }
        this._model  = new MagnetosphereModel();
        this._data   = null;               // parsed JSON once loaded
        this._t0     = 0;                   // epoch ms of sample[0]
        this._tEnd   = 0;
        this._dtMs   = 0;                   // sample cadence
        this._idx    = {};                 // field → column index

        this._playMs       = 0;            // storm-time cursor
        this._ingestedUpTo = -Infinity;    // model integrated through this storm-time
        this._playing      = false;
        this._speed        = DEFAULT_SPEED;
        this._lastWall     = 0;            // performance.now() of last advance
        this._loaded       = false;
    }

    async start() {
        try {
            const r = await fetch(this._meta.file);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            this._data = d;
            d.fields.forEach((f, i) => { this._idx[f] = i; });
            this._dtMs = d.cadenceSec * 1000;
            this._t0   = Date.parse(d.t0);
            this._tEnd = this._t0 + (d.samples.length - 1) * this._dtMs;
            this._playMs   = this._t0;
            this._loaded   = true;
            this._lastWall = performance.now();
            this._playing  = true;          // auto-play on load
            this._advanceModelTo(this._playMs);
        } catch (e) {
            console.warn(`[TimelineSource] ${this._meta.id}: ${e.message}`);
        }
    }

    stop() { this._playing = false; }

    // ── transport control ────────────────────────────────────────────────────
    play()       { if (this._loaded) { this._playing = true; this._lastWall = performance.now(); } }
    pause()      { this._playing = false; }
    togglePlay() { this._playing ? this.pause() : this.play(); }
    setSpeed(x)  { this._speed = x; }

    // Seek to a fraction [0,1] of the storm; keeps current play/pause state.
    seekFraction(f) {
        if (!this._loaded) return;
        const clamped = Math.min(Math.max(f, 0), 1);
        this._playMs   = this._t0 + clamped * (this._tEnd - this._t0);
        this._lastWall = performance.now();
        this._advanceModelTo(this._playMs);
    }

    get loaded()   { return this._loaded; }
    get playing()  { return this._playing; }
    get speed()    { return this._speed; }
    get fraction() { return this._tEnd > this._t0 ? (this._playMs - this._t0) / (this._tEnd - this._t0) : 0; }

    // Ingest every sample in (_ingestedUpTo, targetMs]; reset + replay on a
    // backward jump (the Dst integrator is stateful).
    _advanceModelTo(targetMs) {
        if (!this._loaded) return;
        if (targetMs < this._ingestedUpTo) {
            this._model.reset();
            this._ingestedUpTo = -Infinity;
        }
        const s = this._data.samples;
        const startI = this._ingestedUpTo === -Infinity
            ? 0
            : Math.floor((this._ingestedUpTo - this._t0) / this._dtMs) + 1;
        for (let i = Math.max(startI, 0); i < s.length; i++) {
            const t = this._t0 + i * this._dtMs;
            if (t > targetMs) break;
            const row = s[i];
            this._model.ingest({
                bz:      row[this._idx.bz],
                bt:      row[this._idx.bt],
                speed:   row[this._idx.speed],
                density: row[this._idx.density],
                kp:      row[this._idx.kp],
            }, t);
            this._ingestedUpTo = t;
        }
    }

    toUniforms() {
        if (this._loaded && this._playing) {
            const now = performance.now();
            this._playMs += (now - this._lastWall) * this._speed;
            this._lastWall = now;
            if (this._playMs >= this._tEnd) { this._playMs = this._tEnd; this._playing = false; }
            this._advanceModelTo(this._playMs);
        }
        return {
            ...this._model.sampleUniforms(this._playMs),
            dataAge: 0,
            isStale: false,
            timeline: {
                id:         this._meta.id,
                name:       this._data?.name ?? this._meta.name,
                teaches:    this._data?.teaches ?? '',
                loaded:     this._loaded,
                playing:    this._playing,
                speed:      this._speed,
                fraction:   this.fraction,
                utc:        this._loaded ? new Date(this._playMs).toISOString() : '',
                realDstMin: this._data?.realDstMin ?? null,
            },
        };
    }
}
