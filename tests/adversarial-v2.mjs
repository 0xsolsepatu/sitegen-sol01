// Adversarial suite (fresh, v2): hand-built cases from SPEC sentences the practice
// set never exercises. Each case's expected answer is the baseline vendor build()
// itself (program/generator/oracle.js); the entry must match as canonical JSON, and
// must throw exactly when the vendor throws. Usage: node tests/adversarial-v2.mjs
import { createHash } from 'node:crypto';
import { run as oracleRun } from '../../makefun-sitegen-kit/site-generator-speed-01-run-20261122-kit/program/generator/oracle.js';
import { run as entryRun } from '../solve.js';

const canon = (v) => JSON.stringify(v, (k, val) => {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const o = {};
    for (const key of Object.keys(val).sort()) o[key] = val[key];
    return o;
  }
  return val;
});

const T = (site, templates, files) => ({ site, templates, files });
const SITE = (over = {}) => ({ title: 'S', base_url: 'https://x.example/blog/', per_page: 2, recent: 3, ...over });
const STD = {
  post: '<article><h1>{{ page.title }}</h1>{{{ page.content }}}<p>{{ page.date_long }} / {{ page.reading_minutes }}m</p>{% if page.newer %}N:{{ page.newer.title }}{% endif %}{% if page.older %}O:{{ page.older.title }}{% endif %}</article>',
  page: '<section><h1>{{ page.title }}</h1>{{{ page.content }}}{% for t in page.tags %}[{{ t.name }}|{{ t.slug }}|{{ t.url }}]{% endfor %}</section>',
  index: '<main>{% for p in posts %}<a href="{{ p.url }}">{{ p.title }}</a>{% endfor %}<span>{{ pager.number }}/{{ pager.total }} {{ pager.newer_url }} {{ pager.older_url }}</span></main>',
  tag: '<div>{{ tag.name }} {{ tag.count }}{% for p in tag.posts %}{{ p.title }},{% endfor %}</div>',
  tags: '<ul>{% for t in tags %}<li>{{ t.name }} {{ t.count }}</li>{% endfor %}</ul>',
};
const md = (path, content) => ({ path, content });

const cases = [];
const add = (name, input) => cases.push({ name, input });

// --- front matter ---
add('fm-no-front-matter', T(SITE(), STD, [md('a.md', 'title: No\n\nBody\n')]));
add('fm-unclosed', T(SITE(), STD, [md('a.md', '---\ntitle: X\nBody\n')]));
add('fm-unknown-key', T(SITE(), STD, [md('a.md', '---\ntitle: X\nbogus: 1\n---\nBody\n')]));
add('fm-duplicate-key', T(SITE(), STD, [md('a.md', '---\ntitle: X\ntitle: Y\n---\nBody\n')]));
add('fm-empty-value', T(SITE(), STD, [md('a.md', '---\ntitle:\n---\nBody\n')]));
add('fm-bad-line-number', T(SITE(), STD, [md('a.md', '---\ntitle: X\nnot a kv line\n---\nBody\n')]));
add('fm-bad-date-leap', T(SITE(), STD, [md('posts/p.md', '---\ntitle: X\ndate: 2023-02-29\n---\nBody\n')]));
add('fm-bad-date-range', T(SITE(), STD, [md('posts/p.md', '---\ntitle: X\ndate: 1969-12-31\n---\nBody\n')]));
add('fm-date-2099-ok', T(SITE(), STD, [md('posts/p.md', '---\ntitle: X\ndate: 2099-12-31\n---\nBody\n')]));
add('fm-quoted-escapes', T(SITE(), STD, [md('a.md', '---\ntitle: "a \\"b\\" c \\\\ d"\n---\nBody\n')]));
add('fm-stray-quote', T(SITE(), STD, [md('a.md', '---\ntitle: "a "b" c"\n---\nBody\n')]));
add('fm-bad-escape', T(SITE(), STD, [md('a.md', '---\ntitle: "a \\n b"\n---\nBody\n')]));
add('fm-unclosed-quote', T(SITE(), STD, [md('a.md', '---\ntitle: "abc\n---\nBody\n')]));
add('fm-bare-bracket', T(SITE(), STD, [md('a.md', '---\ntitle: [abc]\n---\nBody\n')]));
add('fm-tags-not-list', T(SITE(), STD, [md('a.md', '---\ntitle: X\ntags: a, b\n---\nBody\n')]));
add('fm-tags-empty-item', T(SITE(), STD, [md('a.md', '---\ntitle: X\ntags: [a, , b]\n---\nBody\n')]));
add('fm-tags-bad-char', T(SITE(), STD, [md('a.md', '---\ntitle: X\ntags: [a"b]\n---\nBody\n')]));
add('fm-tags-empty-list', T(SITE(), STD, [md('a.md', '---\ntitle: X\ntags: []\n---\nBody\n')]));
add('fm-tags-spaces-list', T(SITE(), STD, [md('a.md', '---\ntitle: X\ntags: [   ]\n---\nBody\n')]));
add('fm-draft-bad', T(SITE(), STD, [md('a.md', '---\ntitle: X\ndraft: yes\n---\nBody\n')]));
add('fm-layout-bad-name', T(SITE(), STD, [md('a.md', '---\ntitle: X\nlayout: My_Layout\n---\nBody\n')]));
add('fm-slug-too-long', T(SITE(), STD, [md('a.md', '---\ntitle: X\nslug: ' + 'a'.repeat(65) + '\n---\nBody\n')]));
add('fm-slug-bad', T(SITE(), STD, [md('a.md', '---\ntitle: X\nslug: Foo_Bar\n---\nBody\n')]));
add('fm-no-title-after-errors', T(SITE(), STD, [md('a.md', '---\nsummary: only\n---\nBody\n')]));
add('fm-comments-blanks', T(SITE(), STD, [md('a.md', '---\n# a comment\n\ntitle: X\n  \n# another\n---\nBody\n')]));
add('fm-value-trailing-spaces', T(SITE(), STD, [md('a.md', '---\ntitle: X   \n---\nBody\n')]));
add('fm-key-colon-nospace', T(SITE(), STD, [md('a.md', '---\ntitle:X\n---\nBody\n')]));

