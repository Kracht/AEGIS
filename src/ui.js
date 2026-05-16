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
`;

// Hover tooltip text per label
const TIP = {
    Bz:    'IMF Bz [nT] — southward (−) drives magnetopause reconnection and aurora oval expansion',
    Bt:    'IMF total field strength [nT] — higher Bt = stronger solar-wind coupling potential',
    Spd:   'Solar wind speed [km/s] — quiet: 350–500, elevated: 500–650, storm: 650+',
    Kp:    'Kp index: planetary geomagnetic activity. 0=quiet, 5=G1 storm, 7=G3 strong, 9=G5 extreme',
    P:     'Solar wind dynamic pressure [nPa] — compresses the magnetopause inward toward Earth',
    Flare: 'GOES X-ray flux class — A/B: background, C: minor, M: moderate, X: major flare',
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

export class UI {
    constructor() {
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
    }

    update({ bz, bt, speed, pressure, kp, flare, dataAge, isStale }) {
        if (!this._el) return;

        this._s('ss-bz',       `${bz >= 0 ? '+' : ''}${bz.toFixed(1)} nT`, bzColor(bz));
        this._s('ss-speed',    `${speed.toFixed(0)} km/s`);
        this._s('ss-bt',       `${bt.toFixed(1)} nT`);
        this._s('ss-kp',       kp.toFixed(1),           kpColor(kp));
        this._s('ss-kpbar',    kpBar(kp));
        this._s('ss-pressure', `${pressure.toFixed(1)} nPa`);
        this._s('ss-flare',    formatFlare(flare),       flareColor(flare));
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
    }

    _s(id, text, color) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        if (color !== undefined) el.style.color = color;
    }
}
