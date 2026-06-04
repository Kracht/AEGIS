// Render-mode controller — Phase 3 abstraction layers.
//   Visual     — today's volumetric ray-march ("what does it look like").
//   Data       — Visual underneath + a DOM overlay of the live uniforms with
//                units, citations and what scene feature each drives.
//   Physics    — SDF line-art base + a camera-synced 2D vector/topology
//                overlay ("what is the mechanism"): field-direction glyphs,
//                open vs closed flux, and the two reconnection X-lines.
//
// Toggle: F3 cycles Visual → Data → Physics → Visual. Persisted in localStorage
// so a reload preserves the user's choice.
//
// CODE is the shader contract (u_renderMode) and is independent of the cycle
// order: the fragment shader keys off these fixed integers (1 and 3 select the
// SDF/structural density). The bare "structural" code (1) is no longer in the
// cycle but the constant is kept so the shader mapping stays stable.

const MODES = ['visual', 'data', 'physics'];
const CODE  = { visual: 0, structural: 1, data: 2, physics: 3 };
const LABEL = { visual: 'VISUAL', structural: 'STRUCTURAL', data: 'DATA', physics: 'PHYSICS' };
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
    get index() { return CODE[this.mode]; }       // shader code — pushed as u_renderMode
    get label() { return LABEL[this.mode]; }
}