// --- markdown blocks ---
const mdBody = (body) => T(SITE(), { ...STD, page: '<div>{{{ page.content }}}</div>' }, [md('a.md', `---\ntitle: T\n---\n${body}`)]);
add('md-fence-bad-lang', mdBody('```c++\nint x;\n```\n\n```bad lang!\ncode\n```\n'));
add('md-fence-unclosed', mdBody('```js\nconst x = 1;\n'));
add('md-fence-empty', mdBody('```\n\n```\n'));
add('md-heading-7', mdBody('####### Not a heading\n\n# Real\n'));
add('md-heading-empty', mdBody('# \n\n##  Hi  \n'));
add('md-heading-closing-hashes', mdBody('## Title ##\n'));
add('md-hr-variants', mdBody('Text\n\n---\n\nMore\n\n***\n\nEnd\n'));
add('md-setext-underline', mdBody('Some text\n===\n\nOther\n'));
add('md-blockquote', mdBody('> first\n>\n> second\n>\n> \n\n>only\n'));
add('md-blockquote-empty', mdBody('>\n>\n\nAfter\n'));
add('md-list-ordered-start', mdBody('3. three\n4. four\n'));
add('md-list-continuation', mdBody('- one\n  continued line\n- two\n'));
add('md-list-mixed-markers', mdBody('- a\n* b\n- c\n'));
add('md-list-ordered-in-bullet', mdBody('- a\n1. one\n- b\n'));
add('md-list-bullet-in-ordered', mdBody('1. one\n- bullet\n2. two\n'));
add('md-list-big-number', mdBody('1234567890. too long\n\n123456789. ok\n'));
add('md-paragraph-ends', mdBody('para one\nstill para\n# Heading\n\npara two\n```\ncode\n```\n'));
add('md-indented-not-code', mdBody('    indented text\n\n\t tabbed\n'));

