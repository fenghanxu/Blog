#!/usr/bin/env node
/* ============================================================
   只读展示站构建脚本

   用法：
     node tools/build-site.js [备份 JSON 路径]

   默认读取 content/blog-export.json，输出到 site/。
   site/ 是纯静态产物，可以整目录删除，不会影响后台页面。
   ============================================================ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'site');
const SRC = path.join(ROOT, 'tools', 'site-assets');
const CONTENT = path.join(ROOT, 'content');

const argv = process.argv.slice(2);
const inputArg = argv.find((item) => !item.startsWith('--'));
const inputPath = path.resolve(inputArg || path.join(CONTENT, 'blog-export.json'));

const site = JSON.parse(fs.readFileSync(path.join(CONTENT, 'site.json'), 'utf8'));
const BASE_URL = String(site.baseUrl || '').replace(/\/+$/, '');
const HOME_PATH = (() => {
  try {
    const { pathname } = new URL(BASE_URL);
    return pathname.endsWith('/') ? pathname : pathname + '/';
  } catch (error) {
    return '/';
  }
})();
const SITE_NAME = site.name || '字间';
const AUTHOR = site.author || '';
const PER_PAGE = Number(site.perPage) || 20;

// 每次构建都从干净目录开始，避免上次的旧文件残留
fs.rmSync(OUT, { recursive: true, force: true });

const marked = require(path.join(ROOT, 'assets', 'vendor', 'marked.min.js'));

/* ---------------- 小工具 ---------------- */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(target, content) {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '').slice(0, 10);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatShortDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '').slice(0, 10);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatReads(value) {
  const n = Number(value) || 0;
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/* ---------------- 分类 ---------------- */

const DEFAULT_CATEGORY_LABELS = {
  ios: 'iOS',
  oc: 'OC',
  swift: 'Swift',
  swiftui: 'SwiftUI',
  android: '安卓',
  flutter: 'flutter',
  uniapp: 'UniApp',
  java: 'Java',
  html: 'Html',
  kotlin: 'Kotlin',
  miniprogram: '小程序',
  frontend: '前端开发',
  backend: '后端架构',
  ai: 'AI 与工具',
  engineering: '工程效率',
  essay: '随笔'
};

const categoryLabels = new Map(Object.entries(DEFAULT_CATEGORY_LABELS));
(site.categories || []).forEach((item) => {
  if (item && item.id) categoryLabels.set(item.id, item.label || item.id);
});

function categoryLabel(id) {
  return categoryLabels.get(id) || id || '未分类';
}

/* ---------------- 读取数据 ---------------- */

const backup = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const rawArticles = (backup.articles || []).filter((item) => item && item.title);
const rawImages = backup.images || [];

if (!rawArticles.length) {
  console.error(`备份里没有文章：${inputPath}`);
  process.exit(1);
}

/* ---------------- 文章链接（确定性、可保持） ---------------- */

const slugFile = path.join(CONTENT, 'slugs.json');
let slugMap = {};
if (fs.existsSync(slugFile)) {
  try {
    const saved = JSON.parse(fs.readFileSync(slugFile, 'utf8'));
    slugMap = saved && typeof saved === 'object' ? saved : {};
  } catch (error) {
    console.warn('slugs.json 读取失败，将重新生成：' + error.message);
  }
}

function baseSlug(article) {
  const title = String(article.title || '').trim();

  // 链接就是文章标题（小写、空格转连字符、去掉文件名和 URL 里不安全的字符）
  const cleaned = title
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%{}^~\[\]`]/g, ' ')
    .replace(/[，,。.、；;：:！!？?（）()【】《》「」'"“”‘’…—·]/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[ 　]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/[-.]+$/g, '');
  if (cleaned.length >= 2) return cleaned;

  const compact = String(article.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  return 'post' + (compact ? '-' + compact : '');
}

const usedSlugs = new Set();
const articles = rawArticles.map((article) => {
  let slug = slugMap[article.id];
  if (!slug) {
    const base = baseSlug(article);
    slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    slugMap[article.id] = slug;
  }
  usedSlugs.add(slug);
  return { ...article, slug };
});

writeFile(slugFile, JSON.stringify(slugMap, null, 2) + '\n');

/* ---------------- 图片 ---------------- */

const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
const imageFiles = new Map();

rawImages.forEach((image) => {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(String(image.dataUrl || ''));
  if (!match) return;
  const ext = IMG_EXT[match[1]] || 'bin';
  const fileName = `${String(image.id).replace(/[^a-z0-9._-]/gi, '')}.${ext}`;
  writeFile(path.join(OUT, 'images', fileName), Buffer.from(match[2], 'base64'));
  imageFiles.set(image.id, fileName);
});

/* ---------------- 远程图片：下载到本地，避免外链防盗链 ---------------- */

const REMOTE_CACHE = path.join(CONTENT, 'media', 'remote');
const remoteFiles = new Map();

function extFromUrl(url) {
  try {
    const name = new URL(url).pathname;
    const match = /\.(png|jpe?g|gif|webp|avif|svg)$/i.exec(name);
    if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  } catch (error) {
    // 忽略非法 URL
  }
  return '';
}

function sniffExt(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.slice(0, 3).toString() === 'GIF') return 'gif';
  if (buffer.slice(8, 12).toString() === 'WEBP') return 'webp';
  return 'png';
}

function cacheRemoteImage(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const known = ['png', 'jpg', 'gif', 'webp', 'avif', 'svg'].find((ext) => fs.existsSync(path.join(REMOTE_CACHE, `${key}.${ext}`)));
  if (known) return `${key}.${known}`;

  const tmp = path.join(os.tmpdir(), `blog-remote-${key}`);
  try {
    execFileSync('curl', ['-sSfL', '--max-time', '30', '-A', 'Mozilla/5.0 (compatible; site-build)', '-o', tmp, url], { stdio: 'ignore' });
    const buffer = fs.readFileSync(tmp);
    if (!buffer.length) return null;
    const ext = extFromUrl(url) || sniffExt(buffer);
    const name = `${key}.${ext}`;
    ensureDir(REMOTE_CACHE);
    fs.writeFileSync(path.join(REMOTE_CACHE, name), buffer);
    return name;
  } catch (error) {
    return null;
  }
}

const remoteUrls = new Set();
rawArticles.forEach((article) => {
  const body = String(article.body || '');
  const patterns = [/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi];
  patterns.forEach((pattern) => {
    let match = pattern.exec(body);
    while (match) {
      remoteUrls.add(match[1].replace(/&amp;/g, '&'));
      match = pattern.exec(body);
    }
  });
});

let downloaded = 0;
remoteUrls.forEach((url) => {
  const name = cacheRemoteImage(url);
  if (!name) {
    console.warn('远程图片下载失败，保留原链接：' + url);
    return;
  }
  remoteFiles.set(url, name);
  writeFile(path.join(OUT, 'images', 'media', name), fs.readFileSync(path.join(REMOTE_CACHE, name)));
  downloaded += 1;
});

/* ---------------- 正文渲染 ---------------- */

const EMBED_HOSTS = [
  'player.bilibili.com',
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com'
];

/** 尽量保守地净化一遍正文 HTML：去脚本、去内联事件、只放行白名单视频 iframe。 */
function sanitize(html) {
  let out = String(html || '');
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  out = out.replace(/<\/?(?:link|meta|base|object|embed|form|input|textarea|select)\b[^>]*>/gi, '');
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>|<iframe\b[^>]*\/?>/gi, (tag) => {
    const found = /src\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!found) return '';
    try {
      const url = new URL(found[1].replace(/&amp;/g, '&'));
      if (url.protocol === 'https:' && EMBED_HOSTS.indexOf(url.hostname.toLowerCase()) !== -1) {
        return tag;
      }
    } catch (error) {
      return '';
    }
    return '';
  });
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  out = out.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  return out;
}

function rewriteImages(html) {
  // 本地图片：blog-image/<id> → ../images/<file>
  let out = html.replace(/(src\s*=\s*["'])blog-image\/([^"']+)(["'])/gi, (match, pre, id, post) => {
    const fileName = imageFiles.get(id);
    if (fileName) return `${pre}../images/${fileName}${post}`;
    return `${pre}../images/missing.svg${post}`;
  });

  // 远程图片：构建时已经下载过的，改成站内地址
  out = out.replace(/(src\s*=\s*["'])(https?:\/\/[^"']+)(["'])/gi, (match, pre, url, post) => {
    const local = remoteFiles.get(url.replace(/&amp;/g, '&'));
    return local ? `${pre}../images/media/${local}${post}` : match;
  });

  // 图片统一懒加载
  out = out.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    let next = attrs;
    if (!/\bloading\s*=/i.test(next)) next += ' loading="lazy"';
    if (!/\bdecoding\s*=/i.test(next)) next += ' decoding="async"';
    if (/missing\.svg/.test(next)) {
      next = next.replace(/class\s*=\s*"([^"]*)"/i, 'class="$1 is-missing"');
    }
    return `<img${next}>`;
  });

  return out;
}

function wrapCodeBlocks(html) {
  return html.replace(/<pre><code(?:\s+class="(?:language-)?([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g, (match, lang, code) => {
    const label = String(lang || 'text').replace(/[^a-z0-9+#.-]/gi, '') || 'text';
    return `<div class="code"><div class="code-head"><span>${label}</span>`
      + '<button class="code-copy" type="button">复制代码</button></div>'
      + `<pre><code>${code}</code></pre></div>`;
  });
}

function addHeadingIds(html) {
  const toc = [];
  const out = html.replace(/<h([1-4])(\s[^>]*)?>([\s\S]*?)<\/h\1>/g, (match, level, attrs = '', inner) => {
    const text = stripTags(inner);
    if (!text) return match;
    const id = `heading-${toc.length}`;
    toc.push({ level: Number(level), text, id });
    return `<h${level}${attrs.replace(/\sid="[^"]*"/g, '')} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, toc };
}

function renderBody(article) {
  const markdown = String(article.body || '').replace(/@\[toc\]/gi, '');
  let html;
  try {
    html = marked.parse(markdown);
  } catch (error) {
    html = `<pre>${esc(markdown)}</pre>`;
  }
  html = sanitize(html);
  html = rewriteImages(html);
  html = wrapCodeBlocks(html);
  return addHeadingIds(html);
}

function summaryOf(article) {
  const own = stripTags(article.summary || '').trim();
  if (own) return own;
  const text = stripTags(article.body);
  return text.length > 120 ? text.slice(0, 120).trim() + '…' : text;
}

function coverOf(article, renderedHtml) {
  const local = /<img[^>]+src="\.\.\/images\/([^"]+)"/i.exec(renderedHtml);
  if (local) return `${BASE_URL}/images/${local[1]}`;
  const remote = /<img[^>]+src="(https?:\/\/[^"]+)"/i.exec(renderedHtml);
  if (remote) return remote[1];
  return '';
}

