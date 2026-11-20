/* ============================================================
   edit.html 交互
   - Markdown 实时预览 / 分栏拖拽 / 目录生成 / 字数统计
   - 新建 / 编辑文章、IndexedDB 发布、草稿本地保存、快捷导出
   ============================================================ */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const source = $('#source');
  const preview = $('#preview');
  const titleInput = $('#title');
  const titleCount = $('#titleCount');
  const panes = $('#panes');
  const splitter = $('#splitter');
  const tocList = $('#tocList');
  const tocEmpty = $('#tocEmpty');
  const tocBadge = $('#tocBadge');
  const workspace = $('#workspace');
  const toastEl = $('#toast');
  const categorySelect = $('#category');
  const tagsInput = $('#tagsInput');
  const summaryInput = $('#summaryInput');
  const summaryCount = $('#summaryCount');
  const metaPanel = $('#metaPanel');
  const metaBrief = $('#metaBrief');
  const backLink = $('#backLink');
  const publishBtn = $('#publishBtn');
  const imageFile = $('#imageFile');
  const videoDialog = $('#videoDialog');
  const videoForm = $('#videoForm');
  const videoUrlInput = $('#videoUrl');
  const videoError = $('#videoError');
  const Util = window.BlogUtil;
  const resolveImages = Util.createImageResolver();

  const DRAFT_PREFIX = 'zjian.edit.draft';
  let articleId = Util.queryParam('id') || null;
  let currentArticle = null;
  let isLeaving = false;
  let draftKey = draftKeyFor(articleId);
  let publishing = false;
  let dirty = false;

  function draftKeyFor(id) {
    return id ? `${DRAFT_PREFIX}.${id}` : `${DRAFT_PREFIX}.new`;
  }

  /* ---------------- 基础工具 ---------------- */
  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  let toastTimer = 0;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2000);
  }

  /* ---------------- 预览渲染 ---------------- */
  function renderMarkdown() {
    const raw = source.value;
    let html = '';

    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        window.marked.setOptions({ gfm: true, breaks: true });
        html = window.marked.parse(raw);
      } catch (err) {
        html = `<pre>${escapeHtml(raw)}</pre>`;
      }
    } else {
      html = `<pre style="white-space:pre-wrap">${escapeHtml(raw)}</pre>`;
    }

    html = Util.sanitizeHtml(html);
    preview.innerHTML = html;
    resolveImages(preview).catch(() => {});

    const headings = $$('h1, h2, h3', preview);
    headings.forEach((h, i) => { h.id = `heading-${i}`; });

    renderToc(headings);
    updateStats();
  }

  function renderToc(headings) {
    if (tocBadge) tocBadge.textContent = `${headings.length} 节`;
    if (!headings.length) {
      tocList.hidden = true;
      tocList.innerHTML = '';
      tocEmpty.hidden = false;
      return;
    }

    tocEmpty.hidden = true;
    tocList.hidden = false;
    tocList.innerHTML = headings.map((h) => {
      const level = Number(h.tagName.slice(1));
      return `<a href="#${h.id}" class="lv-${level}" data-target="${h.id}">${escapeHtml(h.textContent.trim() || '未命名标题')}</a>`;
    }).join('');
  }

  function scrollPreviewTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const pane = target.closest('.pane-preview');
    const offset = target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 12;
    pane.scrollTo({ top: Math.max(offset, 0), behavior: 'smooth' });
  }

  tocList.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-target]');
    if (!link) return;
    event.preventDefault();
    $$('a', tocList).forEach((a) => a.classList.toggle('is-current', a === link));
    if (panes.dataset.mode === 'edit') setMode('split');
    scrollPreviewTo(link.dataset.target);
  });

  /* ---------------- 统计 ---------------- */
  function countChars(text) {
    return text.replace(/\s/g, '').length;
  }

  function updateStats() {
    const value = source.value;
    const pos = source.selectionStart || 0;
    const before = value.slice(0, pos);
    const lines = value ? value.split('\n') : [];
    const line = before.split('\n').length;
    const column = before.length - before.lastIndexOf('\n') - 1;
    const htmlText = preview.textContent || '';

    $('#statChars').textContent = countChars(value);
    $('#statLines').textContent = lines.length;
    $('#statLine').textContent = line;
    $('#statCol').textContent = column;
    $('#statHtmlChars').textContent = countChars(htmlText);
    $('#statParas').textContent = $$('p', preview).length;
    titleCount.textContent = `${titleInput.value.length}/100`;
  }

  /* ---------------- 编辑区插入 ---------------- */
  function applyEdit(nextValue, selStart, selEnd) {
    source.value = nextValue;
    source.focus();
    source.setSelectionRange(selStart, selEnd);
    renderMarkdown();
    markDirty();
  }

  function surround(before, after, placeholder) {
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const value = source.value;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    applyEdit(next, start + before.length, start + before.length + selected.length);
  }

  function prefixLines(prefix) {
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const value = source.value;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;

    const block = value.slice(lineStart, lineEnd);
    const cleaned = block.split('\n').map((line) => line.replace(/^(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|\[ \]\s+)/, ''));
    const nextBlock = cleaned.map((line) => prefix + line).join('\n');
    const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
    applyEdit(next, lineStart + nextBlock.length, lineStart + nextBlock.length);
  }

  function insertBlock(text, cursorOffset = null) {
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const value = source.value;
    const needGapBefore = start > 0 && !/\n\n$/.test(value.slice(0, start));
    const gap = needGapBefore ? (value[start - 1] === '\n' ? '\n' : '\n\n') : '';
    const trailing = /\n$/.test(value.slice(0, start)) ? '' : '\n';
    const block = gap + text + trailing;
    const next = value.slice(0, start) + block + value.slice(end);
    const caret = cursorOffset === null
      ? start + block.length
      : start + gap.length + cursorOffset;
    applyEdit(next, caret, caret);
  }

  function insertAtCursor(text) {
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const value = source.value;
    const next = value.slice(0, start) + text + value.slice(end);
    applyEdit(next, start + text.length, start + text.length);
  }

  async function uploadImages(files) {
    const selected = Array.from(files || []).filter((file) => file && String(file.type).startsWith('image/'));
    if (!selected.length) {
      toast('请选择图片文件');
      return;
    }

    try {
      await window.BlogDB.ready();
    } catch (error) {
      toast(error.message || '图片存储不可用');
      return;
    }

    const snippets = [];
    let failed = 0;
    for (const file of selected.slice(0, 12)) {
      try {
        const image = await window.BlogDB.addImage(file);
        const alt = String(file.name || '图片').split('.')[0].split(']').join('').trim() || '图片';
        snippets.push(`![${alt}](blog-image/${encodeURIComponent(image.id)})`);
      } catch (error) {
        failed += 1;
      }
    }

    if (snippets.length) {
      insertBlock(snippets.join('\n\n'));
      toast(failed ? `已插入 ${snippets.length} 张图片，${failed} 张失败` : `已插入 ${snippets.length} 张本地图片`);
    } else {
      toast('图片没有插入，请检查文件类型和大小（单张不超过 10MB）');
    }

    imageFile.value = '';
  }

  async function exportMarkdown() {
    const name = (titleInput.value.trim() || '无标题').replace(/[\\/:*?"<>|]/g, '_');
    let body = source.value;
    let missing = 0;

    for (const id of Util.localImageIds(body)) {
      try {
        const image = await window.BlogDB.getImage(id);
        if (!image || !image.blob) {
          missing += 1;
          continue;
        }
        const dataUrl = await Util.blobToDataUrl(image.blob);
        body = body.split(`blog-image/${encodeURIComponent(id)}`).join(dataUrl);
        body = body.split(`blog-image/${id}`).join(dataUrl);
      } catch (error) {
        missing += 1;
      }
    }

    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(missing ? `Markdown 已导出，${missing} 张图片未找到` : 'Markdown 已导出，本地图片已内嵌');
  }

  /* ---------------- 插入视频 ---------------- */
  function showVideoError(message) {
    if (!videoError) return;
    videoError.textContent = message;
    videoError.hidden = false;
    videoUrlInput.focus();
  }

  function openVideoDialog() {
    if (!videoDialog) return;
    const selected = source.value.slice(source.selectionStart, source.selectionEnd).trim();
    if (videoError) {
      videoError.hidden = true;
      videoError.textContent = '';
    }
    videoUrlInput.value = /^https?:\/\//i.test(selected) ? selected : '';
    videoDialog.hidden = false;
    videoUrlInput.focus();
    videoUrlInput.select();
  }

  function closeVideoDialog() {
    if (videoDialog) videoDialog.hidden = true;
  }

  function insertVideoFromInput() {
    const result = Util.parseVideoLink(videoUrlInput.value);
    if (!result) {
      showVideoError('没认出这个链接，支持 B 站视频页地址、YouTube 地址或 .mp4 直链');
      return;
    }
    if (result.error) {
      showVideoError(result.error);
      return;
    }
    closeVideoDialog();
    insertBlock(result.html);
    toast(`已插入${result.label}`);
  }

  if (videoDialog) {
    videoDialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-video-close]')) closeVideoDialog();
    });
    videoForm.addEventListener('submit', (event) => {
      event.preventDefault();
      insertVideoFromInput();
    });
  }

  /* ---------------- 命令 ---------------- */
  const TABLE_SNIPPET = '| 列一 | 列二 | 列三 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |';

  function runCommand(cmd) {
    switch (cmd) {
      case 'bold': return surround('**', '**', '加粗文字');
      case 'italic': return surround('*', '*', '斜体文字');
      case 'strike': return surround('~~', '~~', '删除线文字');
      case 'heading': return prefixLines('## ');
      case 'h3': return prefixLines('### ');
      case 'ul': return prefixLines('- ');
      case 'ol': return prefixLines('1. ');
      case 'task': return prefixLines('- [ ] ');
      case 'quote': return prefixLines('> ');
      case 'inline-code': return surround('`', '`', 'code');
      case 'code-block': return insertBlock('```swift\n\n```\n', 10);
      case 'table': return insertBlock(TABLE_SNIPPET);
      case 'hr': return insertBlock('---');
      case 'toc': return insertBlock('@[TOC]');
      case 'link': return surround('[', '](https://)', '链接文字');
      case 'image': return imageFile.click();
      case 'video': return openVideoDialog();
      case 'image-url': {
        const url = window.prompt('图片地址（支持网络图片或相对路径）', 'assets/images/');
        if (!url) return;
        const alt = window.prompt('图片描述（可留空）', '') || '图片';
        return insertAtCursor(`![${alt}](${url})`);
      }
      case 'save': return saveDraft(true);
      case 'delete': return deleteArticle();
      case 'history': return toast('历史版本功能尚未接入');
      case 'clear-draft': {
        clearTimeout(autosaveTimer);
        dirty = false;
        localStorage.removeItem(draftKey);
        return toast('本地草稿已清除');
      }
      case 'clear': {
        if (!source.value.trim()) return toast('正文已经是空的');
        if (!window.confirm('确定清空正文吗？此操作不可撤销。')) return;
        applyEdit('', 0, 0);
        return toast('正文已清空');
      }
      case 'export': return exportMarkdown();
      case 'copy-html': {
        navigator.clipboard?.writeText(preview.innerHTML)
          .then(() => toast('已复制渲染后的 HTML'))
          .catch(() => toast('复制失败，请检查浏览器权限'));
        return;
      }
      default:
        return undefined;
    }
  }

  /* ---------------- 菜单 ---------------- */
  let openMenu = null;

  function closeMenus() {
    if (!openMenu) return;
    openMenu.classList.remove('is-open');
    openMenu = null;
  }

  function toggleMenu(trigger) {
    const menu = document.getElementById(trigger.dataset.menu);
    if (!menu) return;
    if (openMenu === menu) return closeMenus();

    closeMenus();
    menu.classList.add('is-open');
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 6;
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    openMenu = menu;
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-menu]');
    const item = event.target.closest('.menu button');

    if (item) {
      closeMenus();
      runCommand(item.dataset.cmd);
      return;
    }

    if (trigger) {
      event.preventDefault();
      toggleMenu(trigger);
      return;
    }

    if (!event.target.closest('.menu')) closeMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenus();
      closeVideoDialog();
    }
  });

  $$('[data-cmd]').forEach((button) => {
    if (button.dataset.menu || button.closest('.menu')) return;
    button.addEventListener('click', () => runCommand(button.dataset.cmd));
  });

  /* ---------------- 编辑模式 ---------------- */
  function setMode(mode) {
    panes.dataset.mode = mode;
    $$('.mode').forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }

  $$('.mode').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  /* ---------------- 分栏拖拽 ---------------- */
  let dragging = false;

  function setSplit(percent) {
    const clamped = Math.min(75, Math.max(25, percent));
    panes.style.setProperty('--edit', `${clamped}%`);
  }

  function resetSplit() {
    panes.style.removeProperty('--edit');
  }

  splitter.addEventListener('pointerdown', (event) => {
    if (panes.dataset.mode !== 'split') setMode('split');
    dragging = true;
    splitter.classList.add('is-dragging');
    splitter.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  splitter.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = panes.getBoundingClientRect();
    setSplit(((event.clientX - rect.left) / rect.width) * 100);
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (event && event.pointerId !== undefined && splitter.hasPointerCapture(event.pointerId)) {
      splitter.releasePointerCapture(event.pointerId);
    }
  }

  splitter.addEventListener('pointerup', endDrag);
  splitter.addEventListener('pointercancel', endDrag);

  splitter.addEventListener('dblclick', () => {
    resetSplit();
    toast('已恢复等宽分栏');
  });

  splitter.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = parseFloat(getComputedStyle(panes).getPropertyValue('--edit')) || 50;
    setSplit(current + (event.key === 'ArrowRight' ? 2 : -2));
  });

  /* ---------------- 草稿 ---------------- */
  let autosaveTimer = 0;

  function readDraft() {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || 'null');
    } catch (error) {
      return null;
    }
  }

  function collectDraft() {
    return {
      title: titleInput.value,
      body: source.value,
      cat: categorySelect.value,
      tags: Util.parseTags(tagsInput.value),
      summary: summaryInput.value,
      articleId,
      savedAt: Date.now()
    };
  }

  function saveDraft(notify = false) {
    if (!dirty && !notify) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(collectDraft()));
      dirty = false;
      if (notify) toast(articleId ? '草稿已保存到本地' : '草稿已保存，下次写文章可以继续');
    } catch (err) {
      if (notify) toast('保存失败：浏览器禁用了本地存储');
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveDraft(false), 1000);
  }

  function markDirty() {
    dirty = true;
    scheduleAutosave();
  }

  function applyDraft(draft) {
    if (!draft) return;
    titleInput.value = draft.title || '';
    source.value = draft.body || '';
    categorySelect.value = draft.cat || 'essay';
    tagsInput.value = Array.isArray(draft.tags) ? draft.tags.join(', ') : (draft.tags || '');
    summaryInput.value = draft.summary || '';
    updateSummaryCount();
    updateMetaBrief();
    updateStats();
  }

  function updateSummaryCount() {
    summaryCount.textContent = `${summaryInput.value.length}/160`;
  }

  function updateMetaBrief() {
    const tags = Util.parseTags(tagsInput.value);
    const cat = Util.categoryLabel(categorySelect.value);
    const tagText = tags.length ? `${tags.length} 个标签` : '未加标签';
    const summaryText = summaryInput.value.trim() ? '已填写摘要' : '摘要自动生成';
    metaBrief.textContent = `${cat} · ${tagText} · ${summaryText}`;
  }

  function populateCategories() {
    categorySelect.innerHTML = Util.CATEGORIES
      .map((item) => `<option value="${item.id}">${Util.escapeHtml(item.label)}</option>`)
      .join('');
  }

  function fillForm(article) {
    titleInput.value = article.title || '';
    source.value = article.body || '';
    categorySelect.value = article.cat || 'essay';
    tagsInput.value = (article.tags || []).join(', ');
    summaryInput.value = article.summary || '';
    updateSummaryCount();
    updateMetaBrief();
    updateStats();
  }

  function setPublishLabel(text) {
    const label = $('#publishText');
    if (label) label.textContent = text;
  }

  async function loadPage() {
    populateCategories();
    categorySelect.value = 'essay';
    updateSummaryCount();
    updateMetaBrief();

    if (articleId) {
      try {
        await window.BlogDB.ready();
        currentArticle = await window.BlogDB.get(articleId);
      } catch (error) {
        toast(error.message || '读取文章失败');
      }
    }

    if (currentArticle) {
      fillForm(currentArticle);
      document.title = `编辑：${currentArticle.title} · 字间`;
      setPublishLabel('保存修改');
      metaPanel.open = false;
      backLink.href = `detail.html?id=${encodeURIComponent(articleId)}`;
      backLink.querySelector('span').textContent = '返回文章';
    } else {
      if (articleId) {
        toast('文章不存在，已切换到新建模式');
        articleId = null;
        draftKey = draftKeyFor(null);
        history.replaceState(null, '', 'edit.html');
      }
      document.title = '写文章 · 字间';
      setPublishLabel('发布文章');
      metaPanel.open = true;
      backLink.href = 'index.html';
      backLink.querySelector('span').textContent = '返回列表';
    }

    const draft = readDraft();
    const baseTime = currentArticle ? new Date(currentArticle.updatedAt).getTime() : 0;

    if (draft && draft.savedAt > baseTime + 500) {
      let restore = true;
      if (currentArticle) {
        const when = new Date(draft.savedAt).toLocaleString('zh-CN');
        restore = window.confirm(`发现这篇未发布的本地草稿（${when}），要恢复吗？`);
      }
      if (restore) {
        applyDraft(draft);
        toast('已恢复本地草稿');
      } else {
        localStorage.removeItem(draftKey);
      }
    } else if (draft) {
      localStorage.removeItem(draftKey);
    }

    dirty = false;
  }

  async function publishArticle() {
    if (publishing) return;

    const title = titleInput.value.trim();
    if (!title) {
      toast('先给文章起个标题吧');
      titleInput.focus();
      return;
    }
    if (!source.value.trim()) {
      toast('正文还是空的，写点内容再发布吧');
      source.focus();
      return;
    }

    const payload = {
      title,
      body: source.value,
      cat: categorySelect.value,
      tags: Util.parseTags(tagsInput.value),
      summary: summaryInput.value.trim() || Util.summarize(source.value)
    };

    publishing = true;
    publishBtn.disabled = true;
    clearTimeout(autosaveTimer);
    setPublishLabel(articleId ? '保存中…' : '发布中…');

    try {
      const editing = Boolean(articleId);
      const saved = editing
        ? await window.BlogDB.update(articleId, payload)
        : await window.BlogDB.create(payload);

      localStorage.removeItem(draftKey);
      isLeaving = true;
      const flag = editing ? 'updated' : 'published';
      window.location.href = `detail.html?id=${encodeURIComponent(saved.id)}&${flag}=1`;
    } catch (error) {
      publishing = false;
      publishBtn.disabled = false;
      setPublishLabel(articleId ? '保存修改' : '发布文章');
      toast(error.message || '保存失败，请重试');
    }
  }

  async function deleteArticle() {
    if (!articleId) {
      toast('新文章还没有保存，无需删除');
      return;
    }
    const title = titleInput.value.trim() || currentArticle?.title || '这篇文章';
    if (!window.confirm(`确定删除《${title}》吗？删除后无法恢复。`)) return;

    try {
      const stored = await window.BlogDB.get(articleId);
      const usedImages = Util.localImageIds(stored?.body || source.value);
      await window.BlogDB.remove(articleId);
      await window.BlogDB.cleanupImages(usedImages).catch(() => 0);
      localStorage.removeItem(draftKey);
      isLeaving = true;
      window.location.href = 'index.html?deleted=1';
    } catch (error) {
      toast(error.message || '删除失败，请重试');
    }
  }

  /* ---------------- 交互事件 ---------------- */
  source.addEventListener('input', () => {
    renderMarkdown();
    markDirty();
  });
  ['keyup', 'click', 'select'].forEach((type) => source.addEventListener(type, updateStats));
  source.addEventListener('input', updateStats);

  titleInput.addEventListener('input', () => {
    updateStats();
    markDirty();
  });

  categorySelect.addEventListener('change', () => {
    updateMetaBrief();
    markDirty();
  });

  tagsInput.addEventListener('input', () => {
    updateMetaBrief();
    markDirty();
  });

  summaryInput.addEventListener('input', () => {
    updateSummaryCount();
    updateMetaBrief();
    markDirty();
  });

  imageFile.addEventListener('change', () => uploadImages(imageFile.files));

  source.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files || [])
      .filter((file) => String(file.type).startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    uploadImages(files);
  });

  const editPane = $('.pane-edit');
  editPane.addEventListener('dragover', (event) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    editPane.classList.add('is-dragover');
  });
  editPane.addEventListener('dragleave', (event) => {
    if (event.target === editPane) editPane.classList.remove('is-dragover');
  });
  editPane.addEventListener('drop', (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    event.preventDefault();
    editPane.classList.remove('is-dragover');
    uploadImages(files);
  });

  source.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); runCommand('bold'); }
    else if (mod && event.key.toLowerCase() === 'i') { event.preventDefault(); runCommand('italic'); }
    else if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); saveDraft(true); }
    else if (event.key === 'Tab') {
      event.preventDefault();
      insertAtCursor('  ');
    }
  });

  $('#draftBtn').addEventListener('click', () => saveDraft(true));
  publishBtn.addEventListener('click', publishArticle);

  $('#richBtn').addEventListener('click', () => toast('富文本模式尚未接入，当前使用 Markdown 编辑'));
  $('#feedbackBtn').addEventListener('click', () => toast('反馈入口待接入'));

  $('#tocToggle').addEventListener('click', () => {
    const hidden = workspace.classList.toggle('toc-hidden');
    $('#tocToggle').setAttribute('aria-expanded', String(!hidden));
  });

  $('#resetSplit').addEventListener('click', (event) => {
    event.stopPropagation();
    resetSplit();
    toast('已恢复等宽分栏');
  });

  window.addEventListener('beforeunload', () => {
    if (!isLeaving) saveDraft(false);
  });

  /* ---------------- 初始化 ---------------- */
  (async () => {
    try {
      await loadPage();
    } catch (error) {
      toast(error.message || '页面初始化失败');
    }
    renderMarkdown();
    setMode('split');
    updateStats();
  })();
})();
