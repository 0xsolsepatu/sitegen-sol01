# site-generator-speed — SPEC-SUMMARY

Competition `site-generator-speed-01-run-20261122` ($100, 10 × $10). Deadline Tue 24 Nov 2026 21:00 WIB
(2026-11-24T20:00:00Z). Scored set drawn after close from drand quicknet round 34249212.
Practice set: 3 cases (g-0001/2/3), 250/340/480 Markdown sources, 21–27 templates, 6–8 static
files, 0.64/0.87/1.27 MB of source text (2.77 MB total). Expected answers in
`practice/reference/expected.json` (format `makefun/speed-home/expected/v1`, one group
`generated`).

## Output contract

- `solve.js`: dependency-free ES module in repo root, exports `run(input)`.
- `input` = `{ site: {title, base_url, per_page, recent}, templates: {name: source}, files: [{path, content}] }`.
- `run` returns the output tree: JSON object path → text, byte for byte identical to
  makefun-site 1.0.0's `build(input)`. Scorer compares as JSON values (strings code-unit for
  code-unit, objects key-order-insensitive). **Gate: all 3 cases must match exactly, else no
  timing and no reward.**
- `main.ts`: the baseline's driver, kept as-is (read `/input/cases.json` = `[{id, input}]`,
  answer each with `run`, write `/output/answers.json` = JSON array in case order).
  It calls `setFlagsFromString('--no-incremental-marking')` BEFORE importing solve.js.
  Env overrides: `MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` (else `/input`, `/output`).
  Node 22 runs `node /bot/main.ts`; JS/TS source only, nothing installed, no WASM/native.
- Runtime: fresh container, no network, read-only /bot + /input, writable /output, 1 CPU,
  1024 MB, 64 procs, **10 s wall budget**. Entry executed twice; both outputs byte-identical.
- Repo ≤ 4 MiB total (4,194,304 B, all files counted), OSI licence, `main.ts` at root.
- Timing (final): only entries passing all cases are timed; 30 fastest (+ ties) + house
  baseline in one heat — 1 warm-up + 9 timed rounds, 1 CPU, CPU time net of do-nothing
  control; trimmed mean (drop 2 fastest + 2 slowest). Paid places + 2 more race 30 more
  rounds. Places by CPU time, least first; later entry passes earlier only at 95%
  confidence (one-sided). **Reward requires beating the house baseline at 95% confidence.**
  A house bot in a paid place holds it (prize not awarded, nobody moves up).
- Transcripts: **optional for this competition** (no transcript gate runs).

## Build pipeline (vendor index.js, in order)

0. `base` = `site.base_url` with trailing `/`s stripped (`replace(/\/+$/,'')`).
1. **Sources**: files sorted by path in code-unit order. `*.md` = source, `\r\n` and lone `\r`
   → `\n` (`replace(/\r\n?/g,'\n')`); others static.
2. **Templates**: every template parsed, in code-unit order of name. One that fails to parse
   is reported (`template "<name>": <reason>`) and left out as if absent.
3. **Front matter** per source (see below). Checks in this order, first failure reported:
   front-matter error → `refused <path>: <reason>`; source under `tags/` or `page/` →
   `refused <path>: <dir>/ is the generator's own`; post (`posts/…`) with no `date` →
   `refused <path>: a post needs a date`; layout (its `layout` key, else `post`/`page`)
   is no parsed template → `refused <path>: layout "<layout>" is no template that parses`;
   `draft: true` → `draft <path>` (not "refused"). All dropped.
4. **Permalinks**: post dir = `posts`; page dir = its source's directory. Slug = `slug` key
   or slug of title, made unique **in its directory, in source order**: first of
   `s, s-2, s-3…` not yet taken. At root, `posts`, `tags`, `page` are taken from the start.
   Written to `<dir>/<slug>/index.html`; url = `<base>/<dir>/<slug>/` (root: `<base>/<slug>/`).
5. **Markdown** each body, links resolved (see below).
6. **Collections**: posts newest date first; equal dates by slug code-unit order.
   `newer` = previous in that order, `older` = next (null at ends).
