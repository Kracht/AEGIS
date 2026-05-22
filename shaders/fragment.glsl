#version 300 es
precision highp float;
precision highp int;

// ============================================================================
//  AEGIS — Active Earth Geomagnetic Imaging System
//  Volumetric magnetosphere fragment shader (WebGL2 / GLSL ES 3.00)
//
//  Physics / empirical models
//    • Shue et al. (1997)             — magnetopause size & shape
//    • Fairfield (1971), Cairns (1995) — bow-shock standoff & flaring
//    • Harris (1962)                  — tail current-sheet sech² profile
//    • Carpenter & Anderson (1992)    — plasmapause L-shell
//    • NOAA OVATION                   — auroral precipitation grid
//
//  Rendering techniques
//    • Single-pass volumetric ray march with stochastic jitter
//    • Value noise / fBm / domain warping + SDF scene model
//      (techniques after Inigo Quilez, iquilezles.org)
//    • Classic GLSL sine-hash (cf. Dave Hoskins, "Hash without Sine")
//    • Reinhard et al. (2002) photographic tone mapping
//
//  Full credits & citations: see README.md
// ============================================================================

// --- Uniforms ---
uniform float u_time;
uniform vec2  u_resolution;
uniform float u_r0;      // Magnetopause subsolar distance [R_E] (Shue 1997)
uniform float u_alpha;   // Magnetopause flaring exponent
uniform float u_bz;      // IMF Bz [nT]
uniform float u_speed;   // SW speed [km/s]
uniform float u_kp;      // Kp index
uniform float u_bt;      // IMF total field [nT]
uniform float u_density; // SW density [1/cm³]
uniform float u_pressure;// SW dynamic pressure [nPa]
uniform float u_dst;     // Burton/O'Brien ring-current Dst* [nT] (integrated, lagged)
uniform float u_flare;   // GOES flare level
uniform float u_dataAge;
uniform sampler2D u_auroraGridNH;
uniform sampler2D u_auroraGridSH;
uniform sampler2D u_earthDay;    // NASA Blue Marble equirectangular
uniform sampler2D u_earthNight;  // City lights equirectangular
uniform float     u_earthRot;    // Longitude offset (subsolarLon°E / 360)
uniform vec3      u_sunDir;      // Sun direction tilted by solar declination

// Dev-panel visual controls — no science-data dependency
uniform float u_camRadius;       // camera orbit radius [R_E]
uniform float u_fov;             // field of view factor
uniform float u_exposure;        // pre-tonemap exposure
uniform float u_gamma;           // output gamma (sRGB ≈ 2.2)
uniform float u_starBright;      // star brightness scale
uniform float u_auroraScale;     // aurora intensity scale
uniform float u_nightlightScale; // city lights scale
uniform float u_limbScale;       // atmosphere limb scale
uniform float u_fieldScale;      // field line intensity scale
uniform float u_volExtinct;      // volumetric extinction scale
uniform int   u_renderMode;      // 0 = Visual, 1 = Structural, 2 = Data (Visual + DOM)
uniform int   u_camMode;         // 0 = auto cinematic orbit, 1 = free look (mouse)
uniform float u_camAzim;         // free-look azimuth [rad]
uniform float u_camElev;         // free-look elevation [rad] (clamped off the poles)
uniform float u_bzAurora;        // IMF Bz delayed by the substorm growth phase [nT]
uniform float u_auroraSynth;     // 0 = live OVATION texture, 1 = model oval (replay)

out vec4 fragColor;

// SUN is now `u_sunDir` (uniform). Alias for code clarity.
#define SUN u_sunDir
const int  VSTEPS = 96;

// ================================================================
// HASH / NOISE
// ================================================================

float h11(float p) { return fract(sin(p * 78.233) * 43758.5453); }

float h3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.3))) * 43758.5453);
}

float h2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float vn(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(h3(i),            h3(i+vec3(1,0,0)), f.x),
            mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
        mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x),
            mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y),
        f.z);
}

float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vn(p); p *= 2.1; a *= 0.5; }
    return v;
}

// Domain-warped FBM — produces organic, fluid-like turbulence
float turbulence(vec3 p, float t) {
    vec3 q = p + vec3(fbm(p * 0.6 + vec3(t * 0.03, 0, 0)),
                      fbm(p * 0.6 + vec3(0, t * 0.024, 0)),
                      fbm(p * 0.6 + vec3(0, 0, t * 0.018))) * 1.4;
    return fbm(q * 1.1);
}

// ================================================================
// MAGNETOPAUSE SDF (Shue 1997)
// ================================================================

float sdMp(vec3 p) {
    float r    = length(p);
    // cosT measured relative to actual Sun direction (handles declination tilt)
    float cosT = clamp(dot(p, SUN) / max(r, 1e-4), -1.0, 1.0);
    float rb   = u_r0 * pow(2.0 / (1.0 + cosT + 1e-5), u_alpha);
    return r - min(rb, 60.0);
}

// Bow-shock paraboloid (Cairns 1995 / Fairfield 1971): same Shue form with
// empirical standoff factor 1.32 and slightly larger flaring. Dayside-only —
// the model diverges at θ=180° and there is no clean shock surface in the
// deep tail. Used by Structural mode to outline the shock as a thin arc.
float sdBs(vec3 p) {
    float r    = length(p);
    float cosT = clamp(dot(p, SUN) / max(r, 1e-4), -1.0, 1.0);
    if (cosT < -0.30) return 1e6;
    float bsR0    = u_r0 * 1.32;
    float bsAlpha = u_alpha * 1.04;
    float rBS     = bsR0 * pow(2.0 / (1.0 + cosT + 1e-5), bsAlpha);
    rBS = min(rBS, 40.0);
    return r - rBS;
}

