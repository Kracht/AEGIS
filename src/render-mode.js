// Render-mode controller — Phase 3 abstraction layers.
//   Visual     — today's volumetric ray-march ("what does it look like").
//   Structural — SDF outline-only render ("what are the surfaces"): magnetopause,
//                bow shock, L-shells.
//   Data       — Visual underneath + a DOM overlay of the live uniforms with
//                units, citations and what scene feature each drives.
//
// Toggle: F3 cycles Visual → Structural → Data → Visual. Persisted in
// localStorage so a reload preserves the user's choice.

const MODES = ['visual', 'structural', 'data'];
const LABEL = { visual: 'VISUAL', structural: 'STRUCTURAL', data: 'DATA' };
const STORE = 'aegis.renderMode';

export class RenderMode {
    constructor() {
        const saved = (() => {
            try { return localStorage.getItem(STORE); } catch { return null; }
        })();
        this._idx = MODES.indexOf(saved);
        if (this._idx < 0) this._idx = 0;
        this._listeners = [];
        window.addEventListener('keydown', e => {
            if (e.key === 'F3' && !e.repeat) { e.preventDefault(); this.cycle(); }
        });
    }

    cycle() {
        this._idx = (this._idx + 1) % MODES.length;
        try { localStorage.setItem(STORE, MODES[this._idx]); } catch { /* private mode */ }
        for (const fn of this._listeners) fn(this.mode);
    }

    onChange(fn) {
        this._listeners.push(fn);
        fn(this.mode);             // fire once so subscribers can initialise
    }

    get mode()  { return MODES[this._idx]; }
    get index() { return this._idx; }            // 0/1/2 — pushed as u_renderMode
    get label() { return LABEL[this.mode]; }
}
