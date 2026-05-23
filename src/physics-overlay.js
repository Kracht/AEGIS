// Physics mode — Phase 5, the last abstraction layer (consultation §2 cost-note:
// "field-vector glyphs + topology as a 2D camera-synced overlay, NOT in the
// ray-marcher"). It is the layer that puts the *mechanism back into the
// geometry*: where the Causal HUD draws the driver→response graph in the
// abstract, Physics mode draws it in space — the field topology and the two
// reconnection sites that actually transfer the energy.
//
// Per the Phase-5 consultation (Dr. T.), the design is disciplined on three
// points so the prettiest layer doesn't re-teach the misconceptions Phases 1–2
// were built to kill:
//   1. It reads as a SCHEMATIC (sparse directional glyphs, analytic dipole +
//      draped IMF) — not a flowing MHD solution. Labelled as such.
//   2. The single most important thing it colours is OPEN vs CLOSED field —
//      open flux is the doorway energy walks through. Two colours, one lesson.
//   3. Two reconnection X-lines that fire IN ORDER: the dayside merges promptly
//      with southward Bz; the near-Earth neutral line lights *later*, off the
//      same lagged tail-loading driver the aurora uses (bzAurora) — so a
//      scrubbed storm shows dayside → (minutes) → tail → oval → Dst.
// Current systems (ring/cross-tail/FAC) are deliberately omitted from v1:
// arrows for currents get misread as arrows for flows.
//
// Geometry lives in the noon-midnight meridian (z = 0): x sunward, y magnetic
// north (dipole axis), matching the side-view the scene favours. The By
// clock-angle tilt is edge-on in this plane, so the meridian-visible Bz lesson
// is the MERGING-SITE LATITUDE instead (equatorial X-line for southward IMF,
// high-latitude lobe reconnection for northward) — richer here, and correct.

import { CameraProjection } from './camera-projection.js';

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const DEG = Math.PI / 180;

// ---- analytic field-line geometry (schematic) -------------------------------

// Half of a dipole field line in the meridian, on side s (+1 dayside / −1 night):
// r(λ) = L·cos²λ, footpoints where r = 1. Returns world points [x,y,0].
function dipoleArc(L, s, scaleX, scaleY) {
    const lamF = Math.acos(Math.sqrt(1 / L));   // footpoint latitude (r = 1)
    const pts = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
        const lam = -lamF + (2 * lamF) * (i / N);
        const r = L * Math.cos(lam) * Math.cos(lam);
        const x = s * r * Math.cos(lam) * scaleX;
        const y = r * Math.sin(lam) * scaleY;
        pts.push([x, y, 0]);
    }
    return pts;
}

// An open lobe field line: footpoint near the polar cap, draped over the pole
// and stretched antisunward into the tail lobe. hemi = +1 north / −1 south.
// openFrac ∈ [0,1] expands the polar cap (footpoint drops equatorward) and
// lengthens the tail.
function lobeLine(hemi, openFrac, r0) {
    const tail = 14 + 10 * openFrac;            // lobe reaches farther when loaded
    const yLobe = (1.8 - 0.6 * openFrac) * hemi; // sags toward the sheet when loaded
    const wp = [
        [0.55, 0.95 * hemi, 0],                 // high-latitude footpoint (r≈1)
        [Math.min(1.7, r0 * 0.45), 3.0 * hemi, 0],
        [0.0, 4.1 * hemi, 0],                   // over the pole
        [-5.5, (2.4 - 0.5 * openFrac) * hemi, 0],
        [-tail, yLobe, 0],
    ];
    return wp;
}

// ---- the overlay ------------------------------------------------------------