/* ---------------- 模板 ---------------- */

function fill(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

const tplIndex = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const tplPost = fs.readFileSync(path.join(SRC, 'post.html'), 'utf8');
const tpl404 = fs.readFileSync(path.join(SRC, '404.html'), 'utf8');

/* ---------------- 排序与列表数据 ---------------- */

function newestFirst(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

const ordered = [...articles].sort(newestFirst);

const categories = Array.from(
  ordered.reduce((map, article) => {
    const id = article.cat || 'uncategorized';
    if (!map.has(id)) map.set(id, { id, label: categoryLabel(id), count: 0 });
    map.get(id).count += 1;
    return map;
  }, new Map()).values()
);

const tags = Array.from(
  ordered.reduce((map, article) => {
    (article.tags || []).forEach((tag) => {
      const name = String(tag || '').trim();
      if (!name) return;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return map;
  }, new Map())
).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

/* ---------------- 生成文章页 ---------------- */

const built = ordered.map((article) => {
  const { html, toc } = renderBody(article);
  const summary = summaryOf(article);
  const url = `${BASE_URL}/p/${article.slug}.html`;
  const cover = coverOf(article, html);
  return { article, html, toc, summary, url, cover };
});

built.forEach((item, index) => {
  const { article, html, toc, summary, url, cover } = item;
  const prev = built[index - 1];
  const next = built[index + 1];

  const tocHtml = toc.length
    ? toc.map((entry) => `<a href="#${entry.id}" class="lv-${Math.min(4, entry.level)}" data-target="${entry.id}">${esc(entry.text)}</a>`).join('')
    : '<p class="side-empty">这篇文章没有小节标题。</p>';

  const tagHtml = (article.tags || []).length
    ? article.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')
    : '';

  const adjacent = [
    prev ? `<a class="adj-link" href="${prev.article.slug}.html"><span class="adj-label">上一篇</span><b>${esc(prev.article.title)}</b></a>` : '',
    next ? `<a class="adj-link" href="${next.article.slug}.html"><span class="adj-label">下一篇</span><b>${esc(next.article.title)}</b></a>` : ''
  ].filter(Boolean).join('');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: summary,
    datePublished: article.createdAt,
    dateModified: article.updatedAt || article.createdAt,
    author: { '@type': 'Person', name: AUTHOR },
    mainEntityOfPage: url,
    url
  };
  if (cover) jsonLd.image = cover;

  const page = fill(tplPost, {
    SITE_NAME: esc(SITE_NAME),
    TITLE: esc(`${article.title} · ${SITE_NAME}`),
    DESC: esc(summary),
    CANONICAL: esc(url),
    OG_IMAGE: esc(cover),
    OG_IMAGE_TAG: cover ? `<meta property="og:image" content="${esc(cover)}">` : '',
    PUBLISHED: esc(article.createdAt || ''),
    MODIFIED: esc(article.updatedAt || article.createdAt || ''),
    AUTHOR: esc(AUTHOR),
    JSONLD: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
    ARTICLE_TITLE: esc(article.title),
    ARTICLE_SUMMARY: esc(summary),
    ARTICLE_SUMMARY_BLOCK: summary ? `<p class="lead">${esc(summary)}</p>` : '',
    CATEGORY: esc(categoryLabel(article.cat)),
    DATE: esc(formatDate(article.createdAt)),
    READS: esc(formatReads(article.reads)),
    TAGS: tagHtml,
    TAGS_BLOCK: tagHtml ? `<div class="tag-row">${tagHtml}</div>` : '',
    TOC: tocHtml,
    TOC_COUNT: String(toc.length),
    TOC_CARD_HIDDEN: toc.length ? '' : ' hidden',
    CONTENT: html,
    UPDATED: esc(formatDate(article.updatedAt || article.createdAt)),
    ADJACENT: adjacent ? `<section class="side-card"><h2 class="side-title">相邻文章</h2><div class="adj-list">${adjacent}</div></section>` : ''
  });

  writeFile(path.join(OUT, 'p', `${article.slug}.html`), page);
});

/* ---------------- 生成列表页 ---------------- */

const listData = {
  perPage: PER_PAGE,
  categories,
  tags,
  articles: built.map(({ article, summary, url }) => ({
    id: article.id,
    title: article.title,
    summary,
    cat: article.cat || '',
    catLabel: categoryLabel(article.cat),
    tags: article.tags || [],
    createdAt: article.createdAt || '',
    reads: Number(article.reads) || 0,
    likes: Number(article.likes) || 0,
    pinnedAt: article.pinnedAt || '',
    url: `p/${article.slug}.html`,
    absUrl: url
  }))
};

const staticRows = built.map(({ article, summary }) => `
      <a class="row" href="p/${article.slug}.html">
        <span class="row-cat"><span class="category-badge">${esc(categoryLabel(article.cat))}</span></span>
        <span class="row-main">
          <h2 class="title">${esc(article.title)}</h2>
          <p class="summary">${esc(summary || '暂无摘要')}</p>
          <span class="tags">${(article.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</span>
        </span>
        <span class="row-side"><span class="meta"><span>${esc(formatShortDate(article.createdAt))}</span><span class="dot">·</span><span>阅读 ${esc(formatReads(article.reads))}</span></span></span>
      </a>`).join('');

const indexPage = fill(tplIndex, {
  SITE_NAME: esc(SITE_NAME),
  TITLE: esc(`${SITE_NAME} · ${site.tagline || ''}`.replace(/ · $/, '')),
  DESC: esc(site.description || ''),
  CANONICAL: esc(`${BASE_URL}/`),
  TAGLINE: esc(site.tagline || ''),
  AUTHOR: esc(AUTHOR),
  DATA_JSON: JSON.stringify(listData).replace(/</g, '\\u003c'),
  STATIC_ROWS: staticRows,
  TOTAL: String(built.length),
  YEAR: String(new Date().getFullYear())
});

writeFile(path.join(OUT, 'index.html'), indexPage);

/* ---------------- 404 ---------------- */

writeFile(path.join(OUT, '404.html'), fill(tpl404, {
  SITE_NAME: esc(SITE_NAME),
  HOME: esc(HOME_PATH),
  CANONICAL: esc(`${BASE_URL}/404.html`)
}));

/* ---------------- 静态资源 ---------------- */

['site.css', 'index.js', 'post.js', 'favicon.svg'].forEach((name) => {
  const target = name.endsWith('.css') ? path.join(OUT, 'assets', 'css', name)
    : name.endsWith('.js') ? path.join(OUT, 'assets', 'js', name)
      : path.join(OUT, name);
  writeFile(target, fs.readFileSync(path.join(SRC, name)));
});

writeFile(path.join(OUT, 'images', 'missing.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#f6f2ff"/><text x="320" y="188" font-family="sans-serif" font-size="18" fill="#a99cc4" text-anchor="middle">图片缺失</text></svg>`);

/* ---------------- 字体：能子集化就子集化 ---------------- */

const FONT_SOURCES = [{ file: 'KirakaraMaru.ttf', family: 'ArticleFont' }];

function collectGlyphText() {
  const chunks = [SITE_NAME, site.tagline || '', site.description || '', AUTHOR, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'];
  const punct = '，。、；：？！“”‘’（）《》【】…—·~～・,.:;?!()[]{}+-=*/\\|@#$%^&_"\'<>';
  chunks.push(punct);
  built.forEach(({ article, summary }) => {
    chunks.push(article.title || '', summary || '', categoryLabel(article.cat), (article.tags || []).join(''));
    chunks.push(stripTags(article.body));
  });
  return Array.from(new Set(chunks.join('').split(''))).join('');
}

function subsetFont(source, target) {
  const textFile = path.join(os.tmpdir(), 'blog-site-glyphs.txt');
  fs.writeFileSync(textFile, collectGlyphText());
  ensureDir(path.dirname(target));
  const runners = [
    ['python3', ['-m', 'fontTools.subset']],
    ['pyftsubset', []]
  ];
  for (const [bin, prefix] of runners) {
    try {
      execFileSync(bin, [...prefix, source,
        `--text-file=${textFile}`,
        '--flavor=woff2',
        `--output-file=${target}`,
        '--no-hinting',
        '--desubroutinize',
        '--layout-features=*',
        '--drop-tables+=DSIG'
      ], { stdio: 'ignore' });
      if (fs.existsSync(target) && fs.statSync(target).size > 0) return true;
    } catch (error) {
      // 换下一个可执行文件
    }
  }
  return false;
}

let fontUsed = 'ttf';
for (const font of FONT_SOURCES) {
  const source = path.join(ROOT, 'assets', 'fonts', font.file);
  if (!fs.existsSync(source)) continue;
  const woff2Name = font.file.replace(/\.ttf$/i, '.woff2');
  const target = path.join(OUT, 'assets', 'fonts', woff2Name);
  if (subsetFont(source, target)) {
    fontUsed = 'woff2';
    console.log(`字体子集：${font.file} → ${woff2Name}（${Math.round(fs.statSync(target).size / 1024)} KB）`);
  } else {
    writeFile(path.join(OUT, 'assets', 'fonts', font.file), fs.readFileSync(source));
    console.log(`字体子集不可用（需要 fonttools + brotli），已直接复制 ${font.file}`);
  }
}

/* ---------------- 样式：复制后台 CSS，仅产物内替换字体地址 ---------------- */

function copyCss(sourceName, targetName, fontExt) {
  let css = fs.readFileSync(path.join(ROOT, 'assets', 'css', sourceName), 'utf8');
  if (fontExt === 'woff2') {
    css = css.replace(/url\("\.\.\/fonts\/KirakaraMaru\.ttf"\) format\("truetype"\)/g, 'url("../fonts/KirakaraMaru.woff2") format("woff2")');
  }
  writeFile(path.join(OUT, 'assets', 'css', targetName), css);
}

copyCss('list.css', 'list.css', fontUsed);
copyCss('detail.css', 'detail.css', fontUsed);

/* ---------------- 收录与站点地图 ---------------- */

writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);

const sitemapUrls = [`${BASE_URL}/`, ...built.map(({ url }) => url)];
writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((url) => `  <url><loc>${esc(url)}</loc></url>`).join('\n')}
</urlset>
`);

/* ---------------- 完成 ---------------- */

console.log(`\n已生成 ${built.length} 篇文章 → ${path.relative(process.cwd(), OUT)}/`);
console.log(`分类 ${categories.length} 个，标签 ${tags.length} 个，图片 ${imageFiles.size} 张`);
console.log(`入口：${path.relative(process.cwd(), path.join(OUT, 'index.html'))}`);
