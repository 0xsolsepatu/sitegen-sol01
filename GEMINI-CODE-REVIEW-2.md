# GEMINI-CODE-REVIEW-2.md — code review of solve.js, round 2 (WITH vendor code)

Model: gemini-3.5-flash-lite, via `gemini.py ask`, 23 Nov 2026 ~02:00 WIB.
Difference from round 1: Gemini was sent solve.js TOGETHER WITH the vendor
reference code this time (lib/text.js, lib/frontmatter.js, lib/markdown.js,
lib/template.js, index.js), in two calls. Prompts saved at
/tmp/gemini-r2-prompt-a.txt, /tmp/gemini-r2-prompt-b.txt,
/tmp/gemini-r2-prompt-b2.txt; raw replies at /tmp/gemini-r2-a-out.json,
/tmp/gemini-r2-b-out.json, /tmp/gemini-r2-b2-out.json.
Tooling: `gemini.py` prints only the first 20,000 chars of its JSON dump;
both replies were short enough to survive in full (part A: ~1.1 KB text,
part B: 11 chars then 54 tokens on re-run).

## Part A — text helpers, slugify, front matter: 4 findings, 0 verified bugs

1. **OK** for `escapeHtmlStr`, `escapeRange`, `uniqueSlug`, `longDate`,
   `wordsOf`, `resolvePath`, `stringOf`, `valueOf`.
2. **`slugify` trailing hyphens at the 64-char cut — WRONG, rejected.**
   Gemini claimed solve.js cuts at SLUG_MAX before trimming trailing
   hyphens and could leave several. Vendor text.js does
   `out.slice(0, SLUG_MAX).replace(/-+$/, '')`. But solve.js first collapses
   every run of non-`[A-Za-z0-9]` into exactly ONE `-`
   (`NON_ALNUM_RUN = /[^A-Za-z0-9]+/g`), so hyphens are never adjacent in
   `out` — a cut can leave at most ONE trailing `-`, and solve.js removes
   exactly that one (`if (out.endsWith('-')) out = out.slice(0, -1)`).
   Verified by reading vendor text.js and by the fuzz: unicode titles and
   64-char cuts are exercised by the generator (30/30 fresh cases pass).
3. **`parseFrontMatter` unclosed front matter — WRONG, rejected.**
   Gemini claimed solve.js returns the whole text as body when `closeNL`
   is -1. It misread the code: `if (closeStart === -1) return { error:
   'the front matter is not closed' }` returns BEFORE the body is ever
   computed, exactly like the vendor (`if (close === -1) return { error:
   ... }`). The `closeNL === -1 ? '' : ...` branch only fires when the
   closing `---` is the last line with no trailing newline — body `''`,
   identical to the vendor's `lines.slice(close + 1).join('\n')`.
4. **Slug-cache size limit / ASCII lookup array for slugify — noted, not
   applied.** A suggestion, not a bug. The cache is bounded by the distinct
   strings in the input (hundreds per case); the regex path was already
   fast (slugify is 0.7% of profile time). No change.

## Part B — Markdown, templates, build pipeline: all OK

First call returned a bare `1. OK / 2. OK` (7 output tokens) — too terse to
trust as evidence, so it was re-run with a forced per-function verdict
format (prompt-b2). Second call, all 11 functions:

`findUnescaped: OK`, `findSingleStar: OK`, `inlineStr: OK`,
`renderMarkdown: OK`, `tokenize: OK`, `parseTemplate: OK`, `lookup: OK`,
`textOf: OK`, `truthy: OK`, `renderNodes: OK`, `run: OK`.

Gemini named no slow spot in part B despite being asked (question 2
unanswered in both calls).

## Model availability note

gemini-3.5-flash-lite returned HTTP 503 on the first part-B attempt (same
outage pattern as round 1); a retry 20 s later succeeded, so no fallback
model was needed this time. Part A succeeded on the first attempt.

## Independent spot-check (mine, against vendor markdown.js + template.js)

Gemini's part-B verdicts are 54 tokens for 17k tokens of code, so I checked
the riskiest spots myself, line by line:

- Fence/heading/HR/blockquote/list block rules and `endsParagraph`:
  solve.js's `startsWith('```')` guard and `(line[0]==='-'||'*')` guard are
  redundant but equivalent — the vendor regexes are anchored the same way.
- Backtick/strong/em/link inline rules: solve.js bounds every search by
  the range end `b`, which is exactly the vendor's slice end; `s[i+1]`
  past the range is guarded (`i+1 < b`) where the vendor reads
  `undefined`. Equivalent on every edge (empty code span `` `` ``,
  unclosed delimiters, link target with spaces/escapes).
- Backslash escape: vendor `escapeHtml(s[i+1])` vs solve.js
  `n === '>' ? '&gt;' : n` — only `>` is in the escape table, so identical.
- Template tokenize standalone-tag slice, parseTemplate body restoration
  after end tags, lookup hasOwn chain, for-loop `loop` object, include
  depth: all verbatim copies of the vendor's expressions.
- `run()` pipeline (front-matter check order, slug uniqueness per
  directory, tag ordering, pager math, shadowed statics, report sort and
  counts): verified identical against vendor index.js.

## Verdict

**Round-2 Gemini findings: 4 in part A (2 wrong, 1 OK-group, 1 suggestion),
11 OK verdicts in part B — 0 verified bugs, 0 code changes from the review.**
The review's value this round is mostly negative evidence: combined with
the differential testing (30/30 fresh generator cases, 66/66 adversarial,
600-case builder fuzz, 3/3 practice), no divergence was found anywhere.
solve.js md5 was a4fb769f… before this review; the only later change is the
wordsOf optimisation in BUILD-STEP2.md (md5 300a3f05… after it), which was
re-verified end to end.
