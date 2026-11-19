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
    queryParam,
    stripMarkdown,
    summarize
  };
})();
