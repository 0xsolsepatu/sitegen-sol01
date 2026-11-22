# BUILD-STEP2.md — adversarial review round 2 (23 Nov 2026 ~02:00 WIB)

Review round 2 of the site-generator-speed entry. Nothing submitted.
solve.js before this round: md5 a4fb769f…, 29,687 B. After: md5
300a3f0500a84000879151aaa1daf1ae, 30,437 B (one optimisation, see §4).

## 1. Fresh-case fuzzing with the kit's own generator

New harness `tests/fuzz.mjs`: drives `program/generator` directly —
`streamFor(seed, 'case', i)` from `rng.ts` + `generate()` from
`subject/sites.mjs` — with NEW seeds (sha256 of `sitegen-fuzz-seed-N`,
never the practice seed), 3 cases per seed (index 0/1/2 = all three size
bands: 200–333 / 334–466 / 467–600 sources). Each case's expected answer
is the baseline vendor `build()` (via `program/generator/oracle.js`);
solve.js must match as canonical JSON, every output path.

- Seeds 1–5: **15/15 pass** (205–603 files, 14–30 templates, 227–604
  output paths per case).
- Seeds 6–10: **15/15 pass** (same ranges).
- **Total: 30/30 fresh cases, 0 mismatches, 0 solve.js bugs found.**

The generator's own edge coverage is exercised by these cases: ~10%
drafts, ~5% refused front matter (unknown key, duplicate key, bad dates,
missing title, bad tag lists, unclosed quotes, post with no date, unknown
layout), ~5% non-ASCII titles, ~5% respelled titles (slug collisions),
CRLF bodies, links to pages/drafts/refusals/missing files, raw HTML,
indented code, setext underlines, underscores, closing hashes.

No fallback hand-built cases were needed — the generator drove directly
on the first try (Node 24 runs the generator's `rng.ts` via type
stripping). `tests/adversarial.mjs` (66 cases) was NOT extended: the
generator's 30 fresh cases cover strictly more ground than 20 more
hand-built ones would have.

## 2. Gemini code review round 2 (with vendor code)

Full record in GEMINI-CODE-REVIEW-2.md. Two calls, gemini-3.5-flash-lite
(one 503 on the first part-B attempt, retry succeeded; no fallback model
needed this time):

- Part A (text/slugify/front matter + vendor text.js/frontmatter.js):
  4 findings — 2 WRONG (slugify trailing-hyphen cut: hyphens can never
  be adjacent after the run-collapse, so one removal suffices; unclosed
  front matter: solve.js returns the error before computing the body,
  Gemini misread the early return), 1 OK-group, 1 suggestion (slug-cache
  size limit — noted, not applied; cache is bounded by the input).
- Part B (Markdown/templates/build + vendor markdown.js/template.js/
  index.js): first reply was a bare "1. OK / 2. OK" (7 tokens — too terse
  to trust), re-run with forced per-function verdicts: all 11 functions
  OK. Gemini named no slow spot.
- My own spot-check of the riskiest vendor-vs-solve.js seams (fence/
  heading/HR/blockquote/list rules, inline delimiter bounds, backslash
  escape, standalone-tag slice, parseTemplate body restoration, lookup
  chain, for-loop `loop`, include depth, pipeline check order): no
  divergences found.

**Round 2 verdict: 0 verified bugs, 0 code changes from the review.**

## 3. Speed under Node 22 + profile

Node 22.20.0 binary at /tmp/node-v22.20.0-linux-x64/bin/node (downloaded
in round 1). `bench.mjs`, 5 rounds each, before the §4 change:

| | entry CPU | baseline CPU | speedup |
|---|---|---|---|
| g-0001 | 53.9 ms | 152.7 ms | 2.83× |
| g-0002 | 120.6 ms | 233.8 ms | 1.94× |
| g-0003 | 120.4 ms | 268.0 ms | 2.23× |
| TOTAL | 294.9 ms | 654.4 ms | 2.22× |

Every case faster in every round (entry per-case max 57.0/181.5/180.0 ms
vs baseline per-case min 123.0/198.2/246.7 ms). Speedup holds under Node
22, though the margin is smaller than on Node 24 (2.55–2.78×) — Node 22
is slower for both, and g-0002/g-0003 show GC-spike rounds (max ~181 ms).

CPU profile (`--cpu-prof`, Node 22, 3 rounds): no single hot spot.
Entry-side: GC 10.7%, renderNodes 8.0%, inlineStr 7.8%, renderMarkdown
6.0%, wordsOf ~9.7% (function 6.0% + `/\S+/` regex 3.7%),
escapeRange 3.7%, escapeHtmlStr 2.7%, lookup 2.3%. (24.3% of samples
are the bench harness's own per-case `JSON.stringify`, not entry code.)

## 4. One speed change: manual wordsOf scan

wordsOf was the biggest single identifiable cost (~10%). Replaced
`text.match(/\S+/g)` with a manual charCode scan using the exact JS
`\s` set (space, \t\n\v\f\r, U+00A0, U+1680, U+2000–U+200A, U+2028,
U+2029, U+202F, U+205F, U+3000, U+FEFF) — astral code units are never
whitespace, so `charCodeAt` is exact.

- Isolated micro-benchmark (all 1070 practice bodies, 2.77 MB, 5 rounds):
  scan 19–21 ms/pass vs match 28–33 ms/pass, exact agreement on every
  body plus tricky strings (NBSP, U+2003, U+2028, U+FEFF, lone
  surrogates/emoji, combining marks, `\v`/`\f`).
- A/B on Node 22 (bench.mjs, 3 rounds each, interleaved pairs):
  OLD (match) 315.0 / 341.2 / 318.5 ms vs NEW (scan) 295.4 / 282.4 /
  304.0 ms — NEW faster in every pair (mean 293.9 vs 324.9 ms, ~10%).
- Re-verified after the change: practice 3/3 exact on Node 24 AND Node
  22, adversarial 66/66, fuzz 30/30 (seeds 1–10 re-run). Node 24 bench
  after change: 210.8 ms total.

Kept: the change is faster in every paired round and still exact.
Rejected without trying: reusing scope objects across loop iterations
in renderNodes (would save allocation/GC but risks `loop` state leaking
between iterations — not worth it at 8% share); array-join instead of
`+=` for templates (already measured slower in round 1).

## Final verification (after all round-2 changes)

- Practice: **3/3 exact** (Node 24 and Node 22.20.0).
- Adversarial: **66/66** (`tests/adversarial.mjs`).
- Fresh fuzz: **30/30** (`tests/fuzz.mjs 5 1` + `tests/fuzz.mjs 5 6`).
- Node 22 speedup: **~2.2×** vs baseline (entry ~294 ms vs ~654 ms
  CPU, 5 rounds); Node 24: ~2.9× (entry ~211 ms vs ~644 ms).
- solve.js: 30,437 B, dependency-free ES module, `node --check` clean
  (implicit in the runs above).

## Submit-readiness: YES

No bugs found in round 2; the one change is a measured ~10% speedup
with full re-verification. Remaining known risks (unchanged from round
1): `per_page: 0` hangs exactly like the baseline (copied deliberately);
scored cases may be up to 600 sources (largest fuzz band already covers
this); timing noise on shared CPUs (margin ~2.2× on Node 22 is large
relative to it). Packaging note from round 1 still stands: the
submission repo needs LICENSE + README (already prepared in the work
dir) and GitHub About.
