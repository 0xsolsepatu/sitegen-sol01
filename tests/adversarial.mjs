// Adversarial tests for the site-generator-speed entry (step 7).
// Self-contained: node, no deps. Each case is a full input {site, templates, files};
// the entry's run() (../solve.js) and the vendor baseline's build() are run on the
// same input and their outputs compared as canonical JSON (keys sorted).
// The baseline IS the expectation: any mismatch means solve.js differs from it.
// DO NOT weaken a case to match solve.js. Run: node tests/adversarial.mjs
import { run as solveRun } from '../solve.js';
import { run as baseRun } from '../../../workspace/makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/baselines/makefun-site/solve.js';

const POST = 'POST[{{ page.title }}|{{ page.slug }}|{{ page.date }}|{{ page.date_long }}|{{ page.reading_minutes }}|{{ page.is_post }}|tags={% for t in page.tags %}{{ t.name }}={{ t.slug }}={{ t.url }};{% endfor %}|newer={{ page.newer.title }}|older={{ page.older.title }}|toc={% for h in page.toc %}{{ h.level }}:{{ h.id }};{% endfor %}|ex={{{ page.excerpt }}}|sum={{ page.summary }}]\n{{{ page.content }}}';
const PAGE = 'PAGE[{{ page.title }}|{{ page.slug }}|{{ page.date }}|{{ page.is_post }}|tags={% for t in page.tags %}{{ t.name }}={{ t.slug }}={{ t.url }};{% endfor %}|newer={{ page.newer }}|older={{ page.older }}]\n{{{ page.content }}}';
const INDEX = 'INDEX[{{ site.title }}|{{ site.base_url }}|posts={% for p in posts %}{{ p.title }}@{{ p.url }};{% endfor %}|pager={{ pager.number }}/{{ pager.total }}|{{ pager.url }}|{{ pager.newer_url }}|{{ pager.older_url }}|recent={% for r in recent %}{{ r.title }};{% endfor %}|tags={% for t in tags %}{{ t.name }}:{{ t.count }};{% endfor %}]';
const TAG = 'TAG[{{ tag.name }}|{{ tag.slug }}|{{ tag.count }}|posts={% for p in tag.posts %}{{ p.title }};{% endfor %}]';
const TAGS = 'TAGS[{% for t in tags %}{{ t.name }}:{{ t.count }};{% endfor %}]';
const DEFAULT_TEMPLATES = { post: POST, page: PAGE, index: INDEX, tag: TAG, tags: TAGS };

const F = (path, content) => ({ path, content });
const md = (fm, body = '') => `---\n${fm}\n---\n${body}`;
function input({ site = {}, templates = {}, files = [] } = {}) {
  const t = { ...DEFAULT_TEMPLATES, ...templates };
  for (const k of Object.keys(t)) if (t[k] === null) delete t[k];
  return {
    site: { title: 'T', base_url: 'https://example.com/', per_page: 2, recent: 2, ...site },
    templates: t,
    files,
  };
}

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const CASES = [];
const add = (name, inp) => CASES.push({ name, input: inp });

