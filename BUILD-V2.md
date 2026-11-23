# Build v2 — site-generator-speed entry (fresh rebuild, in-window session)

Competition: `site-generator-speed-01-run-20261122`, $100, 10 places @ $10.
Opened 2026-11-22T20:00:00Z (= 23 Nov 03:00 WIB); deadline Tue 24 Nov 2026
21:00 WIB. Reward only if the entry beats the house baseline at 95%
confidence. This rebuild was done in a session that started AFTER the opening
(the v1 build predated it, so its transcripts could not be entered).

## What was built

- `solve.js` — 32,754 B, dependency-free ES module, exports `run(input)`,
  byte-exact vs makefun-site 1.0.0. Written FRESH in this session from
  RULES.txt, the vendor lib files, and the v1 design docs. The old
  `archive-v1/solve-v1.js` was never opened, read, copied, imported, run, or
  tested (hard rule, honoured throughout).
- `main.ts` — the kit's verbatim baseline driver, unchanged
  (byte-identical to `baselines/makefun-site/main.ts`, verified by cmp).
- `REBUILD-NOTES.md` — design points followed vs v1 (written first, before
  the build).
- `bench-v2.mjs` — fresh benchmark harness (CPU ms per case, N rounds).
- `tests/adversarial-v2.mjs` — 115 hand-built cases, expected answers from
  the baseline vendor `build()` itself.
- `tests/fuzz-v2.mjs` — fresh-seed fuzz (seeds `sitegen-v2-fuzz-seed-N`,
  never used by v1), 3 seeds x 3 cases.
- `BENCHMARK-V2.md`, `GEMINI-CODE-REVIEW-V2.md`, this file.

## Optimisation techniques (from the v1 design docs, re-implemented fresh)

Fused lex+render Markdown (no intermediate block arrays); run-buffered
escaping in inline parsing (flush plain runs once, escape only on a hit);
cached slugify; `wordsOf` as a manual charCode scan (not `match(/\S+/g)`);
templates compiled once per case; `+=` string building; index-scan front
matter (no full `split`); two-phase FM scan (close line first, then line
checks — this matches the vendor's error precedence); `escapeHtml` test-first;
manual `trimLine`.

## Verification (all run in this session, numbers re-measured, not trusted from v1)

| check | result |
|---|---|
| Practice (3 cases, per-case output vs `practice/reference/expected.json`) | **3/3 exact** (276 / 350 / 509 paths) |
| Determinism (main.ts twice, cmp answers.json) | **byte-identical** (7,446,432 B) |
| Adversarial suite `tests/adversarial-v2.mjs` | **115/115 pass** |
| Fresh-seed fuzz `tests/fuzz-v2.mjs` (3 seeds x 3) | **9/9 pass** (255–535 paths each) |
| Benchmark Node 24.22.1 (5 rounds) | entry 251.1 ms vs baseline 685.3 ms CPU — **2.73x** |
| Benchmark Node 22.20.0 (3 rounds) | entry 305.3 ms vs baseline 680.9 ms CPU — **2.23x** |
| Gemini code review (gemini-3.5-flash-lite) | 6 findings, **0 verified** (2 claimed bugs refuted by direct tests, 3 slowness claims refuted by profile/measurement) |

## Bugs found and fixed during the rebuild

1. **Template stack bug (first run):** for/if nodes were pushed with field `k`
   (numeric) but the stack checks read `top.kind`, so every template failed
   with "an endif with no open if" / "an else outside an if". Fixed by giving
   for/if nodes a `kind` field too. Practice went from 8 paths to 3/3 exact.
2. **Front-matter error precedence (adversarial suite):** the first version
   interleaved the close-line search with FM line checks, so an unclosed
   block with a bad line reported the line error instead of "the front matter
   is not closed". Rewrote `parseFrontMatter` as a two-phase scan (find the
   closing `---` first, then process FM lines) — exactly the vendor's order.
   `fm-unclosed` then passed; suite went 111/112 -> 112/112, then 115/115
   after the Gemini-driven extra cases (slugify dashes/truncation, malformed
   links).
3. **Mini-test false alarm (not a code bug):** the first mini-test input had
   no `date` on a post, so "a post needs a date" was correct behaviour.

## Deliberate quirks copied from the vendor (verified by the oracle)

- `per_page: 0` hangs exactly like the baseline.
- `recent` negative is passed to `slice(0, recent)`.
- `static files` count in the report counts ALL statics, kept or shadowed.
- Slug uniqueness is per directory in source order; root reserves
  `posts`/`tags`/`page`.
- Link resolution is against kept sources + statics; broken links reported
  once each, in first-seen order.
- Reading time counts words with `wordsOf`; minutes = ceil(words / 200).

## Not submitted

Build + verify only, per the task. The parent handles the repo push (repo
https://github.com/0xsolsepatu/sitegen-sol01 already exists with the v1 push;
the v2 solve.js differs and must be pushed), the transcript bundle, and the
submit — with the explicit keypair
`~/.makefun/keypairs/https_make.fun.json` (the mend lesson: the CLI's default
keypair does not verify).

## Entry state: SUBMIT-READY

Practice 3/3 exact, determinism confirmed, adversarial 115/115, fuzz 9/9,
faster than baseline on every case on both Node 24 and Node 22, Gemini
review clean (0 verified findings). Nothing known blocks submission.
