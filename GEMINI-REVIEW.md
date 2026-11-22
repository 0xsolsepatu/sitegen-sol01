# GEMINI-REVIEW.md — spec review (before build)

Model: gemini-3.5-flash-lite, via `gemini.py ask`, 23 Nov 2026 ~01:10 WIB.
Prompt: SPEC-SUMMARY.md + request for (1) ranked speed wins, (2) top byte-exactness traps.
Full prompt saved at `gemini-spec-prompt.txt`.

## What Gemini said

### Speed ranking (Gemini)
1. Inline parser per-char `escapeHtml` regex — SAFE, "massive". Fix: buffer text runs, batch-escape.
2. Pre-compiled templates — SAFE, "very high". Parse once, reuse render function.
3. Template `out +=` + scope allocation — SAFE, "high". Use array push + join; reuse/flatten scopes.
4. Redundant `wordsOf`/`cardOf`, `slugify` twice per tag — SAFE, "medium-high". Compute once, cache.
5. Markdown lexer + `findUnescaped`/`findSingleStar` rescans — SAFE, "medium". Single-pass scanner.
6. Hoist regexes to module scope — "low-medium".

### Byte-exactness traps (Gemini, top 10)
1. Standalone `{% %}` line removal (offset math via lastIndexOf/indexOf).
2. Negative `recent` slice quirk — copy, don't clamp.
3. Slug uniqueness per-directory, in source order; root reserves posts/tags/page.
4. Page tag URL `""` where no post has the tag.
5. Front-matter check order: FM errors → dir → post-date → layout → draft → (no-title).
6. Inline delimiters: code-span content only escaped, never inline-parsed; backslashes in code spans not processed.
7. List continuation locked to the same marker-regex family.
8. `textOf` fallback: arrays joined `, ` recursively; objects/undefined/null → `""`.
9. `per_page: 0` → `pages = Infinity` — copy, don't guard.
10. Report sorted code-unit order; static count = ALL statics incl. shadowed.

## Verification against the vendor code (ichi's corrections)

- **Trap 5 — Gemini is WRONG on the no-title reason and its place.** There is no
  6th check and no `key "title": no title`. `no title` is checked INSIDE `parseFrontMatter`
  (after all FM line checks, before returning), so the report line is
  `refused <path>: no title` and it fires as part of step 1 (FM errors), BEFORE the
  dir/date/layout/draft checks. Order is: (a) all FM errors incl. `no title`, (b) dir,
  (c) post-date, (d) layout, (e) draft. Gemini's 1–5 order is otherwise right.
- **Speed #2 — overstated.** The baseline parses each template ONCE per case (per build),
  not once per page. The parse cost is 21–27 templates × 3 cases. Caching across cases
  only helps if template sources repeat across cases (to be measured); the per-case parse
  is a small share of total time. The bigger template cost is per-page RENDERING
  (250–480 pages × loops over tags/recent/posts), which Gemini's #3 addresses.
- **Speed #3 — partially questionable.** V8 optimises `+=` string concat with cons
  strings; array-push + `join('')` is not reliably faster in Node 22 and can be slower
  for many small appends. Must measure both; do not assume.
- **Speed #6 — mostly already done.** The vendor's regexes are already module-level
  constants (`BLANK`, `FENCE_OPEN`, … in markdown.js; `PATH`, `FOR`, … in template.js;
  `LINE`, `DATE`, … in frontmatter.js). Only `slugify`'s `/\p{M}/gu` and `/ -+$/` and the
  inline `/\s/` test are created per call — minor.
- **Speed #1, #4, #5 — agreed.** Per-char `escapeHtml(c)` is the single hottest spot
  (one regex `.replace` per character of every body line); `wordsOf` is run twice per
  page (cards map + `pageOf`); `slugify` is run twice per tag name (`ownTags` + the
  `slugify(name)` in the loop) plus per title/heading.
- **Trap 9 — noted, low risk.** `per_page: 0` with posts>0 → `pages = Infinity` → the
  index loop never ends in the baseline too. The generator is not expected to emit
  `per_page: 0`; copy the code as-is (do not guard), matching the baseline exactly.
- Traps 1, 2, 3, 4, 6, 7, 8, 10 — **verified correct** against index.js / lib/*.js.

## Consequences for the build

- Optimise in this order: (1) inline parser with run-buffered escaping + single-pass
  delimiter scan; (2) compute `wordsOf`/cards/slugs once per page/post and cache
  `slugify` results per distinct string; (3) template render with minimal allocation
  (measure `+=` vs array-join); (4) cache parsed templates across cases keyed by
  template source ONLY if overlap is measured; (5) streaming Markdown renderer that
  avoids token-object allocation (lex + render fused), keeping every edge rule.
- Do not "fix" any quirk: negative `recent`, `per_page` edge, `no title` inside FM,
  tag URL `""`, standalone-tag offset math, per-directory slug sets.