// ---------------------------------------------------------------- front matter
add('fm01-unclosed', input({ files: [
  F('a.md', '---\ntitle: Unclosed\nbody here\n'),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm02-first-line-not-dash', input({ files: [
  F('a.md', 'title: Nope\n---\nbody\n'),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm03-key-no-space', input({ files: [
  F('a.md', md('title:NoSpace', 'x')),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm04-duplicate-key', input({ files: [
  F('a.md', md('title: One\ntitle: Two', 'x')),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm05-unknown-key', input({ files: [
  F('a.md', md('title: X\nfoo: bar', 'x')),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm06-empty-value', input({ files: [
  F('a.md', md('title:', 'x')),
  F('b.md', md('title:   ', 'x')),
  F('c.md', md('title: Kept\nsummary:', 'ok')),
  F('d.md', md('title: Kept Two', 'ok')),
] }));
add('fm07-quoted-stray-quote', input({ files: [
  F('a.md', md('title: "a"b"', 'x')),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm08-quoted-bad-escape', input({ files: [
  F('a.md', md('title: "a\\nb"', 'x')),
  F('b.md', md('title: "a\\tb"', 'x')),
  F('c.md', md('title: Kept', 'ok')),
] }));
add('fm09-quoted-unclosed', input({ files: [
  F('a.md', md('title: "abc', 'x')),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm10-quoted-valid-escapes', input({ files: [
  F('a.md', md('title: "a\\"b\\\\c"', 'x')),
  F('b.md', md('title: ""', 'x')),
  F('c.md', md('title: Kept', 'ok')),
] }));
add('fm11-bare-bracket', input({ files: [
  F('a.md', md('title: [abc]', 'x')),
  F('b.md', md('title: Kept', 'ok')),
] }));
add('fm12-dates-invalid', input({ files: [
  F('posts/a.md', md('title: NonLeap\ndate: 2026-02-29', 'x')),
  F('posts/b.md', md('title: TooEarly\ndate: 1969-12-31', 'x')),
  F('posts/c.md', md('title: TooLate\ndate: 2100-01-01', 'x')),
  F('posts/d.md', md('title: Feb30\ndate: 2026-02-30', 'x')),
  F('posts/e.md', md('title: Month13\ndate: 2026-13-01', 'x')),
  F('posts/f.md', md('title: BadFmt\ndate: 2026-2-9', 'x')),
  F('posts/g.md', md('title: Month00\ndate: 2026-00-10', 'x')),
  F('posts/h.md', md('title: Day00\ndate: 2026-01-00', 'x')),
  F('posts/i.md', md('title: Kept\ndate: 2026-01-15', 'ok')),
] }));
add('fm13-dates-valid-edges', input({ files: [
  F('posts/a.md', md('title: Leap\ndate: 2024-02-29', 'leap')),
  F('posts/b.md', md('title: First\ndate: 1970-01-01', 'first')),
  F('posts/c.md', md('title: Last\ndate: 2099-12-31', 'last')),
  F('posts/d.md', md('title: CenturyNonLeap\ndate: 2100-02-29', 'x')),
  F('posts/e.md', md('title: CenturyLeap\ndate: 2000-02-29', 'leap2000')),
] }));
add('fm14-tags-forms', input({ files: [
  F('posts/a.md', md('title: EmptyList\ndate: 2026-01-01\ntags: []', 'x')),
  F('posts/b.md', md('title: SpacesList\ndate: 2026-01-02\ntags: [ ]', 'x')),
  F('posts/c.md', md('title: DoubleComma\ndate: 2026-01-03\ntags: [a,,b]', 'x')),
  F('posts/d.md', md('title: QuoteTag\ndate: 2026-01-04\ntags: [a"b]', 'x')),
  F('posts/e.md', md('title: BracketTag\ndate: 2026-01-05\ntags: [a[b]', 'x')),
  F('posts/f.md', md('title: NotAList\ndate: 2026-01-06\ntags: abc', 'x')),
  F('posts/g.md', md('title: ValidTags\ndate: 2026-01-07\ntags: [Alpha, beta ,  Gamma-Delta ]', 'x')),
  F('posts/h.md', md('title: TrailingComma\ndate: 2026-01-08\ntags: [a,]', 'x')),
] }));
add('fm15-draft-values', input({ files: [
  F('a.md', md('title: Yes\ndraft: yes', 'x')),
  F('b.md', md('title: Upper\ndraft: TRUE', 'x')),
  F('c.md', md('title: One\ndraft: 1', 'x')),
  F('d.md', md('title: Drafted\ndraft: true', 'x')),
  F('e.md', md('title: NotDraft\ndraft: false', 'x')),
] }));
add('fm16-layout-forms', input({
  templates: { 'post-2': 'POST2[{{ page.title }}]\n{{{ page.content }}}' },
  files: [
    F('a.md', md('title: Upper\nlayout: Post', 'x')),
    F('b.md', md('title: Missing\nlayout: no-such', 'x')),
    F('c.md', md('title: Dashes\nlayout: post-2', 'ok')),
    F('d.md', md('title: Upper2\nlayout: POST', 'x')),
    F('e.md', md('title: Empty\nlayout:', 'x')),
  ],
}));
add('fm17-slug-forms', input({ files: [
  F('a.md', md('title: LongSlug\nslug: ' + 'a'.repeat(65), 'x')),
  F('b.md', md('title: TrailDash\nslug: abc-', 'x')),
  F('c.md', md('title: DoubleDash\nslug: a--b', 'x')),
  F('d.md', md('title: UpperSlug\nslug: Abc', 'x')),
  F('e.md', md('title: Exactly64\nslug: ' + 'b'.repeat(64), 'ok')),
  F('f.md', md('title: Underscore\nslug: a_b', 'x')),
] }));
add('fm18-no-title', input({ files: [
  F('a.md', md('date: 2026-01-01', 'x')),
  F('b.md', md('summary: only', 'x')),
  F('c.md', md('title: Kept', 'ok')),
] }));
add('fm19-comments-blanks', input({ files: [
  F('a.md', '---\n\n   \n# a comment\ntitle: Comments\n# another\n\nsummary: S\n---\nbody\n'),
  F('b.md', '---\n   # indented hash\ntitle: Indented\n---\nbody\n'),
  F('c.md', '---\ntitle: Kept\n   \n---\nbody\n'),
] }));
add('fm20-crlf-and-lone-cr', input({ files: [
  F('a.md', '---\r\ntitle: CRLF\r\n---\r\nBody line\r\nsecond\r\n'),
  F('b.md', '---\rtitle: LoneCR\r---\rBody\rlone\r'),
  F('c.md', '---\ntitle: Mixed\n---\nOne\rTwo\r\nThree\n'),
] }));
add('fm21-post-no-date-and-own-dirs', input({ files: [
  F('posts/a.md', md('title: NoDate', 'x')),
  F('tags/a.md', md('title: InTags', 'x')),
  F('page/a.md', md('title: InPage', 'x')),
  F('page.md', md('title: PageAtRoot', 'ok')),
  F('tags.md', md('title: TagsAtRoot', 'ok')),
  F('posts/b.md', md('title: Kept\ndate: 2026-01-01', 'ok')),
] }));

