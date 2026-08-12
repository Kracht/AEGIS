// Causal HUD — the Phase-4 centrepiece. A camera-independent SVG overlay of the
// magnetosphere's two-branch causal graph (consultation §1.2), the reviewer's
// #1 ask. It is built *last* on purpose: it can only be honest once the L1
// advection lag (Phase 1) and the Burton/O'Brien Dst ODE (Phase 2) exist
// underneath, so the arrows light in physical order with real delays rather
// than re-teaching "cause = effect, now."
//
// The single most transferable lesson it carries (§1.2) is that the two branches
// are INDEPENDENT and run on different clocks:
//
//   COMPRESSION  Pdyn = ρv²  ──(L1 advection)──▶  r₀ standoff      (fast, pressure)
//   STORM        Bz south ─▶ reconnection ─▶ injection ──(τ hours)──▶ Dst   (slow, VBs)
//
// A high-speed stream can light the top branch (r₀ slams in) while the bottom
// stays dark; a slow southward stream can drive a deep Dst with little
// compression. Drawing them as two physically separate tracks is the curriculum.
//
// Progressive disclosure: the skeleton reads at a glance; hovering a node
// reveals its governing equation, live value, and citation.

// Each node: position (in a 760×210 viewBox), label, the branch it belongs to,
// an intensity(u) ∈ [0,1] for threshold-lighting, and a detail(u) for the
// hover card. Keep intensity maps gentle so quiet conditions read as "dim, not
// off" and storms clearly saturate.
const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const bs   = (u) => Math.max(-u.bz, 0);                    // southward component [nT]
const vbsOf = (u) => 1e-3 * u.speed * bs(u);               // rectified E-field [mV/m]

const NODES = [
    { id: 'pdyn', x: 56,  y: 46,  branch: 'top', label: 'Pdyn', sub: 'ρv²',
      intensity: (u) => clamp01((u.pressure - 1) / 12),
      detail: (u) => ({ title: 'Dynamic pressure',
        eq: 'Pdyn = 1.67e-6 · n · v²',
        val: `${u.pressure.toFixed(1)} nPa   (n=${u.density.toFixed(1)} cm⁻³, v=${u.speed.toFixed(0)} km/s)`,
        cite: 'Solar-wind ram pressure' }) },
    { id: 'r0', x: 358, y: 46, branch: 'top', label: 'r₀ standoff', sub: 'Shue ’97',
      intensity: (u) => clamp01((10.8 - u.r0) / 4.5),
      detail: (u) => ({ title: 'Magnetopause standoff',
        eq: 'r₀ = (11.4 + 0.013·Bz)·Pdyn^(−1/6.6)',
        val: `${u.r0.toFixed(1)} Rₑ   (compression ${(10.8 - u.r0).toFixed(1)} Rₑ)`,
        cite: 'Shue et al. 1997 — pressure term dominates' }) },

    { id: 'bz', x: 56, y: 150, branch: 'bot', label: 'Bz IMF', sub: 'GSM',
      intensity: (u) => clamp01(bs(u) / 15),
      detail: (u) => ({ title: 'Interplanetary Bz',
        eq: 'Bs = max(−Bz, 0)',
        val: `Bz = ${u.bz.toFixed(1)} nT   →   Bs = ${bs(u).toFixed(1)} nT`,
        cite: 'Southward IMF opens the dayside' }) },
    { id: 'recon', x: 274, y: 150, branch: 'bot', label: 'reconnection', sub: 'VBs',
      intensity: (u) => clamp01(vbsOf(u) / 5),
      detail: (u) => ({ title: 'Dayside reconnection',
        eq: 'VBs = 10⁻³ · V · Bs   [mV/m]',
        val: `${vbsOf(u).toFixed(2)} mV/m`,
        cite: 'Rectified merging electric field' }) },
    { id: 'inject', x: 492, y: 150, branch: 'bot', label: 'injection Q', sub: 'O’Brien ’00',
      intensity: (u) => clamp01(-u.dstInject / 30),
      detail: (u) => ({ title: 'Ring-current injection',
        eq: 'Q = −4.4·(VBs − 0.49)   [nT/h]',
        val: `${u.dstInject.toFixed(1)} nT/h   (threshold VBs > 0.49)`,
        cite: 'O’Brien & McPherron 2000' }) },
    { id: 'dst', x: 702, y: 150, branch: 'bot', label: 'Dst', sub: 'Burton ’75',
      intensity: (u) => clamp01(-u.dst / 250),
      detail: (u) => ({ title: 'Ring-current index',
        eq: 'dDst*/dt = Q − Dst*/τ ;  Dst = Dst* + 7.26√Pdyn − 11',
        val: `${u.dst.toFixed(0)} nT   (τ = ${u.dstTau.toFixed(1)} h)`,
        cite: 'Burton et al. 1975 — injection vs. decay',
        obs: (typeof u.hp30 === 'number' && isFinite(u.hp30))
            ? `Hp30 = ${u.hp30.toFixed(2)}  (GFZ — 30-min, open above 9)`
            : null }) },
];

