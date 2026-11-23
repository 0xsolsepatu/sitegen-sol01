# Optimisation probe — sitegen v2 (23 Nov 2026, after submission)

Submitted entry ("Prime Delta", 23 Nov 12:29 WIB) vs probed version.
Starting point (pristine, md5 `df6d6b82f94eba06fb8a556a24eefc46`, 32,754 B).
Final file: md5 `762438dc25028ace25b3c871365692bd`, 33,654 B (+900 B).
`main.ts` untouched (md5 `553ce98be187b36d4a07a2e06975ebfc`).
Node 22 binary re-downloaded to `/tmp/node-v22.20.0-linux-x64/bin/node` (was gone).

## Step 1 — re-verification (unchanged solve.js)
- Practice via `main.ts`: Node 24 **3/3 exact**, Node 22 **3/3 exact**
  (expected.json is `{cases:[{id, output}]}` — a bare-array comparison reads 0/3, that was a harness mistake, not an entry failure).
- `tests/adversarial-v2.mjs`: **115/115**; `tests/fuzz-v2.mjs`: **9/9**.
- Baseline re-measured (bench-v2, 3 rounds, CPU mean): Node 24 entry 255.9 ms vs baseline 631.5 ms (2.47x);
  Node 22 entry 352.8 ms vs baseline 674.2 ms (1.91x).

## Step 2 — profile (Node 24, --cpu-prof, 3 rounds x 3 cases, 649 samples)
- renderNodes 13.7%, inlineRange 10.2%, GC 9.7%, wordsOf 8.6%, renderMarkdown 8.5%,
  escapeHtml 4.0%, escapeRange 3.9%, RegExp `[&<>"']` 2.9%, lookup 2.5%.
- Phase timing (instrumented copy, 9 runs): markdown 47.4%, layouts 37.6%,
  frontMatter 8.5%, tags 4.2%, readSources 1.3%, permalinks 0.7%, rest <1%.
- Top 3 hot spots: (1) Markdown rendering — renderMarkdown + inlineRange + escaping (~47% of phase time);
  (2) Layouts — renderNodes + wordsOf via cardOf (~38%); (3) frontMatter (~8.5%).

## Measurement warning
This VM (1.5 shared CPUs) is extremely noisy: single-case CPU reps swing 45–210 ms,
medians move ±15% between runs. Three harnesses were used:
- `bench-v2.mjs` (3 rounds, mean) — original harness.
- `bench-ab.mjs` (alternating entry/baseline, median) — later found BIASED against the
  lower-allocation solver: both solvers share one heap, the entry runs right after the
  baseline's garbage, so GC CPU lands in the entry's window. Do not trust its medians alone.
- `alt-min.mjs` (gc() before every rep, 40 reps, min/p10/median) — cleanest for run() CPU.
- Whole-process `main.ts` CPU (bash `time`, user+sys, 10 runs) — the actual grading path;
  includes ~640 ms constant driver overhead (JSON parse/stringify/startup), so the
  absolute ms difference is the signal, not the relative %.

## Attempts
| # | change | result | verdict |
|---|--------|--------|---------|
| O1 | First-char guards in renderMarkdown/endsParagraph (skip regex exec when 1st char can't match) | A/B 7r medians: N24 184.9 vs pristine 184.6 (flat); N22 286.9 vs 267.3 (~7% slower) | REVERTED |
| O2 | wordsOf: inline ASCII fast path (space / 9–13 checked inline; isWs only for c≥128) | Micro-bench on all 1,070 bodies (2.77M chars): N24 16.3 vs 21.7 ms/pass; N22 18.8 vs 21.3 ms/pass. Regex `match(/\S+/g)` (27–30 ms) and split (30–36 ms) both slower. End-to-end: N24 11r A/B 166.2 vs pristine 179.9 (-7.6%); N22 257.0 vs 251.1 (+2.3%, within noise) | KEPT (marginal ~1% end-to-end, micro-verified faster on both engines) |
| O3 | renderNodes `for`: reuse one vars/loop/scope object per for-node invocation, mutate per iteration (was 2 fresh objects per item). Safe: rendering is synchronous; a re-entered for via include gets its own objects per invocation | Isolated A/B (O2+O3 vs O2-only): N22 g-0002 30 reps med 117.4 vs 132.9 (-12%); N24 g-0002 72.5 vs 97.2 (-25%), g-0003 97.7 vs 89.8 (+9%, noisy). Whole-process and alt-min totals support a net gain | KEPT |
| O4 | escapeHtml/escapeRange: regex test + manual build on hit instead of regex replace + callback. Micro-bench (81k strings, 7.8M chars): hybrid 51–61 ms vs regex 73–95 ms on both engines | End-to-end (gc/rep, 50 reps): N24 g-0002 -6% min, g-0003 +14% min; N22 g-0002 +2.5% min, g-0003 +14% min. Faster in isolation, NOT faster end-to-end on N22 | REVERTED |
| O5 | readSources: `includes('\r')` guard before the `/\r\n?/g` replace (51 of ~1,091 files contain CR; the rest skip the regex) | Measured jointly with O6 (effect alone is ~1 ms/run, below the noise floor); semantically identical | KEPT (joint with O6) |
| O6 | inlineRange/findUnescaped/findSingleStar: charCodeAt + Uint8Array escapable table instead of `s[i]` string indexing and `Set.has` | Joint O5+O6 vs O2+O3 (gc/rep, 40 reps, min/p10/med): faster-or-flat in 11 of 12 cells; worst cell g-0002 N24 min +1.7% | KEPT |

## Final comparison: current (O2+O3+O5+O6) vs pristine
- alt-min, gc/rep, 40 reps, sum of per-case mins: N24 139.0 vs 146.6 ms (**-5.2%**); N22 203.9 vs 238.3 ms (**-14.4%**).
  Sum of p10: N24 -7.1%, N22 -11.1%.
- Whole-process main.ts CPU, 10 runs: N22 median 0.848 s vs 0.891 s (-43 ms), mean -47 ms;
  N24 median 0.937 s vs 0.955 s (-18 ms), mean -38 ms. Driver overhead ~640 ms is constant,
  so the absolute deltas are run() savings: N22 ≈ -17%, N24 ≈ -6% of run() time. Consistent with alt-min.
- bench-v2 (3 rounds, mean), current vs baseline: N24 **222.5 vs 635.7 ms = 2.86x** (was 2.47x);
  N22 **263.1 vs 663.2 ms = 2.52x** (was 1.91x).
- Correctness after every kept change: practice 3/3 exact (both engines via main.ts),
  adversarial 115/115, fuzz 9/9. Nothing submitted or pushed.

## Recommendation
**Yes, resubmit.** The gain on the grading engine (Node 22 — the harness runs node22) is
~14–17% of run() time, above the 10% bar; Node 24 is also faster (~5–6%). The changes are
general (word counting, for-loop allocation, CR fast path, charCode inline parsing), not
practice-specific, and all correctness suites still pass. Caveat: per-case noise on this VM
is ±10–15%, so the true Node 22 gain is best stated as ~10–17%, not a point figure.
