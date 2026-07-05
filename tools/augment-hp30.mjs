// Augment curated scenario JSONs with Hp30 (30-min planetary geomagnetic index).
//
// Hp30 is the GFZ Potsdam Kp-family index at 30-min resolution, open-ended
// above 9 — so the largest storms register their actual intensity instead of
// pegging at Kp = 9. In AEGIS it serves as an *observation ghost* for the
// modelled aurora driver (`bzAurora` → modelled oval), the same role SYM-H
// plays for modelled Dst: the model says what it thinks should be happening,
// Hp30 says what the planet actually felt.
//
// Source: Geomagnetic Observatory Niemegk, GFZ Helmholtz Centre for Geosciences
//   Yamazaki et al. 2024,  DOI 10.5880/Hpo.0003,  CC BY 4.0
//
// This tool does NOT refetch OMNI. It reads each existing scenario JSON,
// looks up the Hp30 bin whose 30-min window contains each 5-min sample mid-time,
// and appends an `hp30` column. Idempotent — safe to rerun.
//
//     node tools/augment-hp30.mjs

import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const FULL_URL  = 'https://kp.gfz.de/fileadmin/files_for_gfz_cms/Hp30_ap30_complete_series.txt';
const CACHE     = 'tools/.hpo-cache.txt';
const CACHE_TTL_MS = 24 * 3600 * 1000;

const SCENARIOS = [
    'cir-2007-0507', 'november-2004', 'stpatrick-2015',
    'gannon-2024',   'jan-2026',
];

async function ensureHpoCache() {
    if (existsSync(CACHE)) {
        const s = await stat(CACHE);
        if (Date.now() - s.mtimeMs < CACHE_TTL_MS) {
            return readFile(CACHE, 'utf8');
        }
    }
    console.log(`[hp30] fetching ${FULL_URL} (~44 MB, once per 24 h) …`);
    const r = await fetch(FULL_URL);
    if (!r.ok) throw new Error(`GFZ HTTP ${r.status}`);
    const text = await r.text();
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, text);
    console.log(`[hp30] cached ${(text.length / 1e6).toFixed(1)} MB → ${CACHE}`);
    return text;
}

// Parse the fixed-width ASCII file into a flat array indexed by 30-min bin.
// Each record: { tStartMs, tMidMs, hp30, ap30 }. Missing data is dropped.
function parseHpo(text) {
    const out = [];
    for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 9) continue;
        const yyyy = parseInt(parts[0], 10);
        const mm   = parseInt(parts[1], 10);
        const dd   = parseInt(parts[2], 10);
        const hhStart = parseFloat(parts[3]);
        const hhMid   = parseFloat(parts[4]);
        const hp30 = parseFloat(parts[7]);
        const ap30 = parseInt(parts[8], 10);
        if (!isFinite(yyyy) || !isFinite(hp30) || hp30 < 0) continue;
        const dayMs = Date.UTC(yyyy, mm - 1, dd);
        out.push({
            tStartMs: dayMs + hhStart * 3600_000,
            tMidMs:   dayMs + hhMid   * 3600_000,
            hp30, ap30,
        });
    }
    out.sort((a, b) => a.tStartMs - b.tStartMs);
    console.log(`[hp30] parsed ${out.length} records (${new Date(out[0].tStartMs).toISOString().slice(0, 10)} … ${new Date(out[out.length - 1].tStartMs).toISOString().slice(0, 10)})`);
    return out;
}

// Binary-search the 30-min bin containing `tMs`. Returns Hp30, or null on miss
// (no record covers the time — would only happen pre-1985 or far future).
function lookupHp30(records, tMs) {
    let lo = 0, hi = records.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = records[mid];
        if (tMs < r.tStartMs) hi = mid - 1;
        else if (tMs >= r.tStartMs + 30 * 60_000) lo = mid + 1;
        else return r.hp30;
    }
    // Fallback: snap to nearest bin within 30 min, else null
    const near = records[Math.max(0, Math.min(records.length - 1, lo))];
    if (near && Math.abs(near.tStartMs - tMs) < 30 * 60_000) return near.hp30;
    return null;
}

const r2 = (v) => Math.round(v * 100) / 100;

async function augment(id, records) {
    const path = `data/scenarios/${id}.json`;
    const sc = JSON.parse(await readFile(path, 'utf8'));
    if (sc.fields.includes('hp30')) {
        // Idempotent — re-augment instead of double-appending.
        const idx = sc.fields.indexOf('hp30');
        for (const row of sc.samples) row.splice(idx, 1);
        sc.fields.splice(idx, 1);
        sc.units.splice(idx, 1);
    }
    const t0   = Date.parse(sc.t0);
    const dtMs = sc.cadenceSec * 1000;
    let hits = 0, misses = 0;
    for (let i = 0; i < sc.samples.length; i++) {
        const tMid = t0 + (i + 0.5) * dtMs;
        const v = lookupHp30(records, tMid);
        if (v === null) { misses++; sc.samples[i].push(-1); }
        else            { hits++;   sc.samples[i].push(r2(v)); }
    }
    sc.fields.push('hp30');
    sc.units.push('Hpo');
    sc.source += ' + GFZ Hp30 (Yamazaki et al. 2024, DOI 10.5880/Hpo.0003, CC BY 4.0).';
    const hpMax = sc.samples.reduce((m, r) => Math.max(m, r[sc.fields.length - 1]), -Infinity);
    sc.realHp30Max = r2(hpMax);
    await writeFile(path, JSON.stringify(sc));
    console.log(`  ${id.padEnd(18)} hp30 hits=${hits} miss=${misses}  max=${hpMax.toFixed(2)}`);
}

const text    = await ensureHpoCache();
const records = parseHpo(text);
console.log('[hp30] augmenting scenarios:');
for (const id of SCENARIOS) {
    try { await augment(id, records); }
    catch (e) { console.error(`  ${id}: ${e.message}`); }
}
