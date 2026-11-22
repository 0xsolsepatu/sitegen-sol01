# BUILD.md — site-generator-speed entry

Built 23 Nov 2026. Deliverables in `~/workspace/makefun-sitegen/`:
`solve.js` (29,687 B, dependency-free ES module, exports `run(input)`),
`main.ts` (1,579 B, verbatim copy of the baseline driver, incl. the
`setFlagsFromString('--no-incremental-marking')` call before importing solve.js).
Total 31,266 B — far under the 4,194,304 B repo limit. No LICENSE file is
included here yet; the submission repo still needs an OSI licence file added
at packaging time.

## What was built

A from-scratch, byte-exact reimplementation of makefun-site 1.0.0's
`build(input)`, following the vendor code (`kit/baselines/makefun-site/vendor/makefun-site/`)
as ground truth wherever it differs from the README, and SPEC-SUMMARY.md /
GEMINI-REVIEW.md (with ichi's corrections) as the quirk list. Every quirk was
copied, not fixed:

- `no title` checked inside `parseFrontMatter`, after all FM line checks,
  reported as `refused <path>: no title`, before dir/date/layout/draft checks.
- Negative `recent` passed straight to `posts.slice(0, recent)` (slice quirk).
- `per_page` used as-is: `Math.max(1, Math.ceil(posts/per))` — a `per_page` of 0
  would loop forever exactly as the baseline does (generator is not expected
  to emit it; noted as a risk, not guarded).
- Slug uniqueness per directory in source order; root reserves `posts`,
  `tags`, `page` from the start.
- Page tags with no matching post-tag get `url: ""` (object still present).
- Standalone `{% %}` line removal with the baseline's exact offset math
  (`lastIndexOf('\n', open-1)`, truncate accumulated text by `open-lineStart`).
- Report sorted in code-unit order; `static files` count = ALL statics,
  including shadowed ones.
- Markdown: fence/heading/hr/blockquote/flat-list/paragraph blocks, inline
  code/strong/em/link/backslash rules with `findUnescaped` /
  `findSingleStar` semantics, link resolution against kept sources + statics,
  broken links reported once each via a Set.

## Optimisations (all measured on the practice set, this VM, Node v24.22.1)

1. **Inline Markdown — fused lex+render, run-buffered escaping.** No token
   objects; blocks render straight into the output string. The inline parser
   works on string ranges (no substring allocation for nested strong/em/link
   content) and buffers plain runs, escaping each run in a single pass
   (`escapeRange`: slice once, regex-test, replace only if a special char is
   present). This removes the baseline's hottest spot: one regex `.replace`
   per character via `escapeHtml(c)`.
2. **`wordsOf` / cards computed once per source.** Baseline called `wordsOf`
   (a full-body `/\S+/g`) twice per page (cards map + `pageOf`); here the card
   is built once, cached on the source object, and `pageOf` spreads it.
   `slugify` is called once per distinct tag name (baseline: twice in
   `ownTags` plus once more in the tag loop).
3. **`slugify` rewritten + cached.** Per distinct string, cached in a
   module-level `Map`. ASCII-only strings skip NFKD + the `\p{M}` strip
   (NFKD is identity on ASCII); the char loop is replaced by one
   `replace(/[^A-Za-z0-9]+/g, '-')`, trim of edge dashes, `toLowerCase()`
   (safe: at that point the string holds only `[A-Za-z0-9-]`, so lowering
   only affects A–Z), slice to 64, drop a trailing `-`, `untitled` if empty.
   Verified equivalent to the baseline char loop, including NFKD cases
   (Kelvin sign, ligatures, combining marks) — see fuzz below.
4. **Front matter parsed by index scanning**, not by splitting the whole
   text: the body is a single `slice` after the closing `---` line, so large
   bodies are never split into a line array for FM purposes.
5. **Template nodes use integer kinds** with a `switch`, and `lookup` walks
   the scope chain with `Object.hasOwn`. Rendering itself stays `out +=`
   (see measurement below).
6. **Cross-case template cache: NOT implemented.** Measured overlap across
   the 3 practice cases: 70 template sources, 68 distinct — only the 183-char
   `meta` template repeats. Caching would save ~nothing and add a leak risk.

## Measured rejections (evidence, not assumption)

- **`+=` vs array-push + `join('')` for template rendering** (7 rounds each):
  `+=` total **222.2 ms** CPU vs array-join **243.4 ms**. `+=` kept, as
  GEMINI-REVIEW.md suspected (V8 cons strings beat join here).
- **`wordsOf` via `RegExp.exec` loop** (avoids the match-array allocation)
  vs `String.match(/\S+/g)`: exec-loop total **244.2 ms** vs `match()`
  **222.2 ms** (7 rounds each). V8's `match` is faster despite the array
  allocation. `match()` kept.
- CPU profile of the final build (3 rounds): remaining time is spread
  across `renderNodes` (~8%), `inlineStr` (~8%), `renderMarkdown` (~7%),
  `wordsOf` + `/\S+/` (~9%), GC ~11% — no single hot spot left worth a
  risky rewrite.

## Verification

- **Practice exact match: 3/3.** `main.ts` run on
  `practice/input/cases.json` (env `MAKEFUN_INPUT_DIR` /
  `MAKEFUN_OUTPUT_DIR`); `answers.json` compared against
  `practice/reference/expected.json` with canonical JSON deep-equal (keys
  sorted) AND per-path string byte-compare — all 3 cases match exactly.
  Independent differential check vs the baseline `build()` in-process:
  3/3 match, same key sets (276 / 350 / 509 output paths).
- **Determinism:** `main.ts` run twice; `answers.json` bytes identical
  (`cmp` clean, 7,446,432 B both runs).
- **Fuzz (extra insurance beyond the practice set):** 600 random synthetic
  sites (random front matter incl. invalid keys/dates/tags/slugs, random
  Markdown lines incl. fences, headings, lists, links, escapes, unicode
  titles, CRLF bodies, random templates incl. broken/standalone/include
  chains, `recent` ∈ {0, 1, 3, −1, −2, 5}, trailing-slash `base_url`) —
  **600/600 match the baseline**, including identical throw behaviour.
- `node --check solve.js` passes.

## Benchmark (`node bench.mjs ./solve.js`, vs BENCHMARK.md baseline)

| case | entry CPU mean | baseline CPU mean | speedup |
|------|---------------|-------------------|---------|
| g-0001 | 37.7 ms | 137.6 ms | 3.65× |
| g-0002 | 85.5 ms | 225.1 ms | 2.63× |
| g-0003 | 88.4 ms | 224.9 ms | 2.54× |
| **TOTAL** | **211.5 ms** | **587.6 ms** | **2.78×** |

Final run: 5 rounds (1 warm-up + 5 timed). Across repeated runs the total
landed at 211–222 ms CPU — every case faster than baseline in every run,
total well under the ~300 ms target. Wall mean 174.8 ms.

## Remaining risks

- **Scored set may be larger** (200–600 sources/case per the spec notes);
  the win is per-byte/per-page, so it should scale, but the absolute margin
  on a max-size set is unmeasured.
- **Node 22 vs Node 24 ICU:** `slugify` relies on `String.normalize('NFKD')`
  and `\p{M}`; the spec notes Node 22 and this VM's Node 24 share ICU
  behaviour, and the fuzz covered NFKD edge cases (Kelvin sign, `ﬀ`,
  combining marks, Greek) — but the scored heat runs Node 22, so a final
  Node 22 sanity run would close this out.
- **`per_page: 0`** hangs exactly like the baseline (copied deliberately);
  if the generator ever emitted it, both entries would time out.
- **Slug cache is unbounded** across `run()` calls in one process, but the
  key space is bounded by distinct titles/tags/headings in the input
  (a few thousand strings on the practice set); negligible memory.
- **Timing variance:** per-case CPU ranged e.g. g-0002 53–117 ms across
  rounds on this shared-CPU VM; the heat's trimmed mean should be kinder,
  but the margin over baseline (~2.6×) is large relative to that noise.
- The entry has **not** been submitted (per instructions: build + verify
  only). Packaging still needs: repo root layout (`solve.js`, `main.ts`,
  OSI `LICENSE`), and a final check that nothing else in the repo pushes
  it over 4 MiB.

## Post-build verification (ichi, 23 Nov 2026 ~01:15–01:35 WIB)

- **Independent re-verification:** main.ts re-run on practice input → 3/3 canonical
  match; bench re-run (5 rounds) → total 218.3 ms CPU (2.69×); determinism:
  two main.ts runs, byte-identical answers.json. main.ts byte-identical to the
  baseline driver (diff clean).
- **Adversarial suite** (`tests/adversarial.mjs`): **66/66 pass, 0 solve.js bugs.**
  65 hand-built cases + shuffle-invariance, each expected answer generated by
  running the baseline vendor `build()` itself. Harness validated by mutation:
  SLUG_MAX 64→63 fails exactly 1 case; 'untitled'→'no-title' fails exactly 2.
  `per_page: 0` deliberately untested (hangs the baseline identically).
  Final bench after adversarial: 230.5 ms total (2.55×), every case faster.
- **Gemini code review** (GEMINI-CODE-REVIEW.md): 4 parts on gemini-3-flash-preview
  (3.5-flash-lite returned HTTP 503 on all substantive prompts at the time).
  10 findings, **0 verified as bugs, 0 code changes** — all were faithful copies
  of vendor behaviour or misreadings (notably the `lookup` hasOwn check, which
  Gemini claimed was missing but is present). solve.js unchanged (md5 a4fb769f…).
- **Gemini spec review** (GEMINI-REVIEW.md): done before the build; 2 corrections
  recorded there (no-title placement; template-parse cost overstated).
