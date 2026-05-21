// Transport bar — the bottom-of-canvas controller for replaying curated storms.
// Picks a scenario (Live or a curated event), scrubs/plays/pauses, and sets the
// time-acceleration. It is the entry point to the Phase-0 data-source seam: a
// scenario click swaps the active DataSource (live NOAA poller ⇄ TimelineSource)
// through the callbacks main.js wires in. Palette matches the dev panel.

import { SCENARIOS, LIVE_ID } from './scenarios.js';
import { SPEEDS }             from './timeline-source.js';

const CSS = `
#transport {
    position: fixed;
    bottom: 1.1rem;
    left: 50%;
    transform: translateX(-50%);
    width: min(760px, 94vw);
    background: rgba(0, 4, 14, 0.82);
    border: 1px solid rgba(60, 120, 200, 0.22);
    border-radius: 4px;
    padding: 0.5rem 0.7rem 0.55rem;
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    color: rgba(180, 210, 250, 0.85);
    z-index: 20;
    user-select: none;
}
#transport .tp-scenarios { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.45rem; }
#transport .tp-scn {
    flex: 1 1 auto;
    text-align: center;
    padding: 0.22rem 0.4rem;
    background: rgba(22, 62, 122, 0.18);
    border: 1px solid rgba(60, 120, 200, 0.20);
    border-radius: 2px;
    color: rgba(125, 165, 215, 0.72);
    font-size: 10px;
    letter-spacing: 0.02em;
    cursor: pointer;
    line-height: 1.35;
}
#transport .tp-scn .tp-date { display: block; font-size: 8px; color: rgba(95, 130, 180, 0.55); }
#transport .tp-scn:hover { background: rgba(42, 92, 172, 0.30); color: rgba(190, 220, 255, 0.95); }
#transport .tp-scn.tp-active {
    background: rgba(54, 110, 200, 0.34);
    border-color: rgba(110, 170, 245, 0.6);
    color: rgba(205, 228, 255, 1.0);
}
#transport .tp-row { display: flex; align-items: center; gap: 0.6rem; }
#transport .tp-play {
    pointer-events: auto;
    cursor: pointer;
    width: 1.7rem; height: 1.7rem;
    flex: 0 0 auto;
    display: flex; align-items: center; justify-content: center;
    background: rgba(22, 62, 122, 0.28);
    border: 1px solid rgba(60, 120, 200, 0.30);
    border-radius: 3px;
    color: rgba(170, 210, 255, 0.9);
    font-size: 12px;
}
#transport .tp-play:hover { background: rgba(42, 92, 172, 0.4); }
#transport input[type=range] {
    -webkit-appearance: none; appearance: none;
    flex: 1 1 auto; height: 3px;
    background: rgba(45, 100, 185, 0.36);
    border-radius: 2px; outline: none; cursor: pointer;
}
#transport input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 11px; height: 11px; border-radius: 50%;
    background: rgba(90, 170, 255, 0.95);
    box-shadow: 0 0 6px rgba(80, 160, 255, 0.5); cursor: pointer;
}
#transport input[type=range]::-moz-range-thumb {
    width: 11px; height: 11px; border-radius: 50%; border: none;
    background: rgba(90, 170, 255, 0.95);
    box-shadow: 0 0 6px rgba(80, 160, 255, 0.5); cursor: pointer;
}
#transport .tp-speed {
    pointer-events: auto;
    flex: 0 0 auto;
    background: rgba(0, 6, 16, 0.8);
    border: 1px solid rgba(60, 120, 200, 0.30);
    border-radius: 2px;
    color: rgba(170, 210, 255, 0.9);
    font-family: inherit; font-size: 10px;
    padding: 0.12rem 0.25rem;
    cursor: pointer;
}
#transport .tp-utc { flex: 0 0 auto; font-size: 10px; color: rgba(200, 222, 255, 0.9); font-variant-numeric: tabular-nums; min-width: 9.5em; text-align: right; }
#transport .tp-teaches { margin-top: 0.4rem; font-size: 9.5px; color: rgba(120, 180, 240, 0.7); line-height: 1.35; min-height: 1.2em; }
#transport.tp-live .tp-row, #transport.tp-live .tp-teaches { opacity: 0.4; pointer-events: none; }
#transport.tp-live .tp-utc { opacity: 1; }
`;

