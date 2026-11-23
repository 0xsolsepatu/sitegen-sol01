# REBUILD-NOTES.md — site-generator-speed v2 (fresh rebuild, in-window session)

Rebuilt from scratch in a session started after the competition opened
(2026-11-22T20:00:00Z). The v1 build (01:04–01:54 WIB) predated the
opening, so its transcripts cannot be entered; this rebuild re-derives
the entry in-window. The previous version's code was never read, copied,
or imported here — only the design docs (SPEC-SUMMARY.md, BUILD.md,
BUILD-STEP2.md, BENCHMARK.md, GEMINI reviews) were consulted, plus the
vendor code and RULES.txt, which are the ground truth.

## Design points followed from v1 (proven, re-verified here)

- Fused lex+render Markdown: no token objects; blocks render straight
  into the output string. Inline parser works on string ranges
  (start/end indexes, no substring allocation for nested content) with
  run-buffered escaping (escape a whole plain run in one pass).
- `slugify` rewritten + cached per distinct string (module-level Map,
  reset per run call... actually per module lifetime; key space is
  bounded by the input). ASCII-only strings skip NFKD + the `\p{M}`
  strip; collapse non-alnum runs with one regex, trim edge dashes,
  slice to 64, drop a trailing `-`, `untitled` when empty.
- `wordsOf` as a manual charCode scan using the exact JS `\s` set
  (v2's measured ~10% improvement over `match(/\S+/g)`).
- Cards built once per post and cached; `pageOf` spreads the cached
  card instead of recomputing `wordsOf`.
- Templates parsed once per case into integer-kind nodes, rendered
  with `out +=` (measured faster than array-join in v1).
- Front matter parsed by index scanning (find the closing `---` line
  without splitting the whole body into lines first).
- Every quirk copied, not fixed: `no title` inside parseFrontMatter
  after all line checks; negative `recent` passed to `slice(0, recent)`;
  `per_page: 0` would hang exactly like the baseline; slug uniqueness
  per directory in source order with `posts`/`tags`/`page` reserved at
  root; page tags with no post-tag get `url: ""`; standalone `{% %}`
  line removal with the vendor's exact offset math; report sorted
  code-unit order; `static files` count = ALL statics.

## Deliberate differences vs v1

- This solve.js is my own fresh writing: same optimisation techniques
  (they are the documented design), different code layout and helper
  structure. Where v1's docs record a measurement, I re-measure rather
  than trust it.
- Verification harnesses (bench, adversarial, fuzz) are written fresh
  in this session. The fuzz uses NEW seeds (domain `sitegen-v2-fuzz`),
  never the v1 seeds.
- Node 22 binary no longer exists at /tmp (cleaned between sessions);
  I re-download Node 22.20.0 for the Node 22 sanity/bench check.

## Risks carried over (unchanged)

- `per_page: 0` hangs exactly like the baseline (copied deliberately).
- Slug normalisation is the sandbox's Node 22 ICU; verified on Node
  22.20.0 here.
- Timing noise on shared CPUs; the ~2.2–2.9× margin is large vs noise.
