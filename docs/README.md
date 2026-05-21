# AEGIS — User Manual

**A**ctive **E**arth **G**eomagnetic **I**maging **S**ystem

A real-time, browser-based 3D visualization of Earth's magnetosphere, driven by live space weather data from NOAA.

---

## What You're Looking At

The scene shows Earth and the invisible bubble of magnetic force that protects it — the **magnetosphere**. Every shape, color, and glow you see is calculated from measurements taken right now by satellites and ground stations.

| Visual element | What it represents |
|---|---|
| Blue/white teardrop shape | The magnetosphere — compressed on the Sun-facing side, stretched into a long tail on the night side |
| Warm-tinted outer dome (dayside) | **Bow shock + magnetosheath** — where the supersonic solar wind shocks, heats, and drapes around Earth's magnetic obstacle |
| Arcing strands forming a "jellyfish" | Geomagnetic **field-line shells** (McIlwain L = 2…6) — closed field lines, compressed into a bell on the Sun side and swept into trailing tail filaments (the magnetosphere's real teardrop shape) |
| Inner plasma glow | The **plasmasphere** — a torus of cold, dense plasma trapped close to Earth; shrinks inward during storms |
| Crimson glow hugging Earth (storm only) | **Partial ring current** — westward-drifting energetic ions on the closed field lines; asymmetric (tight near noon, bulged toward midnight); the magnetic signature of a geomagnetic main phase |
| Horizontal band across the tail | **Plasma sheet** (Harris current sheet) — thin layer of dense plasma at the magnetic equator inside the tail, flapping in real time |
| Bright orange spot behind Earth (Bz southward) | **Substorm reconnection X-line** — where stretched tail field lines snap and explosively release stored energy |
| Glowing polar rings | **Aurora ovals** — where energetic particles rain into the atmosphere |
| Terminator line on Earth | The real day/night boundary for the current UTC time |
| Earth surface texture | NASA Blue Marble (monthly, seasonal) for day; Black Marble city lights for night |
| Status panel (top-left) | Live numbers from DSCOVR at the L1 Lagrange point, ~1.5 million km sunward |

---

## The Sun → Solar Wind → Magnetosphere Connection

The Sun continuously sheds a stream of charged particles (electrons and protons) called the **solar wind**. It travels at 300–800 km/s and carries the Sun's magnetic field along with it — the **Interplanetary Magnetic Field (IMF)**.

When the solar wind hits Earth's magnetosphere, it compresses the sunward side to about 10 Earth radii (~64,000 km) and stretches the night side into a tail millions of kilometers long. The shape shifts constantly depending on solar wind speed and pressure.

The critical variable is **Bz** — the north/south component of the IMF:

- **Bz northward (+)** → IMF and Earth's field point the same direction → magnetosphere is closed, quiet
- **Bz southward (−)** → field lines reconnect → the solar wind pours energy and particles into the system → geomagnetic storm, aurora, disruptions

---

## Physical Time: Why the Scene Lags L1 by ~30–60 Minutes

DSCOVR sits at the **L1 Lagrange point**, roughly 1.5 million kilometers sunward of Earth. The plasma DSCOVR samples right now hasn't reached Earth yet — it has to drift downstream at the solar wind's own speed.

That advection time is what you're seeing in the scene:

`t_lag ≈ 1.5 × 10⁶ km ÷ v_sw`

- At a typical 450 km/s → **~55 minutes**
- At a fast 800 km/s CME → **~31 minutes**

AEGIS buffers every L1 sample into a 90-minute history ring and renders the snapshot from `t_lag` ago. So a step change in Bz at L1 stays invisible to the scene for the advection time, then sweeps in. The modeled Dst is integrated over the **lagged** Bz and pressure, so the ring-current readout responds in physical sequence: a southward turning at L1 first compresses the magnetopause and loads the tail, *then* drives the Dst signature minutes later.

This is deliberately a simple advective model. The further differential between tail loading (minutes) and full auroral oval expansion (substorm growth phase, tens of minutes more) is a future refinement; today, both share the same L1 lag.

---

## Data Sources

All data is fetched live from **NOAA's Space Weather Prediction Center (SWPC)**. The satellite providing most of it is **DSCOVR**, parked at the L1 gravitational balance point between Earth and Sun.

| Panel label | Source | What it measures | Update interval |
|---|---|---|---|
| **Bz** | DSCOVR/MAG — IMF magnetic field | North/south component of solar wind field [nT]. Negative = storm driver. | 1 min |
| **Bt** | DSCOVR/MAG — IMF magnetic field | Total IMF strength [nT] | 1 min |
| **Spd** | DSCOVR/PLASMAN — plasma instrument | Solar wind speed [km/s] | 1 min |
| **P** | Calculated from density + speed | Dynamic pressure on the magnetopause [nPa] | 1 min |
| **Kp** | Global network of magnetometers | Planetary geomagnetic disturbance index (0–9) | 3 min |
| **Flare** | GOES satellite X-ray sensors | Solar flare class (A → B → C → M → X) | 1 min |
| **Dst** | Modeled — Burton/O'Brien (2000) coupling | Ring-current strength [nT], integrated from the solar-wind input. An estimate, *not* the official Kyoto Dst. | 1 min |
| **Phase** | Derived from dDst/dt | Storm phase — injection winning = main phase (↓), ring-current decay winning = recovery (↑) | 1 min |
| **Aurora ovals** | NOAA OVATION model | Forecast auroral power per degree of latitude/longitude | 5 min |

### How data maps to the visualization

- **Bz + pressure → magnetopause shape**: The Shue et al. (1997) model is computed each frame. A strong southward Bz shrinks and deforms the magnetosphere visibly.
- **Bz southward → storm anatomy**:
  - Plasmapause shrinks from L ≈ 4.2 to L ≈ 2.6 (Carpenter & Anderson 1992)
  - Ring current moves inward from L ≈ 4 to L ≈ 3, intensifies, and becomes a noon–midnight asymmetric *partial* ring current frozen onto the closed field lines — the Dst signature of the storm main phase
  - Magnetotail current sheet thins (substorm growth phase), color shifts from cool blue to warm orange-purple
  - Near-Earth reconnection X-line ignites at ~17 R_E downstream, pulsing on substorm timescales
- **Solar wind speed → bow shock + magnetosheath brightness**: Heating scales with ρv², so faster wind produces a hotter, more visible shock.
- **Kp → aurora oval size**: Higher Kp expands the glowing rings toward lower latitudes.
- **Flare → brightness pulse**: An M or X-class flare adds a visible burst of light from the Sun direction.
- **Speed + density → inner plasma glow intensity**: Elevated solar wind compresses and heats the inner magnetosphere.
- **Dst → ring-current readout**: The panel's Dst integrates the Burton (1975) / O'Brien & McPherron (2000) equation `dDst*/dt = Q − Dst*/τ` every poll — an explicit injection-versus-decay feedback loop, pressure-corrected. It descends during the storm main phase and recovers over hours.

---

## Solar Events: Flares, CMEs, Filaments, Prominences

**Solar Flares**
Sudden, intense bursts of radiation (X-ray and UV) from the Sun's surface. They travel at the speed of light and reach Earth in ~8 minutes. Measured in classes: A and B are background noise, C is minor, M is moderate, X is major (and X10+ is extreme). Flares can disrupt radio communications almost instantly.

**Coronal Mass Ejections (CMEs)**
Massive clouds of magnetized plasma hurled into space by the Sun. Unlike flares (radiation), CMEs are physical material. They travel at 500–3000 km/s and take 1–3 days to reach Earth. When they arrive with southward Bz, they cause the strongest geomagnetic storms.

**Filaments and Prominences**
Filaments are dense, cool strands of plasma suspended above the solar surface by magnetic field lines. When viewed from the edge of the Sun they appear to hang above the surface and are called prominences. If a filament erupts, it often becomes a CME. They are not directly shown in this visualization but are a key precursor to watch.

---

## Space Weather Effects in Daily Life

Space weather is not just a scientific curiosity. Its effects are measurable and sometimes severe:

| Domain | Effect |
|---|---|
| **GPS / Navigation** | Ionospheric disturbances bend radio signals → positioning errors of meters to kilometers |
| **HF Radio / Aviation** | X-ray flares cause radio blackouts on sunlit side of Earth for minutes to hours |
| **Power grids** | Geomagnetically induced currents (GIC) flow in long cables and pipelines → transformer damage or blackouts (Quebec 1989: 6 million without power) |
| **Satellites** | Atmospheric drag increases in low orbit → orbit decay, attitude disturbances; high-energy particles can degrade or destroy electronics |
| **Astronauts** | Radiation exposure risk during strong events — EVAs are planned around space weather forecasts |
| **Pipelines** | GIC corrode metal pipelines over time |
| **Aurora visibility** | During G2+ storms, aurora is visible well outside the polar regions — mid-latitudes in Europe and North America |

---

## Kp / G-Storm Scale Quick Reference

| Kp | NOAA G | Description | Aurora visibility |
|---|---|---|---|
| 0–4 | — | Quiet to unsettled | Polar regions only |
| 5 | G1 Minor | Small storm | ~60° magnetic latitude |
| 6 | G2 Moderate | Moderate storm | ~55° (southern Scandinavia, northern Canada) |
| 7 | G3 Strong | Strong storm | ~50° (Germany, northern US) |
| 8 | G4 Severe | Severe storm | ~45° |
| 9 | G5 Extreme | Extreme storm | Down to ~40° — rare, once per solar cycle |

---

## Render Modes (F3)

AEGIS shows the *same* live physics through three layers of abstraction. Press `F3` (or click **Mode: …** in the top-right) to cycle between them. Your choice persists across reloads.

| Mode | What it shows | Use it to |
|---|---|---|
| **Visual** | Today's full volumetric scene — ray-marched magnetosheath, plasma sheet, jellyfish field lines, aurora, ring current. | See *what near-Earth space looks like* in this configuration. |
| **Structural** | The invisible **surfaces** alone: Shue magnetopause, Cairns/Fairfield bow shock, dipole L-shells L = 2…6 — drawn as thin cyan-white outlines on a black sky with the Earth dimmed to ~28%. | Strip the art away and answer *"what are the surfaces I was actually looking at?"* The outlines deform in real time with `r₀`, `α`, and the storm-dependent shell warp, so you can watch the magnetopause compress and the tail balloon directly. |
| **Data** | Visual underneath, **plus** a panel listing every uniform driving the scene with its units, citation, and the feature it drives. Includes the Phase 1 `lag` clock — `1.5 × 10⁶ km ÷ v_sw`. | Answer *"what are the numbers behind this picture?"* Useful for tracing why a particular storm phase looks the way it does, or for matching a feature back to its empirical model. |

`F2` toggles the visual-tuning sliders (camera, exposure, per-layer intensities). The two panels are independent and can be open at the same time.

---

## Causal HUD & Storm Replay (F4)

The render modes answer *what* you're seeing. The **causal HUD** (`F4`) answers *why it changed*. It draws the magnetosphere's driver chain as **two separate tracks**, because they are genuinely independent mechanisms on different clocks:

- **Compression branch (fast):** `Pdyn = ρv²  →  r₀ standoff`. Solar-wind ram pressure squeezes the dayside boundary inward. This responds in minutes and barely cares about the magnetic field direction.
- **Storm branch (slow):** `Bz → reconnection (VBs) → ring-current injection (Q) → Dst`. Only *southward* IMF opens the dayside, loads the tail, and feeds the ring current — and the ring current then builds and decays over *hours*.

Nodes light up from the live values; edges carry the **real propagation delays** — the L1 advection clock (`⏱ ~30–60 min`) on the way in, the ring-current decay time (`τ`, several hours) on the way out. **Hover any node** to reveal its governing equation, current value, and citation. This is the difference between *watching an aquarium* and *understanding space weather*: the same beautiful scene, but now with its cause-and-effect made explicit and correctly delayed.

The **transport bar** along the bottom lets you replay real, recorded storms instead of waiting for the live sky:

| Scenario | What it teaches |
|---|---|
| **Live (NOAA)** | The real-time sky, right now. |
| **High-Speed Stream** (May 2007) | *Compression ≠ storm.* A corotating stream slams r₀ inward almost as hard as a superstorm, yet Dst stays a tenth as deep — the top branch lights while the bottom barely stirs. The cleanest demonstration that the two branches are independent. |
| **St. Patrick's 2015** | The classic two-step storm: a CME sheath compresses first, then the ejecta's southward Bz drives the main phase minutes later — watch the branches light *in sequence*. |
| **November 2004** | A deep solar-cycle-23 superstorm — both branches hammered hard, in two distinct hits. |
| **Gannon 2024** | The strongest storm in two decades (aurora at tropical latitudes) — the extreme end of both branches. |

Pick a storm, then **play / pause / scrub** and choose a **time-acceleration** (a multi-day storm compresses into a few minutes). Because everything runs through the *same* physics model as live mode, the lag clocks tick honestly: a scrubbed storm lights the dayside compression *before* the ring-current response, never the same frame. Selecting a storm reveals the causal HUD automatically.

> **Note on Halloween 2003.** The famous 2003 superstorm is deliberately not included: its upstream solar-wind monitors (ACE/Wind) were saturated during the event, so OMNI has no usable *driver* data — a faithful replay would be flat. November 2004, comparably deep and fully covered, stands in. (Same principle that excludes Carrington 1859: no instrument data, no honest replay.)

Storm data is real NASA **OMNI** (instrument-era, 5-minute cadence), bundled offline. The modeled Dst is the Burton/O'Brien estimate — close to, but not identical to, the measured index.

---

*Data: NOAA SWPC · DSCOVR at L1 · GOES-16/18 · NASA OMNI (replay) · Earth imagery: NASA Blue Marble / Black Marble*