7. **Tags**: each post's tags, each slug once (first spelling kept), in its own order.
   Tag = all posts whose tags have its slug; named as first met walking posts in
   collection order; url `<base>/tags/<slug>/`. Tags ordered by post count desc, then slug.
   A page's tags link to the post-tag of same slug, or url `""` where no post has it
   (the tag object still has `name`, `slug`, `posts: []`).
8. **Layouts**: every page through its layout (`layout` key else `post`/`page`), with `page`.
   Index through `index`, `site.per_page` posts/page: `index.html`, then `page/2/index.html`…
   (at least one page even with no posts), with `posts` + `pager`. Each tag through `tag` at
   `tags/<slug>/index.html` with `tag`; `tags/index.html` through `tags`. An index/tag/tags
   page whose template is missing is NOT written. Every template also sees `site`, `tags`,
   `recent`. Then static files at their own path, text as given — unless a built page has
   that path (reported `shadowed <path>: a built page has its path`, static NOT written).
9. **Report** `build-report.txt`: every reported line + each broken link
   (`broken-link <source> -> <target>`, each once), sorted code-unit order, then
   `built <n> pages, <n> posts, <n> tags and <n> static files`, every line ending `\n`.
   Note: counts are `pages` = non-post sources kept, `posts` = posts kept, `tags` = number
   of distinct post-tags, `static files` = ALL statics (even shadowed ones — `b.statics.length`).

## Front matter (lib/frontmatter.js) — strict, NOT YAML

- Source must open on line `---`; FM runs to next line exactly `---`.
  First line not `---` → `no front matter`; no closing `---` → `the front matter is not closed`.
- Lines between: blank (spaces/tabs only) or comment (opens on `#`) skipped; else must match
  `/^([a-z_]+):(?: (.*))?$/` or `line <n> is not "key: value"` (n counted from 1 at opening `---`).
- Value: trailing spaces/tabs dropped. Unknown key → `unknown key "<k>"`; duplicate →
  `key "<k>" is given twice`; empty value (no ` (.*)` or empty after trim) →
  `key "<k>" has no value`. Checks run in line order; first failure wins.
- Then no `title` → `no title`. (Title check AFTER all line checks.)
- Keys (`title date tags draft layout slug summary`):
  - `title`, `summary`: quoted `"..."` (only escapes `\"` `\\`; a stray `"` inside, an
    unclosed quote, or any other escape → error `a quoted string is not closed` /
    `a quoted string holds an escape other than \" or \\` / `a quoted string holds a stray quote`,
    prefixed `key "<k>": `) or bare (rest of line, never opening on `"` or `[` —
    opening on `[` → `a bare string opens on [`; opening on `"` IS quoted, so a bare value
    starting `"` is parsed as quoted).
  - `date`: `YYYY-MM-DD`, real day, 1970-01-01…2099-12-31 (leap rule Gregorian). Stays a string.
    Else `key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)`.
  - `tags`: `[a, b, c]`; each trimmed, none empty or holding `"`, `[`, `]`; `[]` = none.
    `[]` with only spaces inside is also none (`inner.trim()===''`). Not `[...]` →
    `key "tags": not a list [a, b]`; bad item → `key "tags": an empty tag, or one holding " [ or ]`.
  - `draft`: `true`/`false` only → else `key "draft": true or false`.
  - `layout`: `/^[a-z0-9-]+$/` → else `key "layout": not a template name`.
  - `slug`: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` and ≤ 64 chars → else `key "slug": not a slug`.
- Body = lines after closing `---`, joined with `\n`. (Note: FM parse happens on `\n`-normalised text.)

## Text (lib/text.js)

- `escapeHtml`: `&` `<` `>` `"` `'` → `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`, nothing else.
- `slugify(text)`: NFKD normalise, drop combining marks (`\p{M}`), A–Z lowered, each run of
  non-`[a-z0-9]` → one `-`, none at either end, cut to 64 chars (trailing `-` at cut dropped),
  `untitled` when empty. **Normalisation is the sandbox's node22's** (same ICU on this VM's
  node 24, but verify on node 22 semantics where it matters).