const CSS = `
#physics-overlay { position: fixed; inset: 0; z-index: 5; pointer-events: none; }
/* Hover hotspots are sized per-frame to the marker's screen footprint (+pad)
   so the legend is easy to hit — not luck-of-the-pixel. Invisible by design. */
.px-hot { position: fixed; z-index: 6; pointer-events: auto; cursor: help; display: none; }
#px-tip {
    position: fixed; z-index: 26; max-width: 280px; display: none;
    background: rgba(0, 4, 14, 0.94); border: 1px solid rgba(70, 130, 210, 0.34);
    border-radius: 3px; padding: 0.5rem 0.65rem;
    backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    pointer-events: none;
}
#px-tip .t-title { color: rgba(120, 180, 250, 0.95); font-size: 10px; letter-spacing: 0.06em; margin-bottom: 0.25rem; }
#px-tip .t-eq    { color: rgba(200, 222, 255, 0.92); font-size: 11px; margin-bottom: 0.2rem; }
#px-tip .t-val   { color: rgba(150, 235, 200, 0.92); font-size: 10.5px; }
#px-tip .t-cite  { color: rgba(110, 150, 200, 0.6);  font-size: 8.5px; margin-top: 0.3rem; font-style: italic; }
`;

const COL_CLOSED = [95, 155, 240];    // cool blue — closed (returns to Earth)
const COL_OPEN   = [255, 168, 70];    // amber — open (connected to the IMF)

export class PhysicsOverlay {
    constructor(canvas) {
        this._srcCanvas = canvas;             // main WebGL canvas (for size mirroring)
        this._visible = false;
        this._proj = new CameraProjection();
        this._lastU = null;
        this._injectStyle();
        this._build();
    }

