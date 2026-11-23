# Benchmark — v2 entry vs baseline (practice cases, CPU ms, this VM)

Method: `bench-v2.mjs` (fresh in this session) — loads a solver once, runs the 3
practice cases per round, takes `process.cpuUsage()` around each case, reports the
mean per case over N rounds. Output byte counts checked identical to the baseline
on every run (same answers.json content).

## Node 24.22.1 — 5 rounds (final numbers)

| case | entry cpu | baseline cpu | speedup |
|------|-----------|--------------|---------|
| g-0001 (276 paths) | 60.6 ms | 158.9 ms | 2.62x |
| g-0002 (350 paths) | 89.1 ms | 258.5 ms | 2.90x |
| g-0003 (509 paths) | 101.3 ms | 267.9 ms | 2.64x |
| **TOTAL** | **251.1 ms** | **685.3 ms** | **2.73x** |

Earlier 5-round run on the same machine: entry 260.5 ms vs baseline 630.7 ms
(2.42x). Per-round values swing widely on this shared-CPU VM (g-0001 entry
30–118 ms across rounds), so treat the totals as ~2.4–2.7x, not a precise figure.
The entry is faster than the baseline on every case in every round measured.

## Node 22.20.0 — 3 rounds (binary re-downloaded to /tmp/node-v22.20.0-linux-x64/)

| case | entry cpu | baseline cpu | speedup |
|------|-----------|--------------|---------|
| g-0001 | 54.6 ms | 161.2 ms | 2.95x |
| g-0002 | 142.6 ms | 249.7 ms | 1.75x |
| g-0003 | 108.0 ms | 270.0 ms | 2.50x |
| **TOTAL** | **305.3 ms** | **680.9 ms** | **2.23x** |

Node 22 is slower than Node 24 for the entry on g-0002 (142.6 vs 89.1 ms);
the baseline is the same speed on both engines (~681–685 ms). The entry still
beats the baseline on every case on both engines — no case is slower than
baseline anywhere.

## CPU profile (Node 24, 3 practice rounds, --cpu-prof)

- renderNodes 14.1%, garbage collector 11.7%, renderMarkdown 8.8%,
  inlineRange 8.7%, wordsOf 7.9%, escapeHtml 7.0%, escapeRange 4.3%,
  RegExp `^[ \t]+|[ \t]+$` 3.7%, RegExp `[&<>"']` 2.5%.
- No single dominant hotspot; the cost is spread across rendering.
- Two micro-optimisations applied from this profile (both verified not to
  change output, practice still 3/3 exact after each):
  - `escapeHtml`: test-first (`/[&<>"']/.test` then replace only on a hit) —
    most strings hold no escapable character.
  - `trimLine`: manual charCode trim instead of `/^[ \t]+|[ \t]+$/g`.
  - Measured effect: 269.5 ms -> 260.5 ms total (5 rounds, Node 24) — small,
    within noise, but not worse; kept because both are strictly cheaper in
    principle.

## Notes
- `per_page: 0` hangs exactly like the baseline (copied deliberately, per SPEC).
- Entry solve.js: 32,754 B, md5 df6d6b82f94eba06fb8a556a24eefc46.
- Baseline for comparison: kit `baselines/makefun-site/solve.js` (vendor
  makefun-site 1.0.0, unmodified).