// ================================================================
// SUN-ANGLE SHELL DEFORMATION  (shared)
// ================================================================
// Pure dipole shells are symmetric (rings). The real magnetosphere is a
// teardrop: Sun-compressed dayside, antisunward-stretched tail. This warp
// is shared by the field-line shells AND the ring current frozen onto them,
// so the two stay coupled — and the ring current inherits the real
// noon-compressed / midnight-bulged partial-ring-current asymmetry.
//   w < 1 → compressed (dayside)   w > 1 → stretched (tail)
//
// As-built (Phase 5): the deformation is no longer a frozen teardrop. Its three
// coefficients now track the live drivers, the way an empirical field model
// (Tsyganenko T96/TS05) parametrizes its analytic deformation by Pdyn, Dst and
// IMF — a "poor man's Tsyganenko" at the shell-coordinate level rather than a
// per-ray field-line integration. Three independent morphological signatures:
//   • DAYSIDE PINCH   ∝ dynamic pressure (read off r₀ via Shue) — fast, pressure
//   • TAIL STRETCH    ∝ southward IMF Bz (substorm flux loading) — minutes
//   • INNER INFLATION ∝ −Dst depression (ring-current diamagnetism) — slow, the
//     same quantity ground magnetometers measure; lags and decays with the ODE.
// Compression and inflation thus separate IN TIME, reinforcing the two-branch
// lesson: a pressure pulse pinches the dayside immediately; the ring current
// balloons the inner shells only as Dst integrates down, and lingers on recovery.
float shellWarp(vec3 p) {
    float r    = length(p);
    float cosS = dot(p, SUN) / max(r, 1e-4);
    float day  = max( cosS, 0.0);
    float ngt  = max(-cosS, 0.0);

    // Driver scalars (quiet → 0/baseline, storm → larger).
    float comp = clamp(10.5 / max(u_r0, 4.0), 1.0, 2.2);   // dayside pinch (pressure via r₀)
    float strm = clamp(-u_bz / 12.0, 0.0, 1.5);            // tail loading (southward IMF)
    float infl = clamp(-u_dst / 80.0, 0.0, 1.6);           // ring-current inflation (−Dst)

    float w = 1.0 - 0.16 * comp * day                      // dayside crushes earthward under pressure
                  + (0.60 + 0.45 * strm) * ngt
                    * (0.30 + 0.70 * smoothstep(1.0, 7.0, r))  // tail elongates with the storm
                  + 0.18 * infl * smoothstep(8.0, 2.5, r);     // inner closed shells balloon outward
    return clamp(w, 0.55, 3.2);
}

// Signed distance to the nearest integer dipole L-shell (L = 2..6), using the
// same shellWarp deformation as fieldLines() so the structural shells match
// the volumetric jellyfish. Distance is approximated as |L − L_int| / |∂L/∂r|,
// which gives roughly uniform outline thickness in space.
float sdLShells(vec3 p) {
    float r   = length(p);
    float rho = length(p.xz);
    if (rho < 0.05 || r < 1.04 || r > 12.0) return 1e6;
    float warp = shellWarp(p);
    float rEff = r / warp;
    float L    = rEff * rEff * rEff / (rho * rho);
    if (L < 1.8 || L > 6.5) return 1e6;
    float Ln = floor(L + 0.5);
    if (Ln < 2.0 || Ln > 6.0) return 1e6;
    float dLdr = 3.0 * rEff * rEff / (rho * rho * max(warp, 1e-3));
    return abs(L - Ln) / max(dLdr, 1e-3);
}

// ================================================================
// DIPOLE FIELD-LINE SHELLS — the hero structure
// ================================================================

// Field lines as DISCRETE bright strands, not continuous tubes.
// Sparse azimuthal sampling → bundles separated by gaps so they don't
// project as continuous rings from any viewing angle.
//
// Jellyfish deformation: a pure dipole gives symmetric L-shells (rings).
// The real magnetosphere is a teardrop — Sun-compressed on the dayside and
// drawn out antisunward into a long tail. We warp the shell coordinate by
// Sun angle (Shue-like, the same asymmetry the magnetopause carries): shells
// pinch inward sunward (the "bell") and balloon/elongate tailward, growing
// with distance (the trailing "tentacles").
float fieldLines(vec3 p) {
    float r   = length(p);
    float rho = length(p.xz);
    if (rho < 0.05) return 0.0;

    float cosS = dot(p, SUN) / max(r, 1e-4);          // +1 sunward, −1 tailward
    float ngt  = max(-cosS, 0.0);

    // Shared day/night deformation (also drives the ring current so the two
    // stay locked): <1 compresses the dayside bell, >1 stretches the tail.
    float warp = shellWarp(p);

    // Sun-dependent reach, now storm-aware: the dayside bell can only reach as
    // far as the (Shue-compressed) magnetopause lets it, so under pressure it
    // retreats earthward with r₀; the tail tentacles trail farther as southward
    // IMF loads flux into the lobes.
    float strm    = clamp(-u_bz / 12.0, 0.0, 1.5);
    float dayMax  = min(7.0, u_r0 * 0.72);                 // dayside closes in with the magnetopause
    float tailMax = 15.0 + 7.0 * strm;                     // tail draws out during the storm
    float rMax    = mix(dayMax, tailMax, ngt);
    if (r < 1.04 || r > rMax) return 0.0;

    float rEff = r / warp;                             // deformed dipole radius
    float L    = rEff * rEff * rEff / (rho * rho);
    if (L < 1.8 || L > 6.5) return 0.0;
    // All shells k=2..6 contribute (full magnetosphere "fill"), but each
    // (shell, azimuth-bin) cell gets its own independent gate so individual
    // strands appear as arcing tubes rather than nested rings.
    float az     = atan(p.z, p.x);
    float azNorm = az / 6.28318 + 0.5;
    float azBin  = floor(azNorm * 14.0);                  // 14 azimuth bins (finer)

    // Smooth time evolution: each cell smoothly cross-fades between two
    // random states every ~14 s, instead of instantly snapping. This kills
    // the synchronized "shuffle pop" that read as an abrupt on/off blink.
    float tF    = u_time / 14.0;
    float tA    = floor(tF);
    float tFrac = smoothstep(0.0, 1.0, fract(tF));

    float g = 0.0;
    for (int k = 2; k <= 6; k++) {
        float d = abs(L - float(k));
        float peak = exp(-d * d * 280.0);
        if (peak < 0.004) continue;                       // far from this shell
        // Cross-fade two hashes over the shuffle period — no step transitions.
        float hA = h3(vec3(azBin, float(k), tA));
        float hB = h3(vec3(azBin, float(k), tA + 1.0));
        float h  = mix(hA, hB, tFrac);
        // Raise the floor: "dim" cells still glow at ~30%, so the wedges
        // read as faint gaps rather than hard cuts.
        float gate = 0.30 + 0.70 * smoothstep(0.32, 0.62, h);
        g += peak * gate / (float(k) * 0.55);
    }

    g *= smoothstep(0.04, 0.22, rho / r);
    g *= smoothstep(1.04, 1.45, r);
    // Inner bell stays crisp (∝1/r²); tailward the falloff flattens (∝1/r)
    // so the swept tentacles don't fade out before they trail back.
    g /= mix(r * r * 0.16 + 0.03, r * 0.11 + 0.05, ngt);

    // Wider azimuthal feather (with 14 bins each is narrower, but the
    // feather kept proportionally wide so cell boundaries stay soft)
    float azFrac = fract(azNorm * 14.0) - 0.5;
    g *= 1.0 - smoothstep(0.34, 0.50, abs(azFrac)) * 0.55;

    // Per-strand slow twinkle so the magnetosphere breathes
    float twk = 0.85 + 0.15 * sin(u_time * 0.42 + azBin * 0.9 + L * 1.7);
    g *= twk;
    return min(g, 6.0);
}

