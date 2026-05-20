// Heads-up status panel: live space-weather readout with hover tooltips,
// a G-storm banner, a data-age indicator, and links to the EN/DE manuals.

const STYLE = `
#status {
    display: block !important;
    pointer-events: auto;
    background: rgba(0, 4, 14, 0.76);
    border: 1px solid rgba(60, 120, 200, 0.22);
    border-radius: 3px;
    padding: 0.55rem 0.9rem 0.45rem;
    min-width: 256px;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    color: rgba(190, 215, 255, 0.80);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 11.5px;
    line-height: 1.68;
    user-select: none;
}
.ss-row { display: flex; align-items: baseline; }
.ss-lbl {
    width: 3.6em;
    color: rgba(120, 158, 205, 0.62);
    flex-shrink: 0;
    cursor: help;
}
.ss-val {
    width: 7.6em;
    flex-shrink: 0;
    color: rgba(212, 228, 255, 0.92);
}
.ss-bar {
    color: rgba(90, 140, 210, 0.42);
    font-size: 10px;
    letter-spacing: -1.8px;
}
.ss-sep {
    border: none;
    border-top: 1px solid rgba(60, 120, 200, 0.17);
    margin: 0.38rem 0 0.30rem;
}
#ss-gstorm {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding-bottom: 0.1rem;
}
.ss-foot {
    font-size: 10px;
    color: rgba(100, 140, 180, 0.52);
    display: flex;
    justify-content: space-between;
}
.ss-manual {
    font-size: 10px;
    color: rgba(100, 140, 180, 0.52);
    margin-top: 0.16rem;
}
.ss-manual a {
    color: rgba(120, 165, 220, 0.78);
    text-decoration: none;
    pointer-events: auto;
}
.ss-manual a:hover { color: rgba(170, 205, 255, 0.95); }
#ss-stale {
    font-size: 10px;
    color: #f84;
    margin-top: 0.1rem;
    min-height: 1em;
}

/* Data-mode overlay (Phase 3) — bottom-right; shown when renderMode == 'data' */
#data-panel {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    background: rgba(0, 4, 14, 0.84);
    border: 1px solid rgba(60, 120, 200, 0.22);
    border-radius: 3px;
    padding: 0.65rem 0.95rem 0.55rem;
    width: 320px;
    color: rgba(190, 215, 255, 0.82);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 10.5px;
    line-height: 1.55;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    pointer-events: auto;
    z-index: 15;
    display: none;
    user-select: none;
}
#data-panel.dp-show { display: block; }
.dp-head {
    color: rgba(95, 160, 245, 0.88);
    font-size: 9.5px;
    letter-spacing: 0.12em;
    font-weight: 600;
    margin-bottom: 0.25rem;
}
.dp-sec {
    color: rgba(70, 120, 185, 0.58);
    font-size: 8.5px;
    letter-spacing: 0.14em;
    margin: 0.45rem 0 0.15rem;
    padding-bottom: 0.1rem;
    border-bottom: 1px solid rgba(60, 120, 200, 0.14);
}
.dp-line {
    display: grid;
    grid-template-columns: 3.4em 5.6em 1fr;
    align-items: baseline;
    column-gap: 0.5em;
    font-size: 10.5px;
}
.dp-k    { color: rgba(120, 158, 205, 0.66); }
.dp-v    { color: rgba(212, 228, 255, 0.94); text-align: right; font-variant-numeric: tabular-nums; }
.dp-meta { color: rgba(100, 138, 180, 0.62); font-size: 9.5px; }
`;

// Hover tooltip text per label
const TIP = {
    Bz:    'IMF Bz [nT] — southward (−) drives magnetopause reconnection and aurora oval expansion',
    Bt:    'IMF total field strength [nT] — higher Bt = stronger solar-wind coupling potential',
    Spd:   'Solar wind speed [km/s] — quiet: 350–500, elevated: 500–650, storm: 650+',
    Kp:    'Kp index: planetary geomagnetic activity. 0=quiet, 5=G1 storm, 7=G3 strong, 9=G5 extreme',
    P:     'Solar wind dynamic pressure [nPa] — compresses the magnetopause inward toward Earth',
    Flare: 'GOES X-ray flux class — A/B: background, C: minor, M: moderate, X: major flare',
    Dst:   'Modeled Dst [nT] — ring-current strength integrated from the Burton/O’Brien (2000) solar-wind coupling. An estimate, not the official Kyoto Dst.',
    Phase: 'Storm phase from dDst/dt: injection winning = main phase (↓), ring-current decay winning = recovery (↑)',
};