- `uniqueSlug(slug, taken)`: first of `slug, slug-2, slug-3…` not in set; adds it.
- `longDate`: from string alone: `2026-11-09` → `9 November 2026` (day as number, no padding).

## Markdown (lib/markdown.js) — NOT CommonMark; lexer + inline renderer

Blocks, read line by line; a block starts at each non-blank line. Blocks written in order,
each followed by `\n` (HTML = blocks joined with `\n` after each).
- **Fence**: line `/^```([A-Za-z0-9_+-]*)[ \t]*$/`; body runs to `/^```[ \t]*$/` or EOF.
  `<pre><code class="language-<lang>">...</code></pre>` (no class without lang); each body line
  escaped + `\n`. Note: a fence line with a bad language char is NOT a fence (falls through
  to paragraph); closing fence line is consumed but a non-matching line at EOF just ends body.
- **Heading**: `/^(#{1,6})[ \t]+(.*?)[ \t]*$/` with non-empty text (after trailing trim).
  `<hN id="<id>">inline</hN>`; id = slug of heading text as written, unique in the page
  (`-2`, `-3`…). No text after `#`s, or 7+ `#` → NOT a heading. Closing `#`s kept as text.
- **Thematic break**: `/^(?:---|\*\*\*)[ \t]*$/` → `<hr>`. (So `---` under text is a break,
  never a setext heading; a paragraph ends before it.)
- **Blockquote**: lines opening on `>`; each has `>` + one space dropped (`/^> ?/`), then
  trimmed; empty ones dropped. `<blockquote>\n<p>inline</p>\n</blockquote>`, or
  `<blockquote>\n</blockquote>` when none left. Joined lines with `\n` before inline render.
- **List**: `- ` / `* ` (bullet) or `/^(\d{1,9})\. (.*)$/` (ordered); following lines of the
  same kind are items; a line of 2+ spaces then non-space continues the item (trimmed, after
  a `\n`). Any other line ends the list. No nesting. `<ul>\n<li>…</li>\n…</ul>`; ordered with
  first number ≠ 1 opens `<ol start="n">`. Item text = its parts joined by `\n`, each part
  trimmed. **Subtle**: the marker regex is re-tested per line against the SAME kind (bullet
  regex for bullet lists, ordered for ordered); a `* ` line inside a `- ` list is a bullet
  line of the same BULLET regex (`/^[-*] /`) so it continues; a `1. ` line inside a bullet
  list ends it (unless it is a 2-space continuation).
- **Paragraph**: any other line + following lines up to a blank line, fence, heading or
  thematic break. Each line trimmed both ends; joined by `\n`: `<p>inline</p>`.
- Indented lines are NOT code; `=` underlines are text.
- `excerpt` = first paragraph's inline HTML (or `""`); `toc` = every level-2/3 heading
  (`level`, `id`, `html` = inline HTML of heading text).

