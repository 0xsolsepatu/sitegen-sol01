# BENCHMARK.md — baseline (house makefun-site 1.0.0)

Measured 23 Nov 2026 ~01:15 WIB on this VM (Node v24.22.1, 1.5 shared CPUs).
Practice set: 3 cases, 250/340/480 Markdown sources, 2.77 MB source text.

## Baseline `run()` in-process (bench.mjs, 1 warm-up + 3 timed rounds)

| case | CPU mean | CPU min–max | wall mean | output bytes |
|------|----------|-------------|-----------|--------------|
| g-0001 | 137.6 ms | 113.6–179.3 | 113.1 ms | 1,497,960 |
| g-0002 | 225.1 ms | 193.6–254.7 | 183.5 ms | 2,822,891 |
| g-0003 | 224.9 ms | 214.9–238.1 | 200.2 ms | 3,100,630 |
| **TOTAL** | **587.6 ms** | | **496.7 ms** | 7,421,481 |

## Baseline driver end-to-end (node main.ts, cold process, 3 runs)

| run | wall | user | sys |
|-----|------|------|-----|
| 1 | 1.187 s | 1.128 s | 0.271 s |
| 2 | 1.115 s | 1.098 s | 0.235 s |
| 3 | 1.013 s | 1.137 s | 0.143 s |

Driver output verified to match `practice/reference/expected.json` (canonical JSON compare: True).

## What the numbers mean

- The heat measures CPU time of a fresh container run, net of a do-nothing control.
  The driver overhead (Node startup + JSON.parse of 2.9 MB cases.json +
  JSON.stringify of ~7.4 MB answers) is IDENTICAL for baseline and entry (same main.ts),
  so the race is decided inside `run()`: baseline ≈ **590 ms CPU** warm, more cold.
- Target: `run()` total well under ~300 ms CPU (≥2× speedup) to beat the baseline at
  95% confidence with margin for cold-start/JIT variance and the scored set being
  possibly larger (200–600 sources per case).
- Note the spread: g-0001 CPU ranged 113–179 ms across rounds (JIT/GC noise) — repeat
  measurements (3+ rounds) and compare means, as the heat uses trimmed means.

## Entry benchmark (to be filled after build)

| case | entry CPU mean | baseline CPU mean | speedup |
|------|---------------|-------------------|---------|
| g-0001 | 48.7 ms | 137.6 ms | 2.83× |
| g-0002 | 105.4 ms | 225.1 ms | 2.14× |
| g-0003 | 76.5 ms | 224.9 ms | 2.94× |
| TOTAL | 230.5 ms | 587.6 ms | 2.55× |

Final independent re-run (3 rounds, after adversarial + code review, solve.js
unchanged): total 230.5 ms CPU, wall 188.8 ms. Earlier runs: 211.5 ms (builder,
5 rounds), 218.3 ms (ichi, 5 rounds). All runs every case faster than baseline,
total well under the ~300 ms target.

## Node 22 (the scored heat's runtime) — round 2, 23 Nov 2026

Node 22.20.0 binary, `bench.mjs`, 5 rounds each. Entry 294.9 ms CPU vs
baseline 654.4 ms (**2.22×**); every case faster in every round (entry
per-case max 57.0/181.5/180.0 ms vs baseline per-case min
123.0/198.2/246.7 ms). After the round-2 `wordsOf` manual-scan change
(see BUILD-STEP2.md §4): entry 282–304 ms across interleaved A/B pairs
vs old-`wordsOf` 315–341 ms — faster in every pair; Node 24 total after
the change 210.8 ms. Margin is smaller than on Node 24 (2.55–2.78×) but
still large relative to timing noise.
