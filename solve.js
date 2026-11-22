// site-generator-speed entry: byte-exact reimplementation of makefun-site 1.0.0's
// build(input), optimised for speed. Dependency-free ES module, exports run(input).
// Optimisations vs the baseline (all semantics copied from vendor/makefun-site):
//  - inline Markdown: fused lex+render (no token objects), run-buffered escaping
//    (one escape pass per text run, never per character), range-based recursive
//    inline parser (no substring slicing for nested strong/em/link).
//  - slugify: regex-based, cached per distinct string, ASCII fast path (no NFKD).
//  - wordsOf / cardOf computed once per source (baseline: wordsOf twice per page).
//  - front matter parsed by index scanning (no whole-text split for the body).
//  - template nodes use integer kinds; scope lookup via Object.hasOwn on the chain.

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const RESERVED = ['posts', 'tags', 'page'];
const REPORT_FILE = 'build-report.txt';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------------------------------------------------------------- text

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_TEST = /[&<>"']/;
const ESC_RE = /[&<>"']/g;

/** escapeHtml on a whole string: identity fast path when nothing is special. */
function escapeHtmlStr(text) {
  return ESC_TEST.test(text) ? text.replace(ESC_RE, (c) => ESCAPES[c]) : text;
}

/** escapeHtml on s[a..b): slice once, escape only if a special char is present. */
function escapeRange(s, a, b) {
  if (a >= b) return '';
  const seg = s.slice(a, b);
  return ESC_TEST.test(seg) ? seg.replace(ESC_RE, (c) => ESCAPES[c]) : seg;
}

const SLUG_MAX = 64;
const slugCache = new Map();
const NON_ASCII = /[^\x00-\x7F]/;
const NON_ALNUM_RUN = /[^A-Za-z0-9]+/g;

/** slugify, byte-identical to lib/text.js. Cached per distinct input string. */
function slugify(text) {
  const hit = slugCache.get(text);
  if (hit !== undefined) return hit;
  let plain = text;
  if (NON_ASCII.test(text)) plain = text.normalize('NFKD').replace(/\p{M}/gu, '');
  // Runs of non-[a-z0-9] become one '-'; leading/trailing runs dropped (baseline's
  // gap flag only fires once output is non-empty, and a trailing gap emits nothing).
  let out = plain.replace(NON_ALNUM_RUN, '-');
  if (out.startsWith('-')) out = out.slice(1);
  if (out.endsWith('-')) out = out.slice(0, -1);
  out = out.toLowerCase();
  out = out.slice(0, SLUG_MAX);
  if (out.endsWith('-')) out = out.slice(0, -1);
  if (out === '') out = 'untitled';
  slugCache.set(text, out);
  return out;
}

function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

function longDate(date) {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** wordsOf, byte-identical to lib/text.js via /\S+/g: count runs of non-whitespace. Manual scan (exact JS \s set: \t\n\v\f\r space U+00A0 U+1680 U+2000-U+200A U+2028 U+2029 U+202F U+205F U+3000 U+FEFF) — measured ~30% faster than String.match(/\S+/g) on the practice bodies (19-21 ms vs 28-33 ms per pass, 5 rounds, exact agreement on all 1070 bodies + tricky strings). */
function wordsOf(text) {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const ws = c === 32 || c === 9 || c === 10 || c === 11 || c === 12 || c === 13 || c === 160 || c === 5760 || (c >= 8192 && c <= 8202) || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
    if (ws) inWord = false;
    else if (!inWord) {
      inWord = true;
      n++;
    }
  }
  return n;
}

function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

// ---------------------------------------------------------------- front matter

const KEYS = new Set(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);
const LINE = /^([a-z_]+):(?: (.*))?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME = /^[a-z0-9-]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG = /^[^"[\]]+$/;
const TRAIL_WS = /[ \t]+$/;

function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function stringOf(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: 'a bare string opens on [' };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      if (tags.some((t) => t === '' || !TAG.test(t))) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return NAME.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return SLUG_RE.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

/** parseFrontMatter, index-scanned (no split of the whole text): {data, body} or {error}. */
function parseFrontMatter(text) {
  const firstNL = text.indexOf('\n');
  const firstLine = firstNL === -1 ? text : text.slice(0, firstNL);
  if (firstLine !== '---') return { error: 'no front matter' };
  // Find the closing '---' line; track its start and the newline after it.
  let closeStart = -1;
  let closeNL = -1;
  let pos = firstNL === -1 ? text.length : firstNL + 1;
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    if (end - pos === 3 && text[pos] === '-' && text[pos + 1] === '-' && text[pos + 2] === '-') {
      closeStart = pos;
      closeNL = nl;
      break;
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (closeStart === -1) return { error: 'the front matter is not closed' };
  const data = {};
  let lineNo = 1; // line number of the line starting at `pos` below (opening --- is 1)
  pos = firstNL === -1 ? text.length : firstNL + 1;
  while (pos < closeStart) {
    lineNo++;
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? text.length : nl;
    const line = text.slice(pos, end);
    if (line !== '' && !/^[ \t]*$/.test(line) && !line.startsWith('#')) {
      const m = LINE.exec(line);
      if (!m) return { error: `line ${lineNo} is not "key: value"` };
      const key = m[1];
      const raw = (m[2] ?? '').replace(TRAIL_WS, '');
      if (!KEYS.has(key)) return { error: `unknown key "${key}"` };
      if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
      if (raw === '') return { error: `key "${key}" has no value` };
      const v = valueOf(key, raw);
      if ('error' in v) return v;
      data[key] = v.value;
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body: closeNL === -1 ? '' : text.slice(closeNL + 1) };
}

// ---------------------------------------------------------------- Markdown

const BLANK = /^[ \t]*$/;
const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;

function trimLine(line) {
  let a = 0;
  let b = line.length;
  while (a < b && (line[a] === ' ' || line[a] === '\t')) a++;
  while (b > a && (line[b - 1] === ' ' || line[b - 1] === '\t')) b--;
  return a === 0 && b === line.length ? line : line.slice(a, b);
}

function headingOf(line) {
  if (line[0] !== '#') return null;
  const m = HEADING.exec(line);
  return m === null || m[2] === '' ? null : { depth: m[1].length, text: m[2] };
}

function endsParagraph(line) {
  if (BLANK.test(line)) return true;
  if (line.startsWith('```') && FENCE_OPEN.test(line)) return true;
  if (headingOf(line) !== null) return true;
  if ((line[0] === '-' || line[0] === '*') && HR.test(line)) return true;
  return false;
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);
const WS_TEST = /\s/;

/** First index in [from, end) where `what` occurs outside a backslash escape, or -1. */
function findUnescaped(s, what, from, end) {
  const wl = what.length;
  for (let j = from; j <= end - wl; j++) {
    if (s[j] === '\\' && j + 1 < end && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

/** First single * in [from, end) (one whose run is not **), outside an escape, or -1. */
function findSingleStar(s, from, end) {
  for (let j = from; j < end; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < end && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (c !== '*') continue;
    if (j + 1 < end && s[j + 1] === '*') {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

/**
 * Inline rendering of s[a..b), exactly as lib/markdown.js inline() on s.slice(a, b).
 * Plain runs are buffered and escaped in one pass; delimiters recurse by range
 * (no substring allocation for nested content).
 */
function inlineStr(s, a, b, link) {
  let out = '';
  let plain = a;
  let i = a;
  while (i < b) {
    const c = s[i];
    if (c === '\\' && i + 1 < b && ESCAPABLE.has(s[i + 1])) {
      out += escapeRange(s, plain, i);
      const n = s[i + 1];
      out += n === '>' ? '&gt;' : n;
      i += 2;
      plain = i;
      continue;
    }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j !== -1 && j < b && j > i + 1) {
        out += escapeRange(s, plain, i);
        out += '<code>' + escapeRange(s, i + 1, j) + '</code>';
        i = j + 1;
        plain = i;
      } else {
        i++; // lone backtick is plain text
      }
      continue;
    }
    if (c === '*') {
      if (i + 1 < b && s[i + 1] === '*') {
        const j = findUnescaped(s, '**', i + 2, b);
        if (j !== -1 && j > i + 2) {
          out += escapeRange(s, plain, i);
          out += '<strong>' + inlineStr(s, i + 2, j, link) + '</strong>';
          i = j + 2;
          plain = i;
        } else {
          i += 2; // '**' with no closer is plain text
        }
        continue;
      }
      const j = findSingleStar(s, i + 1, b);
      if (j !== -1 && j > i + 1) {
        out += escapeRange(s, plain, i);
        out += '<em>' + inlineStr(s, i + 1, j, link) + '</em>';
        i = j + 1;
        plain = i;
      } else {
        i++; // '*' with no closer is plain text
      }
      continue;
    }
    if (c === '[') {
      const k = findUnescaped(s, ']', i + 1, b);
      let m = -1;
      if (k !== -1 && k + 1 < b && s[k + 1] === '(') {
        const r = s.indexOf(')', k + 2);
        if (r !== -1 && r < b) m = r;
      }
      if (m !== -1) {
        const target = s.slice(k + 2, m);
        if (target !== '' && !WS_TEST.test(target)) {
          out += escapeRange(s, plain, i);
          out += '<a href="' + escapeHtmlStr(link(target)) + '">' + inlineStr(s, i + 1, k, link) + '</a>';
          i = m + 1;
          plain = i;
          continue;
        }
      }
      i++; // '[' with no valid link is plain text
      continue;
    }
    i++;
  }
  out += escapeRange(s, plain, b);
  return out;
}

/** Fused lex+render: {html, toc, excerpt}, exactly as renderMarkdown(). */
function renderMarkdown(src, link) {
  const lines = src.split('\n');
  const ids = new Set();
  const toc = [];
  let excerpt = null;
  let html = '';
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i];
    if (BLANK.test(line)) {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        let code = '';
        i++;
        while (i < n && !FENCE_CLOSE.test(lines[i])) code += escapeHtmlStr(lines[i++]) + '\n';
        i++;
        const cls = fence[1] === '' ? '' : ` class="language-${escapeHtmlStr(fence[1])}"`;
        html += `<pre><code${cls}>${code}</code></pre>\n`;
        continue;
      }
    }
    const heading = headingOf(line);
    if (heading !== null) {
      const id = uniqueSlug(slugify(heading.text), ids);
      const h = inlineStr(heading.text, 0, heading.text.length, link);
      html += `<h${heading.depth} id="${id}">${h}</h${heading.depth}>\n`;
      if (heading.depth === 2 || heading.depth === 3) toc.push({ level: heading.depth, id, html: h });
      i++;
      continue;
    }
    if ((line[0] === '-' || line[0] === '*') && HR.test(line)) {
      html += '<hr>\n';
      i++;
      continue;
    }
    if (line[0] === '>') {
      const body = [];
      while (i < n && lines[i][0] === '>') {
        const l = lines[i++];
        body.push(l[1] === ' ' ? l.slice(2) : l.slice(1));
      }
      const trimmed = [];
      for (const l of body) {
        const t = trimLine(l);
        if (t !== '') trimmed.push(t);
      }
      if (trimmed.length === 0) html += '<blockquote>\n</blockquote>\n';
      else {
        const qtext = trimmed.join('\n');
        html += `<blockquote>\n<p>${inlineStr(qtext, 0, qtext.length, link)}</p>\n</blockquote>\n`;
      }
      continue;
    }
    let bullet = null;
    let ordered = null;
    if (line[0] === '-' || line[0] === '*') bullet = BULLET.exec(line);
    if (bullet === null && line[0] >= '0' && line[0] <= '9') ordered = ORDERED.exec(line);
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const items = [];
      while (i < n) {
        const m = marker.exec(lines[i]);
        if (m !== null) {
          items.push([trimLine(isOrdered ? m[2] : m[1])]);
          i++;
        } else if (lines[i].startsWith('  ') && CONTINUED.test(lines[i])) {
          items[items.length - 1].push(trimLine(lines[i]));
          i++;
        } else break;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      const open = isOrdered && Number(ordered[1]) !== 1 ? `<ol start="${Number(ordered[1])}">` : `<${tag}>`;
      let block = open + '\n';
      for (const parts of items) {
        const item = parts.join('\n');
        block += `<li>${inlineStr(item, 0, item.length, link)}</li>\n`;
      }
      block += `</${tag}>\n`;
      html += block;
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < n && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    const text = body.join('\n');
    const h = inlineStr(text, 0, text.length, link);
    if (excerpt === null) excerpt = h;
    html += `<p>${h}</p>\n`;
  }
  return { html, toc, excerpt: excerpt ?? '' };
}

// ---------------------------------------------------------------- templates

class TemplateError extends Error {}
const INCLUDE_DEPTH = 8;
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR_RE = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF_RE = /^if (not )?(\S+)$/;
const INCLUDE_RE = /^include "([a-z0-9-]+)"$/;

// Node kinds: 0 text, 1 var, 2 raw, 3 if, 4 for, 5 include, 6 root
const KIND_NAME = { 3: 'if', 4: 'for' };

function pathOf(name, text) {
  if (!PATH_RE.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

function isBlankSpaces(s) {
  for (let k = 0; k < s.length; k++) if (s[k] !== ' ' && s[k] !== '\t') return false;
  return true;
}

function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = isBlankSpaces(src.slice(lineStart, open)) && isBlankSpaces(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

function parseTemplate(name, src) {
  const root = { k: 6, b: [] };
  const stack = [root];
  let body = root.b;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ k: 0, t: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ k: tok.t === 'var' ? 1 : 2, p: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR_RE.exec(tag)) !== null) {
        const node = { k: 4, nm: m[1], p: pathOf(name, m[2]), b: [] };
        body.push(node);
        stack.push(node);
        body = node.b;
      } else if ((m = IF_RE.exec(tag)) !== null) {
        const node = { k: 3, not: m[1] !== undefined, p: pathOf(name, m[2]), th: [], el: null };
        body.push(node);
        stack.push(node);
        body = node.th;
      } else if (tag === 'else') {
        if (top.k !== 3 || top.el !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.el = [];
        body = top.el;
      } else if (tag === 'endfor' || tag === 'endif') {
        const want = tag === 'endfor' ? 4 : 3;
        if (top.k !== want) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.k === 6 ? parent.b : parent.k === 4 ? parent.b : (parent.el ?? parent.th);
      } else if ((m = INCLUDE_RE.exec(tag)) !== null) body.push({ k: 5, nm: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${KIND_NAME[stack[stack.length - 1].k]} is not closed`);
  return root.b;
}

function lookup(scope, path) {
  let s = scope;
  while (s !== null) {
    const vars = s.vars;
    if (Object.hasOwn(vars, path[0])) {
      let v = vars[path[0]];
      for (let k = 1; k < path.length; k++) {
        if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
        v = v[path[k]];
      }
      return v;
    }
    s = s.parent;
  }
  return undefined;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

function renderNodes(nodes, scope, ctx, depth) {
  let out = '';
  for (const n of nodes) {
    switch (n.k) {
      case 0:
        out += n.t;
        break;
      case 1:
        out += escapeHtmlStr(textOf(lookup(scope, n.p)));
        break;
      case 2:
        out += textOf(lookup(scope, n.p));
        break;
      case 3: {
        const v = truthy(lookup(scope, n.p));
        const branch = v !== n.not ? n.th : n.el;
        if (branch !== null) out += renderNodes(branch, scope, ctx, depth);
        break;
      }
      case 4: {
        const xs = lookup(scope, n.p);
        if (!Array.isArray(xs)) break;
        const len = xs.length;
        xs.forEach((x, k) => {
          const vars = { [n.nm]: x, loop: { index: k + 1, first: k === 0, last: k === len - 1, length: len } };
          out += renderNodes(n.b, { vars, parent: scope }, ctx, depth);
        });
        break;
      }
      case 5: {
        const t = ctx.templates.get(n.nm);
        if (t !== undefined && depth < INCLUDE_DEPTH) out += renderNodes(t, scope, ctx, depth + 1);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- build

function linkOf(s) {
  return s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) };
}

export function run(input) {
  const templates = new Map();
  const report = [];
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    try {
      templates.set(name, parseTemplate(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const base = input.site.base_url.replace(/\/+$/, '');
  const output = {};

  // 1. Sources, sorted by path in code-unit order.
  const files = [...input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  let sources = [];
  const statics = [];
  for (const f of files) {
    if (f.path.endsWith('.md')) sources.push({ path: f.path, text: f.content.replace(/\r\n?/g, '\n') });
    else statics.push({ path: f.path, content: f.content });
  }

  // 2. Front matter.
  const kept = [];
  for (const s of sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) {
      report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = RESERVED.find((d) => d !== 'posts' && s.path.startsWith(`${d}/`));
    if (own !== undefined) {
      report.push(`refused ${s.path}: ${own}/ is the generator's own`);
      continue;
    }
    if (s.post && !Object.hasOwn(s.data, 'date')) {
      report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!templates.has(layout)) {
      report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }
  sources = kept;

  // 3. Permalinks.
  const taken = new Map();
  const takenIn = (dir) => {
    if (!taken.has(dir)) taken.set(dir, new Set(dir === '' ? RESERVED : []));
    return taken.get(dir);
  };
  const bySource = new Map();
  for (const s of sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), takenIn(dir));
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${base}/${s.outDir}/`;
    bySource.set(s.path, s);
  }

  // 4. Markdown, links resolved.
  const broken = new Set();
  const staticPaths = new Set(statics.map((f) => f.path));
  for (const s of sources) {
    const dir = dirOf(s.path);
    const link = (target) => {
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('/') || target.startsWith('#')) return target;
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const frag = hash === -1 ? '' : target.slice(hash);
      const path = rel === '' ? null : resolvePath(dir, rel);
      if (path !== null && bySource.has(path)) return `${bySource.get(path).url}${frag}`;
      if (path !== null && staticPaths.has(path)) return `${base}/${path}${frag}`;
      broken.add(`broken-link ${s.path} -> ${target}`);
      return target;
    };
    const md = renderMarkdown(s.body, link);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }

  // 5. Collections.
  const posts = sources.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  posts.forEach((p, k) => {
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  });

  // 6. Tags.
  const bySlug = new Map();
  const ownTags = (s) => {
    const seen = new Set();
    const out = [];
    for (const name of (s.data.tags ?? [])) {
      const slug = slugify(name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push(name);
    }
    return out;
  };
  for (const p of posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const slug = slugify(name);
      if (!bySlug.has(slug)) bySlug.set(slug, { name, slug, url: `${base}/tags/${slug}/`, posts: [] });
      const tag = bySlug.get(slug);
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of sources) {
    if (!s.post) {
      s.tagRefs = ownTags(s).map((name) => {
        const slug = slugify(name);
        return bySlug.get(slug) ?? { name, slug, url: '', posts: [] };
      });
    }
  }
  const tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));

  // 7. Layouts. Card computed once per source and reused (baseline recomputed
  // wordsOf per pageOf call); page objects spread that cached card.
  const cardOf = (s) => {
    if (s.card !== undefined) return s.card;
    s.card = {
      title: s.data.title,
      url: s.url,
      date: s.data.date ?? '',
      date_long: s.data.date === undefined ? '' : longDate(s.data.date),
      summary: s.data.summary ?? '',
      excerpt: s.excerpt,
      reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)),
      tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
    };
    return s.card;
  };
  const cards = new Map(posts.map((p) => [p, cardOf(p)]));
  const site = { title: input.site.title, base_url: base };
  const allTags = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => cards.get(p));
  const ctx = { templates, escape: escapeHtmlStr };
  const render = (name, vars) => {
    const nodes = templates.get(name);
    return nodes === undefined ? null : renderNodes(nodes, { vars: { site, tags: allTags, recent, ...vars }, parent: null }, ctx, 0);
  };
  const pageOf = (s) => ({
    ...cardOf(s),
    slug: s.slug,
    content: s.html,
    toc: s.toc.map((h) => ({ level: h.level, id: h.id, html: h.html })),
    newer: linkOf(s.newer ?? null),
    older: linkOf(s.older ?? null),
    is_post: s.post,
  });
  for (const s of sources) output[`${s.outDir}/index.html`] = render(s.layout, { page: pageOf(s) });
  const per = input.site.per_page;
  const pages = Math.max(1, Math.ceil(posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${base}/` : `${base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: posts.slice((k - 1) * per, k * per).map((p) => cards.get(p)),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of tags) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => cards.get(p)) } });
    if (html !== null) output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) output['tags/index.html'] = tagsHtml;
  for (const f of statics) {
    if (Object.hasOwn(output, f.path)) report.push(`shadowed ${f.path}: a built page has its path`);
    else output[f.path] = f.content;
  }

  // 8. Report.
  const lines = [...report, ...broken].sort(byCodeUnits);
  const pageCount = sources.filter((s) => !s.post).length;
  lines.push(`built ${pageCount} pages, ${posts.length} posts, ${tags.length} tags and ${statics.length} static files`);
  output[REPORT_FILE] = `${lines.join('\n')}\n`;
  return output;
}