Inline, left to right, single pass:
- `\` + one of `` \ ` * _ [ ] ( ) # + - . ! > `` writes that char (escaped); any other `\`
  is itself (written escaped — `\` is not special, stays `\`).
- Backtick: opens code span closed by NEXT backtick (`indexOf`), ≥1 char between:
  `<code>escaped</code>`; no closer → backtick itself. (No handling of double-backtick spans;
  inner backslashes NOT processed — content is only escaped, not inline-parsed.)
- `**` opens strong, closed by next `**` not escaped (findUnescaped), ≥1 char between:
  `<strong>inline</strong>`; no closer → `**` itself. Content is recursively inline-parsed.
- Single `*` opens emphasis, closed by next single `*` (one not beside another `*`)
  not escaped, ≥1 char between: `<em>inline</em>`; no closer → `*` itself. `_` is always itself.
- `[text](target)`: first `]` not escaped closes text, `(` must follow at once, next `)`
  closes target; target must be non-empty and hold no whitespace, else `[` is itself.
  `<a href="escaped href">inline text</a>` — text recursively inline-parsed.
  Note: `findUnescaped` skips `\` + escapable char pairs; the `]` search starts at `i+1`.
  The `)` search is a plain `indexOf` (escapes NOT skipped) from `k+2`.
- Every other char written escaped. Raw HTML is text (all `<` escaped).

Link resolution (`env.link`, in index.js markdown plugin):
- Target with scheme (`/^[A-Za-z][A-Za-z0-9+.-]*:/`), or starting `/` or `#` → kept as written.
- Else: split off `#fragment`; resolve path from source's directory (`.`/`..` steps, never
  above root — `..` at root → null → broken). Empty rel (target is just `#frag`) → path null.
  If resolved path is a built page source → that page's url + fragment; else if a static
  file → `<base>/<path>` + fragment; else reported `broken-link <source> -> <target>` (Set:
  each once) and kept as written. **Note**: resolution uses `b.bySource` (kept sources only)
  and static paths; a link to a refused/draft source is broken. Fragment is appended AFTER
  the resolved url (which ends in `/`).

## Templates (lib/template.js) — own dialect, NOT Liquid/Nunjucks

- `{{ path }}` escaped, `{{{ path }}}` raw. Path = names joined by `.` (`[A-Za-z_][A-Za-z0-9_]*`
  segments); spaces allowed inside braces around it (trimmed).
- `{% for x in path %}…{% endfor %}`: renders body per element of an array (anything else
  renders nothing); `x` bound to element, `loop` = `{index` (from 1), `first`, `last`, `length}`.
- `{% if path %}…{% else %}…{% endif %}`, `{% if not path %}`; else optional. Falsy:
  undefined, null, false, `""`, `0`, empty array. Everything else truthy (incl. non-empty
  string, objects, non-zero numbers).
- `{% include "name" %}`: renders template `name` in same scope; missing, or nested more
  than 8 deep (`depth < 8` to render), renders nothing. Name grammar: `/^[a-z0-9-]+$/`.
- A `{% %}` tag alone on its line (only spaces/tabs beside it) takes the whole line with it,
  its `\n` included. Text, `{{ }}`, `{{{ }}}` never do. **Subtle**: standalone check uses
  `src.lastIndexOf('\n', open-1)+1` for line start and `src.indexOf('\n', end)` for line end;
  the text accumulated BEFORE the tag is truncated by `(open - lineStart)` chars (the spaces
  before the tag on that line). A standalone tag at EOF without `\n` consumes to end.
- Parse errors (TemplateError, reported as `template "<name>": <reason>` and template left
  out): `{{`/`{{{`/`{%` not closed; a path is not one (`<text> is not a path`, text
  JSON-stringified); a tag is none of the above (`{% <tag> %} is not a tag`); for/if not
  closed or closed out of order (`an else outside an if`, `an endfor with no open for`,
  `an endif with no open if`, `a for is not closed` / `a if is not closed`).
  Note: `for` path regex `/^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/` — the path part is
  `\S+` then validated by pathOf; `if` regex `/^if (not )?(\S+)$/`. Extra spaces inside a
  tag are trimmed first, so `{%  for  x  in  y  %}` FAILS (FOR regex has single spaces).
- Tokenizer: scans for `{`; a `{` not followed by `{` or `%` is literal text (appended,
  `i = open+1`). `{{` vs `{{{` decided by 3rd char. Unclosed `{{`/`{{{`/`{%` throws.
  A `{%` tag's content is trimmed; `{{ }}` path is trimmed.
