// Fresh-seed fuzz (v2): drives the kit generator with NEW seeds (domain
// 'sitegen-v2-fuzz-seed-N', never used by v1) and compares the entry against the
// baseline vendor build() as canonical JSON. 3 seeds x 3 cases = 9 cases.
// Usage: node tests/fuzz-v2.mjs [seeds] [cases-per-seed]
import { createHash } from 'node:crypto';
import { streamFor } from '../../makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/program/generator/rng.ts';
import { generate } from '../../makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/program/generator/subject/sites.mjs';
import { run as oracleRun } from '../../makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/program/generator/oracle.js';
import { run as entryRun } from '../solve.js';

const canon = (v) => JSON.stringify(v, (k, val) => {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const o = {};
    for (const key of Object.keys(val).sort()) o[key] = val[key];
    return o;
  }
  return val;
});

const nSeeds = Number(process.argv[2] ?? 3);
const nCases = Number(process.argv[3] ?? 3);
let pass = 0;
let fail = 0;
for (let s = 0; s < nSeeds; s++) {
  const seed = createHash('sha256').update(`sitegen-v2-fuzz-seed-${s}`).digest('hex');
  for (let i = 0; i < nCases; i++) {
    const input = generate(streamFor(seed, 'case', i), i);
    let want, got, wantErr = null, gotErr = null;
    try { want = oracleRun(structuredClone(input)); } catch (e) { wantErr = `${e.constructor.name}: ${e.message}`; }
    try { got = entryRun(structuredClone(input)); } catch (e) { gotErr = `${e.constructor.name}: ${e.message}`; }
    const ok = wantErr === null
      ? gotErr === null && canon(got) === canon(want)
      : gotErr === wantErr;
    if (ok) {
      pass++;
      console.log(`PASS seed=${s} case=${i} (${Object.keys(want).length} paths)`);
    } else {
      fail++;
      console.log(`FAIL seed=${s} case=${i}`);
      if (wantErr !== null || gotErr !== null) console.log(`  oracle err: ${wantErr}\n  entry err:  ${gotErr}`);
      else {
        const diffs = [...new Set([...Object.keys(want), ...Object.keys(got)])].filter((k) => canon(want[k]) !== canon(got[k]));
        console.log(`  differing paths (${diffs.length}):`, diffs.slice(0, 5));
        for (const k of diffs.slice(0, 2)) {
          console.log(`  got ${k}:`, JSON.stringify(String(got[k] ?? '')).slice(0, 300));
          console.log(`  exp ${k}:`, JSON.stringify(String(want[k] ?? '')).slice(0, 300));
        }
      }
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