    _injectStyle() {
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    _build() {
        this._cv = document.createElement('canvas');
        this._cv.id = 'physics-overlay';
        document.body.appendChild(this._cv);
        this._ctx = this._cv.getContext('2d');

        // Hover hotspots for the topology markers (progressive disclosure).
        this._hot = {};
        for (const id of ['dayX', 'tailX', 'cusp', 'imf']) {
            const h = document.createElement('div');
            h.className = 'px-hot';
            h.addEventListener('mouseenter', (e) => this._showTip(id, e));
            h.addEventListener('mousemove',  (e) => this._moveTip(e));
            h.addEventListener('mouseleave', () => this._hideTip());
            document.body.appendChild(h);
            this._hot[id] = h;
        }
        this._tip = document.createElement('div');
        this._tip.id = 'px-tip';
        document.body.appendChild(this._tip);
    }

    show() { this._visible = true;  this._cv.style.display = 'block'; }
    hide() {
        this._visible = false;
        this._cv.style.display = 'none';
        this._hideTip();
        for (const k in this._hot) this._hot[k].style.display = 'none';
    }
    get visible() { return this._visible; }

    // --- progressive-disclosure cards ---
    _tipData(id, u) {
        const bs = Math.max(-u.bz, 0);
        const vbs = (1e-3 * u.speed * bs).toFixed(2);
        switch (id) {
            case 'dayX': return { title: 'Dayside reconnection (X-line)',
                eq: 'merging ∝ V·Bs ;  site latitude ← Bz',
                val: `Bz ${u.bz.toFixed(1)} nT → Bs ${bs.toFixed(1)} nT, V·Bs ${vbs} mV/m`,
                cite: 'Southward IMF opens dayside flux — equatorward X-line; northward → high-latitude lobe reconnection' };
            case 'tailX': return { title: 'Near-Earth neutral line (substorm)',
                eq: 'lit by tail loading at lag + 30 min growth phase',
                val: `aurora-driver Bz ${(u.bzAurora ?? u.bz).toFixed(1)} nT · fires after the dayside`,
                cite: 'Loaded lobe flux reconnects in the tail — the substorm onset, delayed from the dayside' };
            case 'cusp': return { title: 'Polar cusp',
                eq: 'open field funnel — direct solar-wind entry',
                val: `widens with southward Bz (open flux ↑)`,
                cite: 'Where newly-opened field lines let magnetosheath plasma reach the ionosphere' };
            case 'imf': return { title: 'Interplanetary magnetic field',
                eq: 'draped IMF — direction sets the geoeffectiveness',
                val: `Bz ${u.bz.toFixed(1)} nT (${u.bz < 0 ? 'southward — geoeffective' : 'northward — quiet'})`,
                cite: 'Schematic upstream field; southward Bz drives reconnection' };
        }
        return null;
    }
    _showTip(id, e) {
        if (!this._lastU) return;
        const d = this._tipData(id, this._lastU);
        if (!d) return;
        this._tip.innerHTML =
            `<div class="t-title">${d.title}</div><div class="t-eq">${d.eq}</div>` +
            `<div class="t-val">${d.val}</div><div class="t-cite">${d.cite}</div>`;
        this._tip.style.display = 'block';
        this._moveTip(e);
    }
    _moveTip(e) {
        const pad = 14; let x = e.clientX + pad, y = e.clientY + pad;
        const r = this._tip.getBoundingClientRect();
        if (x + r.width  > window.innerWidth)  x = e.clientX - pad - r.width;
        if (y + r.height > window.innerHeight) y = e.clientY - pad - r.height;
        this._tip.style.left = `${x}px`; this._tip.style.top = `${y}px`;
    }
    _hideTip() { this._tip.style.display = 'none'; }

    // --- per-frame draw ---
    update(u, timeSecs) {
        this._lastU = u;
        if (!this._visible) return;

        const cv = this._cv, ctx = this._ctx;
        const W = this._srcCanvas.width, H = this._srcCanvas.height;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        cv.style.width = this._srcCanvas.clientWidth + 'px';
        cv.style.height = this._srcCanvas.clientHeight + 'px';
        const dpr = W / Math.max(this._srcCanvas.clientWidth, 1);   // device px per CSS px

        this._proj.update(u, timeSecs, W, H);
        ctx.clearRect(0, 0, W, H);

        // Driver scalars (same physics the scene reads).
        const r0    = u.r0 ?? 10.5;
        const bz    = u.bz ?? -2;
        const south = clamp01(-bz / 8);                       // dayside merging strength
        const north = clamp01(bz / 8);                        // northward → lobe reconnection
        const open  = clamp01(-bz / 10);                      // open-flux fraction (schematic)
        const load  = clamp01(-(u.bzAurora ?? bz) / 10);      // LAGGED tail loading

        // --- closed dipole shells (cool) ---
        const comp = clamp01(r0 / 10.5) * 0.45 + 0.55;        // dayside compression scale
        const tailS = 1 + 0.8 * open;                          // nightside stretch
        for (const L of [2.5, 4.0]) {
            this._drawLine(dipoleArc(L, +1, comp, 1.0), COL_CLOSED, 0.95, dpr);          // noon
            this._drawLine(dipoleArc(L, -1, tailS, 1.0 + 0.3 * open), COL_CLOSED, 0.82, dpr); // midnight
        }

        // --- open lobe field (amber): more, and longer, with southward Bz ---
        const openAlpha = 0.55 + 0.45 * open;
        this._drawLine(lobeLine(+1, open, r0), COL_OPEN, openAlpha, dpr);
        this._drawLine(lobeLine(-1, open, r0), COL_OPEN, openAlpha, dpr);

        // --- draped IMF arrows upstream of the dayside (driver, visibly swinging) ---
        const bzn = Math.max(-1, Math.min(1, bz / 6));
        const imfDir = [-0.45, bzn, 0];
        const imfWarm = clamp01(-bz / 8);
        const imfCol = [90 + 165 * imfWarm, 150 - 90 * imfWarm, 235 - 165 * imfWarm];
        for (const yy of [-4, 0, 4]) {
            this._drawArrow([r0 + 4, yy, 0], imfDir, 1.6, imfCol, 0.9, dpr);
        }

        // --- topology markers (X-lines, cusps) ---
        // Dayside X-line: site latitude rides Bz (equatorial when south, high-lat
        // lobe reconnection when north); brightness = southward merging strength.
        const lamX = north * 55 * DEG;
        const dayBright = 0.25 + 0.75 * south;
        const dx = r0 * Math.cos(lamX), dy = r0 * Math.sin(lamX);
        const dayN = [dx, dy, 0], dayS = [dx, -dy, 0];
        this._drawX(dayN, 0.95, [255, 120, 245], dayBright, dpr, dy > 0.4 ? null : 'dayside recon');
        this._drawX(dayS, 0.95, [255, 120, 245], dayBright, dpr, dy > 0.4 ? 'dayside recon' : null);
        // hotspot bounds both marks + their arm extent
        this._placeHotRect('dayX', [[dx + 1.2, dy + 1.2, 0], [dx - 1.2, -dy - 1.2, 0]], 24, 64);

        // Near-Earth neutral line: lit by the LAGGED tail driver → fires after the
        // dayside. Migrates earthward as the lobe loads.
        const xNL = 22 - 8 * load;
        const tailPos = [-xNL, 0, 0];
        this._drawX(tailPos, 1.2, COL_OPEN, 0.2 + 0.8 * load, dpr, 'neutral line');
        this._placeHotRect('tailX', [[-xNL + 1.4, 1.4, 0], [-xNL - 1.4, -1.4, 0]], 24, 64);

        // Cusps — open-field funnels, widen with southward Bz.
        const cuspBright = 0.2 + 0.7 * open;
        const cx = Math.min(1.7, r0 * 0.45);
        this._drawCusp([cx, 3.0, 0], +1, cuspBright, dpr, 'cusp');
        this._drawCusp([cx, -3.0, 0], -1, cuspBright, dpr, null);
        this._placeHotRect('cusp', [[cx * 0.5, 2.0, 0], [cx * 1.4, 3.6, 0]], 22, 56);

        // IMF column hotspot — span the three upstream arrows.
        this._placeHotRect('imf', [[r0 + 4, -4.5, 0], [r0 + 4, 4.5, 0], [r0 + 4 - 0.6, 0, 0]], 22, 56);
    }

    // --- drawing primitives (all take/emit device-pixel coords) ---
    _stroke(col, a, w) {
        const c = this._ctx;
        c.strokeStyle = `rgba(${col[0]|0},${col[1]|0},${col[2]|0},${a})`;
        c.lineWidth = w;
        c.lineCap = 'round'; c.lineJoin = 'round';
    }

    // Polyline with Earth-occlusion culling; one arrowhead near the middle.
    _drawLine(worldPts, col, alpha, dpr) {
        const c = this._ctx;
        this._stroke(col, alpha, 1.4 * dpr);
        let prev = null, mid = null, midDir = null;
        const half = Math.floor(worldPts.length / 2);
        for (let i = 0; i < worldPts.length; i++) {
            const P = worldPts[i];
            const s = (this._proj.occluded(P)) ? null : this._proj.project(P);
            if (s && prev) { c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(s.x, s.y); c.stroke(); }
            if (i === half && s && prev) { mid = s; midDir = [s.x - prev.x, s.y - prev.y]; }
            prev = s;
        }
        if (mid && midDir) this._arrowHead(mid.x, mid.y, midDir, col, alpha, 6 * dpr);
    }

    // A field-direction arrow from world `base` along world `dir` (length Rₑ).
    // Returns the screen point of the arrow tip (for hotspot placement).
    _drawArrow(base, dir, lenRe, col, alpha, dpr) {
        const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        const tip = [base[0] + dir[0] / dl * lenRe, base[1] + dir[1] / dl * lenRe, base[2] + dir[2] / dl * lenRe];
        const a = this._proj.project(base), b = this._proj.project(tip);
        if (!a || !b) return null;
        const c = this._ctx;
        this._stroke(col, alpha, 1.6 * dpr);
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        this._arrowHead(b.x, b.y, [b.x - a.x, b.y - a.y], col, alpha, 7 * dpr);
        return b;
    }

    _arrowHead(x, y, dir, col, alpha, size) {
        const a = Math.atan2(dir[1], dir[0]);
        const c = this._ctx;
        c.fillStyle = `rgba(${col[0]|0},${col[1]|0},${col[2]|0},${alpha})`;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - size * Math.cos(a - 0.4), y - size * Math.sin(a - 0.4));
        c.lineTo(x - size * Math.cos(a + 0.4), y - size * Math.sin(a + 0.4));
        c.closePath(); c.fill();
    }

