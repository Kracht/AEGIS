// AEGIS data-source seam.
//
// The render loop never talks to a concrete fetcher — it talks to a
// *DataSource*: anything that can be started, stopped, and asked for the
// current space-weather uniforms. Today the only implementation is the live
// NOAA poller (DataFetcher). A future TimelineSource — curated instrument-era
// storms with pause/scrub — will implement the same contract and drop in here
// without main.js, the renderer or the HUD changing.
//
// DataSource contract:
//   start()        begin producing data (open pollers / load a timeline)
//   stop()         release resources (clear timers)
//   toUniforms()   -> {
//                       r0, alpha, bz, speed, kp, bt, density, pressure,
//                       flare,                       // drivers + Shue model
//                       dst, dstInject, dstDecay, dstTau,  // ring-current ODE
//                       dataAge, isStale             // provenance
//                     }
//                     called every frame; all fields in physical units
//                     (see data-fetcher.js for derivations / citations).
//
// The renderer and HUD consume this object and nothing else from the data
// layer — keep this contract stable when adding new sources.

import { DataFetcher } from './data-fetcher.js';

// Returns the active data source. Swap the implementation here (e.g. a
// TimelineSource) without touching the renderer or the main loop.
export function createDataSource() {
    return new DataFetcher();
}
