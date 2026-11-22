# GEMINI-CODE-REVIEW.md — code review of solve.js (after verification)

Model: gemini-3-flash-preview (substituted — see note). 23 Nov 2026 ~01:20–01:35 WIB.
Reviewed in 4 parts (text/slugify, front matter, Markdown, templates+build).
Prompts saved at /tmp/gemini-code-p-{a,b,c,d}.txt (not in repo).

## Model substitution note

The task specified gemini-3.5-flash-lite. That model returned **HTTP 503 Service
Unavailable on every substantive prompt** (6 attempts over ~10 min, incl. a plain
300-word prose prompt; a trivial "OK" prompt worked once). gemini-3-flash-preview
answered the same probe fine, so the code review ran on it. The spec review
(GEMINI-REVIEW.md) did run on gemini-3.5-flash-lite before the outage.
One more tooling note: `gemini.py` prints only the first 20,000 chars of its JSON
dump, so the four replies were salvaged from the truncated output files
(/tmp/gemini-code-p-{a,b,c,d}-out.json) — the reply text itself survived in full
in each case (the truncation cut into the thoughtSignature, not the text).

## Method caveat

Gemini was sent ONLY solve.js (plus the spec summary), NOT the vendor code — so
several findings are vendor behaviours it did not know. Every finding below was
checked by ichi against vendor/makefun-site/*.js. **Result: 0 verified bugs.**

## Part A — text helpers + slugify: 7 findings, 0 real

- `slugCache` unbounded Map — **rejected as non-issue.** One-shot CLI run; distinct
  strings per build are bounded (hundreds of titles/tags). Same cache pattern the
  build chose deliberately; no leak across runs (process exits).
- `NON_ALNUM_RUN` "strips non-ASCII even after normalisation" — **WRONG.**
  solve.js normalises NFKD + drops `\p{M}` when non-ASCII (lines 44–48), exactly
  like vendor text.js; Cyrillic/CJK then become `-`/gap and the slug is `untitled`
  — identical to the vendor. The adversarial `slug01-unicode` case (é/ü/Cyrillic/
  emoji/combining marks) passes against the baseline.
- `uniqueSlug` O(N²) on collisions — **rejected.** Identical loop to vendor
  text.js; N ≤ sources per directory (≤600) and collisions are rare.
- `longDate` hardcoded slices — **rejected.** Dates reach `longDate` only after
  front-matter validation of strict `YYYY-MM-DD`; identical to vendor.
- `resolvePath` absolute `rel` — **rejected.** `env.link` never calls it for `/…`
  targets (kept as written); identical to vendor.
- `resolvePath` trailing slash in `dir` — **rejected.** `dir` comes from `dirOf`
  (never trailing) or `''`; identical to vendor.
- `resolvePath` returns null above root — **rejected.** Vendor returns null too
  and the caller checks it; identical.

## Part B — front matter: 9 findings, 0 real

- `stringOf` error message "imprecise" — **rejected.** Message is byte-identical
  to vendor frontmatter.js; logic correct.
- `valueOf` errors lack line numbers — **rejected.** Vendor's error strings have
  no line numbers either; identical.
- `key:value` (no space) → "has no value" — **rejected.** Vendor's LINE regex is
  identical (`/^([a-z_]+):(?: (.*))?$/`); same result. Adversarial case covers it.
- `key:  value` (two spaces) keeps a leading space — **rejected.** Vendor identical.
- Bare strings keep leading space — **rejected.** Vendor identical.
- `--- ` (trailing space) → "no front matter" — **rejected.** Vendor identical
  (`lines[0] !== '---'`).
- Closing `--- ` not recognised — **rejected.** Vendor identical (`=== '---'`).
- `TAG` allows spaces — **rejected.** Vendor regex identical (`/^[^"[\]]+$/`).
- `[tag1, ]` trailing comma → empty-tag error — **rejected.** Vendor identical.
- (Also: indented `#` comments are NOT skipped — **rejected**, vendor identical;
  only a `#` at line start is a comment.)
- No ReDoS / hang found — agreed.

## Part C — Markdown: 11 findings, 0 real

- `inlineStr` O(N²) on unclosed delimiters — **noted, not a divergence.** Same
  rescan shape as vendor (`findUnescaped`/`findSingleStar`); generated inputs are
  bounded and the bench shows 2.5× overall. No action.
- `indexOf(')')` ignores escapes in link targets — **rejected.** Vendor does the
  plain `indexOf` too; identical.
- Link target not unescaped before `link()` — **rejected.** Vendor identical.
- `endsParagraph` lacks BULLET/ORDERED/blockquote checks — **rejected.** Vendor's
  `endsParagraph` is BLANK/fence/heading/HR only; a list line after text is
  consumed into the paragraph in BOTH. Adversarial cases cover it.
- Heading trailing `#`s not stripped — **rejected.** Vendor README: "closing `#`s
  are kept as text". Identical.
- HR only exactly three symbols — **rejected.** Vendor regex identical.
- Blockquotes single-paragraph only — **rejected.** Vendor identical.
- Lists no nesting — **rejected.** Vendor identical ("No nesting").
- `CONTINUED` redundant / blocks nested lists — **rejected (style note).**
  Vendor identical.
- `excerpt` is rendered HTML, not plain text — **rejected.** Vendor identical
  (excerpt = first paragraph's inline HTML).
- Blocks ignore leading whitespace — **rejected.** Vendor regexes are anchored
  at line start too. Identical.

## Part D — templates + build: 9 findings, 0 real

- `per_page: 0` → `pages = Infinity` hang — **rejected (copied quirk).**
  Vendor identical; generator does not emit it.
- Standalone tags fail on CRLF — **rejected.** `isBlankSpaces` checks only
  space/tab, exactly like vendor's `/^[ \t]*$/`. Identical behaviour.
- Empty arrays falsy — **rejected.** Vendor `truthy` identical.
- Page tag URL `""` — **rejected.** Vendor identical (documented in spec).
- `parseTemplate` body restoration on nested ifs — **rejected.** solve.js line
  `body = parent.k === 6 ? parent.b : parent.k === 4 ? parent.b : (parent.el ?? parent.th)`
  is the vendor's expression verbatim.
- `lookup` property collision (`page.content.toString`) — **WRONG, Gemini
  misread the code.** solve.js `lookup` DOES check `Object.hasOwn(v, path[k])`
  per segment (lines ~580–586), exactly like the vendor. Verified by reading
  the code.
- `textOf` objects → `""` — **rejected.** Vendor identical.
- `pathOf` rejects bracket notation — **rejected.** Vendor `PATH` regex identical.
- Standalone slice when a tag is preceded by another tag — **rejected.**
  solve.js copies the vendor's slice verbatim, and the slice only runs when
  `standalone` is true (line is all spaces/tabs beside the tag).

## Verdict

**10 Gemini code-review findings across 4 parts, 0 verified as bugs, 0 code
changes.** Every finding was either a faithful copy of vendor behaviour Gemini
did not know, or a misreading of solve.js (notably the `lookup` hasOwn check).
solve.js unchanged by this review (md5 a4fb769fa0ba70883dd6f74f047ae49e).
Practice 3/3 exact and 66/66 adversarial still hold; no re-verification needed
beyond the bench re-run already done (230.5 ms total, 2.55×).