// ── colour helpers ────────────────────────────────────────────────────────────

function bzColor(bz) {
    if (bz  >   0) return '#5bf';               // northward — quiet
    if (bz  >  -5) return 'rgba(212,228,255,.92)';
    if (bz  > -15) return '#f93';               // elevated storm driving
    return '#f44';                              // extreme
}

function kpColor(kp) {
    if (kp < 5) return 'rgba(212,228,255,.92)';
    if (kp < 7) return '#fb5';
    return '#f44';
}

function flareColor(f) {
    if (f < 3) return 'rgba(212,228,255,.92)'; // A/B background
    if (f < 4) return '#fd5';                  // C
    if (f < 5) return '#f85';                  // M
    return '#f44';                             // X
}

function ageColor(s) {
    if (s < 300) return 'rgba(80,200,120,.75)'; // fresh
    if (s < 900) return '#fd5';                 // getting old
    return '#f44';                              // stale (>15 min)
}

// Dst storm classification (NOAA/Loewe-Prölss bands)
function dstColor(d) {
    if (d > -20)  return 'rgba(212,228,255,.92)'; // quiet
    if (d > -50)  return '#fd5';                  // weak storm
    if (d > -100) return '#f93';                  // moderate storm
    return '#f44';                                // intense storm
}

// ── formatters ────────────────────────────────────────────────────────────────

// flare: log10(flux)+9 scale. 1=A1.0, 2=B1.0, 3=C1.0, 4=M1.0, 5=X1.0
function formatFlare(f) {
    if (f < 1) return 'A<1';
    const tiers = 'ABCMX';
    const tier  = Math.min(Math.floor(f) - 1, 4);
    const num   = Math.pow(10, f - (tier + 1));
    return `${tiers[tier]}${num >= 10 ? num.toFixed(0) : num.toFixed(1)}`;
}

function kpBar(kp) {
    const n = Math.round(Math.min(Math.max(kp, 0), 9));
    return '█'.repeat(n) + '░'.repeat(9 - n);
}

// NOAA G-storm scale derived from Kp (Kp5=G1 … Kp9=G5)
function kpToG(kp) { return kp < 5 ? 0 : Math.min(Math.floor(kp) - 4, 5); }
const G_LABEL = ['','G1 Minor','G2 Moderate','G3 Strong','G4 Severe','G5 Extreme'];
const G_COLOR = ['','#fd5','#f93','#f44','#f44','#f44'];