// ================================================================
// VOLUME DENSITY  →  (emission.rgb, extinction.a)
// Philosophy: less ambient haze, more crisp structures.
// All soft shells modulated by 3D noise to break axisymmetric rings.
// ================================================================

vec4 volDensity(vec3 p) {
    float r = length(p);
    if (r > 30.0) return vec4(0.0);  // hard cull — no contribution at huge radii

    // Sun-aligned coordinate frame (handles solar declination tilt).
    // pSun.x is "along the Sun direction"; pSun.yz is perpendicular distance.
    vec3 sunSide = vec3(-SUN.y, SUN.x, 0.0);            // 90° CCW from SUN in XY plane
    vec3 pSun = vec3(dot(p, SUN), dot(p, sunSide), p.z);

    float dmp  = sdMp(p);
    float cosT = pSun.x / max(r, 1e-4);

    float bzStorm   = clamp(-u_bz / 15.0, 0.0, 1.0);
    float speedNorm = max(u_speed / 450.0, 0.1);
    float btNorm    = clamp(u_bt / 5.0, 0.5, 3.0);
    float flareFact = smoothstep(2.0, 5.0, u_flare);
    float sinLat    = abs(p.y) / max(r, 0.01);

    vec3  em = vec3(0.0);
    float sg = 0.0;

    if (dmp < 0.0 && r < 16.0) {
        // ============ INSIDE MAGNETOSPHERE ============

        // Diffuse inner plasma — VERY low, only inside ~5 R_E.
        // nearFade pushes the densest emission away from Earth's surface so it
        // doesn't pile up in front of the night side and bleach it blue.
        if (r < 5.0) {
            float plNoise  = 0.55 + 0.45 * turbulence(p * 0.9, u_time);
            float nearFade = smoothstep(1.0, 2.2, r);
            float pl = 0.004 * exp(-r * 0.55) * plNoise * nearFade;
            vec3 plCol = mix(vec3(0.04, 0.09, 0.42), vec3(0.30, 0.06, 0.10), bzStorm * 0.70);
            sg += pl * 0.25; em += pl * plCol;  // mostly emissive — minimal extinction
        }

        // Plasmasphere torus — plasmapause moves inward under storm
        // (Carpenter/Anderson 1992: Lpp ≈ 5.6 − 0.46·Kp for quiet, shrinks
        //  to L≈2.5 in major storms). Use bzStorm as proxy for ring-current pressure.
        if (r > 2.2 && r < 6.0) {
            float ppL   = 4.2 - bzStorm * 1.6;                // 4.2 quiet → 2.6 storm
            float dt    = length(vec2(length(p.xz) - ppL, p.y * 1.35)) - 0.45;
            float tFil  = 0.40 + 0.60 * vn(vec3(atan(p.z, p.x) * 6.0, p.y * 4.0, length(p.xz) * 3.0));
            float tor   = exp(-max(dt, 0.0) * 9.0) * 0.13 * tFil;
            sg += tor; em += tor * vec3(0.06, 0.38, 0.90);
        }

        // Field lines — visible bundles arcing from pole to pole
        float pulse = 0.82 + 0.18 * sin(u_time * 0.32 + r * 0.6);
        float fl    = fieldLines(p) * 0.45 * btNorm * pulse * u_fieldScale;
        vec3 flCol  = mix(vec3(0.30, 0.72, 1.10), vec3(1.05, 0.55, 0.18), bzStorm * 0.72);
        sg += fl * 0.10; em += fl * flCol;  // field lines glow but don't absorb — no shadow casting

        // (Removed magnetic cocoon — it added haze near Earth that broke the
        //  ISS-style "Earth-on-pure-black-space" composition.)

        // Ring current — westward-drifting energetic ions on closed field
        // lines, peaking at L≈4 quiet and shifting inward to L≈3 during
        // storms (Daglis 1999; matches the Dst signature of the main phase).
        // Sits between the (shrinking) plasmasphere and the inner edge of
        // the outer Van Allen belt.
        // Parameterized by the SAME deformed shell coordinate as the field
        // lines (rD = r / shellWarp) so the ring current stays frozen onto
        // those drift shells instead of detaching from the compressed dayside
        // strands. Falls out as the real noon-compressed / midnight-bulged
        // partial ring current.
        if (bzStorm > 0.08) {
            float rD = r / shellWarp(p);
            if (rD > 2.0 && rD < 5.5) {
                float rcL  = 4.0 - bzStorm * 1.2;                 // 4.0 → 2.8 storm
                float rcW  = 0.55 + 0.40 * bzStorm;               // tighter when intense
                float eq   = 1.0 - sinLat;
                float rcN  = 0.6 + 0.4 * vn(p * 5.0 + vec3(0, u_time * 0.04, 0));
                float rc   = eq * eq * eq
                           * exp(-(rD - rcL) * (rD - rcL) * rcW)
                           * 0.20 * bzStorm * (1.0 + bzStorm * 1.4) * rcN;
                sg += rc; em += rc * vec3(0.95, 0.10, 0.42);
            }
        }

        // AURORA — thin glowing band hugging the polar regions, ISS-style.
        // Subtle and beautiful, not a dominating crown.
        if (r > 1.016 && r < 1.10 && sinLat > 0.42) {
            float aurU   = fract(atan(-p.z, p.x) / 6.28318 + 0.5 + u_earthRot);
            float latDeg = degrees(asin(clamp(sinLat, 0.0, 0.9999)));
            float aurV   = clamp((latDeg - 50.0) / 40.0, 0.0, 1.0);
            float ovaTex = (p.y >= 0.0)
                ? texture(u_auroraGridNH, vec2(aurU, aurV)).r
                : texture(u_auroraGridSH, vec2(aurU, aurV)).r;
            // The OVATION grid only spans 50–90° (CLAMP_TO_EDGE on latitude), so
            // sampling below 50° returns the clamped 50° edge row. Without this
            // mask that edge value smears across the whole 25–50° band as a hard
            // filled cap ("a slice through a ball"). Fade it out at the real data
            // floor; the synthetic oval below has its own smooth falloff.
            ovaTex *= smoothstep(49.0, 51.0, latDeg);

            // Model auroral oval — used in REPLAY (no live OVATION exists for a
            // past storm), blended out in live mode (u_auroraSynth = 0, real
            // nowcast texture). The equatorward boundary marches toward the
            // equator with activity (~2°/Kp, Gussenhoven et al. 1983), driven
            // here by the GROWTH-PHASE-LAGGED Bz (u_bzAurora, ~30 min behind the
            // tail) with a Kp floor — so the oval expands and brightens minutes
            // AFTER the tail X-line fires, the substorm growth phase made
            // visible. ~6° equatorward shift toward magnetic midnight.
            float bzAur  = clamp(-u_bzAurora / 15.0, 0.0, 1.0);
            float aurAct = max(bzAur, clamp((u_kp - 2.0) / 7.0, 0.0, 1.0));
            float midn   = clamp(-dot(normalize(p), SUN), 0.0, 1.0);   // 1 at magnetic midnight
            // Teardrop oval (Gussenhoven et al. 1983 boundary, ~2°/Kp): the
            // equatorward edge marches down with activity AND dips deeper toward
            // midnight. Thickness is asymmetric — thin on the dayside, broad on
            // the nightside, broader still with activity — matching how OVATION
            // draws a fat night-side oval and a narrow day-side arc.
            float bnd    = 67.0 - 17.0 * aurAct - 9.0 * midn;     // equatorward boundary [°]
            float halfW  = 2.5 + 5.0 * midn + 3.0 * aurAct;       // half-width [°] (fat at midnight)
            float center = bnd + halfW;                            // bright ridge sits poleward of the edge
            float dLat   = latDeg - center;
            // Sharp poleward edge, diffuse equatorward tail (the real profile).
            float sig    = (dLat < 0.0) ? halfW : halfW * 0.6;
            float synth  = (0.10 + 0.90 * aurAct) * exp(-(dLat * dLat) / (sig * sig));
            float oval   = mix(ovaTex, synth, u_auroraSynth);

            if (oval > 0.005) {
                // Sharp altitude falloff → thin band, ISS look
                float altFade = exp(-(r - 1.016) * 22.0);
                float t1 = u_time * 0.13, t2 = u_time * 0.08;
                // Single-octave curtain noise — keeps it organic but not chaotic
                float curtain = vn(p * 9.0 + vec3(t1, 0, t2));
                float aurNoise = 0.55 + 0.45 * curtain;
                float aurInt = oval * aurNoise * altFade * 12.0 * u_auroraScale;
                // Color: bright green base, red at strong peaks, violet only in
                // storms — keyed to the lagged Bz so colour also trails the tail.
                vec3 aurCol = mix(vec3(0.05, 1.10, 0.32), vec3(1.05, 0.18, 0.06),
                                  smoothstep(0.30, 0.85, oval));
                aurCol = mix(aurCol, vec3(0.55, 0.06, 0.95), bzAur * 0.45);
                sg += aurInt; em += aurInt * aurCol;
            }
        }

    }

    // ================================================================
    // POLAR CUSP — dayside reconnection funnel
    // ================================================================
    // Magnetosheath plasma penetrating THROUGH the magnetopause toward the
    // atmosphere. It straddles the boundary, so it must NOT be clipped by the
    // inside-only branch above (doing so produced a hard CG edge exactly along
    // the dayside high-latitude magnetopause). The exp(-|dmp|) term already
    // tapers it ~3 R_E either side, so it reads as a soft funnel.
    if (bzStorm > 0.10 && r < 16.0) {
        float cuspN  = 0.5 + 0.5 * vn(p * 6.0 + vec3(0, u_time * 0.1, 0));
        float rFade  = 1.0 - smoothstep(11.0, 15.5, r);   // gentle outer taper
        float cusp   = exp(-pow((sinLat - 0.93) / 0.06, 2.0))
                     * exp(-abs(dmp) * 0.32)              // symmetric across MP
                     * smoothstep(-0.1, 0.6, cosT)
                     * bzStorm * 0.85 * cuspN * rFade;
        sg += cusp; em += cusp * vec3(1.05, 0.15, 0.02);
    }

    // ================================================================
    // BOW SHOCK + MAGNETOSHEATH
    // ================================================================
    // Outside the magnetopause, on the dayside: solar wind hits the standoff
    // shock and is compressed/heated, then drapes around Earth as the
    // magnetosheath. Bow-shock surface uses the same paraboloid form as Shue
    // with empirical standoff factor ~1.32 (Cairns 1995; Fairfield 1971 fits
    // give 1.25–1.4) and slightly larger flaring exponent.
    //
    // Kept geometrically thin and dayside-only so the camera doesn't sit
    // submerged in glowing sheath fog when orbiting at 25 R_E.
    if (dmp > 0.0 && cosT > -0.05 && r < 22.0) {
        float bsR0    = u_r0 * 1.32;
        float bsAlpha = u_alpha * 1.04;
        float rBS     = bsR0 * pow(2.0 / (1.0 + cosT + 1e-5), bsAlpha);
        rBS           = min(rBS, 40.0);
        float dBS     = r - rBS;                          // <0 inside shock, >0 upstream
        float rMP     = r - dmp;                          // local MP radius
        float sheathThick = max(rBS - rMP, 0.4);

        // Dayside-strength weight — falls off fast away from subsolar
        float daySide = smoothstep(-0.05, 0.55, cosT);

        // Bow shock — thin compressed shell at the shock surface.
        // Reads as a faint arc, not a sky-filling dome. Color biased toward
        // peach/cream (warm but not pure red) so tangential rays — which
        // accumulate brightness along the curved shell — don't blow out red.
        if (abs(dBS) < 0.75) {
            float bsN  = 0.55 + 0.45 * vn(vec3(cosT * 4.0, p.y * 0.6, p.z * 0.6)
                                          + vec3(u_time * 0.022, 0.0, 0.0));
            // Soft cosT taper instead of square daySide — subsolar peak less spiky
            float bsW    = pow(daySide, 1.3) * (1.0 - 0.35 * cosT * cosT);
            float shockI = exp(-dBS * dBS * 12.0) * 0.0090 * bsN
                         * bsW * speedNorm;
            sg += shockI * 0.25;
            em += shockI * vec3(0.95, 0.74, 0.45);        // peachy warm
        }

        // Magnetosheath fill — turbulent shocked flow between BS and MP.
        // Halved again; mostly a hint of structure rather than a fog.
        if (dBS < 0.0 && dmp > 0.0) {
            float sheathFrac = clamp(dmp / sheathThick, 0.0, 1.0);
            float bell  = sheathFrac * (1.0 - sheathFrac) * 4.0;
            float khT   = u_time * speedNorm * 0.16;
            vec3  khP   = pSun * vec3(0.35, 1.4, 1.4) + vec3(khT, 0.0, 0.0);
            float khN   = 0.38 + 0.62 * vn(khP);
            float sheathI = bell * khN * 0.0048 * daySide * speedNorm;
            sg += sheathI * 0.10;
            vec3 shCol = mix(vec3(0.55, 0.62, 0.95), vec3(0.95, 0.55, 0.30), bzStorm * 0.55);
            em += sheathI * shCol;
        }
    }

    // ================================================================
    // MAGNETOTAIL — three-component structure
    // ================================================================
    // Physically motivated replacement for the old flat-disc plasma sheet.
    // Components (anti-sunward only, beyond the terminator):
    //   1. Current sheet   — Harris sech² profile, thin near-Earth → wide far-tail
    //   2. PSBL            — sharp bright ridges at lobe/sheet interface
    //   3. Lobe fill       — cold tenuous plasma between PSBL and magnetopause
    //   4. MP boundary glow— faint emission at the tail magnetopause surface
    //
    // The tail magnetopause radius flares outward: R(tailX) = 12.5 + √(tailX·1.1)
    // using an empirical fit (Fairfield/Sibeck) instead of the Shue model which
    // diverges at θ=180°. No hard-sphere cutoff anywhere.
    if (pSun.x < -2.0 && r < 30.0) {
        float tailX    = -pSun.x;               // > 0 = tailward
        float tailPerp = length(pSun.yz);       // cylindrical radius from tail axis

        // Tail magnetopause — continuous match to Shue at the terminator,
        // asymptoting to ~26 R_E far downstream (Fairfield/Sibeck observations).
        float rTermMP  = u_r0 * pow(2.0, u_alpha);
        float rTailMax = 26.0;
        float rTail    = rTermMP + (rTailMax - rTermMP) * (1.0 - exp(-tailX / 22.0));

        // Smooth entry ramp over ~3 R_E past the terminator (no hard edge)
        float entryFade = smoothstep(2.0, 5.0, tailX);

        if (tailPerp < rTail * 0.97) {

            // --- Neutral sheet position: noise warp + slow sinusoidal flapping ---
            // warpA is zero-mean (vn shifted by −0.5), warpB is always zero-mean (sin).
            float warpA = 0.80 * (vn(vec3(tailX * 0.10, p.z * 0.33, u_time * 0.015)) * 2.0 - 1.0);
            float warpB = 0.45 * sin(p.z * 0.44 + u_time * 0.032);
            float neutralY = warpA + warpB;
            float dy       = p.y - neutralY;     // signed dist from neutral plane

            // --- Plasma sheet half-thickness: Harris sheet grows as sqrt(tailX) ---
            // Near-Earth (tailX≈2): h≈1.6 Re  |  Middle tail (tailX≈15): h≈2.7 Re
            // Far tail  (tailX≈25): h≈3.2 Re
            // Under southward IMF the sheet thins (substorm growth phase) before
            // explosive reconnection — drop hPS up to ~35% with bzStorm.
            float hPS = 1.00 + 0.44 * sqrt(tailX);
            hPS *= (1.0 - bzStorm * 0.35);

            // Harris sech² profile: n(z) ∝ sech²(z/h) — smooth, no flat core
            float s   = dy / max(hPS, 0.1);
            float es  = exp(min(abs(s), 8.0));
            float sech2 = 4.0 / ((es + 1.0 / es) * (es + 1.0 / es));

            // Shared attenuation factors
            float mpProx   = 1.0 - tailPerp / rTail;    // 0 at MP, 1 on axis
            float mpFade   = smoothstep(0.0, 0.20, mpProx);
            float tailFade = exp(-tailX * 0.046);

            // --- 1. Current sheet ---
            // Filamentary noise elongated along tail axis (reconnection blobs)
            float filCS = 0.28 + 0.72 * vn(
                vec3(tailX * 0.16, dy * 2.5, p.z * 1.00) + vec3(u_time * 0.048, 0.0, 0.0));
            float csInt = sech2 * filCS * tailFade * mpFade * 0.20;
            // Quiet: cool blue-white. Storm: shifts to warm orange through purple.
            vec3 csCol = mix(vec3(0.12, 0.40, 0.98), vec3(0.76, 0.18, 0.65), bzStorm * 0.65);
            csCol      = mix(csCol, vec3(0.93, 0.50, 0.12), bzStorm * 0.42);
            sg += csInt * entryFade;
            em += csInt * csCol * (1.0 + bzStorm * 1.4) * entryFade;

            // --- 1b. Near-Earth reconnection (substorm X-line) ---
            // Under sustained Bz < 0, a localized hot spot forms at ~15-25 R_E
            // tailward where the dayside-eroded flux reconnects. Bright orange-red
            // localized to the neutral sheet; pulses on substorm timescales.
            if (bzStorm > 0.12) {
                float xRec  = 17.0 + 3.0 * sin(u_time * 0.10);   // X-line drifts
                float dxr   = (tailX - xRec) / 4.0;
                float along = exp(-dxr * dxr);
                float thin  = exp(-s * s * 2.8);                  // hug the sheet
                float tight = exp(-p.z * p.z * 0.05);             // limited dawn-dusk width
                float pulse = 0.55 + 0.45 * sin(u_time * 0.62 + tailX * 0.18);
                float rec   = along * thin * tight * pulse * bzStorm * 0.22;
                vec3 recCol = vec3(1.15, 0.50, 0.18);
                sg += rec * entryFade;
                em += rec * recCol * entryFade;
            }

            // --- 2. Plasma sheet boundary layer (PSBL) ---
            // Energetic-particle ridges at the inner lobe boundary.
            float absDy    = abs(dy);
            float psblDist = abs(absDy - hPS * 1.55);
            float psblFil  = 0.35 + 0.65 * vn(
                vec3(tailX * 0.13, dy * 1.6, p.z * 1.15) + vec3(u_time * 0.028, 0.0, 0.0));
            float psblInt  = exp(-psblDist * psblDist * 2.1)
                           * 0.07 * tailFade * mpFade * psblFil;
            vec3  psblCol  = mix(vec3(0.18, 0.56, 1.00), vec3(0.45, 0.10, 0.88), bzStorm * 0.48);
            sg += psblInt * entryFade;
            em += psblInt * psblCol * entryFade;

            // --- 3. Lobe fill ---
            // Cold tenuous plasma; bell-shaped profile peaks mid-lobe.
            float lobeIn  = hPS * 1.55;           // inner edge ≈ outer PSBL
            float lobeOut = rTail * 0.86;         // outer edge just inside MP
            if (absDy > lobeIn && absDy < lobeOut) {
                float lobeFrac  = clamp((absDy - lobeIn) / max(lobeOut - lobeIn, 0.5), 0.0, 1.0);
                float lobeBell  = lobeFrac * (1.0 - lobeFrac) * 4.0;  // parabola, peak mid-lobe
                float lobeNoise = 0.42 + 0.58 * vn(
                    vec3(tailX * 0.07, absDy * 0.48, p.z * 0.42) + vec3(u_time * 0.012, 0.0, 0.0));
                float lobeInt = lobeBell * exp(-tailX * 0.060) * lobeNoise * 0.014;
                sg += lobeInt * entryFade;
                em += lobeInt * vec3(0.14, 0.36, 0.88) * entryFade;
            }

            // --- 4. Tail magnetopause boundary glow ---
            // Very thin faint emission at the MP surface (contact with magnetosheath).
            float mpRimFrac = tailPerp / rTail;
            float mpGlow    = exp(-(1.0 - mpRimFrac) * (1.0 - mpRimFrac) * 50.0)
                            * exp(-tailX * 0.062) * 0.020;
            sg += mpGlow * entryFade;
            em += mpGlow * vec3(0.18, 0.50, 0.92) * entryFade;
        }
    }

    // (Magnetopause boundary shell removed — its noise modulation read as
    // "fabric chunks" in the background. The Shue magnetopause is still active
    // via sdMp() for the dayside structure cutoff.)

    // ============ SOLAR WIND STREAMERS ============
    // Subtle Sun-aligned streaks on dayside — flow direction follows actual
    // Sun direction (declination-tilted), not the +X axis.
    // Inner boundary: always keep streamers beyond the camera orbit so the camera
    // never ends up submerged inside them regardless of the orbit-radius slider.
    if (cosT > 0.2 && dmp > 0.8 && r > max(u_r0 * 1.15, u_camRadius * 1.12) && r < 22.0) {
        float flowT  = u_time * speedNorm * 0.65;
        // Streaks elongated along Sun direction in pSun frame
        vec3  sP1    = vec3(pSun.x * 0.10 + flowT, pSun.y * 1.6, pSun.z * 1.6);
        float streak = pow(vn(sP1), 5.0);
        float perp   = length(pSun.yz);          // distance from Sun-Earth line
        float focus  = exp(-perp * 0.28);        // tighter cone — less omnidirectional
        float sw = streak * focus * 0.18 * smoothstep(0.2, 0.7, cosT);
        vec3 swCol = mix(vec3(0.35, 0.62, 1.10), vec3(1.20, 0.70, 0.30), flareFact * 0.7);
        sg += sw; em += sw * swCol;
    }

    // ============ EARTH SHADOW ============
    // Anti-Sun cylinder behind Earth — only applied to inner structures (r < 8).
    // Beyond that, Earth subtends <4° and its geometric shadow is negligible
    // compared to the tail scales; applying it further just darkens the current sheet.
    if (cosT < 0.0 && r < 8.0) {
        float perp   = length(pSun.yz);
        float shadow = smoothstep(1.15, 0.85, perp);
        shadow *= smoothstep(-0.5, -2.0, pSun.x);
        em *= 1.0 - shadow * 0.85;
    }

    return vec4(em, sg);
}

