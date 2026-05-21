// Curated-storm manifest — the single list shared by TimelineSource (which
// loads the JSON) and the transport bar (which renders the picker). Each entry
// is lightweight; the full series + blurb/teaches/realDstMin live in the JSON
// under data/scenarios/, fetched lazily when a scenario is selected.
//
// The data is real instrument-era OMNI (see tools/build-scenarios.mjs). Ordered
// to walk a student from the textbook two-branch contrast up to the extremes.

export const LIVE_ID = 'live';

export const SCENARIOS = [
    { id: LIVE_ID, name: 'Live (NOAA)', date: 'now',
      blurb: 'Real-time DSCOVR/ACE + GOES feed from NOAA SWPC.' },
    { id: 'cir-2007-0507', name: 'High-Speed Stream', date: '2007-05-07',
      file: './data/scenarios/cir-2007-0507.json' },
    { id: 'stpatrick-2015', name: "St. Patrick's 2015", date: '2015-03-17',
      file: './data/scenarios/stpatrick-2015.json' },
    { id: 'november-2004', name: 'November 2004', date: '2004-11-07',
      file: './data/scenarios/november-2004.json' },
    { id: 'gannon-2024', name: 'Gannon 2024', date: '2024-05-10',
      file: './data/scenarios/gannon-2024.json' },
];

export function scenarioById(id) {
    return SCENARIOS.find(s => s.id === id) || null;
}
