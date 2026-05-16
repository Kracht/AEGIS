# AEGIS

### **A**ctive **E**arth **G**eomagnetic **I**maging **S**ystem

A real-time, browser-based 3D visualization of Earth's magnetosphere, driven by
live space-weather data from NOAA.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![WebGL2](https://img.shields.io/badge/WebGL2-required-orange.svg)
![Build](https://img.shields.io/badge/build-none%20(vanilla%20ES%20modules)-brightgreen.svg)
![Data](https://img.shields.io/badge/data-NOAA%20SWPC%20live-9cf.svg)

AEGIS ray-marches the magnetosphere in a single WebGL2 fragment shader. The
magnetopause, bow shock, plasmasphere, ring current, magnetotail current sheet,
auroral ovals and substorm reconnection are all recomputed every frame from the
solar wind, IMF, Kp and GOES X-ray feeds that NOAA publishes right now. Nothing
is pre-baked — the shape you see is the shape of near-Earth space at the moment
you load the page.

<!-- Add a hero image at docs/preview.jpg and uncomment:
![AEGIS](docs/preview.jpg)
-->

---

## What you're looking at

| Element | Meaning |
|---|---|
| Blue/white teardrop | The magnetosphere — Sun-compressed, drawn into a long night-side tail |
| Warm dayside dome | Bow shock + magnetosheath — shocked, heated, draped solar wind |
| Arcing tubes near Earth | Geomagnetic field-line shells (McIlwain L = 2…6) |
| Inner glow | Plasmasphere — cold dense plasma; shrinks inward during storms |
| Crimson torus (storms) | Ring current — the Dst signature of a geomagnetic main phase |
| Tail band | Plasma sheet (Harris current sheet), flapping in real time |
| Orange spot behind Earth | Near-Earth reconnection X-line (Bz southward) |
| Polar rings | Aurora ovals from the NOAA OVATION nowcast |
| Terminator | Real day/night boundary for the current UTC time |

A full annotated walkthrough is in the manuals:
**[English](docs/README.md)** · **[Deutsch](docs/README.de.md)**.

---

## Quick start

AEGIS is a static site with **no build step** — plain HTML + ES modules + GLSL.
It does need to be served over HTTP (ES module imports and `fetch()` do not work
from `file://`), and it needs network access to reach the NOAA endpoints.

```bash
git clone <your-repo-url> aegis
cd aegis

# any static file server works; e.g. Python:
python3 -m http.server 8080

# then open http://localhost:8080
```

**Requirements**

- A browser with **WebGL2** (Chrome/Edge/Firefox/Safari, last few years).
- Internet access for the live NOAA feeds. Offline or if a feed fails, AEGIS
  falls back to quiet-condition defaults and shows a stale-data warning.

**Controls**

- `F2` (or the **Settings [F2]** label by the FPS counter) toggles the visual
  tuning panel — camera orbit/FOV, exposure, gamma, and per-layer intensity.

---

## How it works

```
NOAA SWPC / GOES / OVATION  ──▶  data-fetcher.js   ──▶  Shue (1997) r₀, α
                                  aurora-texture.js ──▶  polar aurora grids
                                          │
                                          ▼
                            renderer.js  (uniforms, textures)
                                          │
                                          ▼
              fragment.glsl  —  one full-screen triangle,
              volumetric ray march of the whole scene
```

1. `data-fetcher.js` polls solar wind, Kp and GOES X-ray, derives the Shue et
   al. (1997) magnetopause standoff `r₀` and flaring exponent `α` plus the
   solar-wind dynamic pressure, and frame-interpolates between polls.
2. `aurora-texture.js` polls the NOAA OVATION aurora nowcast into two polar
   `R8` textures.
3. `renderer.js` compiles the program and pushes per-frame uniforms; the only
   geometry is a single oversized triangle.
4. `fragment.glsl` ray-marches emission/extinction through an SDF model of the
   magnetosphere (96 jittered steps, Reinhard tone map).

---

## Data sources

All live data is fetched client-side from **NOAA's Space Weather Prediction
Center (SWPC)** — U.S. Government work, public domain.

| Feed | Endpoint | Used for |
|---|---|---|
| Solar wind magnetic field | `services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json` | Bz, Bt |
| Solar wind plasma | `services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json` | speed, density, pressure |
| Planetary K-index | `services.swpc.noaa.gov/products/noaa-planetary-k-index.json` | Kp, G-storm scale |
| GOES X-ray flux | `services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json` | flare class |
| OVATION aurora | `services.swpc.noaa.gov/json/ovation_aurora_latest.json` | auroral ovals |

Most measurements originate from **DSCOVR** at the L1 Lagrange point and the
**GOES** satellites.

---

## Project structure

```
index.html            # entry; canvas + status panel mount points
src/
  main.js             # boot + render loop + orbital (terminator) maths
  renderer.js         # WebGL2 program, textures, per-frame uniforms
  data-fetcher.js     # NOAA SWPC ingestion + Shue model + interpolation
  aurora-texture.js   # OVATION nowcast → polar GL textures
  ui.js               # live status HUD + EN/DE manual links
  dev-panel.js        # FPS readout + Settings [F2] tuning panel
shaders/
  vertex.glsl         # full-screen triangle
  fragment.glsl       # the entire scene (ray-marched volumetrics)
textures/             # NASA Blue Marble (monthly) + Black Marble night
docs/                 # user manuals (EN / DE)
```

---

## Acknowledgements & references

This project stands on published space-physics models, public NASA/NOAA data,
and well-known real-time graphics techniques.

**Space-physics & empirical models**

- Shue, J.-H., *et al.* (1997). *A new functional form to study the solar wind
  control of the magnetopause size and shape.* J. Geophys. Res., 102(A5),
  9497–9511. — magnetopause shape.
- Fairfield, D. H. (1971). *Average and unusual locations of the Earth's
  magnetopause and bow shock.* J. Geophys. Res., 76(28), 6700–6716.
- Cairns, I. H., *et al.* (1995). — bow-shock standoff scaling.
- Harris, E. G. (1962). *On a plasma sheath separating regions of oppositely
  directed magnetic field.* Nuovo Cimento, 23, 115–121. — tail current sheet.
- Carpenter, D. L., & Anderson, R. R. (1992). *An ISEE/whistler model of
  equatorial electron density in the magnetosphere.* J. Geophys. Res., 97(A2),
  1097–1108. — plasmapause.
- Newell, P. T., *et al.* (2009). — OVATION auroral precipitation model
  (delivered operationally as NOAA SWPC's OVATION aurora nowcast).
- Cooper, P. I. (1969). — solar declination equation, used to place the
  day/night terminator.
- Reinhard, E., *et al.* (2002). *Photographic Tone Reproduction for Digital
  Images.* — the `c/(1+c)` tone-mapping operator.

**Real-time graphics techniques**

- Inigo Quilez — articles on raymarching distance fields, value noise / fBm,
  and domain warping ([iquilezles.org](https://iquilezles.org/articles/)).
  The SDF scene model and turbulence are built on these techniques.
- The classic GLSL `fract(sin(dot(...)) * 43758.5453)` hash, and the
  sine-free variants surveyed in Dave Hoskins, *"Hash without Sine"*
  (Shadertoy).
- The single full-screen-triangle trick for shader-only rendering.

**Data & imagery**

- **NOAA Space Weather Prediction Center** — live space-weather data
  (DSCOVR @ L1, GOES, OVATION). Public domain.
- **NASA Visible Earth** — *Blue Marble Next Generation* (monthly) and
  *Black Marble / Earth at Night* surface imagery. Credit: NASA Earth
  Observatory; used with attribution.

Any errors in the physical interpretation are mine, not the cited authors'.

---

## Disclaimer

AEGIS is an **illustrative, schematic** visualization for education and
outreach. It blends empirical models with artistic interpolation and is **not a
forecasting or operational tool**. For authoritative space-weather information
see [NOAA SWPC](https://www.swpc.noaa.gov).

---

## License

[MIT](LICENSE) © 2026 skracht. Third-party data/imagery (NOAA, NASA) retain
their own terms — see the [LICENSE](LICENSE) notice.
