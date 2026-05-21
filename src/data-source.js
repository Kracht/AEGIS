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
//                       dataAge, isStale,            // provenance
//                       timeline?                    // present only for replay
//                     }
//                     called every frame; all fields in physical units
//                     (see magnetosphere-model.js for derivations / citations).
//
// Both the live poller (DataFetcher) and the curated-storm replay
// (TimelineSource) drive the *same* MagnetosphereModel — so the physics a
// student sees in replay is identical to the live engine. The renderer and HUD
// consume this object and nothing else from the data layer — keep the contract
// stable when adding sources.

import { DataFetcher }     from './data-fetcher.js';
import { TimelineSource }  from './timeline-source.js';
import { LIVE_ID, scenarioById } from './scenarios.js';

// Returns the data source for a scenario id. 'live' (the default) gives the
// NOAA poller; any curated-storm id gives a TimelineSource. main.js swaps
// sources through this factory when the transport bar changes scenario.
export function createDataSource(id = LIVE_ID) {
    if (id && id !== LIVE_ID) {
        const meta = scenarioById(id);
        if (meta && meta.file) return new TimelineSource(meta);
    }
    return new DataFetcher();
}