// Edges: from → to, with an optional clock(u) annotation that surfaces the
// real physical delay on that propagation step.
const EDGES = [
    { from: 'pdyn', to: 'r0',  clock: (u) => `⏱ ${lagMin(u)} min` },        // L1 advection
    { from: 'bz', to: 'recon', clock: (u) => `⏱ ${lagMin(u)} min` },        // L1 advection
    { from: 'recon', to: 'inject' },
    { from: 'inject', to: 'dst', clock: (u) => `τ ${u.dstTau.toFixed(1)} h` }, // ring-current decay
];

const lagMin = (u) => Math.round((u.lagSeconds ?? 0) / 60);

const W = 96, H = 38; // node box size — wide enough for the longest label ("reconnection")

const CSS = `
#causal-hud {
    position: fixed;
    top: 1.1rem;
    left: 50%;
    transform: translateX(-50%);
    width: min(760px, 92vw);
    z-index: 19;
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.25s ease;
}
#causal-hud.ch-show { opacity: 1; }
#causal-hud .ch-title {
    text-align: center;
    color: rgba(95, 160, 245, 0.78);
    font-size: 9.5px;
    letter-spacing: 0.18em;
    margin-bottom: 0.15rem;
}
#causal-hud svg { width: 100%; height: auto; display: block; overflow: visible; }
#causal-hud .ch-node { pointer-events: auto; cursor: help; }
#causal-hud .ch-box {
    fill: rgba(0, 6, 16, 0.78);
    stroke: rgba(60, 120, 200, 0.30);
    stroke-width: 1;
    rx: 3;
}
#causal-hud .ch-lbl  { fill: rgba(150, 190, 235, 0.92); font-size: 11px; text-anchor: middle; }
#causal-hud .ch-sub  { fill: rgba(95, 135, 185, 0.62); font-size: 7.5px; text-anchor: middle; letter-spacing: 0.04em; }
#causal-hud .ch-edge { stroke: rgba(70, 120, 185, 0.45); stroke-width: 1.4; fill: none; }
#causal-hud .ch-arrow { fill: rgba(70, 120, 185, 0.6); }
#causal-hud .ch-clock {
    fill: rgba(165, 205, 255, 0.98);
    font-size: 8.5px;
    text-anchor: middle;
    /* dark halo so the delay clocks read over the bright magnetosheath */
    stroke: rgba(0, 4, 12, 0.92);
    stroke-width: 2.6px;
    paint-order: stroke fill;
    stroke-linejoin: round;
}
#causal-hud .ch-branchlbl {
    fill: rgba(125, 165, 215, 0.85);
    font-size: 8px;
    letter-spacing: 0.12em;
    stroke: rgba(0, 4, 12, 0.85);
    stroke-width: 2.4px;
    paint-order: stroke fill;
    stroke-linejoin: round;
}
#ch-tip {
    position: fixed;
    z-index: 25;
    max-width: 290px;
    background: rgba(0, 4, 14, 0.94);
    border: 1px solid rgba(70, 130, 210, 0.34);
    border-radius: 3px;
    padding: 0.5rem 0.65rem;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    pointer-events: none;
    display: none;
}
#ch-tip .t-title { color: rgba(120, 180, 250, 0.95); font-size: 10px; letter-spacing: 0.06em; margin-bottom: 0.25rem; }
#ch-tip .t-eq    { color: rgba(200, 222, 255, 0.92); font-size: 11px; margin-bottom: 0.2rem; }
#ch-tip .t-val   { color: rgba(150, 235, 200, 0.92); font-size: 10.5px; font-variant-numeric: tabular-nums; }
/* Observed-ghost line: amber to distinguish measured ground truth from modeled value (t-val, cyan-green). */
#ch-tip .t-obs   { color: rgba(255, 180, 90, 0.92); font-size: 10px; font-variant-numeric: tabular-nums; margin-top: 0.2rem; }
#ch-tip .t-cite  { color: rgba(110, 150, 200, 0.6); font-size: 8.5px; margin-top: 0.3rem; font-style: italic; }
`;

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