// ---------------------------------------------------------------- permalinks
add('perm01-dup-titles', input({ files: [
  F('posts/a.md', md('title: Same Title\ndate: 2026-01-01', 'one')),
  F('posts/b.md', md('title: Same Title\ndate: 2026-01-02', 'two')),
  F('posts/c.md', md('title: Same Title\ndate: 2026-01-03', 'three')),
  F('posts/d.md', md('title: same title!\ndate: 2026-01-04', 'four')),
  F('same-title.md', md('title: Same Title', 'page at root')),
] }));
add('perm02-reserved-root', input({ files: [
  F('a.md', md('title: posts', 'x')),
  F('b.md', md('title: Posts', 'x')),
  F('c.md', md('title: tags', 'x')),
  F('d.md', md('title: page', 'x')),
  F('e.md', md('title: normal', 'x')),
] }));
add('perm03-slug-key-collision', input({ files: [
  F('posts/a.md', md('title: Hello\ndate: 2026-01-01\nslug: hello', 'one')),
  F('posts/b.md', md('title: Hello\ndate: 2026-01-02', 'two')),
  F('docs/a.md', md('title: X\nslug: x', 'one')),
  F('docs/b.md', md('title: X', 'two')),
] }));
add('perm04-nested-dirs', input({ files: [
  F('docs/a/x.md', md('title: Guide', 'one')),
  F('docs/a/y.md', md('title: Guide', 'two')),
  F('docs/b/x.md', md('title: Guide', 'three')),
  F('docs/x.md', md('title: Guide', 'four')),
  F('x.md', md('title: Guide', 'five')),
] }));
add('perm05-date-tie-by-slug', input({ files: [
  F('posts/z.md', md('title: Zulu\ndate: 2026-03-01', 'z')),
  F('posts/a.md', md('title: Alpha\ndate: 2026-03-01', 'a')),
  F('posts/m.md', md('title: Mike\ndate: 2026-03-01', 'm')),
  F('posts/n.md', md('title: Newer\ndate: 2026-03-02', 'n')),
] }));

