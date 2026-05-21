// Curated-storm data builder for AEGIS TimelineSource.
//
// Pulls REAL instrument-era data from NASA CDAWeb (CDAS REST, JSON dataview)
// and writes compact scenario JSON to data/scenarios/. Not shipped to the
// browser at runtime — run it offline to (re)generate the bundle:
//
//     node tools/build-scenarios.mjs            # build all scenarios
//     node tools/build-scenarios.mjs --survey   # just print summary stats
//
// Sources (all public, NSSDC "Rules_of_use: Public"):
//   OMNI_HRO2_5MIN   — IMF + plasma, time-shifted to the bow-shock nose, 5 min
//                      (BZ_GSM, F=|B|, flow_speed, proton_density, SYM_H)
//   OMNI2_H0_MRG1HR  — hourly merged OMNI (KP1800 = planetary Kp × 10)
// OMNI DOI: https://doi.org/10.48322/hkaw-ff03  (King & Papatashvilli, NASA GSFC)

import { writeFile } from 'node:fs/promises';

const CDAS = 'https://cdaweb.gsfc.nasa.gov/WS/cdasr/1/dataviews/sp_phys/datasets';

// Fill-value guards. CDAWeb FILLVALs differ per variable: BZ_GSM/F=9999.99,
// flow_speed=99999.9, SYM_H=99999, but proton_density=999.99 — so density needs
// a tighter ceiling or its fills leak into Pdyn. Pass maxAbs per field.
const isFill = (v, maxAbs = 9999) => v === null || !isFinite(v) || Math.abs(v) >= maxAbs;