export class CausalHUD {
    constructor() {
        this._visible = false;
        this._nodeEls = {};   // id → { box, lbl }
        this._edgeEls = [];   // { clockText }
        this._lastU   = null;
        this._injectStyle();
        this._build();
        window.addEventListener('keydown', (e) => {
            if (e.key === 'F4') { e.preventDefault(); this.toggle(); }
        });
        this._addPerfChip();
    }

    // Mirrors camera.js's own chip-append: nobody finds F4 on their own, so
    // advertise it in the top-right perf bar next to Mode [F3] / Settings [F2].
    _addPerfChip() {
        const perf = document.getElementById('perf');
        if (!perf) return;

        const sep = document.createElement('span');
        sep.className = 'perf-sep';
        sep.textContent = '·';

        const chip = document.createElement('span');
        chip.className = 'perf-settings';
        chip.title = 'Toggle the causal-chain HUD (compression + storm branches)';
        chip.addEventListener('click', () => this.toggle());
        perf.append(sep, chip);
        this._chip = chip;
        this._syncChip();
    }

    _syncChip() {
        if (this._chip) this._chip.textContent = `Causal: ${this._visible ? 'ON' : 'OFF'} [F4]`;
    }

    _injectStyle() {
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    _build() {
        this._root = document.createElement('div');
        this._root.id = 'causal-hud';

        const title = document.createElement('div');
        title.className = 'ch-title';
        title.textContent = 'CAUSAL CHAIN — WHY IT CHANGED';
        this._root.appendChild(title);

        const s = svg('svg', { viewBox: '0 0 760 210' });

        // branch labels
        const bt = svg('text', { x: 4, y: 18, class: 'ch-branchlbl' }); bt.textContent = 'COMPRESSION'; s.appendChild(bt);
        const bb = svg('text', { x: 4, y: 128, class: 'ch-branchlbl' }); bb.textContent = 'STORM'; s.appendChild(bb);

        // edges first (under nodes)
        for (const e of EDGES) {
            const a = NODES.find(n => n.id === e.from), b = NODES.find(n => n.id === e.to);
            const x1 = a.x + W / 2, y1 = a.y + H / 2;
            const x2 = b.x - W / 2, y2 = b.y + H / 2;
            const line = svg('path', { class: 'ch-edge',
                d: `M ${x1} ${y1} L ${x2 - 6} ${y2}` });
            s.appendChild(line);
            // arrowhead
            const ah = svg('path', { class: 'ch-arrow',
                d: `M ${x2 - 6} ${y2 - 4} L ${x2} ${y2} L ${x2 - 6} ${y2 + 4} Z` });
            s.appendChild(ah);
            let clockText = null;
            if (e.clock) {
                clockText = svg('text', { x: (x1 + x2) / 2, y: y1 - 6, class: 'ch-clock' });
                s.appendChild(clockText);
            }
            this._edgeEls.push({ clockText, clock: e.clock });
        }

        // nodes
        for (const n of NODES) {
            const g = svg('g', { class: 'ch-node' });
            const box = svg('rect', { class: 'ch-box', x: n.x - W / 2, y: n.y, width: W, height: H, rx: 3 });
            const lbl = svg('text', { class: 'ch-lbl', x: n.x, y: n.y + 16 });
            lbl.textContent = n.label;
            const sub = svg('text', { class: 'ch-sub', x: n.x, y: n.y + 28 });
            sub.textContent = n.sub;
            g.append(box, lbl, sub);
            g.addEventListener('mouseenter', (ev) => this._showTip(n, ev));
            g.addEventListener('mousemove',  (ev) => this._moveTip(ev));
            g.addEventListener('mouseleave', () => this._hideTip());
            s.appendChild(g);
            this._nodeEls[n.id] = { box, lbl };
        }

        this._root.appendChild(s);
        document.body.appendChild(this._root);

        this._tip = document.createElement('div');
        this._tip.id = 'ch-tip';
        document.body.appendChild(this._tip);
    }

    _showTip(node, ev) {
        if (!this._lastU) return;
        const d = node.detail(this._lastU);
        this._tip.innerHTML =
            `<div class="t-title">${d.title}</div>` +
            `<div class="t-eq">${d.eq}</div>` +
            `<div class="t-val">${d.val}</div>` +
            (d.obs ? `<div class="t-obs">observed · ${d.obs}</div>` : '') +
            `<div class="t-cite">${d.cite}</div>`;
        this._tip.style.display = 'block';
        this._moveTip(ev);
    }
    _moveTip(ev) {
        const pad = 14;
        let x = ev.clientX + pad, y = ev.clientY + pad;
        const r = this._tip.getBoundingClientRect();
        if (x + r.width > window.innerWidth)  x = ev.clientX - pad - r.width;
        if (y + r.height > window.innerHeight) y = ev.clientY - pad - r.height;
        this._tip.style.left = `${x}px`;
        this._tip.style.top  = `${y}px`;
    }
    _hideTip() { this._tip.style.display = 'none'; }

    show()   { this._visible = true;  this._root.classList.add('ch-show'); this._syncChip(); }
    hide()   { this._visible = false; this._root.classList.remove('ch-show'); this._hideTip(); this._syncChip(); }
    toggle() { this._visible ? this.hide() : this.show(); }
    get visible() { return this._visible; }

    // Threshold-light nodes and refresh edge clocks from the live uniforms.
    update(u) {
        this._lastU = u;
        if (!this._visible) return;
        for (const n of NODES) {
            const k = clamp01(n.intensity(u));
            const els = this._nodeEls[n.id];
            // dim → lit: brighten fill + stroke + label toward cyan-white
            els.box.style.fill = `rgba(${10 + k * 30}, ${20 + k * 90}, ${40 + k * 120}, ${0.78})`;
            els.box.style.stroke = `rgba(${60 + k * 80}, ${120 + k * 110}, ${200 + k * 55}, ${0.30 + k * 0.65})`;
            els.box.style.filter = k > 0.04 ? `drop-shadow(0 0 ${1 + k * 7}px rgba(90,170,255,${0.25 + k * 0.5}))` : 'none';
            els.lbl.style.fill = `rgba(${150 + k * 90}, ${190 + k * 50}, ${235 + k * 20}, ${0.7 + k * 0.3})`;
        }
        for (const e of this._edgeEls) {
            if (e.clockText && e.clock) e.clockText.textContent = e.clock(u);
        }

        // Hp30 observed-ghost border on the Dst node: amber tint when the
        // measured GFZ index crosses the Kp-equivalent storm-onset (≥ 5).
        // Brightness ramps further past 9 (Hp30 is open-ended) so a Carrington-
        // class event reads as a hot border rather than saturating at Kp = 9.
        const dstEls = this._nodeEls.dst;
        if (dstEls && typeof u.hp30 === 'number' && isFinite(u.hp30)) {
            const g = clamp01((u.hp30 - 4) / 7);   // dim at 4, full at 11
            if (g > 0) {
                dstEls.box.style.stroke = `rgba(255, ${165 - g * 40}, ${70 + (1 - g) * 60}, ${0.55 + g * 0.4})`;
                dstEls.box.style.filter =
                    `drop-shadow(0 0 ${3 + g * 6}px rgba(255, 170, 80, ${0.35 + g * 0.5}))`;
            }
        }
    }
}
