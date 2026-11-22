// Fresh-case fuzzing for the site-generator-speed entry (round 2).
// Drives the kit's own case generator (program/generator) with NEW seeds
// (never the practice seed) and compares solve.js against the baseline
// vendor build() (the oracle) on every case, byte-for-byte as canonical JSON.
// Usage: node tests/fuzz.mjs [nSeeds] [firstSeed]
//   nSeeds: how many fresh seeds (default 5, 3 cases each = 15 cases)
//   firstSeed: first seed label number (default 1)
// Seeds are sha256("sitegen-fuzz-seed-N") — 64 lowercase hex, as draw.ts wants.
// Node 24 runs the generator's rng.ts (type-stripping); Node 22.20+ too.
import { createHash } from 'node:crypto';
import { streamFor } from '../../makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/program/generator/rng.ts';
import { generate } from '../../makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/program/generator/subject/sites.mjs';
import { run as baseRun } from '../../makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/program/generator/oracle.js';
import { run as solveRun } from '../solve.js';

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const nSeeds = Number(process.argv[2] ?? 5);
const firstSeed = Number(process.argv[3] ?? 1);
let passed = 0;
let failed = 0;
const failures = [];
for (let s = firstSeed; s < firstSeed + nSeeds; s++) {
  const seed = createHash('sha256').update(`sitegen-fuzz-seed-${s}`).digest('hex');
  for (let i = 0; i < 3; i++) {
    const id = `seed${s}-case${i} (band ${i % 3}, ${[200, 334, 467][i % 3]}-${[333, 466, 600][i % 3]} sources)`;
    const input = generate(streamFor(seed, 'case', i), i);
    const expected = baseRun(JSON.parse(JSON.stringify(input)));
    const got = solveRun(JSON.parse(JSON.stringify(input)));
    const ok = canon(got) === canon(expected);
    const nPaths = Object.keys(expected).length;
    const nFiles = input.files.length;
    const nTemplates = Object.keys(input.templates).length;
    if (ok) {
      passed++;
      console.log(`PASS ${id} files=${nFiles} templates=${nTemplates} outPaths=${nPaths}`);
    } else {
      failed++;
      const diffs = [];
      for (const k of new Set([...Object.keys(got), ...Object.keys(expected)])) {
        if (got[k] !== expected[k]) diffs.push(k);
      }
      console.log(`FAIL ${id} files=${nFiles} templates=${nTemplates} outPaths=${nPaths} differing=${diffs.length}: ${diffs.slice(0, 5).join(', ')}`);
      failures.push({ id, diffs, got, expected, input });
      for (const k of diffs.slice(0, 2)) {
        const g = got[k] ?? '<missing>';
        const e = expected[k] ?? '<missing>';
        let at = 0;
        while (at < Math.min(g.length, e.length) && g[at] === e[at]) at++;
        console.log(`  path ${k}: first diff at char ${at}`);
        console.log(`    got: ${JSON.stringify(g.slice(Math.max(0, at - 80), at + 120))}`);
        console.log(`    exp: ${JSON.stringify(e.slice(Math.max(0, at - 80), at + 120))}`);
      }
    }
  }
}
console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exitCode = 1;