// --- markdown inline ---
add('md-inline-unclosed-backtick', mdBody('a `code b\n'));
add('md-inline-empty-codespan', mdBody('a `` b `x` c\n'));
add('md-inline-double-backtick', mdBody('a ``x`` b\n'));
add('md-inline-strong-unclosed', mdBody('a **bold b\n'));
add('md-inline-em-single-star', mdBody('a *em* b **strong** c *x\n'));
add('md-inline-em-star-run', mdBody('a ***x*** b\n'));
add('md-inline-underscore', mdBody('a _em_ b __x__ c\n'));
add('md-inline-link-unclosed-paren', mdBody('[text](target\n\n[a](x.md) [b] [c](y\n'));
add('md-inline-link-bare-brackets', mdBody('[a] [b] [c\n'));
add('build-slug-leading-dashes', T(SITE(), STD, [
  md('posts/a.md', '---\ntitle: --hello-- world--\ndate: 2026-01-01\n---\nA\n'),
  md('posts/b.md', '---\ntitle: ' + 'a'.repeat(63) + '-bbbbbbbbbb\ndate: 2026-01-02\n---\nB\n'),
  md('posts/c.md', '---\ntitle: !!!\ndate: 2026-01-03\n---\nC\n'),
  md('posts/d.md', '---\ntitle: a--b---c\ndate: 2026-01-04\n---\nD\n'),
]));
add('build-slug-exact-64', T(SITE(), STD, [
  md('posts/a.md', '---\ntitle: ' + 'x'.repeat(64) + '\ndate: 2026-01-01\n---\nA\n'),
  md('posts/b.md', '---\ntitle: ' + 'y'.repeat(65) + '\ndate: 2026-01-02\n---\nB\n'),
]));
add('md-inline-link-empty-target', mdBody('[t]()\n'));
add('md-inline-link-escaped-bracket', mdBody('[a \\] b](x.md)\n'));
add('md-inline-link-nested', mdBody('[a **b** c](x.md)\n'));
add('md-inline-link-no-paren', mdBody('[t] (x.md)\n'));
add('md-inline-backslash-all', mdBody('\\\\ \\` \\* \\_ \\[ \\] \\( \\) \\# \\+ \\- \\. \\! \\> \\q \\a\n'));
add('md-inline-raw-html', mdBody('<b>bold</b> & <script>alert(1)</script>\n'));
add('md-inline-link-scheme', mdBody('[a](https://example.com/x) [b](mailto:a@b.c) [c](#frag) [d](/abs)\n'));

// --- link resolution ---
add('links-mixed', T(SITE(), { ...STD, page: '<div>{{{ page.content }}}</div>' }, [
  md('docs/a.md', '---\ntitle: A\n---\n[up](../posts/p.md) [same](b.md) [static](../assets/s.css) [draft](../posts/d.md) [missing](nope.md) [frag](b.md#sec) [above](../../x.md) [root-frag](#top)\n'),
  md('docs/b.md', '---\ntitle: B\n---\nB body\n'),
  md('posts/p.md', '---\ntitle: P\ndate: 2026-01-02\n---\nP body\n'),
  md('posts/d.md', '---\ntitle: D\ndate: 2026-01-03\ndraft: true\n---\nD body\n'),
  { path: 'assets/s.css', content: 'body{}' },
]));

// --- templates ---
const tpl = (templates, files = [md('a.md', '---\ntitle: T\n---\nBody\n')]) => T(SITE(), templates, files);
add('tpl-unclosed-var', tpl({ ...STD, page: 'A {{ page.title' }));
add('tpl-unclosed-raw', tpl({ ...STD, page: 'A {{{ page.title' }));
add('tpl-unclosed-tag', tpl({ ...STD, page: 'A {% if page.title %}' }));
add('tpl-bad-path', tpl({ ...STD, page: 'A {{ 1abc }}' }));
add('tpl-unknown-tag', tpl({ ...STD, page: 'A {% frobnicate %}' }));
add('tpl-else-outside', tpl({ ...STD, page: 'A {% else %} B' }));
add('tpl-endfor-no-for', tpl({ ...STD, page: 'A {% endfor %}' }));
add('tpl-endif-no-if', tpl({ ...STD, page: 'A {% endif %}' }));
add('tpl-unclosed-for', tpl({ ...STD, page: 'A {% for x in page.tags %} {{ x }}' }));
add('tpl-unclosed-if', tpl({ ...STD, page: 'A {% if page.title %} yes' }));
add('tpl-for-extra-spaces', tpl({ ...STD, page: 'A {%  for  x  in  y  %} B' }));
add('tpl-if-not', tpl({ ...STD, page: '{% if not page.tags %}none{% else %}some{% endif %}' }));
add('tpl-for-non-array', tpl({ ...STD, page: '{% for x in page.title %} {{ x }} {% endfor %}done' }));
add('tpl-loop-vars', tpl({ ...STD, index: '{% for p in posts %}{{ loop.index }}:{{ loop.first }}:{{ loop.last }}:{{ loop.length }};{% endfor %}' }));
add('tpl-include-missing', tpl({ ...STD, page: 'A {% include "nope" %} B' }));
add('tpl-include-depth', tpl({
  ...STD,
  page: 'P {% include "a1" %}',
  a1: '1 {% include "a2" %}',
  a2: '2 {% include "a3" %}',
  a3: '3 {% include "a4" %}',
  a4: '4 {% include "a5" %}',
  a5: '5 {% include "a6" %}',
  a6: '6 {% include "a7" %}',
  a7: '7 {% include "a8" %}',
  a8: '8 {% include "a9" %}',
  a9: '9 {% include "a10" %}',
  a10: '10',
}));
add('tpl-include-bad-name', tpl({ ...STD, page: 'A {% include "UPPER" %} B' }));
add('tpl-standalone-tag', tpl({ ...STD, page: 'line1\n  {% if page.title %}  \nYES\n  {% endif %}  \nline2\n' }));
add('tpl-tag-not-standalone', tpl({ ...STD, page: 'x {% if page.title %}Y{% endif %} z\n' }));
add('tpl-standalone-eof', tpl({ ...STD, page: 'before\n{% if page.title %}' }));
add('tpl-textof-types', tpl({ ...STD, page: '{{ page.tags }}|{{ site.recent }}|{{ page.is_post }}|{{ page.missing }}|{{ page.toc }}' }));
add('tpl-nested-for-if', tpl({ ...STD, index: '{% for p in posts %}{% if p.tags %}T{% else %}F{% endif %}{% endfor %}' }));
add('tpl-var-spaces', tpl({ ...STD, page: 'A {{   page.title   }} B' }));
add('tpl-brace-literal', tpl({ ...STD, page: 'A { B } C {x} D {{ page.title }}' }));

