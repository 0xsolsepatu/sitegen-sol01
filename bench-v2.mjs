// Bench harness (fresh, v2): times run() per case (CPU + wall), N rounds, for a given solve.js.
// Usage: node bench-v2.mjs <solve.js path> [rounds]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const solvePath = process.argv[2];
const rounds = Number(process.argv[3] ?? 3);
const cases = JSON.parse(readFileSync('/home/hatch/workspace/makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/practice/input/cases.json', 'utf8'));
const { run } = await import(pathToFileURL(solvePath).href);

const cpu = () => process.cpuUsage();
const cpuMs = (a, b) => ((b.user - a.user) + (b.system - a.system)) / 1000;

// warm-up round (not recorded)
for (const c of cases) run(c.input);

const perCase = cases.map(() => []);
for (let r = 0; r < rounds; r++) {
  for (let k = 0; k < cases.length; k++) {
    const c0 = cpu(); const t0 = performance.now();
    const out = run(cases[k].input);
    const t1 = performance.now(); const c1 = cpu();
    perCase[k].push({ cpu: cpuMs(c0, c1), wall: t1 - t0, bytes: JSON.stringify(out).length });
  }
}
let totalCpu = 0, totalWall = 0;
for (let k = 0; k < cases.length; k++) {
  const rows = perCase[k];
  const cpus = rows.map((x) => x.cpu); const walls = rows.map((x) => x.wall);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const min = Math.min(...cpus), max = Math.max(...cpus);
  totalCpu += mean(cpus); totalWall += mean(walls);
  console.log(`${cases[k].id}: cpu mean ${mean(cpus).toFixed(1)} ms (min ${min.toFixed(1)}, max ${max.toFixed(1)}) wall mean ${mean(walls).toFixed(1)} ms, outBytes ${rows[0].bytes}`);
}
console.log(`TOTAL cpu mean ${totalCpu.toFixed(1)} ms, wall mean ${totalWall.toFixed(1)} ms`);