// ---------------------------------------------------------------- markdown
add('md01-fences', input({ files: [
  F('a.md', md('title: Fences',
    '```c++!\nnot a fence, lang has !\n```\n\n```c++\nint x;\n```\n\n```js   \ncode();\n```  \n\n```py\nunclosed at EOF\nline2')),
] }));
add('md02-headings', input({ files: [
  F('a.md', md('title: Headings',
    '####### seven hashes\n\n#\n\n## \n\n## Hi ##\n\n#NoSpace\n\n###### six ok\n\n##  spaced  \n\n# Café & <Tea>')),
] }));
add('md03-hr-under-text', input({ files: [
  F('a.md', md('title: HRs',
    'para one\n---\npara two\n***\npara three\n--- \npara four\n----\npara five\n--\npara six')),
] }));
add('md04-blockquote', input({ files: [
  F('a.md', md('title: Quotes',
    '>first\n>\n> second\n\n>nospace\n>  double\n>\n>\n>after empties\n\n>\n>\n\nplain')),
] }));
add('md05-lists', input({ files: [
  F('a.md', md('title: Lists',
    '- a\n* b\n- c\n\n5. five\n6. six\n\n- one\n  two\n three\n- four\n\n- bullet\n1. ordered\n- bullet2\n\n1. ord\n- bul\n2. ord2\n\n- x\n   three spaces\n- y')),
] }));
add('md06-para-ends', input({ files: [
  F('a.md', md('title: ParaEnds',
    'line one\nline two\n```js\ncode\n```\nline three\n## Head\nline four\n---\nline five')),
] }));

// ---------------------------------------------------------------- inline
add('in01-escapes', input({ files: [
  F('a.md', md('title: Escapes',
    String.raw`esc: \` \` \* \_ \[ \] \( \) \# \+ \- \. \! \> \\ end` + '\n\n' +
    String.raw`nonesc: \a \n \& \< \q \e \/ \~ end` + '\n\n' +
    'lone backslash at end \\')),
] }));
add('in02-code-spans', input({ files: [
  F('a.md', md('title: Code',
    'a `code` b `unclosed c\n\n``double`` d\n\n`with \\ backslash` e\n\n`` empty? `` f')),
] }));
add('in03-em-strong', input({ files: [
  F('a.md', md('title: EmStrong',
    'a **strong** b *em* c\n\n**no closer d\n\n*no closer e\n\n***triple*** f\n\n**a *b* c** g\n\n*a **b** c* h\n\n**a**b**c** i\n\n* a * b * j')),
] }));
add('in04-links-basic', input({ files: [
  F('a.md', md('title: Links',
    '[empty]()\n\n[ws](x y)\n\n[**bold text**](https://example.com)\n\n[frag](#frag)\n\n[autolink](<http://x>)\n\nraw <http://x> and <b>html</b> here\n\n[scheme](mailto:a@b.c)\n\n[abs](/root/path)\n\n[escaped \\] bracket](https://example.com)')),
] }));
add('in05-links-resolution', input({ files: [
  F('docs/a.md', md('title: DocA',
    '[to root page](../b.md)\n\n[to post](../../posts/p.md)\n\n[to static](../file.txt)\n\n[to static frag](../file.txt#sec)\n\n[above root](../../../escape.md)\n\n[to draft](../../posts/draft.md)\n\n[to refused](../../posts/refused.md)\n\n[to missing](nope.md)\n\n[dot](./b.md)\n\n[self](a.md)')),
  F('docs/b.md', md('title: DocB', 'bee')),
  F('b.md', md('title: RootB', 'root')),
  F('posts/p.md', md('title: PostP\ndate: 2026-01-01', 'pee')),
  F('posts/draft.md', md('title: Draft\ndate: 2026-01-01\ndraft: true', 'd')),
  F('posts/refused.md', md('title: Refused\ndate: 2026-13-40', 'r')),
  F('docs/file.txt', 'static text'),
  F('file.txt', 'root static'),
] }));