// --- build pipeline ---
add('build-slug-collision', T(SITE(), STD, [
  md('posts/a.md', '---\ntitle: Same\ndate: 2026-01-01\n---\nA\n'),
  md('posts/b.md', '---\ntitle: Same\ndate: 2026-01-02\n---\nB\n'),
  md('posts/c.md', '---\ntitle: Same\ndate: 2026-01-03\nslug: same\n---\nC\n'),
]));
add('build-root-reserved-slug', T(SITE(), STD, [
  md('posts.md', '---\ntitle: Posts\n---\nP\n'),
  md('tags.md', '---\ntitle: Tags\n---\nT\n'),
  md('page.md', '---\ntitle: Page\n---\nG\n'),
]));
add('build-post-no-date', T(SITE(), STD, [md('posts/x.md', '---\ntitle: X\n---\nBody\n')]));
add('build-tags-page-dirs-refused', T(SITE(), STD, [
  md('tags/x.md', '---\ntitle: X\n---\nBody\n'),
  md('page/2/x.md', '---\ntitle: X\n---\nBody\n'),
  md('posts/ok.md', '---\ntitle: OK\ndate: 2026-01-01\n---\nBody\n'),
]));
add('build-draft', T(SITE(), STD, [
  md('posts/d.md', '---\ntitle: D\ndate: 2026-01-01\ndraft: true\n---\nBody\n'),
  md('posts/k.md', '---\ntitle: K\ndate: 2026-01-02\n---\nBody\n'),
]));
add('build-layout-missing', T(SITE(), STD, [md('a.md', '---\ntitle: X\nlayout: nope\n---\nBody\n')]));
add('build-layout-explicit', T(SITE(), { ...STD, custom: 'CUSTOM {{ page.title }}' }, [md('a.md', '---\ntitle: X\nlayout: custom\n---\nBody\n')]));
add('build-shadowed-static', T(SITE(), STD, [
  md('a.md', '---\ntitle: A\n---\nBody\n'),
  { path: 'a/index.html', content: 'STATIC' },
  { path: 'index.html', content: 'ALSO STATIC' },
]));
add('build-per-page-exact', T(SITE({ per_page: 2 }), STD, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\nA\n'),
  md('posts/b.md', '---\ntitle: B\ndate: 2026-01-02\n---\nB\n'),
  md('posts/c.md', '---\ntitle: C\ndate: 2026-01-03\n---\nC\n'),
  md('posts/d.md', '---\ntitle: D\ndate: 2026-01-04\n---\nD\n'),
]));
add('build-no-posts', T(SITE(), STD, [md('a.md', '---\ntitle: A\n---\nBody\n')]));
add('build-recent-negative', T(SITE({ recent: -1 }), STD, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\nA\n'),
  md('posts/b.md', '---\ntitle: B\ndate: 2026-01-02\n---\nB\n'),
]));
add('build-recent-zero', T(SITE({ recent: 0 }), STD, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\nA\n'),
]));
add('build-base-trailing-slashes', T(SITE({ base_url: 'https://x.example/blog///' }), STD, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\nA\n'),
]));
add('build-base-empty', T(SITE({ base_url: '' }), STD, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\nA\n'),
]));
add('build-crlf', T(SITE(), STD, [md('posts/a.md', '---\r\ntitle: A\r\ndate: 2026-01-01\r\n---\r\nLine one\r\nLine two\r\n')]));
add('build-tag-dedupe-spelling', T(SITE(), STD, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\ntags: [Rust, rust, RUST, Go]\n---\nA\n'),
  md('posts/b.md', '---\ntitle: B\ndate: 2026-01-02\ntags: [go, Rust]\n---\nB\n'),
]));
add('build-tag-only-on-page', T(SITE(), STD, [
  md('a.md', '---\ntitle: A\ntags: [Lonely]\n---\nBody\n'),
]));
add('build-unicode-title-slug', T(SITE(), STD, [
  md('posts/a.md', '---\ntitle: Café Zürich — naïve résumé\n---\nA\n'),
  md('posts/b.md', '---\ntitle: Ｗｉｄｅ ﬁnal ﬀ\n---\nB\n'),
  md('posts/c.md', '---\ntitle: Δέλτα Москва 東京\n---\nC\n'),
]));
add('build-heading-ids-unique', T(SITE(), { ...STD, page: '<div>{{{ page.content }}}|{% for h in page.toc %}{{ h.level }}:{{ h.id }}:{{ h.html }};{% endfor %}</div>' }, [
  md('a.md', '---\ntitle: T\n---\n## Same\n\n## Same\n\n### Same\n\n# Top\n'),
]));
add('build-excerpt-first-para', T(SITE(), { ...STD, page: '<div>{{ page.excerpt }}</div>' }, [
  md('a.md', '---\ntitle: T\n---\n## Heading first\n\nFirst para *em*.\n\nSecond para.\n'),
]));
add('build-excerpt-no-para', T(SITE(), { ...STD, page: '<div>{{ page.excerpt }}</div>' }, [
  md('a.md', '---\ntitle: T\n---\n## Only heading\n'),
]));
add('build-same-date-order', T(SITE(), STD, [
  md('posts/b.md', '---\ntitle: Bee\ndate: 2026-01-01\n---\nB\n'),
  md('posts/a.md', '---\ntitle: Aye\ndate: 2026-01-01\n---\nA\n'),
  md('posts/c.md', '---\ntitle: Cee\ndate: 2026-01-01\n---\nC\n'),
]));
add('build-empty-body', T(SITE(), STD, [md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\n')]));
add('build-no-files', T(SITE(), STD, []));
add('build-only-statics', T(SITE(), STD, [{ path: 'x.txt', content: 'hi' }]));
add('build-broken-template-kept', T(SITE(), { ...STD, post: 'BROKEN {{ ' }, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\nA\n'),
  md('b.md', '---\ntitle: B\n---\nB\n'),
]));
add('build-index-template-missing', T(SITE(), { post: STD.post, page: STD.page, tag: STD.tag, tags: STD.tags }, [
  md('posts/a.md', '---\ntitle: A\ndate: 2026-01-01\n---\nA\n'),
]));

let pass = 0;
let fail = 0;
for (const { name, input } of cases) {
  let want, got, wantErr = null, gotErr = null;
  try { want = oracleRun(structuredClone(input)); } catch (e) { wantErr = `${e.constructor.name}: ${e.message}`; }
  try { got = entryRun(structuredClone(input)); } catch (e) { gotErr = `${e.constructor.name}: ${e.message}`; }
  const ok = wantErr === null
    ? gotErr === null && canon(got) === canon(want)
    : gotErr === wantErr;
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}`);
    if (wantErr !== null || gotErr !== null) console.log(`  oracle err: ${wantErr}\n  entry err:  ${gotErr}`);
    else {
      const wk = Object.keys(want), gk = Object.keys(got);
      const diffs = [...new Set([...wk, ...gk])].filter((k) => canon(want[k]) !== canon(got[k]));
      console.log(`  differing paths (${diffs.length}):`, diffs.slice(0, 5));
      for (const k of diffs.slice(0, 2)) {
        console.log(`  got ${k}:`, JSON.stringify(String(got[k] ?? '')).slice(0, 300));
        console.log(`  exp ${k}:`, JSON.stringify(String(want[k] ?? '')).slice(0, 300));
      }
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed, ${cases.length} total`);
process.exit(fail === 0 ? 0 : 1);
