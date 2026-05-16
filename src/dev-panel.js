// Visual-tuning panel (toggle: F2) plus the FPS / frametime readout and the
// clickable "Settings [F2]" affordance. Shipped in the public release.

const DEFAULTS = {
    camRadius:       12.0,
    fov:             0.38,
    exposure:        1.0,
    gamma:           2.2,
    starBright:      1.0,
    auroraScale:     1.0,
    nightlightScale: 1.0,
    limbScale:       1.0,
    fieldScale:      1.0,
    volExtinct:      1.0,
};

// section-only entries have no `key`.
const SLIDERS = [
    { section: 'CAMERA' },
    { key: 'camRadius', label: 'Orbit',    min: 11,   max: 25,  step: 0.5,  unit: 'Re' },
    { key: 'fov',       label: 'FOV',      min: 0.15, max: 0.70, step: 0.01, unit: ''   },
    { section: 'SCENE' },
    { key: 'exposure',  label: 'Exposure', min: 0.1,  max: 4.0,  step: 0.05, unit: ''   },
    { key: 'gamma',     label: 'Gamma',    min: 1.0,  max: 3.5,  step: 0.1,  unit: ''   },
    { section: 'SPACE' },
    { key: 'starBright',  label: 'Stars',   min: 0,   max: 4.0, step: 0.05, unit: '×' },
    { key: 'auroraScale', label: 'Aurora',  min: 0,   max: 4.0, step: 0.05, unit: '×' },
    { key: 'fieldScale',  label: 'Fields',  min: 0,   max: 4.0, step: 0.05, unit: '×' },
    { key: 'volExtinct',  label: 'Scatter', min: 0.1, max: 3.0, step: 0.05, unit: '×' },
    { section: 'EARTH' },
    { key: 'nightlightScale', label: 'Nlights', min: 0, max: 4.0, step: 0.05, unit: '×' },
    { key: 'limbScale',       label: 'Atmos',   min: 0, max: 3.0, step: 0.05, unit: '×' },
];

const CSS = `
#perf {
    position: fixed;
    top: 1.25rem;
    right: 1.5rem;
    color: rgba(90, 150, 210, 0.55);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 10.5px;
    pointer-events: none;
    z-index: 20;
    letter-spacing: 0.03em;
    user-select: none;
}
#perf .perf-sep { opacity: 0.5; margin: 0 0.45em; }
#perf .perf-settings {
    pointer-events: auto;
    cursor: pointer;
    color: rgba(95, 160, 245, 0.62);
}
#perf .perf-settings:hover { color: rgba(150, 200, 255, 0.92); }
#dev-panel {
    position: fixed;
    top: 3.0rem;
    right: 1.5rem;
    width: 242px;
    background: rgba(0, 4, 14, 0.82);
    border: 1px solid rgba(60, 120, 200, 0.22);
    border-radius: 3px;
    padding: 0.55rem 0.85rem 0.65rem;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    color: rgba(190, 215, 255, 0.80);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.5;
    z-index: 20;
    user-select: none;
}
#dev-panel.dp-hidden { display: none; }
.dp-header {
    display: flex;
    align-items: center;
    margin-bottom: 0.35rem;
}
.dp-title {
    color: rgba(95, 160, 245, 0.88);
    font-size: 10.5px;
    letter-spacing: 0.10em;
    font-weight: 600;
}
.dp-hint {
    color: rgba(65, 110, 170, 0.48);
    font-size: 9px;
    margin-left: auto;
}
.dp-section {
    color: rgba(70, 120, 185, 0.52);
    font-size: 8.5px;
    letter-spacing: 0.14em;
    margin: 0.48rem 0 0.18rem;
    padding-bottom: 0.12rem;
    border-bottom: 1px solid rgba(60, 120, 200, 0.12);
}
.dp-row {
    display: grid;
    grid-template-columns: 4.2em 1fr 5.0em;
    align-items: center;
    column-gap: 0.4em;
    margin: 0.16rem 0;
}
.dp-lbl { color: rgba(120, 158, 205, 0.62); font-size: 10.5px; }
.dp-val {
    color: rgba(200, 222, 255, 0.90);
    text-align: right;
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
}
#dev-panel input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 2px;
    background: rgba(45, 100, 185, 0.36);
    outline: none;
    cursor: pointer;
    border-radius: 1px;
}
#dev-panel input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: rgba(80, 162, 255, 0.88);
    cursor: pointer;
    box-shadow: 0 0 5px rgba(80, 160, 255, 0.42);
}
#dev-panel input[type=range]::-moz-range-thumb {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: rgba(80, 162, 255, 0.88);
    cursor: pointer;
    border: none;
    box-shadow: 0 0 5px rgba(80, 160, 255, 0.42);
}
.dp-reset {
    display: block;
    width: 100%;
    margin-top: 0.52rem;
    padding: 0.28rem 0;
    background: rgba(22, 62, 122, 0.22);
    border: 1px solid rgba(60, 120, 200, 0.22);
    border-radius: 2px;
    color: rgba(105, 160, 225, 0.58);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.05em;
    cursor: pointer;
}
.dp-reset:hover {
    background: rgba(42, 92, 172, 0.32);
    color: rgba(148, 200, 255, 0.85);
}
`;

