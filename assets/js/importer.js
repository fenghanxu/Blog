/* ============================================================
   文章导入：把 CSDN 复制的富文本 / Markdown 转成可编辑正文，
   并把网络图片存入 IndexedDB 图片仓库。
   ============================================================ */
(() => {
  'use strict';

  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'FORM', 'BUTTON', 'INPUT', 'SVG']);
  const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'FIGURE']);

  function escapeLinkText(text) {
    return String(text || '').replace(/([\[\]])/g, '\\$1');
  }

  function textOf(node) {
    return String(node?.textContent || '').replace(/\u00a0/g, ' ');
  }

  function cleanInline(text) {
    return String(text || '')
      .replace(/[\t\r\f\v]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  function decodeHtmlEntities(text) {
    const area = document.createElement('textarea');
    area.innerHTML = String(text || '');
    return area.value;
  }

  function normalizeImageUrl(src, base = 'https://blog.csdn.net/') {
    if (!src) return '';
    try {
      const url = new URL(decodeHtmlEntities(src), base);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function wrapMarkdown(text, marker, prefix = '') {
    const value = String(text || '').trim();
    if (!value) return '';
    return `${prefix}${marker}${value}${marker}`;
  }

  function codeText(node) {
    return textOf(node).replace(/\u00a0/g, ' ').replace(/\s+$/g, '');
  }

  function inlineToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '').replace(/\u00a0/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName;
    if (DROP_TAGS.has(tag)) return '';

    if (tag === 'BR') return '\n';
    if (tag === 'IMG') {
      const src = normalizeImageUrl(node.getAttribute('data-src') || node.getAttribute('src'));
      if (!src) return '';
      const alt = cleanInline(node.getAttribute('alt') || node.getAttribute('title') || '图片');
      return `![${escapeLinkText(alt)}](${src})`;
    }

    const content = Array.from(node.childNodes).map(inlineToMarkdown).join('');
    switch (tag) {
      case 'STRONG':
      case 'B': return wrapMarkdown(content, '**');
      case 'EM':
      case 'I': return wrapMarkdown(content, '*');
      case 'DEL':
      case 'S': return wrapMarkdown(content, '~~');
      case 'CODE': return content.trim() ? `\`${content.replace(/`/g, '\\`')}\`` : '';
      case 'A': {
        const href = node.getAttribute('href');
        const label = content.trim() || cleanInline(href || '');
        if (!href || !label) return label;
        return `[${label}](${href.replace(/\s/g, '%20')})`;
      }
      case 'SUP': return content ? `<sup>${content}</sup>` : '';
      case 'SUB': return content ? `<sub>${content}</sub>` : '';
      default: return content;
    }
  }

  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
      Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
        inlineToMarkdown(cell).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()
      )
    ).filter((row) => row.length);
    if (!rows.length) return '';
    const width = Math.max(...rows.map((row) => row.length));
    const padded = rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
    const header = padded.shift();
    return [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...padded.map((row) => `| ${row.join(' | ')} |`)
    ].join('\n');
  }

  function blockToMarkdown(node, listDepth = 0, listType = '', listIndex = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = cleanInline(node.nodeValue);
      return value;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName;
    if (DROP_TAGS.has(tag)) return '';
    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
      return `${'#'.repeat(Number(tag[1]))} ${inlineToMarkdown(node).trim()}`;
    }
    if (tag === 'P') return inlineToMarkdown(node).trim();
    if (BLOCK_TAGS.has(tag)) {
      if (tag === 'FIGURE') return blockToMarkdown(node.querySelector('img') || node);
      return Array.from(node.childNodes).map((child) => blockToMarkdown(child, listDepth, listType, listIndex)).filter(Boolean).join('\n\n');
    }
    if (tag === 'PRE') {
      const code = node.querySelector('code');
      const className = code?.className || '';
      const language = (className.match(/language-([\w-]+)/) || className.match(/lang-([\w-]+)/) || [])[1] || '';
      const body = codeText(code || node).replace(/\n{3,}/g, '\n\n');
      return `\`\`\`${language}\n${body}\n\`\`\``;
    }
    if (tag === 'BLOCKQUOTE') {
      const inner = Array.from(node.childNodes).map((child) => blockToMarkdown(child)).filter(Boolean).join('\n\n');
      return inner.split('\n').map((line) => `> ${line}`).join('\n');
    }
    if (tag === 'HR') return '---';
    if (tag === 'BR') return '';
    if (tag === 'UL' || tag === 'OL') {
      const items = Array.from(node.children).filter((child) => child.tagName === 'LI');
      return items.map((li, index) => {
        const marker = tag === 'OL' ? `${index + 1}. ` : '- ';
        const nested = Array.from(li.children).filter((child) => child.tagName === 'UL' || child.tagName === 'OL');
        const direct = Array.from(li.childNodes)
          .filter((child) => !(child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'UL' || child.tagName === 'OL')))
          .map((child) => blockToMarkdown(child, listDepth + 1, tag, index)).filter(Boolean).join(' ').trim();
        const indent = '  '.repeat(listDepth);
        const lines = [`${indent}${marker}${direct || ''}`.trimEnd()];
        nested.forEach((sub) => lines.push(blockToMarkdown(sub, listDepth + 1)));
        return lines.join('\n');
      }).join('\n');
    }
    if (tag === 'LI') return inlineToMarkdown(node).trim();
    if (tag === 'TABLE') return tableToMarkdown(node);
    if (tag === 'IMG') return inlineToMarkdown(node);
    if (tag === 'BR') return '';
    if (tag === 'STRONG' || tag === 'EM' || tag === 'DEL' || tag === 'S' || tag === 'CODE' || tag === 'A' || tag === 'SUP' || tag === 'SUB') {
      return inlineToMarkdown(node);
    }

    const blocks = Array.from(node.childNodes).map((child) => blockToMarkdown(child, listDepth, listType, listIndex)).filter(Boolean);
    const inline = inlineToMarkdown(node).trim();
    return inline && !blocks.length ? inline : blocks.join('\n\n');
  }

  function nodesToMarkdown(nodes) {
    return Array.from(nodes).map((node) => blockToMarkdown(node)).filter(Boolean).join('\n\n');
  }

  /** 去掉 CSDN 页面外围的导航、推荐、评论与广告，只取文章正文。 */
  function prepareHtml(content) {
    if (!window.DOMPurify) return String(content || '');
    return window.DOMPurify.sanitize(String(content || ''), {
      ADD_TAGS: ['source'],
      ADD_ATTR: ['data-src', 'data-original', 'colspan', 'rowspan', 'align', 'class'],
      FORBID_TAGS: ['script', 'style', 'template', 'noscript', 'form', 'button', 'input', 'svg', 'iframe'],
      ALLOW_DATA_ATTR: false
    });
  }

  function htmlToMarkdown(html) {
    if (!html || !String(html).trim()) return '';
    const clean = prepareHtml(html);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = clean;

    const root = wrapper.querySelector('#content_views, .blog-content-box, article, [itemprop="articleBody"]') || wrapper;
    root.querySelectorAll('.hljs-button, .code-toolbar, .toolbar, .recommend-box, .comment-box, .hide-preCode-bt, .pre-numbering, .MathJax').forEach((el) => el.remove());
    root.querySelectorAll('img').forEach((img) => {
      const src = normalizeImageUrl(img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src'));
      if (src) img.setAttribute('src', src);
      img.removeAttribute('data-src');
      img.removeAttribute('data-original');
    });

    const markdown = nodesToMarkdown(root.children.length ? root.children : root.childNodes)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return markdown;
  }

  function looksLikeHtml(text) {
    return /<(p|div|h[1-6]|img|pre|table|ul|ol|article|section)\b/i.test(String(text || ''));
  }

  function looksLikeMarkdown(text) {
    return /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|```|>\s|!\[)/.test(String(text || ''));
  }

  /** CSDN 编辑器里偶尔会出现 `![文字]([图片地址](图片地址))` 这类嵌套写法。 */
  function normalizeMarkdown(markdown) {
    return String(markdown || '')
      .replace(/!\[([^\]]*)\]\s*\\?\(\s*\[[^\]]*\]\s*\(\s*([^\s)]+)\s*\)\s*\\?\)/g, '![$1]($2)')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** 接受 HTML / Markdown / CSDN 页面 HTML，输出统一 Markdown。 */
  function convertToMarkdown(payload) {
    const html = String(payload?.html || '').trim();
    if (html) return normalizeMarkdown(htmlToMarkdown(html));
    return normalizeMarkdown(payload?.markdown);
  }

  function extractTitle(payload) {
    const html = String(payload?.html || '').trim();
    if (html) {
      const doc = new DOMParser().parseFromString(prepareHtml(html), 'text/html');
      const title = doc.querySelector('#articleContentId, h1.title-article, h1, [itemprop="headline"]')?.textContent;
      if (title?.trim()) return cleanInline(title).slice(0, 100);
    }
    const markdownTitle = String(payload?.markdown || '').match(/^#\s+(.+)$/m)?.[1];
    return markdownTitle?.trim()?.slice(0, 100) || '';
  }

  function replaceImageSources(markdown, replacements) {
    let next = String(markdown || '');
    replacements.forEach(({ source, id }) => {
      const target = `blog-image/${encodeURIComponent(id)}`;
      next = next.split(source).join(target);
    });
    return next;
  }

  async function localizeImages(markdown, { onProgress, urls = null, cleanWatermark = false, watermarkMode = 'fill' } = {}) {
    const allowed = urls ? new Set(urls) : null;
    const images = window.BlogUtil.remoteImageTool.collectRemoteImages(markdown)
      .filter((image) => !allowed || allowed.has(image.src));
    if (!images.length) return { markdown, total: 0, saved: [], failed: [] };

    const saved = [];
    const failed = [];
    let completed = 0;

    for (const image of images) {
      try {
        const record = await window.BlogUtil.remoteImageTool.downloadRemoteImage(image.src, {
          cleanWatermark: cleanWatermark && window.BlogWatermark.isCsdnImage(image.src),
          mode: watermarkMode
        });
        saved.push({ source: image.src, id: record.id, alt: image.alt });
      } catch (error) {
        failed.push({ source: image.src, alt: image.alt, reason: error.message || '下载失败' });
      }
      completed += 1;
      onProgress?.({ completed, total: images.length, saved: saved.length, failed: failed.length });
    }

    return { markdown: replaceImageSources(markdown, saved), total: images.length, saved, failed };
  }

  window.BlogImporter = {
    convertToMarkdown,
    extractTitle,
    htmlToMarkdown,
    localizeImages,
    looksLikeHtml,
    looksLikeMarkdown,
    normalizeMarkdown,
    replaceImageSource: (markdown, source, id) => String(markdown || '').split(source).join(`blog-image/${encodeURIComponent(id)}`)
  };
})();
