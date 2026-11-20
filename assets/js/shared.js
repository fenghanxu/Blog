/* ============================================================
   全站共享工具
   - 分类定义 / 日期格式化 / 查询参数 / 文本处理
   ============================================================ */
(() => {
  'use strict';

  const CATEGORIES = [
    { id: 'frontend', label: '前端开发' },
    { id: 'backend', label: '后端架构' },
    { id: 'ai', label: 'AI 与工具' },
    { id: 'engineering', label: '工程效率' },
    { id: 'essay', label: '随笔' }
  ];

  const CATEGORY_LABEL = CATEGORIES.reduce((map, item) => {
    map[item.id] = item.label;
    return map;
  }, {});

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const pad2 = (value) => String(value).padStart(2, '0');

  function formatDate(value, withTime = false) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    if (!withTime) return day;
    return `${day} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function formatListDate(value) {
    return formatDate(value).replace(/-/g, '.');
  }

  const formatReads = (value) => {
    const number = Number(value) || 0;
    return number >= 1000 ? `${(number / 1000).toFixed(1)}k` : String(number);
  };

  function parseTags(value) {
    if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
    return String(value || '')
      .split(/[,，、\n]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function stripMarkdown(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/@\[TOC\]/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#>*_~`|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function summarize(markdown, max = 72) {
    const text = stripMarkdown(markdown);
    if (!text) return '';
    const chars = Array.from(text);
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
  }

  function queryParam(name, fallback = '') {
    return new URLSearchParams(window.location.search).get(name) || fallback;
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function localImageId(src) {
    const match = /^blog-image\/([^/?#]+)$/.exec(String(src || ''));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function localImageIds(markdown) {
    const ids = [];
    const pattern = /blog-image\/([^\s)"'<>]+)/g;
    let match = pattern.exec(String(markdown || ''));
    while (match) {
      ids.push(decodeURIComponent(match[1]));
      match = pattern.exec(String(markdown || ''));
    }
    return Array.from(new Set(ids));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
      reader.readAsDataURL(blob);
    });
  }

  function createImageResolver() {
    const urls = new Map();
    const pending = new Map();

    async function resolveOne(id) {
      if (urls.has(id)) return urls.get(id);
      if (pending.has(id)) return pending.get(id);

      const task = (async () => {
        try {
          const image = await window.BlogDB.getImage(id);
          if (!image || !image.blob) return '';
          const url = URL.createObjectURL(image.blob);
          urls.set(id, url);
          return url;
        } catch (error) {
          return '';
        }
      })();

      pending.set(id, task);
      const url = await task;
      pending.delete(id);
      return url;
    }

    return async function resolveImages(root) {
      if (!root || !window.BlogDB) return;
      const images = Array.from(root.querySelectorAll('img'));
      await Promise.all(images.map(async (img) => {
        const id = localImageId(img.getAttribute('src'));
        if (!id) return;
        const url = await resolveOne(id);
        if (url) {
          img.src = url;
          img.classList.remove('is-missing');
        } else {
          img.removeAttribute('src');
          img.classList.add('is-missing');
          img.alt = `${img.alt || '图片'}（本地图片缺失）`;
        }
      }));
    };
  }

  /* ---------------- 视频嵌入 ---------------- */
  const EMBED_HOSTS = [
    'player.bilibili.com',
    'www.bilibili.com',
    'm.bilibili.com',
    'www.youtube.com',
    'www.youtube-nocookie.com',
    'player.vimeo.com'
  ];

  function parseUrl(value, base) {
    try {
      return base ? new URL(String(value || ''), base) : new URL(String(value || '').trim());
    } catch (error) {
      return null;
    }
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function embedFrame(src) {
    return '<div class="video-embed"><iframe src="' + escapeAttr(src) + '" title="视频播放器" '
      + 'scrolling="no" frameborder="0" allowfullscreen loading="lazy"></iframe></div>';
  }

  /**
   * 把粘贴的链接识别成可写进正文的播放器片段。
   * 返回 { html, label } / { error } / null
   */
  function parseVideoLink(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'https://' + text;
    const url = parseUrl(withScheme);
    if (!url) return null;

    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const path = url.pathname;

    if (host === 'bilibili.com' || host === 'm.bilibili.com') {
      const bv = /\/video\/(BV[0-9A-Za-z]+)/.exec(path);
      const av = /\/video\/av(\d+)/i.exec(path);
      if (!bv && !av) return { error: '这个 B 站链接里没有找到视频号（BV / av）' };
      const page = Math.max(1, Number(url.searchParams.get('p')) || 1);
      const key = bv ? 'bvid=' + bv[1] : 'aid=' + av[1];
      return {
        label: ' B 站播放器',
        html: embedFrame('https://player.bilibili.com/player.html?' + key + '&page=' + page + '&high_quality=1&danmaku=1&autoplay=0')
      };
    }

    if (host === 'b23.tv') {
      return { error: 'b23.tv 短链接要先在浏览器打开，复制跳转后的 bilibili.com/video/BV... 地址再插入' };
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      const shortId = host === 'youtu.be' ? path.slice(1).split('/')[0] : '';
      const shorts = (/\/shorts\/([^/?#]+)/.exec(path) || [])[1] || '';
      const id = shortId || url.searchParams.get('v') || shorts;
      if (!id) return { error: '这个 YouTube 链接里没有找到视频 ID' };
      const start = Number(url.searchParams.get('t')) || 0;
      return {
        label: ' YouTube 播放器',
        html: embedFrame('https://www.youtube.com/embed/' + encodeURIComponent(id) + '?rel=0' + (start > 0 ? '&start=' + start : ''))
      };
    }

    if (host === 'vimeo.com') {
      const id = (/^\/(\d+)/.exec(path) || [])[1];
      if (!id) return { error: '这个 Vimeo 链接里没有找到视频 ID' };
      return { label: ' Vimeo 播放器', html: embedFrame('https://player.vimeo.com/video/' + id) };
    }

    if (/\.(mp4|webm|ogv|ogg|mov|m4v)($|[?#])/i.test(path + url.search)) {
      return {
        label: '视频文件',
        html: '<video controls preload="metadata" playsinline src="' + escapeAttr(url.href) + '"></video>'
      };
    }

    return null;
  }

  let sanitizeHooksReady = false;

  function ensureSanitizeHooks() {
    if (sanitizeHooksReady || !window.DOMPurify) return;
    sanitizeHooksReady = true;

    window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName !== 'IFRAME') return;
      const src = parseUrl(node.getAttribute('src'), window.location.href);
      const host = src ? src.hostname.toLowerCase() : '';
      if (!src || src.protocol !== 'https:' || !EMBED_HOSTS.includes(host)) {
        node.remove();
        return;
      }
      node.setAttribute('frameborder', '0');
      node.setAttribute('scrolling', 'no');
      node.setAttribute('allowfullscreen', '');
      node.setAttribute('loading', 'lazy');
    });
  }

  /** 统一净化正文 HTML：放行白名单域名的视频 iframe，其余保持默认策略。 */
  function sanitizeHtml(html) {
    if (!window.DOMPurify) return html;
    ensureSanitizeHooks();
    return window.DOMPurify.sanitize(html, {
      ADD_TAGS: ['iframe'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'loading', 'referrerpolicy']
    });
  }

  function categoryLabel(id) {
    return CATEGORY_LABEL[id] || '未分类';
  }

  window.BlogUtil = {
    CATEGORIES,
    CATEGORY_LABEL,
    categoryLabel,
    blobToDataUrl,
    createId,
    createImageResolver,
    escapeHtml,
    formatDate,
    formatListDate,
    formatReads,
    localImageId,
    localImageIds,
    pad2,
    parseTags,
    parseVideoLink,
    queryParam,
    sanitizeHtml,
    stripMarkdown,
    summarize
  };
})();