export class DevPanel {
    constructor() {
        this._params = { ...DEFAULTS };
        this._visible = false;
        this._inputs  = {};
        this._perfEl  = null;
        this._statsEl = null;
        this._panel   = null;
        this._injectStyle();
        this._buildDOM();
        this._bindKeys();
    }

    getParams() {
        return { ...this._params };
    }

    updatePerf(fps, dtMs) {
        if (this._statsEl) {
            this._statsEl.textContent = `${fps.toFixed(0)} fps · ${dtMs.toFixed(1)} ms`;
        }
    }

    _injectStyle() {
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    _buildDOM() {
        this._perfEl = document.createElement('div');
        this._perfEl.id = 'perf';

        this._statsEl = document.createElement('span');
        this._statsEl.className = 'perf-stats';

        const sep = document.createElement('span');
        sep.className = 'perf-sep';
        sep.textContent = '·';

        const settings = document.createElement('span');
        settings.className = 'perf-settings';
        settings.textContent = 'Settings [F2]';
        settings.title = 'Toggle visual controls';
        settings.addEventListener('click', () => this._toggle());

        this._perfEl.append(this._statsEl, sep, settings);
        document.body.appendChild(this._perfEl);

        const panel = document.createElement('div');
        panel.id = 'dev-panel';
        panel.classList.add('dp-hidden');

        const header = document.createElement('div');
        header.className = 'dp-header';
        header.innerHTML = `<span class="dp-title">DEV</span><span class="dp-hint">F2 to toggle</span>`;
        panel.appendChild(header);

        for (const item of SLIDERS) {
            if (item.section !== undefined) {
                const sec = document.createElement('div');
                sec.className = 'dp-section';
                sec.textContent = item.section;
                panel.appendChild(sec);
                continue;
            }

            const row = document.createElement('div');
            row.className = 'dp-row';

            const lbl = document.createElement('span');
            lbl.className = 'dp-lbl';
            lbl.textContent = item.label;

            const input = document.createElement('input');
            input.type  = 'range';
            input.min   = String(item.min);
            input.max   = String(item.max);
            input.step  = String(item.step);
            input.value = String(DEFAULTS[item.key]);

            const valSpan = document.createElement('span');
            valSpan.className = 'dp-val';
            valSpan.textContent = this._fmt(item.key, DEFAULTS[item.key], item.unit);

            input.addEventListener('input', () => {
                const v = parseFloat(input.value);
                this._params[item.key] = v;
                valSpan.textContent = this._fmt(item.key, v, item.unit);
            });

            this._inputs[item.key] = { input, valSpan, unit: item.unit };

            row.appendChild(lbl);
            row.appendChild(input);
            row.appendChild(valSpan);
            panel.appendChild(row);
        }

        const resetBtn = document.createElement('button');
        resetBtn.className = 'dp-reset';
        resetBtn.textContent = 'Reset Defaults';
        resetBtn.addEventListener('click', () => this._reset());
        panel.appendChild(resetBtn);

        document.body.appendChild(panel);
        this._panel = panel;
    }

    _fmt(key, v, unit = '') {
        let num;
        switch (key) {
            case 'camRadius': num = v.toFixed(1); break;
            case 'fov':       num = v.toFixed(3); break;
            case 'gamma':     num = v.toFixed(1); break;
            default:          num = v.toFixed(2); break;
        }
        return unit ? `${num} ${unit}` : num;
    }

    _bindKeys() {
        window.addEventListener('keydown', e => {
            if (e.key === 'F2') { e.preventDefault(); this._toggle(); }
        });
    }

    _toggle() {
        this._visible = !this._visible;
        this._panel.classList.toggle('dp-hidden', !this._visible);
    }

    _reset() {
        this._params = { ...DEFAULTS };
        for (const item of SLIDERS) {
            if (item.section !== undefined) continue;
            const { input, valSpan, unit } = this._inputs[item.key];
            const def = DEFAULTS[item.key];
            input.value = String(def);
            valSpan.textContent = this._fmt(item.key, def, unit);
        }
    }
}