// ---------------------------------------------------------------- templates
add('tpl01-standalone', input({
  templates: {
    page: 'START\n{% if page.is_post %}\nYES\n{% endif %}\n  {% if page.is_post %}  \nINDENTED\n\t{% endif %}\t\nMID{% if page.is_post %}INLINE{% endif %}END\n{{{ page.content }}}{% if page.is_post %}\nTAIL-NO-NEWLINE',
  },
  files: [F('a.md', md('title: Stand', 'body text'))],
}));
add('tpl02-unclosed-tags', input({
  templates: { page: 'A {{ page.title ', index: 'B {{{ page.title ', tag: 'C {% if x ', tags: 'D {% for x in y ' },
  files: [F('a.md', md('title: X', 'body')), F('posts/p.md', md('title: P\ndate: 2026-01-01\ntags: [T]', 'p'))],
}));
add('tpl03-bad-paths', input({
  templates: {
    p1: '{{ 1x }}', p2: '{{ }}', p3: '{{ a-b }}', p4: '{{ a..b }}', p5: '{{ a.1b }}',
    page: PAGE,
  },
  files: [
    F('a.md', md('title: One\nlayout: p1', 'x')),
    F('b.md', md('title: Two\nlayout: p2', 'x')),
    F('c.md', md('title: Three\nlayout: p3', 'x')),
    F('d.md', md('title: Four\nlayout: p4', 'x')),
    F('e.md', md('title: Five\nlayout: p5', 'x')),
    F('f.md', md('title: Kept', 'ok')),
  ],
}));
add('tpl04-for-non-array', input({
  templates: {
    page: 'S:{% for c in site.title %}[{{ c }}]{% endfor %}|N:{% for n in page.reading_minutes %}[{{ n }}]{% endfor %}|O:{% for o in page %}[{{ o }}]{% endfor %}|U:{% for u in page.nope %}[{{ u }}]{% endfor %}|A:{% for t in page.tags %}[{{ t.name }}]{% endfor %}',
  },
  files: [F('a.md', md('title: ForTest\ntags: [One, Two]', 'body'))],
}));
add('tpl05-if-falsy', input({
  site: { title: '0' },
  templates: {
    page: 'A:{% if page.tags %}TAGS{% else %}NOTAGS{% endif %}|B:{% if page.date %}DATE{% else %}NODATE{% endif %}|C:{% if site.title %}TITLE{% else %}NOTITLE{% endif %}|D:{% if page.is_post %}POST{% else %}NOTPOST{% endif %}|E:{% if page.newer %}NEWER{% else %}NONEWER{% endif %}|F:{% if page.nope %}NOPE{% else %}NONOPE{% endif %}|G:{% if not page.date %}NOTDATE{% else %}HASDATE{% endif %}|H:{% if page.content %}CONTENT{% else %}NOCONTENT{% endif %}|I:{% if page %}PAGEOBJ{% endif %}',
  },
  files: [F('a.md', md('title: IfTest', 'body'))],
}));
add('tpl06-include-missing', input({
  templates: { page: 'BEFORE[{% include "no-such" %}]AFTER|{% include "also-missing" %}|END' },
  files: [F('a.md', md('title: IncMiss', 'body'))],
}));
add('tpl07-include-deep-9', input({
  templates: {
    page: 'P[{% include "i1" %}]',
    i1: 'I1[{% include "i2" %}]', i2: 'I2[{% include "i3" %}]',
    i3: 'I3[{% include "i4" %}]', i4: 'I4[{% include "i5" %}]',
    i5: 'I5[{% include "i6" %}]', i6: 'I6[{% include "i7" %}]',
    i7: 'I7[{% include "i8" %}]', i8: 'I8[{% include "i9" %}]',
    i9: 'I9[{% include "i10" %}]', i10: 'I10',
  },
  files: [F('a.md', md('title: Deep', 'body'))],
}));
add('tpl08-include-cycle', input({
  templates: {
    page: 'P[{% include "a" %}]',
    a: 'A[{% include "b" %}]',
    b: 'B[{% include "a" %}]',
  },
  files: [F('a.md', md('title: Cycle', 'body'))],
}));
add('tpl09-loop-vars', input({
  templates: {
    page: 'TAGS:{% for t in page.tags %}{{ loop.index }}/{{ loop.length }}/{{ loop.first }}/{{ loop.last }}:{{ t.name }};{% endfor %}',
    index: 'POSTS:{% for p in posts %}{{ loop.index }}:{{ p.title }}(first={{ loop.first }},last={{ loop.last }});{% endfor %}|RECENT:{% for r in recent %}{{ loop.index }}:{{ r.title }};{% endfor %}',
  },
  files: [
    F('posts/a.md', md('title: A\ndate: 2026-01-01\ntags: [One, Two, Three]', 'a')),
    F('posts/b.md', md('title: B\ndate: 2026-01-02\ntags: [One]', 'b')),
    F('posts/c.md', md('title: C\ndate: 2026-01-03', 'c')),
  ],
}));
add('tpl10-deep-paths', input({
  templates: {
    page: 'A:[{{ page.nonexistent.deep }}]|B:[{{ site.title.x }}]|C:[{{ page.tags.name }}]|D:[{{ page.newer.title }}]|E:[{{ page.toc.0 }}]|F:[{{ loop }}]',
  },
  files: [F('a.md', md('title: Deep\ntags: [T]', 'body'))],
}));
add('tpl11-textof-values', input({
  templates: {
    page: 'ARR:[{{ page.tags }}]|NUM:[{{ page.reading_minutes }}]|BOOL:[{{ page.is_post }}]|OBJ:[{{ page }}]|UND:[{{ page.nope }}]|SITEARR:[{{ tags }}]|STR:[{{ site.title }}]',
    index: 'RECENT-ARR:[{{ recent }}]|TAGS-ARR:[{{ tags }}]|PAGER-NUM:[{{ pager.number }}]|PAGER-OBJ:[{{ pager }}]',
  },
  files: [
    F('a.md', md('title: TextOf\ntags: [One, Two]', 'word '.repeat(250))),
    F('posts/p.md', md('title: P\ndate: 2026-01-01\ntags: [One]', 'p')),
  ],
}));
add('tpl12-bad-structure', input({
  templates: {
    b1: '{% endfor %}', b2: '{% else %}', b3: '{% endif %}', b4: '{% if x %}',
    b5: '{% for x in page.tags %}', b6: '{% for  x  in  y %}', b7: '{% bogus %}',
    b8: '{% if x %}{% else %}{% else %}{% endif %}',
    page: PAGE,
  },
  files: [
    F('a.md', md('title: One\nlayout: b1', 'x')),
    F('b.md', md('title: Two\nlayout: b2', 'x')),
    F('c.md', md('title: Three\nlayout: b3', 'x')),
    F('d.md', md('title: Four\nlayout: b4', 'x')),
    F('e.md', md('title: Five\nlayout: b5', 'x')),
    F('f.md', md('title: Six\nlayout: b6', 'x')),
    F('g.md', md('title: Seven\nlayout: b7', 'x')),
    F('h.md', md('title: Eight\nlayout: b8', 'x')),
    F('i.md', md('title: Kept', 'ok')),
  ],
}));
add('tpl13-layout-and-index-fail-parse', input({
  templates: { post: '{{ unclosed', index: '{% bogus %}', tag: '{{{ raw ' },
  files: [
    F('posts/p.md', md('title: P\ndate: 2026-01-01\ntags: [T]', 'p')),
    F('a.md', md('title: APage', 'body')),
  ],
}));
add('tpl14-for-if-nesting', input({
  templates: {
    page: '{% for t in page.tags %}{% if loop.first %}FIRST:{% endif %}{{ t.name }}{% if loop.last %} (last){% endif %};{% endfor %}|{% if page.tags %}{% for t in page.tags %}{% if t.name %}N={{ t.name }};{% endif %}{% endfor %}{% else %}NOTAGS{% endif %}',
    index: '{% for p in posts %}{% if p.tags %}HAS-TAGS:{{ p.title }};{% else %}NO-TAGS:{{ p.title }};{% endif %}{% endfor %}',
  },
  files: [
    F('posts/a.md', md('title: A\ndate: 2026-01-01\ntags: [One]', 'a')),
    F('posts/b.md', md('title: B\ndate: 2026-01-02', 'b')),
    F('c.md', md('title: C\ntags: [Two, Three]', 'c')),
    F('d.md', md('title: D', 'd')),
  ],
}));
add('tpl15-var-spacing-and-braces', input({
  templates: {
    page: 'A[{{page.title}}]|B[{{{  page.title  }}}]|C[{{  page.title  }}]|D[{x}]|E[{{ page.title }}x]|F[{{page.title}} {{page.slug}}]',
  },
  files: [F('a.md', md('title: Spacing & <Stuff>', 'body'))],
}));

