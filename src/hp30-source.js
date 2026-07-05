// Live Hp30 ghost trace — fetches the GFZ Potsdam nowcast via a *same-origin*
// proxy on the deploying server, parses the last ~30 days of 30-min Kp-family
// samples, and exposes the most recent non-missing value via `valueAt(timeMs)`.
//
// Used in *addition* to the magnetosphere model, never as a driver. The model
// stays the same; Hp30 supplies an observed reference next to the modeled
// aurora driver — the live-mode analog of the SYM-H ghost beside modeled Dst.
//
// Why a proxy? GFZ's HTTPS file server (kp.gfz.de) returns no CORS header, so
// browsers block a direct cross-origin fetch. The deploying host needs a tiny
// PHP/Apache pass-through (see api/hp30_proxy.php) that fetches GFZ server-side
// every ~15 minutes, caches the file, and re-serves it with
// `Access-Control-Allow-Origin: *`. This source self-disables on any failure
// (proxy missing, network error, empty response) so cloning the repo to a
// plain static host — Python http.server, GitHub Pages, `npx serve`, anything
// without PHP — keeps the rest of the app working: the HUD just doesn't see
// `u.hp30`, the tooltip/border code already guards on that, and the bundled
// scenarios still carry hp30 from `tools/augment-hp30.mjs`.
//
// Upstream feed format (echoed by the proxy verbatim): 30 header lines starting
// with '#', then fixed-width ASCII rows
//   YYYY MM DD hh.h hh._m days days_m Hp30 ap30 D.
// Missing data: Hp30 = -1.000, ap30 = -1. Upstream latency ~1–3 h behind
// real-time (trailing intervals carry the sentinel until analysis completes).
//
// License: CC BY 4.0. Cite Yamazaki et al. 2024 + DOI 10.5880/Hpo.0003 (the
// citation lives in the README and the HUD tooltip; this module just fetches).

// Same-origin proxy path. Override here if you deploy the proxy elsewhere; it
// must serve the GFZ nowcast file body unchanged with CORS allowed.
const FEED_URL = 'api/hp30_proxy.php';
// Hp30 itself is a 30-min cadence index, so polling more often is wasteful.
// 15 min is the right Nyquist + small headroom for the upstream analysis
// completing slightly off the half-hour boundary.
const POLL_MS  = 15 * 60_000;

function parse(text) {
    const out = [];
    for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const p = line.trim().split(/\s+/);
        if (p.length < 9) continue;
        const yyyy = +p[0], mm = +p[1], dd = +p[2];
        const hhStart = parseFloat(p[3]);
        const hp30 = parseFloat(p[7]);
        const ap30 = parseInt(p[8], 10);
        if (!isFinite(yyyy) || !isFinite(hp30) || hp30 < 0) continue;
        out.push({
            tStartMs: Date.UTC(yyyy, mm - 1, dd) + hhStart * 3600_000,
            hp30, ap30,
        });
    }
    return out;
}

export class Hp30Source {
    constructor() {
        this._records = [];
        this._timer   = null;
        this._active  = false;
        this._disabled = false;        // set after first proxy failure — no retries
        this._lastFetch = 0;
    }

    start() {
        this._active = true;
        this._poll();
    }

    stop() {
        this._active = false;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    }

    // First successful response unlocks the feature; first failure (proxy
    // missing, 4xx/5xx, network/CORS error, empty parse) disables it for the
    // session — replay scenarios still carry hp30 from the bundle, and the HUD
    // guards already make a missing live value a no-op.
    async _poll() {
        if (!this._active || this._disabled) return;
        try {
            const r = await fetch(FEED_URL);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const records = parse(await r.text());
            if (records.length === 0) throw new Error('empty/unparsable response');
            this._records = records;
            this._lastFetch = Date.now();
        } catch (_e) {
            this._disabled = true;
            // Single informational log — devs can see why if they care, but a
            // user on a clone-and-serve host without the optional proxy sees
            // nothing alarming.
            console.info('[Hp30Source] live Hp30 disabled (no proxy at ' + FEED_URL +
                ') — replay scenarios still carry observed Hp30.');
            return;
        }
        if (this._active) this._timer = setTimeout(() => this._poll(), POLL_MS);
    }

    // Most recent non-missing Hp30 at or before timeMs. Returns null when the
    // feed hasn't reported yet, or no completed bin covers the requested time.
    valueAt(timeMs) {
        const rs = this._records;
        if (!rs.length) return null;
        // Binary-search the last bin starting at or before timeMs.
        let lo = 0, hi = rs.length - 1, ans = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (rs[mid].tStartMs <= timeMs) { ans = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        return ans >= 0 ? rs[ans].hp30 : null;
    }
}