function formatAge(s) {
    if (!isFinite(s) || s <= 0) return '—';
    if (s < 60)   return `${Math.round(s)}s ago`;
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return `${(s / 3600).toFixed(1)} h ago`;
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function row(k1, id1, k2, id2, extraRight = '') {
    return `<div class="ss-row">
  <span class="ss-lbl" title="${TIP[k1]}">${k1}</span>
  <span class="ss-val" id="${id1}">—</span>
  <span class="ss-lbl" title="${TIP[k2]}">${k2}</span>
  ${extraRight}
  <span class="ss-val" id="${id2}">—</span>
</div>`;
}

// ── UI class ──────────────────────────────────────────────────────────────────

// Data-mode overlay rows — keyed by uniform, with units, citation and the
// scene feature each value drives. Kept here so the markup is a single
// source of truth that update() can re-populate from live uniforms.
const DATA_ROWS = [
    { section: 'L1 SOLAR WIND' },
    { k: 'Bz',  id: 'dp-bz',       u: 'nT',     cite: 'DSCOVR/MAG @ L1',         drive: 'reconnection · X-line firing' },
    { k: 'Bt',  id: 'dp-bt',       u: 'nT',     cite: 'DSCOVR/MAG',               drive: 'coupling strength' },
    { k: 'Spd', id: 'dp-speed',    u: 'km/s',   cite: 'DSCOVR/PLASMAG',           drive: 'shock heating · L1 lag' },
    { k: 'n',   id: 'dp-density',  u: 'cm⁻³',   cite: 'DSCOVR/PLASMAG',           drive: 'dynamic pressure (ρv²)' },
    { k: 'P',   id: 'dp-pressure', u: 'nPa',    cite: 'ρv² · 1.67e-6',            drive: 'magnetopause compression' },
    { section: 'MAGNETOSPHERE (DERIVED)' },
    { k: 'r₀',  id: 'dp-r0',       u: 'R_E',    cite: 'Shue 1997',                drive: 'subsolar magnetopause standoff' },
    { k: 'α',   id: 'dp-alpha',    u: '',       cite: 'Shue 1997',                drive: 'magnetopause flaring' },
    { section: 'INDICES' },
    { k: 'Kp',  id: 'dp-kp',       u: '',       cite: 'NOAA planetary K',         drive: 'aurora oval extent' },
    { k: 'Flr', id: 'dp-flare',    u: '',       cite: 'GOES X-ray 0.1–0.8 nm',    drive: 'flare flash · radio blackouts' },
    { section: 'DST RING CURRENT' },
    { k: 'Dst', id: 'dp-dst',      u: 'nT',     cite: 'Burton 1975 / O\'Brien 2000', drive: 'partial ring current · main/recovery' },
    { k: 'τ',   id: 'dp-dsttau',   u: 'h',      cite: 'O\'Brien & McPherron 2000', drive: 'ring-current decay timescale' },
    { k: 'Q',   id: 'dp-dstinj',   u: 'nT/h',   cite: 'VBs injection',            drive: 'ring-current loading rate' },
    { section: 'PHYSICAL TIME (Phase 1)' },
    { k: 'lag', id: 'dp-lag',      u: 'min',    cite: '1.5×10⁶ km / v_sw',        drive: 'scene = L1 (now − lag)' },
    { k: 'age', id: 'dp-age',      u: '',       cite: 'last fetch',               drive: 'data freshness' },
];

function dataPanelHTML() {
    const rows = DATA_ROWS.map(r => {
        if (r.section) return `<div class="dp-sec">${r.section}</div>`;
        return `<div class="dp-line">
  <span class="dp-k">${r.k}</span>
  <span class="dp-v" id="${r.id}">—</span>
  <span class="dp-meta" title="${r.cite}">→ ${r.drive}</span>
</div>`;
    }).join('');
    return `<div class="dp-head">DATA — live uniforms · F3 cycles modes</div>${rows}`;
}

export class UI {
    constructor(renderMode = null) {
        this._el = document.getElementById('status');
        if (!this._el) return;

        // Inject stylesheet once
        const style = document.createElement('style');
        style.textContent = STYLE;
        document.head.appendChild(style);

        this._el.innerHTML = `
${row('Bz', 'ss-bz', 'Spd', 'ss-speed')}
<div class="ss-row">
  <span class="ss-lbl" title="${TIP.Bt}">Bt</span>
  <span class="ss-val" id="ss-bt">—</span>
  <span class="ss-lbl" title="${TIP.Kp}">Kp</span>
  <span id="ss-kp" style="width:2.6em;flex-shrink:0;color:rgba(212,228,255,.92)">—</span>
  <span class="ss-bar" id="ss-kpbar" style="flex-shrink:0"></span>
</div>
${row('P', 'ss-pressure', 'Flare', 'ss-flare')}
${row('Dst', 'ss-dst', 'Phase', 'ss-dstphase')}
<div id="ss-gstorm"></div>
<hr class="ss-sep">
<div class="ss-foot">
  <a href="https://www.swpc.noaa.gov" target="_blank"
     style="color:inherit;text-decoration:none;pointer-events:auto">
    NOAA SWPC · DSCOVR@L1
  </a>
  <span id="ss-age"></span>
</div>
<div class="ss-manual">Manual: <a href="./docs/readme.html" target="_blank" rel="noopener">EN</a> | <a href="./docs/readme.de.html" target="_blank" rel="noopener">DE</a></div>
<div id="ss-stale"></div>`;

        // Data-mode overlay — built once, shown only when renderMode == 'data'.
        const dp = document.createElement('div');
        dp.id = 'data-panel';
        dp.innerHTML = dataPanelHTML();
        document.body.appendChild(dp);
        this._dataPanel = dp;
        if (renderMode) {
            renderMode.onChange(mode => {
                dp.classList.toggle('dp-show', mode === 'data');
            });
        }
    }

    update({ bz, bt, speed, pressure, kp, flare, dst, dstInject, dstDecay, dstTau, density, r0, alpha, lagSeconds, dataAge, isStale }) {
        if (!this._el) return;

        this._s('ss-bz',       `${bz >= 0 ? '+' : ''}${bz.toFixed(1)} nT`, bzColor(bz));
        this._s('ss-speed',    `${speed.toFixed(0)} km/s`);
        this._s('ss-bt',       `${bt.toFixed(1)} nT`);
        this._s('ss-kp',       kp.toFixed(1),           kpColor(kp));
        this._s('ss-kpbar',    kpBar(kp));
        this._s('ss-pressure', `${pressure.toFixed(1)} nPa`);
        this._s('ss-flare',    formatFlare(flare),       flareColor(flare));

        // Dst is modeled, not measured — the leading "~" marks it as an estimate
        this._s('ss-dst', `~${dst >= 0 ? '+' : ''}${dst.toFixed(0)} nT`, dstColor(dst));
        const dRate = dstInject + dstDecay;          // dDst*/dt [nT/h]
        let phase, pcol;
        if (dRate < -2)     { phase = 'main ↓';     pcol = '#f93'; }
        else if (dRate > 2) { phase = 'recovery ↑'; pcol = 'rgba(80,200,120,.78)'; }
        else                { phase = 'steady';     pcol = 'rgba(212,228,255,.92)'; }
        this._s('ss-dstphase', phase, pcol);

        this._s('ss-age',      formatAge(dataAge),       ageColor(dataAge));

        const g    = kpToG(kp);
        const gsEl = document.getElementById('ss-gstorm');
        if (gsEl) {
            gsEl.style.display = g > 0 ? '' : 'none';
            if (g > 0) {
                gsEl.textContent = `⚡ ${G_LABEL[g]} geomagnetic storm`;
                gsEl.style.color = G_COLOR[g];
            }
        }

        const stEl = document.getElementById('ss-stale');
        if (stEl) stEl.textContent = isStale ? '⚠ stale data — last update > 15 min' : '';

        // ── Data-mode overlay rows ──
        // Only fill when the panel is on-screen; the DOM writes are cheap but
        // skipping them when hidden keeps the work proportional to visibility.
        if (this._dataPanel?.classList.contains('dp-show')) {
            const lagMin = lagSeconds ? lagSeconds / 60 : 0;
            this._s('dp-bz',       `${bz >= 0 ? '+' : ''}${bz.toFixed(1)}`);
            this._s('dp-bt',       bt.toFixed(1));
            this._s('dp-speed',    speed.toFixed(0));
            this._s('dp-density',  (density ?? 0).toFixed(1));
            this._s('dp-pressure', pressure.toFixed(2));
            this._s('dp-r0',       (r0 ?? 0).toFixed(2));
            this._s('dp-alpha',    (alpha ?? 0).toFixed(3));
            this._s('dp-kp',       kp.toFixed(1));
            this._s('dp-flare',    formatFlare(flare));
            this._s('dp-dst',      `${dst >= 0 ? '+' : ''}${dst.toFixed(0)}`);
            this._s('dp-dsttau',   (dstTau ?? 0).toFixed(2));
            this._s('dp-dstinj',   (dstInject ?? 0).toFixed(1));
            this._s('dp-lag',      lagMin.toFixed(1));
            this._s('dp-age',      formatAge(dataAge));
        }
    }

    _s(id, text, color) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        if (color !== undefined) el.style.color = color;
    }
}