// ---------------------------------------------------------------- tags / collections
add('tag01-spelling-same-slug', input({ files: [
  F('posts/a.md', md('title: A\ndate: 2026-01-01\ntags: [AI, JavaScript]', 'a')),
  F('posts/b.md', md('title: B\ndate: 2026-01-02\ntags: [ai, javascript]', 'b')),
  F('posts/c.md', md('title: C\ndate: 2026-01-03\ntags: [AI, Java Script]', 'c')),
  F('posts/d.md', md('title: D\ndate: 2026-01-04\ntags: [Café Culture, cafe culture]', 'd')),
] }));
add('tag02-page-tag-no-post', input({ files: [
  F('a.md', md('title: PageWithTags\ntags: [Orphan, Shared]', 'body')),
  F('posts/p.md', md('title: P\ndate: 2026-01-01\ntags: [Shared]', 'p')),
] }));
add('tag03-order-count-then-slug', input({ files: [
  F('posts/a.md', md('title: A\ndate: 2026-01-01\ntags: [Beta, Alpha, Gamma]', 'a')),
  F('posts/b.md', md('title: B\ndate: 2026-01-02\ntags: [Beta, Alpha]', 'b')),
  F('posts/c.md', md('title: C\ndate: 2026-01-03\ntags: [Beta, Gamma]', 'c')),
  F('posts/d.md', md('title: D\ndate: 2026-01-04\ntags: [Delta]', 'd')),
  F('posts/e.md', md('title: E\ndate: 2026-01-05\ntags: [Gamma]', 'e')),
] }));
add('tag04a-perpage-big-recent-0', input({
  site: { per_page: 10, recent: 0 },
  files: [
    F('posts/a.md', md('title: A\ndate: 2026-01-01', 'a')),
    F('posts/b.md', md('title: B\ndate: 2026-01-02', 'b')),
  ],
}));
add('tag04b-perpage-1-recent-neg', input({
  site: { per_page: 1, recent: -1 },
  files: [
    F('posts/a.md', md('title: A\ndate: 2026-01-01', 'a')),
    F('posts/b.md', md('title: B\ndate: 2026-01-02', 'b')),
    F('posts/c.md', md('title: C\ndate: 2026-01-03', 'c')),
    F('posts/d.md', md('title: D\ndate: 2026-01-04', 'd')),
    F('posts/e.md', md('title: E\ndate: 2026-01-05', 'e')),
  ],
}));
add('tag04c-recent-big', input({
  site: { per_page: 2, recent: 99 },
  files: [
    F('posts/a.md', md('title: A\ndate: 2026-01-01', 'a')),
    F('posts/b.md', md('title: B\ndate: 2026-01-02', 'b')),
  ],
}));
add('tag05-no-posts', input({
  templates: { index: INDEX, page: PAGE, tag: TAG, tags: TAGS, post: null },
  files: [
    F('a.md', md('title: OnlyPage', 'body')),
    F('b.md', md('title: Second', 'body2')),
  ],
}));
add('tag06-no-templates-index-tag', input({
  templates: { index: null, tag: null, tags: null },
  files: [
    F('posts/a.md', md('title: A\ndate: 2026-01-01\ntags: [T]', 'a')),
    F('b.md', md('title: B', 'body')),
  ],
}));