// ================================================================
// EARTH SURFACE
// ================================================================

// Equirectangular UV from surface normal (Y axis = North pole).
// Returns raw (pre-fract) U so derivatives remain continuous across the date-line seam.
vec2 sphereUVRaw(vec3 n) {
    float u = atan(-n.z, n.x) / 6.28318530718 + 0.5 + u_earthRot;
    float v = asin(clamp(n.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
    return vec2(u, v);
}

vec3 shadeEarth(vec3 pos, vec3 rd) {
    vec3  n    = normalize(pos);
    float diff = dot(n, SUN);

    // Sharp terminator — narrow ~2° solar-elevation transition
    float terminator = smoothstep(-0.01, 0.03, diff);

    // ---- Sample real Earth textures (seam-safe) ----
    // Derivatives are computed on the raw (non-fract) U so the hardware sees the
    // true small per-pixel gradient instead of the ~1.0 jump at the date-line seam.
    vec2 uvRaw = sphereUVRaw(n);
    vec2 uv    = vec2(fract(uvRaw.x), uvRaw.y);
    vec2 ddx   = vec2(dFdx(uvRaw.x), dFdx(uvRaw.y));
    vec2 ddy   = vec2(dFdy(uvRaw.x), dFdy(uvRaw.y));
    // Residual atan seam can still produce a ±1 jump in the raw derivative —
    // subtract it out so mip selection is not thrown off near the poles either.
    if (abs(ddx.x) > 0.5) ddx.x -= sign(ddx.x);
    if (abs(ddy.x) > 0.5) ddy.x -= sign(ddy.x);
    vec3 dayTex   = textureGrad(u_earthDay,   uv, ddx, ddy).rgb;
    vec3 nightTex = textureGrad(u_earthNight, uv, ddx, ddy).rgb;

    // sRGB → linear (NASA textures are sRGB-encoded; tone-map at end re-applies gamma)
    dayTex   = pow(dayTex,   vec3(2.2));
    nightTex = pow(nightTex, vec3(2.2));

    // ---- Day side ----
    float sunI  = max(diff, 0.0);
    vec3 dayCol = dayTex * (0.015 + 0.985 * sunI);
    // Subtle warm tint near subsolar point
    dayCol  = mix(dayCol, dayCol * vec3(1.14, 1.05, 0.84), sunI * 0.45);

    // Ocean specular: bright spot where land texture is mostly blue
    float water = clamp(1.0 - 1.5 * max(dayTex.r, dayTex.g) / max(dayTex.b, 0.05), 0.0, 1.0);
    vec3  hv  = normalize(SUN - rd);
    float sp  = pow(max(dot(n, hv), 0.0), 110.0) * water * max(diff, 0.0);
    dayCol += sp * vec3(0.45, 0.60, 0.92) * 2.0;

    // ---- Night side ----
    // Multiply night-light intensity by a base ambient so shape is faintly visible
    vec3 nightCol = vec3(0.0004, 0.0006, 0.002) + nightTex * 0.85 * u_nightlightScale;

    return mix(nightCol, dayCol, terminator);
}

// ================================================================
// ATMOSPHERE LIMB
// ================================================================

// ISS-style atmospheric limb: orange ground layer → green airglow → blue scattering.
// Layered by rim intensity (closer to limb = lower altitude = warmer color).
vec3 limb(vec3 n, vec3 rd) {
    float ndr    = abs(dot(n, -rd));
    float sunDot = dot(n, SUN);
    // Tighter falloff — atmosphere fades within ~6° of solar elevation past
    // the terminator, instead of bleeding ~18° into the night side.
    float lit    = smoothstep(-0.10, 0.20, sunDot);
    // Twilight gate: orange only where the Sun grazes the horizon (near terminator).
    // Without this, the warm band wraps the entire dayside limb and reads as a tan ring.
    float twilight = smoothstep(-0.15, 0.02, sunDot)
                   * (1.0 - smoothstep(0.02, 0.35, sunDot));

    // Three altitude bands using different rim falloff curves
    float lower  = pow(1.0 - ndr, 8.0);   // tight band right at the horizon (orange)
    float middle = pow(1.0 - ndr, 5.0) - lower * 0.8; // (green airglow)
    float upper  = pow(1.0 - ndr, 2.5) - middle * 0.6 - lower; // (blue scattering)

    vec3 col = vec3(0.0);
    // Orange-red ground layer — only at terminator twilight
    col += vec3(1.10, 0.42, 0.10) * max(lower, 0.0)  * 1.4  * twilight;
    // Green airglow band (oxygen 557.7nm emission, visible in ISS night photos)
    col += vec3(0.10, 0.65, 0.30) * max(middle, 0.0) * 0.55 * lit;
    // Blue scattering — Rayleigh-style sky dome
    col += vec3(0.20, 0.55, 1.10) * max(upper, 0.0)  * 0.85 * lit;

    return col;
}

// Subtle airglow visible even on nightside — faint orange/green band
// just above the horizon where atomic oxygen recombines (real ISS effect).
vec3 nightglow(vec3 n, vec3 rd) {
    float ndr  = abs(dot(n, -rd));
    float band = pow(1.0 - ndr, 7.0) - pow(1.0 - ndr, 12.0);
    band = max(band, 0.0);
    return vec3(0.65, 0.32, 0.10) * band * 0.30;
}

// ================================================================
// STARFIELD — soft Gaussian circles, two layers + Milky Way
// ================================================================

// Dense starfield like the ISS view: three layers of stars at different scales,
// no chunky Milky Way dust noise (which read as "fabric").
vec3 stars(vec3 rd) {
    float b = 0.0;
    // Layer 1: bright sparse stars
    {
        vec3 rds = rd * 200.0;
        vec3 cell = floor(rds);
        vec3 fc   = fract(rds) - 0.5;
        float h   = h3(cell);
        if (h > 0.987) {
            float mag = fract(h * 73.9);
            float tw  = 0.72 + 0.28 * sin(u_time * (2.5 + fract(h * 8.3) * 5.0) + h * 6.28);
            b = max(b, mag * exp(-dot(fc, fc) * 70.0) * tw * 1.4);
        }
    }
    // Layer 2: medium-density mid-brightness stars
    {
        vec3 rds = rd * 360.0;
        vec3 cell = floor(rds);
        vec3 fc   = fract(rds) - 0.5;
        float h   = h3(cell + vec3(17.3, 31.1, 7.7));
        if (h > 0.984) {
            float mag = fract(h * 93.7) * 0.65;
            float tw  = 0.82 + 0.18 * sin(u_time * (1.7 + fract(h * 6.1) * 3.5) + h * 6.28);
            b = max(b, mag * exp(-dot(fc, fc) * 130.0) * tw);
        }
    }
    // Layer 3: dense faint background stars (the dust the eye sees)
    {
        vec3 rds = rd * 580.0;
        vec3 cell = floor(rds);
        vec3 fc   = fract(rds) - 0.5;
        float h   = h3(cell + vec3(53.7, 11.3, 23.9));
        if (h > 0.982) {
            float mag = fract(h * 41.3) * 0.32;
            b = max(b, mag * exp(-dot(fc, fc) * 220.0));
        }
    }
    return vec3(b);
}

// ================================================================
// SUN GLOW — distant star with corona, visible past Earth
// ================================================================

// Sun is a bright point — narrow corona only. Direction cue comes from
// solar wind streamers and limb shading, not from a sky-filling halo.
vec3 sunGlow(vec3 rd, vec3 cam) {
    float cosA = dot(rd, SUN);
    if (cosA < 0.85) return vec3(0.0);

    // Occlusion: if the ray passes close to Earth (and Earth is between the
    // camera and the Sun direction), the Sun is hidden.
    // Test: project Earth (origin) onto the ray, measure perpendicular distance.
    float t_close = -dot(cam, rd);              // ray param at closest approach to origin
    if (t_close > 0.0) {
        vec3 closest = cam + rd * t_close;
        float perp   = length(closest);
        // If the perpendicular distance is less than Earth radius (1 R_E)
        // AND the Sun is on the far side (closest point is between cam and Sun),
        // Earth eclipses the Sun.
        if (perp < 1.0 && dot(closest, SUN) > dot(cam, SUN)) {
            return vec3(0.0);   // Earth eclipses the Sun — hard block
        }
    }

    float frac = (cosA - 0.85) / 0.15;
    float disk = smoothstep(0.9990, 1.0, cosA);
    float core = pow(frac, 6.0) * 0.30;
    float halo = pow(frac, 2.5) * 0.07;
    return disk * vec3(2.4, 2.05, 1.45)
         + core * vec3(1.10, 0.82, 0.45)
         + halo * vec3(0.55, 0.38, 0.15);
}

// ================================================================
// STRUCTURAL DENSITY (Phase 3 — abstraction layer)
// ================================================================
// Outline-only emission: at each march step, evaluate the SDFs of the major
// invisible surfaces (magnetopause, bow shock, dipole L-shells) and emit
// exp(−d²·K) at each zero-crossing. The volumetric volDensity() is skipped
// in this mode, so the result reads as clean line-art on a near-black sky —
// "what are the surfaces?" stripped of art.
vec4 structuralDensity(vec3 p) {
    float r = length(p);
    if (r > 30.0) return vec4(0.0);

    float dMp = sdMp(p);
    float dBs = sdBs(p);
    float dLs = sdLShells(p);

    // Tighter outline on L-shells (denser nest of surfaces); looser on the
    // single Shue magnetopause shell. Tuned so all three read at a similar
    // visual weight when integrated through the ray.
    float lMp = exp(-dMp * dMp * 70.0);
    float lBs = exp(-dBs * dBs * 70.0);
    float lLs = exp(-dLs * dLs * 260.0);

    // Mono cyan-white line tint. Per-surface colour-coding kept off so the
    // structural pass reads as a clean wireframe; Visual already differentiates.
    vec3  lineCol = vec3(0.65, 0.88, 1.12);
    float em = lMp * 0.55 + lBs * 0.40 + lLs * 0.45;
    return vec4(lineCol * em, em * 0.04);   // very light extinction → depth order
}

// ================================================================
// MAIN
// ================================================================

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution) / u_resolution.y;

    // Camera, always centered on Earth (fwd = −cam below). Two modes:
    vec3 cam;
    if (u_camMode == 1) {
        // FREE LOOK — mouse-driven spherical orbit. Elevation is clamped off the
        // poles in JS so the up-vector cross product never degenerates (and so
        // the shells never project as flat concentric rings from straight above).
        float ce = cos(u_camElev);
        cam = u_camRadius * vec3(ce * cos(u_camAzim), sin(u_camElev), ce * sin(u_camAzim));
    } else {
        // AUTO — confined 3/4 orbit on the flank. The old free-running full 360°
        // spin swung the camera straight down the anti-sunward axis once per
        // revolution — and with the storm-aware tail now reaching ~25 R_E while
        // the orbit sits at 12 R_E, that buried the camera inside the lobe and
        // washed the structure into a smear. Instead, sweep a slow arc across the
        // flank, from a sunward 3/4 (dayside bell as hero) to a mild tailward
        // profile — the side-on angles where compression / inflation / tail-
        // stretch read best, dwelling at the flanks (sin flattens there) and
        // never crossing into the tail or the head-on axis.
        float ang = 1.40 + 0.55 * sin(u_time * 0.032);  // ≈ 49°…112° azimuth (flank arc)
        float ch  = 3.0 + 2.5 * sin(u_time * 0.029);    // 0.5–5.5 R_E elevation (parallax)
        cam = vec3(cos(ang) * u_camRadius, ch, sin(ang) * u_camRadius);
    }
    vec3  fwd = normalize(-cam);
    vec3  rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3  upv = cross(rgt, fwd);
    vec3  rd  = normalize(fwd + u_fov * (uv.x * rgt + uv.y * upv));

    // Earth sphere intersection
    float b    = dot(cam, rd);
    float c    = dot(cam, cam) - 1.0;
    float disc = b * b - c;
    float tE   = -1.0;
    if (disc >= 0.0) {
        float sq = sqrt(disc);
        float t0 = -b - sq, t1 = -b + sq;
        tE = (t0 > 1e-3) ? t0 : ((t1 > 1e-3) ? t1 : -1.0);
    }

    // Volume ray march with stochastic jitter — kills banding artifacts
    float tEnd = (tE > 0.0) ? tE : 50.0;
    float tBeg = 0.3;
    float ds   = (tEnd - tBeg) / float(VSTEPS);
    // Per-pixel hash, time-varying so it animates rather than freezing as fixed noise
    float jitter = h2(gl_FragCoord.xy + fract(u_time) * 31.7);

    vec3  vc = vec3(0.0);
    float tr = 1.0;

    bool structural = (u_renderMode == 1);

    for (int i = 0; i < VSTEPS; i++) {
        float t  = tBeg + (float(i) + jitter) * ds;
        vec3  p  = cam + t * rd;
        vec4  vd = structural ? structuralDensity(p) : volDensity(p);
        float sg = vd.a;

        if (sg > 5e-5) {
            vc += tr * vd.rgb * ds;
            tr *= exp(-sg * ds * 0.40 * u_volExtinct);
            if (tr < 0.008) break;
        }
    }

    // Background. Structural mode keeps Earth as a dim geographic anchor and
    // drops the atmospheric limb/nightglow (atmosphere is a Visual feature,
    // not a magnetospheric structure).
    vec3 col;
    if (tE > 0.0) {
        vec3 hp = cam + tE * rd;
        vec3 nrm = normalize(hp);
        if (structural) {
            col = shadeEarth(hp, rd) * 0.28;
        } else {
            col = shadeEarth(hp, rd) + limb(nrm, rd) * u_limbScale + nightglow(nrm, rd) * u_limbScale;
        }
    } else {
        col = vec3(0.0, 0.0, 0.0010);
        col += stars(rd) * u_starBright;
        col += sunGlow(rd, cam);
    }

    col = col * tr + vc;

    // Reinhard tone map + gamma
    col *= u_exposure;
    col = col / (1.0 + col);
    col = pow(max(col, 0.0), vec3(1.0 / u_gamma));

    fragColor = vec4(col, 1.0);
}
