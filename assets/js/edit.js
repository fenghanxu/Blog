/* ============================================================
   edit.html 交互
   - Markdown 实时预览 / 分栏拖拽 / 目录生成 / 字数统计
   - 工具栏插入、草稿本地保存、快捷导出
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

  const DRAFT_KEY = 'zjian.edit.draft';

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

    if (window.DOMPurify) html = window.DOMPurify.sanitize(html);
    preview.innerHTML = html;

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
    scheduleAutosave();
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
      case 'image-url':
      case 'image': {
        const url = window.prompt('图片地址（支持网络图片或相对路径）', 'assets/images/');
        if (!url) return;
        const alt = window.prompt('图片描述（可留空）', '') || '图片';
        return insertAtCursor(`![${alt}](${url})`);
      }
      case 'save': return saveDraft(true);
      case 'history': return toast('历史版本功能尚未接入');
      case 'clear-draft': {
        localStorage.removeItem(DRAFT_KEY);
        return toast('本地草稿已清除');
      }
      case 'clear': {
        if (!source.value.trim()) return toast('正文已经是空的');
        if (!window.confirm('确定清空正文吗？此操作不可撤销。')) return;
        applyEdit('', 0, 0);
        return toast('正文已清空');
      }
      case 'export': {
        const name = (titleInput.value.trim() || '无标题').replace(/[\\/:*?"<>|]/g, '_');
        const blob = new Blob([source.value], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
        return toast('已导出 Markdown 文件');
      }
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
    if (event.key === 'Escape') closeMenus();
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

  function saveDraft(notify = false) {
    const payload = { title: titleInput.value, body: source.value, savedAt: Date.now() };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      if (notify) toast('草稿已保存到本地');
    } catch (err) {
      if (notify) toast('保存失败：浏览器禁用了本地存储');
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveDraft(false), 1000);
  }

  function loadDraft() {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (err) { draft = null; }
    if (!draft) return;
    if (draft.title) titleInput.value = draft.title;
    if (draft.body) source.value = draft.body;
    updateStats();
  }

  /* ---------------- 交互事件 ---------------- */
  source.addEventListener('input', () => {
    renderMarkdown();
    scheduleAutosave();
  });
  ['keyup', 'click', 'select'].forEach((type) => source.addEventListener(type, updateStats));
  source.addEventListener('input', updateStats);

  titleInput.addEventListener('input', () => {
    updateStats();
    scheduleAutosave();
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
  $('#publishBtn').addEventListener('click', () => {
    if (!titleInput.value.trim()) {
      titleInput.value = '【无标题】';
      updateStats();
    }
    saveDraft(false);
    toast('已发布（界面演示，尚未接入后端）');
  });

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

  window.addEventListener('beforeunload', () => saveDraft(false));

  /* ---------------- 初始化 ---------------- */
  loadDraft();
  renderMarkdown();
  setMode('split');
})();