// ---------------------------------------------------------------- statics / files
add('static01-shadow', input({ files: [
  F('a.md', md('title: About', 'about page')),
  F('posts/p.md', md('title: X\ndate: 2026-01-01', 'p')),
  F('index.html', 'STATIC INDEX - should be shadowed'),
  F('about/index.html', 'STATIC ABOUT - should be shadowed'),
  F('posts/x/index.html', 'STATIC POST - should be shadowed'),
  F('build-report.txt', 'STATIC REPORT - report wins, written last'),
  F('style.css', 'kept static'),
  F('posts/x/other.txt', 'kept static under posts'),
] }));
add('file01-empty-md', input({ files: [
  F('a.md', ''),
  F('b.md', '---\n---\n'),
  F('c.md', '---\ntitle: Empty Body\n---\n'),
  F('d.md', '---\ntitle: Only FM\n---'),
  F('e.md', md('title: Kept', '')),
] }));
add('file02-duplicate-paths', input({ files: [
  F('dup.md', md('title: First Dup', 'one')),
  F('dup.md', md('title: Second Dup', 'two')),
  F('dup.md', md('title: Third Dup', 'three')),
  F('same.txt', 'static one'),
  F('same.txt', 'static two'),
  F('z.md', md('title: Zed', 'z')),
] }));
add('file03-shuffled-order', input({ files: [
  F('posts/z.md', md('title: Zulu\ndate: 2026-01-03', 'z')),
  F('m.md', md('title: Middle', 'm')),
  F('posts/a.md', md('title: Alpha\ndate: 2026-01-01', 'a')),
  F('a.md', md('title: Aye', 'a')),
  F('posts/m.md', md('title: Mike\ndate: 2026-01-02', 'm2')),
  F('b.md', md('title: Bee', 'b')),
] }));

