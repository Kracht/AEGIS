// Polls the NOAA OVATION aurora nowcast and uploads it as two GL_R8 polar
// grids (north / south) that the shader samples for the auroral band.

const AURORA_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const POLL_MS    = 300_000; // 5 min — matches SWPC update cadence
const LONS       = 360;     // lon 0–359 at 1° steps
const LATS       = 41;      // lat 50–90 (or -90–-50) at 1° steps per hemisphere

export class AuroraTexture {
    constructor(gl) {
        this.gl    = gl;
        this.texNH = null;  // Northern hemisphere GL_R8 texture
        this.texSH = null;  // Southern hemisphere GL_R8 texture
        this._active = false;
        this._timer  = null;
    }

    get ready() { return this.texNH !== null && this.texSH !== null; }

    start() {
        this._active = true;
        this._run();
    }

    stop() {
        this._active = false;
        clearTimeout(this._timer);
    }

    destroy() {
        this.stop();
        const gl = this.gl;
        if (this.texNH) { gl.deleteTexture(this.texNH); this.texNH = null; }
        if (this.texSH) { gl.deleteTexture(this.texSH); this.texSH = null; }
    }

    async _run() {
        if (!this._active) return;
        try {
            const r = await fetch(AURORA_URL);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            this._upload(await r.json());
        } catch (e) {
            console.warn('[AuroraTexture]', e.message);
        }
        if (this._active) this._timer = setTimeout(() => this._run(), POLL_MS);
    }

    _upload(data) {
        // SWPC format: { "coordinates": [[lon, lat, aurora], ...], "Forecast Time": "..." }
        const points = data?.coordinates;
        if (!Array.isArray(points)) {
            console.warn('[AuroraTexture] unexpected JSON shape — keys:', Object.keys(data ?? {}));
            return;
        }

        const nhGrid = new Uint8Array(LONS * LATS);
        const shGrid = new Uint8Array(LONS * LATS);

        for (const [lon, lat, power] of points) {
            const li  = lon % LONS;                                            // 0–359
            const val = Math.round(Math.min(Math.max(power, 0), 100) * 2.55); // 0–255

            if (lat >= 50 && lat <= 90) {
                const lati = lat - 50;   // 0–40
                nhGrid[lati * LONS + li] = val;
            } else if (lat <= -50 && lat >= -90) {
                const lati = -lat - 50;  // 0–40
                shGrid[lati * LONS + li] = val;
            }
        }

        const gl = this.gl;
        // Delete previous textures before replacing to avoid GPU memory leaks
        if (this.texNH) gl.deleteTexture(this.texNH);
        if (this.texSH) gl.deleteTexture(this.texSH);
        this.texNH = this._makeTex(nhGrid);
        this.texSH = this._makeTex(shGrid);
        console.log(`[AuroraTexture] ${points.length} pts, FT: ${data['Forecast Time']}`);
    }

    _makeTex(pixels) {
        const gl  = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, LONS, LATS, 0, gl.RED, gl.UNSIGNED_BYTE, pixels);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);        // lon wraps at 360°
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // lat clamps at poles
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }
}