    // Reconnection "✕" marker at a world point, sized in Rₑ, with a label.
    _drawX(world, sizeRe, col, bright, dpr, label) {
        if (this._proj.occluded(world)) return;
        const ctr = this._proj.project(world);
        if (!ctr) return;
        // size in px ≈ project an offset point to get the local Rₑ→px scale,
        // with a floor so a distant X stays a visible, hittable glyph.
        const off = this._proj.project([world[0], world[1] + sizeRe, world[2]]);
        const px = Math.max(off ? Math.abs(off.y - ctr.y) : 0, 13 * dpr);
        const c = this._ctx;
        c.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.5 + 0.5 * bright})`;
        c.lineWidth = (2.4 + 2.2 * bright) * dpr;
        c.lineCap = 'round';
        c.shadowColor = `rgba(${col[0]},${col[1]},${col[2]},${0.45 + 0.45 * bright})`;
        c.shadowBlur = (6 + 10 * bright) * dpr;
        c.beginPath();
        c.moveTo(ctr.x - px, ctr.y - px); c.lineTo(ctr.x + px, ctr.y + px);
        c.moveTo(ctr.x - px, ctr.y + px); c.lineTo(ctr.x + px, ctr.y - px);
        c.stroke();
        c.shadowBlur = 0;
        if (label) this._text(label, ctr.x, ctr.y + px + 13 * dpr, col, 0.5 + 0.5 * bright, dpr);
    }

    // A cusp funnel: two short converging strokes pointing at Earth, with a label.
    _drawCusp(world, hemi, bright, dpr, label) {
        if (this._proj.occluded(world)) return;
        const a = this._proj.project(world);
        const b = this._proj.project([world[0] * 0.5, world[1] - 0.8 * hemi, world[2]]);
        const d = this._proj.project([world[0] * 1.4, world[1] + 0.4 * hemi, world[2]]);
        if (!a || !b || !d) return;
        const c = this._ctx;
        this._stroke([120, 235, 160], 0.45 + 0.5 * bright, 2.0 * dpr);
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(a.x, a.y); c.lineTo(d.x, d.y); c.stroke();
        if (label) this._text(label, a.x, a.y - 8 * dpr, [120, 235, 160], 0.5 + 0.5 * bright, dpr);
    }

    // Small monospace label with a dark halo so it reads over the scene.
    _text(str, x, y, col, alpha, dpr) {
        const c = this._ctx;
        c.font = `${9.5 * dpr}px 'JetBrains Mono', 'Courier New', monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineWidth = 3 * dpr;
        c.strokeStyle = 'rgba(0,4,12,0.92)';
        c.lineJoin = 'round';
        c.strokeText(str, x, y);
        c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.min(1, alpha + 0.15)})`;
        c.fillText(str, x, y);
    }

    // Place a rectangular hover hotspot bounding the projection of `worldPts`
    // (CSS px), padded and floored to a minimum so the legend is easy to hit —
    // not luck-of-the-pixel. Hidden if nothing projects in front of Earth.
    _placeHotRect(id, worldPts, padPx = 22, minPx = 48) {
        const dpr = this._cv.width / Math.max(this._srcCanvas.clientWidth, 1);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
        for (const P of worldPts) {
            if (this._proj.occluded(P)) continue;
            const s = this._proj.project(P);
            if (!s) continue;
            const x = s.x / dpr, y = s.y / dpr;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            any = true;
        }
        const h = this._hot[id];
        if (!any) { h.style.display = 'none'; return; }
        const w  = Math.max((maxX - minX) + 2 * padPx, minPx);
        const ht = Math.max((maxY - minY) + 2 * padPx, minPx);
        h.style.display = 'block';
        h.style.left = `${(minX + maxX) / 2 - w / 2}px`;
        h.style.top  = `${(minY + maxY) / 2 - ht / 2}px`;
        h.style.width  = `${w}px`;
        h.style.height = `${ht}px`;
    }
}
