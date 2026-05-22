// Camera controller. Two modes, both centered on Earth:
//   • AUTO — the cinematic flank orbit computed in the shader from u_time.
//   • FREE — mouse-driven spherical orbit: drag to orbit, wheel to zoom.
// Toggle with the [C] key or the "Cam:" chip in the perf bar. State is fed to
// the renderer as uniforms (u_camMode / u_camAzim / u_camElev / u_camRadius);
// the actual eye position is built in fragment.glsl so both modes share one
// look-at-origin convention.

const ELEV_LIMIT  = 1.40;   // ≈ ±80° — keep off the poles (up-vector singularity)
const RADIUS_MIN  = 4.0;
const RADIUS_MAX  = 45.0;
const DRAG_SENS   = 0.006;  // rad per pixel
const ZOOM_SENS   = 0.0012; // per wheel-delta unit (multiplicative)

// Seed roughly matching the auto orbit's flank framing, so toggling in doesn't jump far.
const SEED = { azim: 1.40, elev: 0.34, radius: 12.0 };

export class CameraController {
    constructor(canvas) {
        this._canvas = canvas;
        this._free   = false;
        this._azim   = SEED.azim;
        this._elev   = SEED.elev;
        this._radius = SEED.radius;

        this._dragging = false;
        this._lastX = 0;
        this._lastY = 0;

        this._chip = null;
        this._buildChip();
        this._bindPointer();
        this._bindKeys();
        this._applyCursor();
    }

    // Merged into the per-frame uniforms (after the dev panel, so FREE-mode
    // wheel-zoom overrides the dev panel's Orbit slider; AUTO leaves it alone).
    getParams() {
        if (!this._free) return { camMode: 0 };
        return {
            camMode:   1,
            camAzim:   this._azim,
            camElev:   this._elev,
            camRadius: this._radius,
        };
    }

    toggle() {
        this._free = !this._free;
        this._applyCursor();
        this._updateChip();
    }

    _buildChip() {
        const perf = document.getElementById('perf');
        if (!perf) return;
        const sep = document.createElement('span');
        sep.className = 'perf-sep';
        sep.textContent = '·';
        const chip = document.createElement('span');
        chip.className = 'perf-settings';
        chip.title = 'Toggle free-look camera (drag to orbit, wheel to zoom)';
        chip.addEventListener('click', () => this.toggle());
        perf.append(sep, chip);
        this._chip = chip;
        this._updateChip();
    }

    _updateChip() {
        if (this._chip) this._chip.textContent = `Cam: ${this._free ? 'FREE' : 'AUTO'} [C]`;
    }

    _applyCursor() {
        this._canvas.style.cursor = this._free ? (this._dragging ? 'grabbing' : 'grab') : '';
    }

    _bindPointer() {
        const c = this._canvas;

        c.addEventListener('pointerdown', e => {
            if (!this._free) return;
            this._dragging = true;
            this._lastX = e.clientX;
            this._lastY = e.clientY;
            c.setPointerCapture?.(e.pointerId);
            this._applyCursor();
        });

        c.addEventListener('pointermove', e => {
            if (!this._free || !this._dragging) return;
            const dx = e.clientX - this._lastX;
            const dy = e.clientY - this._lastY;
            this._lastX = e.clientX;
            this._lastY = e.clientY;
            this._azim += dx * DRAG_SENS;
            this._elev = Math.max(-ELEV_LIMIT, Math.min(ELEV_LIMIT, this._elev + dy * DRAG_SENS));
        });

        const end = e => {
            if (!this._dragging) return;
            this._dragging = false;
            c.releasePointerCapture?.(e.pointerId);
            this._applyCursor();
        };
        c.addEventListener('pointerup', end);
        c.addEventListener('pointercancel', end);

        c.addEventListener('wheel', e => {
            if (!this._free) return;
            e.preventDefault();   // don't scroll the page while zooming
            this._radius = Math.max(RADIUS_MIN,
                            Math.min(RADIUS_MAX, this._radius * Math.exp(e.deltaY * ZOOM_SENS)));
        }, { passive: false });
    }

    _bindKeys() {
        window.addEventListener('keydown', e => {
            if (e.key !== 'c' && e.key !== 'C') return;
            const t = e.target;
            if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
            this.toggle();
        });
    }
}