- Lookup: first name from innermost scope holding it (`loop` before the element — both are
  in the same `vars` object, so `loop` wins if the element also had a `loop` property? No:
  `vars = {[name]: x, loop: {...}}` — the element is under its own name; `loop` is a
  sibling key. First-name lookup walks scope chain by `Object.hasOwn(vars, name)`.
  Then each next name = own property of value so far (null/non-object/missing → undefined).
- `textOf(v)`: string itself; number via `String(v)`; boolean `true`/`false`; array = items
  `textOf`-ed joined `, ` (recursive); anything else `""` (undefined, null, objects).
- Rendering is string concatenation (`out += …`) with recursive `renderNodes` per branch/
  loop iteration — a major speed cost in the baseline.
- Includes share the same scope object (no copy) and increment depth; depth is per include
  chain, not global.

## What templates see

- `site`: `{title, base_url: <base>}` (base with trailing slashes stripped).
- `tags`: every tag `{name, slug, url, count}` (in tag order: count desc, then slug).
- `recent`: first `site.recent` posts, as cards. (slice(0, recent); negative recent →
  slice(0, negative) quirk — copy the code, don't "fix" it.)
- Card: `{title, url, date` (string or `""`), `date_long`, `summary` (key or `""`),
  `excerpt` (HTML of first paragraph or `""`), `reading_minutes` (body words — runs of
  non-whitespace — /200, ceil, at least 1), `tags` (each `{name, slug, url}`)}.
  `wordsOf` = `text.match(/\S+/g)` count (0 when null) — on the BODY (front-matter body,
  `\n`-normalised, unrendered).
- `page`: card + `slug`, `content` (body HTML), `toc` (level 2/3 headings: `level, id, html`),
  `newer`/`older` (each `{title, url, date, date_long}` or null; null for a page — note
  `newer`/`older` are only set on posts; pages get `s.newer ?? null` → null), `is_post`.
- Index page: `posts` (that page's cards) + `pager` `{number, total, url, newer_url, older_url}`
  (`""` where none; url = `<base>/` for page 1, `<base>/page/<k>/` otherwise).
- Tag page: `tag` `{name, slug, url, count, posts}` (posts = its cards).
- `per_page`: `pages = max(1, ceil(posts/per))` — division by zero → Infinity → `Math.ceil`
  → Infinity → loop `k <= Infinity` never ends? In practice per_page ≥ 1 in generated cases;
  copy the code as-is (do not "fix" — but note as a risk: if scored cases ever had
  per_page 0 the baseline would hang; the generator presumably never emits it).
- Cards are built ONCE per post (`b.cards` map) and reused across index/tag/recent renders;
  `tagOf` maps tag posts to cards each time it is called (per tag page render).

## Speed-relevant observations (baseline costs)

- Baseline re-parses every template per build (once per case) — parse is per-case, not per page.
- `renderMarkdown` lexes each body into token objects, then renders; inline parsing is
  recursive with `findUnescaped`/`findSingleStar` rescans and `escapeHtml` per char
  (`out += escapeHtml(c)` — a regex `.replace` call per single character!).
- Template rendering is `out +=` string concat with a fresh scope object per loop iteration
  and recursive `renderNodes` calls per branch; `lookup` walks scope chains per path.
- `cardOf` is called once per post for the cards map, but `pageOf` re-calls `cardOf` per page
  (recomputing `wordsOf` — a full-body regex — per page) and `tagOf` re-maps cards per tag.
- `slugify` is called per tag name per post (and again in `ownTags` — twice per name), plus
  per title/heading; each does NFKD normalise + a `\p{M}` regex + a char loop.
- `wordsOf` regex `/\S+/g` over every body, twice per page (cardOf in cards map + pageOf).
- Sorting: files sorted by path; templates sorted by name; posts sorted by date/slug.
- Output JSON: `JSON.stringify(answers)` of the whole 3-case set (~7 MB) — driver cost, same
  for both entries; the win must come from `run()`.

## Entry limits / deliverables

- Repo root: `solve.js` (ES module, dependency-free), `main.ts` (baseline driver, keep),
  `LICENSE` (OSI). Repo ≤ 4,194,304 B total.
- `run` must be deterministic and pure (no clock/env/random/file reads).
- Practice: 3 cases; verify by running main.ts on practice/input/cases.json and diffing
  against practice/reference/expected.json (scorer compares canonical JSON; answers.json
  byte-format is free as long as it parses to the same values).