async function fetchVars(dataset, vars, startISO, endISO) {
    const s = startISO.replace(/[-:]/g, '').replace('.000', '');
    const e = endISO.replace(/[-:]/g, '').replace('.000', '');
    const url = `${CDAS}/${dataset}/data/${s},${e}/${vars.join(',')}?format=json`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${dataset} HTTP ${r.status}`);
    const j = await r.json();
    if (!j.CDF) throw new Error(`${dataset}: ${JSON.stringify(j.body?.p ?? j).slice(0, 200)}`);
    const variable = j.CDF[0].cdfVariables.variable;
    const byName = {};
    for (const v of variable) {
        byName[v.name] = v.cdfVarData.record.map(rec => rec.value[0]);
    }
    return byName; // includes 'Epoch' (ISO strings) + each requested var (strings)
}

// Linear-interpolate interior nulls; forward/back-fill the edges. Keeps a storm
// continuous across short data gaps without inventing trends (documented as a
// gap-fill, not a reconstruction — the underlying samples are all real OMNI).
function clean(values, maxAbs = 9999) {
    const x = values.map(v => (isFill(Number(v), maxAbs) ? null : Number(v)));
    // interior interpolation
    for (let i = 0; i < x.length; i++) {
        if (x[i] !== null) continue;
        let j = i + 1;
        while (j < x.length && x[j] === null) j++;
        const lo = i - 1;
        if (lo >= 0 && j < x.length) {
            const span = j - lo;
            for (let k = i; k < j; k++) x[k] = x[lo] + (x[j] - x[lo]) * (k - lo) / span;
        }
        i = j - 1;
    }
    // edge fill
    const first = x.find(v => v !== null);
    const last  = [...x].reverse().find(v => v !== null);
    for (let i = 0; i < x.length; i++) if (x[i] === null) x[i] = i < x.length / 2 ? first : last;
    return x;
}

const r2 = (v) => Math.round(v * 100) / 100;

async function build(meta, { surveyOnly = false } = {}) {
    const sw = await fetchVars('OMNI_HRO2_5MIN',
        ['BZ_GSM', 'F', 'flow_speed', 'proton_density', 'SYM_H'], meta.start, meta.end);
    const hr = await fetchVars('OMNI2_H0_MRG1HR', ['KP1800'], meta.start, meta.end);

    const epochs = sw.Epoch.map(s => Date.parse(s));
    const cov = (a, maxAbs) => Math.round(100 * a.filter(v => !isFill(Number(v), maxAbs)).length / a.length);
    const coverage = { bz: cov(sw.BZ_GSM, 9999), spd: cov(sw.flow_speed, 9999),
                       den: cov(sw.proton_density, 999), symh: cov(sw.SYM_H, 9999) };
    const bz   = clean(sw.BZ_GSM);
    const bt   = clean(sw.F);
    const spd  = clean(sw.flow_speed);
    const den  = clean(sw.proton_density, 999);
    const symh = clean(sw.SYM_H);

    // Forward-fill hourly Kp (×10) onto the 5-min grid.
    const kpEpochs = hr.Epoch.map(s => Date.parse(s));
    const kpVals   = clean(hr.KP1800).map(v => v / 10);
    const kpAt = (t) => {
        let k = 0;
        for (let i = 0; i < kpEpochs.length; i++) if (kpEpochs[i] <= t) k = i; else break;
        return kpVals.length ? kpVals[k] : 2.0;
    };

    // Derived diagnostics for survey / validation.
    const pdyn = spd.map((v, i) => 1.67e-6 * den[i] * v * v);
    const stat = (a, f) => a.reduce((acc, v) => f(acc, v), f === Math.min ? Infinity : -Infinity);
    const summary = {
        n: epochs.length,
        bzMin:   r2(stat(bz, Math.min)),
        spdMax:  r2(stat(spd, Math.max)),
        pdynMax: r2(stat(pdyn, Math.max)),
        symhMin: r2(stat(symh, Math.min)),  // real measured ring-current depth
        kpMax:   r2(stat(spd.map((_, i) => kpAt(epochs[i])), Math.max)),
        cover:   coverage,                  // % real (pre gap-fill) per driver field
    };
    console.log(`${meta.id.padEnd(18)} ${JSON.stringify(summary)}`);
    if (surveyOnly) return summary;

    const samples = epochs.map((t, i) => [
        r2(bz[i]), r2(bt[i]), r2(spd[i]), r2(den[i]), r2(kpAt(t)),
    ]);

    const out = {
        id: meta.id,
        name: meta.name,
        date: meta.date,
        summary: meta.blurb,
        teaches: meta.teaches,
        fields: ['bz', 'bt', 'speed', 'density', 'kp'],
        units:  ['nT', 'nT', 'km/s', 'n/cc', 'Kp'],
        source: 'NASA CDAWeb OMNI_HRO2_5MIN (IMF/plasma, bow-shock-shifted) + OMNI2_H0_MRG1HR (Kp). DOI 10.48322/hkaw-ff03.',
        cadenceSec: 300,
        t0: new Date(epochs[0]).toISOString(),
        realDstMin: summary.symhMin,   // measured SYM-H min, for the model-vs-reality ghost
        samples,
    };
    await writeFile(`data/scenarios/${meta.id}.json`, JSON.stringify(out));
    console.log(`  → wrote data/scenarios/${meta.id}.json (${samples.length} samples)`);
    return summary;
}

const STORMS = [
    // Halloween 2003 is the iconic superstorm, but OMNI's bow-shock-shifted
    // IMF/plasma is 0% covered there (ACE/Wind saturated during the event) —
    // a driver-driven replay would be flat defaults. November 2004, the other
    // great storm of that era, has full upstream coverage and a comparable
    // depth, so it stands in while honoring "real driver data only".
    { id: 'november-2004', name: 'November 2004 Superstorm', date: '2004-11-07',
      start: '2004-11-07T00:00:00.000Z', end: '2004-11-10T00:00:00.000Z',
      blurb: 'Successive halo CMEs drove a two-step superstorm (Dst ≈ −373 nT) — the deepest of solar cycle 23 with reliable upstream monitoring.',
      teaches: 'Extreme Pdyn compression AND deep ring-current injection, delivered in two distinct hits.' },
    { id: 'stpatrick-2015', name: "St. Patrick's Day Storm", date: '2015-03-17',
      start: '2015-03-17T00:00:00.000Z', end: '2015-03-19T00:00:00.000Z',
      blurb: 'The largest storm of solar cycle 24 — a classic two-step main phase as the CME sheath then ejecta drove southward Bz.',
      teaches: 'Sheath arrival compresses the dayside minutes before the ejecta Bz drives the storm.' },
    { id: 'gannon-2024', name: 'Gannon Storm (Mother’s Day)', date: '2024-05-10',
      start: '2024-05-10T00:00:00.000Z', end: '2024-05-12T12:00:00.000Z',
      blurb: 'May 2024 — a train of CMEs from AR3664 produced the strongest storm in two decades, with aurora seen at tropical latitudes.',
      teaches: 'Stacked CMEs: repeated compression and sustained southward Bz pile into one deep Dst.' },
    { id: 'jan-2026', name: 'January 2026 Storm', date: '2026-01-18',
      start: '2026-01-18T00:00:00.000Z', end: '2026-01-22T00:00:00.000Z',
      blurb: 'An X1.9 flare launched a fast CME (solar wind past 1200 km/s) that drove a deep storm and an S4 radiation event — the hardest dayside compression in the set, r₀ squeezed inside 6 Rₑ.',
      teaches: 'A fast CME hammers both branches at once: extreme ram-pressure compression and strong southward Bz together, with little delay between them.' },
    // The two-branch-independence exemplar (consultation §1.2): a corotating
    // high-speed stream whose interface compresses r₀ nearly as hard as a
    // superstorm, yet drives only a minor ring current. Chosen because the
    // *model* (not just reality) keeps Dst shallow here — modeled −37 matches
    // the measured SYM-H −37 exactly — so the A/B is honest, not an artifact.
    { id: 'cir-2007-0507', name: 'High-Speed Stream (CIR)', date: '2007-05-07',
      start: '2007-05-07T00:00:00.000Z', end: '2007-05-10T00:00:00.000Z',
      blurb: 'A corotating high-speed stream during deep solar minimum — its dense stream interface compresses the magnetopause nearly as hard as a superstorm, yet only a minor ring current forms.',
      teaches: 'Compression ≠ storm: r₀ slams inward almost as far as in November 2004, but Dst stays a tenth as deep — the Pdyn and Bz branches are independent.' },
];

// HSS / CIR candidates for the "compression without storm" slot — surveyed,
// then the cleanest (high Pdyn / weak southward Bz / shallow SYM-H) is chosen.
const HSS_CANDIDATES = [
    { id: 'hss-2017-0904', name: 'High-Speed Stream', date: '2017-09-04',
      start: '2017-09-04T00:00:00.000Z', end: '2017-09-06T00:00:00.000Z',
      blurb: 'Corotating high-speed stream — a stream-interface pressure pile-up compresses the magnetopause with little sustained southward Bz.',
      teaches: 'Compression WITHOUT a storm: the Pdyn branch lights while the Bz/Dst branch stays dark.' },
    { id: 'hss-2016-0307', name: 'High-Speed Stream', date: '2016-03-07',
      start: '2016-03-07T00:00:00.000Z', end: '2016-03-09T00:00:00.000Z',
      blurb: 'Coronal-hole high-speed stream.', teaches: 'Compression without storm.' },
    { id: 'hss-2019-0509', name: 'High-Speed Stream', date: '2019-05-09',
      start: '2019-05-09T00:00:00.000Z', end: '2019-05-11T00:00:00.000Z',
      blurb: 'Coronal-hole high-speed stream.', teaches: 'Compression without storm.' },
];

const survey = process.argv.includes('--survey');
const which = survey ? [...STORMS, ...HSS_CANDIDATES] : STORMS;
for (const m of which) {
    try { await build(m, { surveyOnly: survey }); }
    catch (e) { console.error(`${m.id}: ${e.message}`); }
}
