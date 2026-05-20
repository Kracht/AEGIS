// WebGL2 renderer: compiles the GLSL program, manages the Earth/aurora
// textures, and pushes per-frame uniforms. Geometry is a single full-screen
// triangle — the entire scene is ray-marched in fragment.glsl.

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        // GLSL error format: "ERROR: 0:<line>: ..."
        throw new Error(`Shader compile error:\n${log}`);
    }
    return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link error:\n${log}`);
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return program;
}

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2');
        if (!this.gl) throw new Error('WebGL2 not supported in this browser.');
        this.program = null;
        this.uniforms = {};
        this.vao = null;
    }

    async init() {
        const gl = this.gl;

        const [vertSrc, fragSrc] = await Promise.all([
            fetch('./shaders/vertex.glsl').then(r => {
                if (!r.ok) throw new Error(`Failed to load vertex.glsl: ${r.status}`);
                return r.text();
            }),
            fetch('./shaders/fragment.glsl').then(r => {
                if (!r.ok) throw new Error(`Failed to load fragment.glsl: ${r.status}`);
                return r.text();
            }),
        ]);

        this.program = createProgram(gl, vertSrc, fragSrc);

        this.uniforms = {
            u_time:          gl.getUniformLocation(this.program, 'u_time'),
            u_resolution:    gl.getUniformLocation(this.program, 'u_resolution'),
            u_r0:            gl.getUniformLocation(this.program, 'u_r0'),
            u_alpha:         gl.getUniformLocation(this.program, 'u_alpha'),
            u_bz:            gl.getUniformLocation(this.program, 'u_bz'),
            u_speed:         gl.getUniformLocation(this.program, 'u_speed'),
            u_kp:            gl.getUniformLocation(this.program, 'u_kp'),
            u_bt:            gl.getUniformLocation(this.program, 'u_bt'),
            u_density:       gl.getUniformLocation(this.program, 'u_density'),
            u_pressure:      gl.getUniformLocation(this.program, 'u_pressure'),
            u_flare:         gl.getUniformLocation(this.program, 'u_flare'),
            u_dataAge:       gl.getUniformLocation(this.program, 'u_dataAge'),
            u_auroraGridNH:  gl.getUniformLocation(this.program, 'u_auroraGridNH'),
            u_auroraGridSH:  gl.getUniformLocation(this.program, 'u_auroraGridSH'),
            u_earthDay:      gl.getUniformLocation(this.program, 'u_earthDay'),
            u_earthNight:    gl.getUniformLocation(this.program, 'u_earthNight'),
            u_earthRot:      gl.getUniformLocation(this.program, 'u_earthRot'),
            u_sunDir:        gl.getUniformLocation(this.program, 'u_sunDir'),
            // Dev-panel visual controls
            u_camRadius:       gl.getUniformLocation(this.program, 'u_camRadius'),
            u_fov:             gl.getUniformLocation(this.program, 'u_fov'),
            u_exposure:        gl.getUniformLocation(this.program, 'u_exposure'),
            u_gamma:           gl.getUniformLocation(this.program, 'u_gamma'),
            u_starBright:      gl.getUniformLocation(this.program, 'u_starBright'),
            u_auroraScale:     gl.getUniformLocation(this.program, 'u_auroraScale'),
            u_nightlightScale: gl.getUniformLocation(this.program, 'u_nightlightScale'),
            u_limbScale:       gl.getUniformLocation(this.program, 'u_limbScale'),
            u_fieldScale:      gl.getUniformLocation(this.program, 'u_fieldScale'),
            u_volExtinct:      gl.getUniformLocation(this.program, 'u_volExtinct'),
            u_renderMode:      gl.getUniformLocation(this.program, 'u_renderMode'),
        };

        // Earth textures: load asynchronously, replacing a 1×1 ocean-blue placeholder.
        this._earthDayTex   = this._makePlaceholderTex(gl, [12, 30, 96]);
        this._earthNightTex = this._makePlaceholderTex(gl, [0, 0, 4]);
        const mm = String(new Date().getUTCMonth() + 1).padStart(2, '0');
        this._loadEarthTexture(`./textures/day_monthly/earth_day_${mm}.jpg`, tex => this._earthDayTex   = tex);
        this._loadEarthTexture('./textures/earth_night.jpg',                 tex => this._earthNightTex = tex);

        // 1×1 zero texture: bound to aurora sampler units before OVATION data arrives
        this._fallbackTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._fallbackTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._aurora = null;

        // Fullscreen triangle needs a bound VAO even without attributes
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
    }

    setAurora(aurora) {
        this._aurora = aurora;
    }

    _makePlaceholderTex(gl, rgb) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(rgb));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    _loadEarthTexture(url, onReady) {
        const gl  = this.gl;
        const img = new Image();
        img.onload = () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);        // longitude wraps
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // poles clamp
            gl.bindTexture(gl.TEXTURE_2D, null);
            console.log(`[Renderer] loaded ${url} (${img.width}×${img.height})`);
            onReady(tex);
        };
        img.onerror = () => console.warn(`[Renderer] failed to load ${url}`);
        img.src = url;
    }

    draw(timeSecs, params = {}) {
        const gl = this.gl;
        const { width, height } = this.canvas;

        gl.viewport(0, 0, width, height);
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.uniform1f(this.uniforms.u_time,       timeSecs);
        gl.uniform2f(this.uniforms.u_resolution, width, height);
        gl.uniform1f(this.uniforms.u_r0,         params.r0       ?? 10.5);
        gl.uniform1f(this.uniforms.u_alpha,      params.alpha    ?? 0.58);
        gl.uniform1f(this.uniforms.u_bz,         params.bz       ?? -2.0);
        gl.uniform1f(this.uniforms.u_speed,      params.speed    ?? 450.0);
        gl.uniform1f(this.uniforms.u_kp,         params.kp       ?? 2.0);
        gl.uniform1f(this.uniforms.u_bt,         params.bt       ?? 5.0);
        gl.uniform1f(this.uniforms.u_density,    params.density  ?? 5.0);
        gl.uniform1f(this.uniforms.u_pressure,   params.pressure ?? 1.7);
        gl.uniform1f(this.uniforms.u_flare,      params.flare    ?? 0.0);
        gl.uniform1f(this.uniforms.u_dataAge,    params.dataAge  ?? 0.0);
        gl.uniform1f(this.uniforms.u_earthRot,   params.earthRot ?? 0.0);
        const sd = params.sunDir ?? [1.0, 0.0, 0.0];
        gl.uniform3f(this.uniforms.u_sunDir,     sd[0], sd[1], sd[2]);

        // Dev-panel visual controls
        gl.uniform1f(this.uniforms.u_camRadius,       params.camRadius       ?? 12.0);
        gl.uniform1f(this.uniforms.u_fov,             params.fov             ?? 0.38);
        gl.uniform1f(this.uniforms.u_exposure,        params.exposure        ?? 1.0);
        gl.uniform1f(this.uniforms.u_gamma,           params.gamma           ?? 2.2);
        gl.uniform1f(this.uniforms.u_starBright,      params.starBright      ?? 1.0);
        gl.uniform1f(this.uniforms.u_auroraScale,     params.auroraScale     ?? 1.0);
        gl.uniform1f(this.uniforms.u_nightlightScale, params.nightlightScale ?? 1.0);
        gl.uniform1f(this.uniforms.u_limbScale,       params.limbScale       ?? 1.0);
        gl.uniform1f(this.uniforms.u_fieldScale,      params.fieldScale      ?? 1.0);
        gl.uniform1f(this.uniforms.u_volExtinct,      params.volExtinct      ?? 1.0);
        gl.uniform1i(this.uniforms.u_renderMode,      params.renderMode      ?? 0);

        // Aurora OVATION textures — fallback to 1×1 zero until data arrives
        const texNH = this._aurora?.texNH ?? this._fallbackTex;
        const texSH = this._aurora?.texSH ?? this._fallbackTex;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texNH);
        gl.uniform1i(this.uniforms.u_auroraGridNH, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texSH);
        gl.uniform1i(this.uniforms.u_auroraGridSH, 1);

        // Earth surface textures
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this._earthDayTex);
        gl.uniform1i(this.uniforms.u_earthDay, 2);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this._earthNightTex);
        gl.uniform1i(this.uniforms.u_earthNight, 3);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    destroy() {
        const gl = this.gl;
        if (this.program)     gl.deleteProgram(this.program);
        if (this.vao)         gl.deleteVertexArray(this.vao);
        if (this._fallbackTex) gl.deleteTexture(this._fallbackTex);
        this.program     = null;
        this.vao         = null;
        this._fallbackTex = null;
    }
}