// ---------------------------------------------------------------- slug unicode
add('slug01-unicode', input({ files: [
  F('a.md', md('title: Café Über', 'a')),
  F('b.md', md('title: Москва', 'b')),
  F('c.md', md('title: 🎉 Party Time', 'c')),
  F('d.md', md('title: éclair', 'd')),
  F('e.md', md('title: !!!', 'e')),
  F('f.md', md('title: Ærøskøbing ﬁnal Ｗｉｄｅ', 'f')),
  F('g.md', md('title: ' + 'a'.repeat(63) + ' ' + 'b'.repeat(40), 'g')),
  F('h.md', md('title: ' + 'word '.repeat(20).trim(), 'h')),
  F('i.md', md('title: naïve résumé piñata', 'i')),
] }));

// ---------------------------------------------------------------- runner
let pass = 0;
let fail = 0;
const failures = [];
function diffKeys(a, b, path = '') {
  if (canon(a) === canon(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      if (!(k in a) || !(k in b)) return `${path}${k}: only in ${k in a ? 'solve' : 'baseline'}`;
      const d = diffKeys(a[k], b[k], `${path}${k}.`);
      if (d) return d;
    }
    return `${path} (key sets equal but values differ)`;
  }
  if (Array.isArray(a) && Array.isArray(b)) return `${path} array len ${a.length} vs ${b.length}`;
  return path.replace(/\.$/, '');
}

for (const c of CASES) {
  let got, want, errG, errW;
  try { got = solveRun(JSON.parse(JSON.stringify(c.input))); } catch (e) { errG = e; }
  try { want = baseRun(JSON.parse(JSON.stringify(c.input))); } catch (e) { errW = e; }
  if (errG || errW) {
    if (errG && errW && String(errG) === String(errW)) { pass++; console.log(`PASS ${c.name} (both throw: ${String(errG).slice(0, 120)})`); }
    else {
      fail++;
      failures.push(c.name);
      console.log(`FAIL ${c.name}: solve threw ${errG ? String(errG).slice(0, 200) : 'nothing'}; baseline threw ${errW ? String(errW).slice(0, 200) : 'nothing'}`);
    }
    continue;
  }
  if (canon(got) === canon(want)) { pass++; console.log(`PASS ${c.name}`); }
  else {
    fail++;
    failures.push(c.name);
    const at = diffKeys(got, want);
    const gv = at ? JSON.stringify(got[at.split('.')[0]]) : '';
    const wv = at ? JSON.stringify(want[at.split('.')[0]]) : '';
    console.log(`FAIL ${c.name}: first diff at ${at}`);
    console.log(`  solve:    ${(gv ?? '').slice(0, 400)}`);
    console.log(`  baseline: ${(wv ?? '').slice(0, 400)}`);
  }
}

// Meta-check: input file order must not change the output (sorting holds).
{
  const base = CASES.find((c) => c.name === 'file03-shuffled-order').input;
  const rev = JSON.parse(JSON.stringify(base));
  rev.files.reverse();
  const a = canon(solveRun(JSON.parse(JSON.stringify(base))));
  const b = canon(solveRun(rev));
  const c = canon(baseRun(JSON.parse(JSON.stringify(base))));
  const d = canon(baseRun(rev));
  if (a === b && c === d && a === c) { pass++; console.log('PASS shuffle-invariance (solve + baseline, reversed file order)'); }
  else { fail++; failures.push('shuffle-invariance'); console.log(`FAIL shuffle-invariance: solve ${a === b ? 'stable' : 'UNSTABLE'}, baseline ${c === d ? 'stable' : 'UNSTABLE'}, cross ${a === c ? 'match' : 'MISMATCH'}`); }
}

console.log(`\n${pass} passed, ${fail} failed, ${CASES.length + 1} checks total`);
if (failures.length) console.log('Failing: ' + failures.join(', '));
process.exit(fail ? 1 : 0);
