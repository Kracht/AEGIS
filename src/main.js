// AEGIS — application entry point.
// Boots the WebGL2 renderer, starts the live NOAA data + OVATION aurora
// pollers, runs the per-frame render loop, and feeds the HUD / dev panel.

import { Renderer }         from './renderer.js';
import { createDataSource } from './data-source.js';
import { AuroraTexture }    from './aurora-texture.js';
import { UI }            from './ui.js';
import { DevPanel }      from './dev-panel.js';
import { RenderMode }    from './render-mode.js';
import { Transport }     from './transport.js';
import { CausalHUD }     from './causal-hud.js';
import { PhysicsOverlay } from './physics-overlay.js';
import { CameraController } from './camera.js';
import { LIVE_ID }       from './scenarios.js';

let rafId      = null;
let renderer   = null;
let source     = null;
let aurora     = null;
let ui         = null;
let devPanel   = null;
let renderMode = null;
let transport  = null;
let causalHud  = null;
let physicsOverlay = null;
let camera     = null;

const startTime = performance.now();

// FPS / frametime tracking
const _frameTimes    = new Float32Array(60);
let   _frameIdx      = 0;
let   _frameCount    = 0;
let   _prevFrameMs   = performance.now();
let   _lastPerfMs    = 0;

// Compute Earth's longitude offset and solar declination so the rendered
// terminator matches the real Sun position right now.
function orbitalParams() {
    const now = new Date();
    const utcH = now.getUTCHours() + now.getUTCMinutes()/60 + now.getUTCSeconds()/3600;
    // Subsolar longitude (degrees east) — at 12:00 UTC it's 0° (Greenwich)
    let subsolarLonE = (12 - utcH) * 15;
    while (subsolarLonE < 0)    subsolarLonE += 360;
    while (subsolarLonE >= 360) subsolarLonE -= 360;
    // Day of year for Cooper's solar declination equation
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
    const dayOfYear = Math.floor((now - start) / 86400000);
    const declRad = 23.45 * Math.PI / 180 *
                    Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);
    return {
        earthRot:  subsolarLonE / 360,           // 0..1 texture U offset
        sunDir:    [Math.cos(declRad), Math.sin(declRad), 0.0],
    };
}

function resize(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(window.innerWidth  * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth  + 'px';
    canvas.style.height = window.innerHeight + 'px';
}

function showError(msg) {
    const el = document.getElementById('error');
    if (el) el.textContent = msg;
    console.error(msg);
}

async function main() {
    const canvas = document.getElementById('canvas');
    resize(canvas);
    window.addEventListener('resize', () => resize(canvas));

    try {
        renderer = new Renderer(canvas);
        await renderer.init();
    } catch (err) {
        showError(err.message);
        return;
    }

    source = createDataSource(LIVE_ID);
    source.start();

    aurora = new AuroraTexture(renderer.gl);
    renderer.setAurora(aurora);
    aurora.start();

    renderMode = new RenderMode();
    ui         = new UI(renderMode);
    devPanel   = new DevPanel(renderMode);
    causalHud  = new CausalHUD();
    physicsOverlay = new PhysicsOverlay(canvas);
    // Physics mode (F3) reveals the camera-synced vector/topology overlay; every
    // other mode hides it. Structural base for Physics is set in the shader.
    renderMode.onChange((mode) => {
        if (mode === 'physics') physicsOverlay.show(); else physicsOverlay.hide();
    });
    // After DevPanel — the camera chip appends into the perf bar it builds.
    camera     = new CameraController(canvas);

    // The transport bar swaps the active DataSource through the Phase-0 seam.
    // Live → quiet causal HUD; a curated storm auto-reveals it (that's where
    // the lag clocks and branch independence actually become legible).
    transport = new Transport({
        onSelect: (id) => {
            source.stop();
            source = createDataSource(id);
            source.start();
            if (id === LIVE_ID) causalHud.hide(); else causalHud.show();
        },
        onPlayPause: () => source.togglePlay?.(),
        onSeek:      (f) => source.seekFraction?.(f),
        onSpeed:     (x) => source.setSpeed?.(x),
    });

    let lastUiTime = -Infinity;

    function frame() {
        // FPS / frametime bookkeeping
        const nowMs = performance.now();
        const dtMs  = nowMs - _prevFrameMs;
        _prevFrameMs = nowMs;
        _frameTimes[_frameIdx++ % 60] = dtMs;
        _frameCount++;

        if (nowMs - _lastPerfMs > 250) {
            const n   = Math.min(_frameCount, 60);
            let   sum = 0;
            for (let i = 0; i < n; i++) sum += _frameTimes[i];
            const avgDt = sum / n;
            devPanel.updatePerf(1000 / avgDt, avgDt);
            _lastPerfMs = nowMs;
        }

        const timeSecs = (nowMs - startTime) / 1000;
        const uniforms = {
            ...source.toUniforms(),
            ...orbitalParams(),
            ...devPanel.getParams(),
            ...camera.getParams(),   // after devPanel: FREE-mode zoom overrides Orbit slider
            renderMode: renderMode.index,
        };
        // Live mode keeps the real OVATION texture; a replay has no historical
        // OVATION, so the shader synthesises the oval from the model state.
        uniforms.auroraSynth = uniforms.timeline ? 1.0 : 0.0;

        renderer.draw(timeSecs, uniforms);

        // The causal HUD reads the same uniforms every frame so its nodes light
        // smoothly as a scrubbed storm evolves (cheap: SVG attribute writes).
        causalHud.update(uniforms);

        // Physics-mode overlay mirrors the shader camera (needs the same u_time)
        // and redraws its glyphs each frame; it no-ops cheaply when not visible.
        physicsOverlay.update(uniforms, timeSecs);

        // UI rerenders at 1 Hz — data changes slowly, no need for 60 fps DOM updates
        if (timeSecs - lastUiTime >= 1.0) {
            ui.update(uniforms);
            transport.update(uniforms.timeline);
            lastUiTime = timeSecs;
        }

        rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
}

window.addEventListener('unload', () => {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId    = null; }
    if (aurora)   { aurora.destroy();   aurora   = null; }
    if (source)   { source.stop();      source   = null; }
    if (renderer) { renderer.destroy(); renderer = null; }
});

main();