export class Transport {
    constructor({ onSelect, onPlayPause, onSeek, onSpeed } = {}) {
        this._cb = { onSelect, onPlayPause, onSeek, onSpeed };
        this._dragging = false;
        this._activeId = LIVE_ID;
        this._injectStyle();
        this._build();
    }

    _injectStyle() {
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    _build() {
        const root = document.createElement('div');
        root.id = 'transport';
        root.classList.add('tp-live');

        const scn = document.createElement('div');
        scn.className = 'tp-scenarios';
        this._scnEls = {};
        for (const sc of SCENARIOS) {
            const b = document.createElement('div');
            b.className = 'tp-scn' + (sc.id === LIVE_ID ? ' tp-active' : '');
            b.innerHTML = `${sc.name}<span class="tp-date">${sc.date}</span>`;
            b.style.pointerEvents = 'auto';
            b.addEventListener('click', () => this._select(sc.id));
            scn.appendChild(b);
            this._scnEls[sc.id] = b;
        }
        root.appendChild(scn);

        const row = document.createElement('div');
        row.className = 'tp-row';

        this._playBtn = document.createElement('div');
        this._playBtn.className = 'tp-play';
        this._playBtn.textContent = '▶';
        this._playBtn.addEventListener('click', () => this._cb.onPlayPause?.());

        this._slider = document.createElement('input');
        this._slider.type = 'range';
        this._slider.min = '0'; this._slider.max = '1000'; this._slider.value = '0';
        this._slider.addEventListener('input', () => {
            this._dragging = true;
            this._cb.onSeek?.(this._slider.value / 1000);
        });
        this._slider.addEventListener('change', () => { this._dragging = false; });

        this._speed = document.createElement('select');
        this._speed.className = 'tp-speed';
        for (const sp of SPEEDS) {
            const o = document.createElement('option');
            o.value = String(sp); o.textContent = `${sp}×`;
            this._speed.appendChild(o);
        }
        this._speed.value = '900';
        this._speed.addEventListener('change', () => this._cb.onSpeed?.(Number(this._speed.value)));

        this._utc = document.createElement('span');
        this._utc.className = 'tp-utc';
        this._utc.textContent = 'LIVE · NOAA';

        row.append(this._playBtn, this._slider, this._speed, this._utc);
        root.appendChild(row);

        this._teaches = document.createElement('div');
        this._teaches.className = 'tp-teaches';
        root.appendChild(this._teaches);

        document.body.appendChild(root);
        this._root = root;
    }

    _select(id) {
        if (id === this._activeId) return;
        this._activeId = id;
        for (const k in this._scnEls) this._scnEls[k].classList.toggle('tp-active', k === id);
        this._root.classList.toggle('tp-live', id === LIVE_ID);
        this._cb.onSelect?.(id);
    }

    // Called each UI tick with uniforms.timeline (undefined in live mode).
    update(timeline) {
        if (!timeline) {
            this._utc.textContent = 'LIVE · NOAA';
            this._teaches.textContent = '';
            return;
        }
        this._playBtn.textContent = timeline.playing ? '⏸' : '▶';
        if (!this._dragging) this._slider.value = String(Math.round(timeline.fraction * 1000));
        if (this._speed.value !== String(timeline.speed)) this._speed.value = String(timeline.speed);
        this._utc.textContent = timeline.utc ? timeline.utc.replace('T', ' ').slice(0, 16) + 'Z' : '…';
        this._teaches.textContent = timeline.teaches || '';
    }
}
