/* ============================================================
   全站共享工具
   - 分类定义 / 日期格式化 / 查询参数 / 文本处理
   ============================================================ */
(() => {
  'use strict';

  const DEFAULT_CATEGORIES = [
    { id: 'ios', label: 'iOS' },
    { id: 'oc', label: 'OC' },
    { id: 'swift', label: 'Swift' },
    { id: 'swiftui', label: 'SwiftUI' },
    { id: 'android', label: '安卓' },
    { id: 'flutter', label: 'flutter' },
    { id: 'uniapp', label: 'UniApp' },
    { id: 'java', label: 'Java' },
    { id: 'html', label: 'Html' },
    { id: 'kotlin', label: 'Kotlin' },
    { id: 'miniprogram', label: '小程序' }
  ];

  const CATEGORY_STORAGE_KEY = 'zjian.categories';
  const CATEGORY_LIMIT = 30;
  const CATEGORIES = [];
  const CATEGORY_LABEL = {};
  const LEGACY_CATEGORY_LABEL = { frontend: '前端开发', backend: '后端架构', ai: 'AI 与工具', engineering: '工程效率', essay: '随笔' };
  const DEFAULT_TAGS = ['Extension', '扩展', '技术分享', 'UI'];
  const TAG_STORAGE_KEY = 'zjian.tags';
  const TAG_LIMIT = 30;
  const TAGS = [];

  function cleanCategoryLabel(value) {
    return Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, 16).join('');
  }

  function normalizeCategories(list) {
    const rows = [];
    const ids = new Set();
    const labels = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const label = cleanCategoryLabel(item?.label);
      const key = label.toLowerCase();
      let id = typeof item?.id === 'string' ? item.id.trim() : '';
      if (!label || labels.has(key) || rows.length >= CATEGORY_LIMIT) return;
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) id = `cat-${createId()}`;
      ids.add(id);
      labels.add(key);
      rows.push({ id, label });
    });
    return rows;
  }

  function rebuildCategoryLabels() {
    Object.keys(CATEGORY_LABEL).forEach((key) => delete CATEGORY_LABEL[key]);
    CATEGORIES.forEach((item) => { CATEGORY_LABEL[item.id] = item.label; });
  }

  function persistCategories() {
    try {
      localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(CATEGORIES));
    } catch (error) {
      throw new Error('浏览器禁用了本地存储，分类无法保存');
    }
  }

  function applyCategories(list, persist = false) {
    const rows = normalizeCategories(list);
    if (!rows.length) throw new Error('至少需要保留一个分类');
    CATEGORIES.splice(0, CATEGORIES.length, ...rows);
    rebuildCategoryLabels();
    if (persist) persistCategories();
    return getCategories();
  }

  function loadCategories() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY) || 'null');
    } catch (error) {
      stored = null;
    }
    const rows = normalizeCategories(stored);
    CATEGORIES.splice(0, CATEGORIES.length, ...(rows.length ? rows : DEFAULT_CATEGORIES));
    rebuildCategoryLabels();
  }

  function getCategories() {
    return CATEGORIES.map((item) => ({ ...item }));
  }

  function addCategory(value) {
    const label = cleanCategoryLabel(value);
    if (!label) throw new Error('请输入分类名称');
    if (CATEGORIES.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
      throw new Error('这个分类已经存在');
    }
    if (CATEGORIES.length >= CATEGORY_LIMIT) throw new Error(`最多只能创建 ${CATEGORY_LIMIT} 个分类`);
    const id = `cat-${createId()}`;
    CATEGORIES.push({ id, label });
    persistCategories();
    rebuildCategoryLabels();
    return { id, label };
  }

  function renameCategory(id, value) {
    const current = CATEGORIES.find((item) => item.id === id);
    if (!current) throw new Error('分类不存在或已被删除');
    const label = cleanCategoryLabel(value);
    if (!label) throw new Error('请输入分类名称');
    if (CATEGORIES.some((item) => item.id !== id && item.label.toLowerCase() === label.toLowerCase())) {
      throw new Error('这个分类已经存在');
    }
    current.label = label;
    persistCategories();
    rebuildCategoryLabels();
    return { ...current };
  }

  function deleteCategory(id) {
    if (CATEGORIES.length <= 1) throw new Error('至少需要保留一个分类');
    const index = CATEGORIES.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('分类不存在或已被删除');
    CATEGORIES.splice(index, 1);
    persistCategories();
    rebuildCategoryLabels();
  }

  function normalizeTags(list) {
    const rows = [];
    const labels = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const label = cleanCategoryLabel(typeof item === 'string' ? item : item?.label);
      const key = label.toLowerCase();
      if (!label || labels.has(key) || rows.length >= TAG_LIMIT) return;
      labels.add(key);
      rows.push(label);
    });
    return rows;
  }

  function persistTags() {
    try {
      localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(TAGS));
    } catch (error) {
      throw new Error('浏览器禁用了本地存储，标签无法保存');
    }
  }

  function loadTags() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(TAG_STORAGE_KEY) || 'null');
    } catch (error) {
      stored = null;
    }
    const rows = normalizeTags(stored);
    TAGS.splice(0, TAGS.length, ...(Array.isArray(stored) ? rows : DEFAULT_TAGS));
  }

  function getTags() {
    return TAGS.slice();
  }

  function applyTags(list) {
    const rows = normalizeTags(list);
    TAGS.splice(0, TAGS.length, ...rows);
    persistTags();
    return getTags();
  }

  function addTag(value) {
    const label = cleanCategoryLabel(value);
    if (!label) throw new Error('请输入标签名称');
    if (TAGS.some((tag) => tag.toLowerCase() === label.toLowerCase())) {
      throw new Error('这个标签已经存在');
    }
    if (TAGS.length >= TAG_LIMIT) throw new Error(`最多只能创建 ${TAG_LIMIT} 个标签`);
    TAGS.push(label);
    persistTags();
    return label;
  }

  function deleteTag(value) {
    const key = cleanCategoryLabel(value).toLowerCase();
    const index = TAGS.findIndex((tag) => tag.toLowerCase() === key);
    if (index < 0) throw new Error('标签不存在或已被删除');
    TAGS.splice(index, 1);
    persistTags();
  }

  loadCategories();
  loadTags();

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

  function summarize(markdown, max = 150) {
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

  /* ---------------- 网络图片本地化 ---------------- */
  const REMOTE_IMAGE_PATTERN = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/gi;
  const PROXY_HOSTS = new Set([
    'i-blog.csdnimg.cn',
    'img-blog.csdnimg.cn',
    'i.csdn.net',
    'csdnimg.cn',
    'img-blog.csdn.net'
  ]);

  function isRemoteImageUrl(src) {
    const url = parseUrl(src);
    return Boolean(url && /^https?:$/.test(url.protocol));
  }

  /** 找出 Markdown / HTML 里的图片地址，保持首次出现顺序。 */
  function collectRemoteImages(markdown) {
    const text = String(markdown || '');
    const found = [];
    const seen = new Set();
    const add = (src, alt = '') => {
      const clean = String(src || '').replace(/&amp;/g, '&').trim();
      if (!isRemoteImageUrl(clean) || seen.has(clean)) return;
      seen.add(clean);
      found.push({ src: clean, alt: String(alt || '').trim() || '网络图片' });
    };

    let match;
    REMOTE_IMAGE_PATTERN.lastIndex = 0;
    while ((match = REMOTE_IMAGE_PATTERN.exec(text))) add(match[2], match[1]);

    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('img[src]').forEach((img) => add(img.getAttribute('src'), img.getAttribute('alt')));
    return found;
  }

  function proxyImageUrl(src) {
    const url = parseUrl(src);
    if (!url || !PROXY_HOSTS.has(url.hostname.toLowerCase())) return '';
    return `https://images.weserv.nl/?url=${encodeURIComponent(url.href)}`;
  }

  function imageExtension(blobUrl, fallback = 'png') {
    try {
      const ext = new URL(blobUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
      return /^(png|jpe?g|gif|webp|avif|svg)$/.test(ext || '') ? ext : fallback;
    } catch (error) {
      return fallback;
    }
  }

  async function downloadRemoteImage(src, options = {}) {
    // 清理和保留原图分开复用缓存，避免旧原图被误当作已清理图片。
    const existing = await window.BlogDB.findImageBySource(src, (image) => (
      options.cleanWatermark
        ? image.watermarkStatus === 'cleaned' && image.watermarkMode === (options.mode || 'fill')
        : image.watermarkStatus !== 'cleaned'
    )).catch(() => null);
    if (existing) return existing;

    const attempts = [{ url: src, mode: 'cors' }];
    const proxy = proxyImageUrl(src);
    if (proxy) attempts.push({ url: proxy, mode: 'cors' });

    let lastError = null;
    for (const attempt of attempts) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(attempt.url, {
          mode: attempt.mode,
          credentials: 'omit',
          redirect: 'follow',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`图片服务器返回 ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error('图片文件为空');
        if (blob.size > 10 * 1024 * 1024) throw new Error('图片超过 10MB，无法保存到本地');
        if (blob.type && !blob.type.startsWith('image/')) throw new Error('返回内容不是图片');

        const finalType = blob.type || `image/${imageExtension(src)}`;
        const ext = imageExtension(src, finalType.split('/')[1] || 'png');
        const name = `csdn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
        let processed = blob;
        if (options.cleanWatermark && window.BlogWatermark) {
          processed = await window.BlogWatermark.process(blob, options);
        }
        const record = await window.BlogDB.addImage(new File([processed], name, { type: processed.type || finalType }), {
          name,
          sourceUrl: src,
          watermarkStatus: options.cleanWatermark ? 'cleaned' : 'original',
          watermarkMode: options.cleanWatermark ? (options.mode || 'fill') : ''
        });
        return record;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error(lastError?.name === 'AbortError' ? '下载超时' : (lastError?.message || '下载失败'));
  }

  const remoteImageTool = {
    collectRemoteImages,
    downloadRemoteImage,
    previewUrl: (src) => proxyImageUrl(src) || src
  };

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
    return CATEGORY_LABEL[id] || LEGACY_CATEGORY_LABEL[id] || '未分类';
  }

  window.BlogUtil = {
    CATEGORIES,
    CATEGORY_LABEL,
    addCategory,
    applyCategories,
    addTag,
    applyTags,
    categoryLabel,
    blobToDataUrl,
    createId,
    createImageResolver,
    deleteCategory,
    deleteTag,
    escapeHtml,
    formatDate,
    formatListDate,
    formatReads,
    getCategories,
    getTags,
    localImageId,
    localImageIds,
    pad2,
    parseTags,
    parseVideoLink,
    queryParam,
    renameCategory,
    remoteImageTool,
    sanitizeHtml,
    stripMarkdown,
    summarize
  };
})();
