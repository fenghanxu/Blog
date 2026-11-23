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
  const tagSelect = $('#tagSelect');
  const tagSelectBtn = $('#tagSelectBtn');
  const tagSelectMenu = $('#tagSelectMenu');
  const tagSelectOptions = $('#tagSelectOptions');
  const tagSelectValue = $('#tagSelectValue');
  const tagSelectedCount = $('#tagSelectedCount');
  const tagCreateInput = $('#tagCreateInput');
  const tagCreateBtn = $('#tagCreateBtn');
  const summaryInput = $('#summaryInput');
  const summaryCount = $('#summaryCount');
  const backLink = $('#backLink');
  const publishBtn = $('#publishBtn');
  const publishDialog = $('#publishDialog');
  const publishForm = $('#publishForm');
  const publishConfirm = $('#publishConfirm');
  const publishConfirmText = $('#publishConfirmText');
  const imageFile = $('#imageFile');
  const videoDialog = $('#videoDialog');
  const videoForm = $('#videoForm');
  const videoUrlInput = $('#videoUrl');
  const videoError = $('#videoError');
  const importDialog = $('#importDialog');
  const importText = $('#importText');
  const importTitle = $('#importTitle');
  const importTitleEnabled = $('#importTitleEnabled');
  const importReadBtn = $('#importReadClipboard');
  const importClearBtn = $('#importClear');
  const importConfirm = $('#importConfirm');
  const importConfirmText = $('#importConfirmText');
  const importProgress = $('#importProgress');
  const importProgressText = $('#importProgressText');
  const importProgressCount = $('#importProgressCount');
  const importProgressBar = $('#importProgressBar');
  const importResult = $('#importResult');
  const importResultTitle = $('#importResultTitle');
  const importResultDetail = $('#importResultDetail');
  const importFailuresList = $('#importFailures');
  const importRetryFailed = $('#importRetryFailed');
  const importSupplement = $('#importSupplement');
  const importSupplementHint = $('#importSupplementHint');
  const importSupplementFiles = $('#importSupplementFiles');
  const importStats = $('#importStats');
  const importImageCount = $('#importImageCount');
  const importImages = $('#importImages');
  const importSourceState = $('#importSourceState');
  const importWatermarkEnabled = $('#importWatermarkEnabled');
  const importWatermarkMode = $('#importWatermarkMode');
  const importWatermarkOriginal = $('#importWatermarkOriginal');
  const importWatermarkProcessed = $('#importWatermarkProcessed');
  const importWatermarkSource = $('#importWatermarkSource');
  const importWatermarkRetry = $('#importWatermarkRetry');
  const importWatermarkHint = $('#importWatermarkHint');
  const Util = window.BlogUtil;
  const resolveImages = Util.createImageResolver();

  const DRAFT_PREFIX = 'zjian.edit.draft';
  const DEFAULT_SUMMARY = '一直觉得自己写的不是技术，而是情怀，一个个的教程是自己这一路走来的痕迹。靠专业技能的成功是最具可复制性的，希望我的这条路能让你们少走弯路，希望我能帮你们抹去知识的蒙尘，希望我能帮你们理清知识的脉络，希望未来技术之巅上有你们也有我。';
  let articleId = Util.queryParam('id') || null;
  let currentArticle = null;
  let isLeaving = false;
  let draftKey = draftKeyFor(articleId);
  let publishing = false;
  let selectedTags = [];
  let tagMenuOpen = false;
  let dirty = false;
  let importBusy = false;
  let importHtml = '';
  let importMarkdown = '';
  let importUrls = [];
  let importFailures = [];
  let importParsedTitle = '';
  let importPreviewTimer = 0;
  let importPasteAt = 0;
  let importTitleTouched = false;
  let importApplied = false;

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

  /* ---------------- 导入文章 / 网络图片本地化 ---------------- */
  function parseImportContent() {
    const text = importText?.value.trim() || '';
    if (!text && !importHtml) return { markdown: '', title: '' };
    const payload = importHtml
      ? { html: importHtml, markdown: text }
      : (window.BlogImporter.looksLikeHtml(text) ? { html: text, markdown: text } : { markdown: text });
    const markdown = window.BlogImporter.convertToMarkdown(payload) || text;
    return { markdown, title: window.BlogImporter.extractTitle(payload) };
  }

  function updateImportPreview() {
    if (!importText) return;
    clearTimeout(importPreviewTimer);
    const parsed = parseImportContent();
    importMarkdown = parsed.markdown;
    importParsedTitle = parsed.title;
    importUrls = Util.remoteImageTool.collectRemoteImages(importMarkdown);

    if (!importTitleTouched) importTitle.value = importParsedTitle;
    importStats.textContent = importMarkdown
      ? `已识别 ${importMarkdown.length} 个字符 · ${importMarkdown.split('\n').length} 行`
      : '尚未识别内容';
    importImageCount.textContent = importUrls.length
      ? `${importUrls.length} 张网络图片${importUrls.length > 24 ? '（预览前 24 张）' : ''}`
      : '0 张网络图片';
    importSourceState.textContent = importHtml
      ? '已读取富文本，将按网页结构导入'
      : (importMarkdown ? '已读取文本内容' : '等待粘贴内容');
    renderImportImagePreview();
    showWatermarkPreview();
  }

  function queueImportPreview() {
    clearTimeout(importPreviewTimer);
    importPreviewTimer = setTimeout(updateImportPreview, 120);
  }

  function watermarkMode() {
    return importDialog?.querySelector('input[name="importWatermarkMode"]:checked')?.value || 'fill';
  }

  function cleanWatermarkEnabled() {
    return Boolean(importWatermarkEnabled?.checked);
  }

  let watermarkPreviewSrc = '';
  let watermarkPreviewTimer = 0;
  let watermarkPreviewObjectUrl = '';
  let watermarkOriginalObjectUrl = '';
  let watermarkPreviewRequest = 0;

  function clearWatermarkPreview() {
    clearTimeout(watermarkPreviewTimer);
    watermarkPreviewRequest += 1;
    watermarkPreviewSrc = '';
    [watermarkPreviewObjectUrl, watermarkOriginalObjectUrl].forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    watermarkPreviewObjectUrl = '';
    watermarkOriginalObjectUrl = '';
    importWatermarkOriginal.removeAttribute('src');
    importWatermarkProcessed.removeAttribute('src');
    importWatermarkProcessed.classList.add('is-loading');
    if (importWatermarkSource) importWatermarkSource.textContent = '—';
    if (importWatermarkRetry) importWatermarkRetry.hidden = true;
  }

  async function fetchPreviewBlob(src) {
    const candidates = [src, Util.remoteImageTool.previewUrl(src)].filter((url, index, list) => url && list.indexOf(url) === index);
    let lastError = null;
    for (const url of candidates) {
      try {
        const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error(`图片服务器返回 ${response.status}`);
        const blob = await response.blob();
        if (blob.type && !blob.type.startsWith('image/')) throw new Error('返回内容不是图片');
        return blob;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('图片下载失败');
  }

  function showWatermarkPreview(preferredSrc = watermarkPreviewSrc) {
    if (!importWatermarkOriginal || !importWatermarkProcessed) return;
    clearWatermarkPreview();
    const target = importUrls.find((item) => item.src === preferredSrc && window.BlogWatermark.isCsdnImage(item.src))
      || importUrls.find((item) => window.BlogWatermark.isCsdnImage(item.src));
    if (!cleanWatermarkEnabled() || !target) {
      importWatermarkHint.textContent = cleanWatermarkEnabled()
        ? '文章里没有可预览的 CSDN 图片。'
        : '水印清理已关闭，将保存网络原图。';
      return;
    }
    watermarkPreviewSrc = target.src;
    if (importWatermarkSource) importWatermarkSource.textContent = `CSDN 图片 · ${target.alt}`;
    if (importWatermarkRetry) importWatermarkRetry.hidden = true;
    importWatermarkHint.textContent = '正在生成清理前后预览…';
    importWatermarkOriginal.src = target.src;
    importWatermarkProcessed.classList.add('is-loading');
    const request = watermarkPreviewRequest;

    watermarkPreviewTimer = setTimeout(async () => {
      try {
        const sourceBlob = await fetchPreviewBlob(target.src);
        if (request !== watermarkPreviewRequest) return;
        watermarkOriginalObjectUrl = URL.createObjectURL(sourceBlob);
        importWatermarkOriginal.src = watermarkOriginalObjectUrl;
        const processed = await window.BlogWatermark.process(sourceBlob, { mode: watermarkMode() });
        if (request !== watermarkPreviewRequest) return;
        watermarkPreviewObjectUrl = URL.createObjectURL(processed);
        importWatermarkProcessed.src = watermarkPreviewObjectUrl;
        importWatermarkProcessed.classList.remove('is-loading');
        if (importWatermarkRetry) importWatermarkRetry.hidden = false;
        importWatermarkHint.textContent = importWatermarkProcessed.naturalWidth < importWatermarkOriginal.naturalWidth
          ? '已裁掉底部水印区域；确认导入后将只保存这张清理后的图片。'
          : `已按“${watermarkModeLabel()}”生成预览；确认导入后只保存清理后的图片。`;
      } catch (error) {
        if (request !== watermarkPreviewRequest) return;
        importWatermarkProcessed.classList.remove('is-loading');
        if (importWatermarkRetry) importWatermarkRetry.hidden = false;
        importWatermarkHint.textContent = `预览生成失败：${error.message || '图片加载失败'}。可点“重新处理”再试。`;
      }
    }, 160);
  }

  function watermarkModeLabel() {
    return { fill: '背景补全', blur: '马赛克遮盖', crop: '裁切底部' }[watermarkMode()] || '背景补全';
  }

  function renderImportImagePreview() {
    if (!importImages) return;
    importImages.innerHTML = '';
    importImages.hidden = !importUrls.length;

    importUrls.slice(0, 24).forEach((image) => {
      const item = document.createElement('a');
      item.className = 'import-image-item';
      item.href = image.src;
      item.dataset.src = image.src;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';

      const preview = document.createElement('img');
      preview.alt = image.alt;
      preview.loading = 'lazy';
      preview.referrerPolicy = 'no-referrer';
      preview.src = image.src;
      preview.addEventListener('error', () => {
        const fallback = Util.remoteImageTool.previewUrl(image.src);
        if (fallback && fallback !== image.src && preview.src !== fallback) preview.src = fallback;
      });

      const caption = document.createElement('span');
      caption.textContent = image.alt || '网络图片';
      item.append(preview, caption);
      importImages.append(item);
    });
  }

  function resetImportDialog() {
    clearTimeout(importPreviewTimer);
    importBusy = false;
    importHtml = '';
    importMarkdown = '';
    importUrls = [];
    importFailures = [];
    importParsedTitle = '';
    importTitleTouched = false;
    importApplied = false;
    importText.value = '';
    importText.readOnly = false;
    importTitle.value = '';
    importTitle.readOnly = false;
    importTitleEnabled.checked = true;
    importImages.innerHTML = '';
    importImages.hidden = true;
    importUrls = [];
    importStats.textContent = '尚未识别内容';
    importImageCount.textContent = '0 张网络图片';
    importSourceState.textContent = '等待粘贴内容';
    importProgress.hidden = true;
    importProgressBar.style.width = '0%';
    importResult.hidden = true;
    importFailuresList.innerHTML = '';
    clearWatermarkPreview();
    if (importWatermarkEnabled) importWatermarkEnabled.checked = true;
    if (importWatermarkHint) importWatermarkHint.textContent = '选择一张图片预览；导入时会自动处理 CSDN 图片。';
    importConfirm.hidden = false;
    importConfirm.disabled = false;
    importConfirmText.textContent = '导入并保存图片';
    const append = importDialog.querySelector('input[name="importPlacement"][value="append"]');
    if (append) append.checked = true;
  }

  function syncDialogLock() {
    const open = [publishDialog, importDialog].some((dialog) => dialog && !dialog.hidden);
    document.body.classList.toggle('is-dialog-open', open);
  }

  function openImportDialog(mode = 'paste') {
    if (!importDialog || !window.BlogImporter) {
      toast('导入模块未加载，请刷新页面后重试');
      return;
    }
    resetImportDialog();
    if (mode === 'localize') {
      if (!Util.remoteImageTool.collectRemoteImages(source.value).length) {
        toast('正文里没有找到需要本地化的网络图片');
        return;
      }
      importText.value = source.value;
      importTitleEnabled.checked = false;
      importSourceState.textContent = '已读取当前正文，将替换其中的网络图片';
      const replace = importDialog.querySelector('input[name="importPlacement"][value="replace"]');
      if (replace) replace.checked = true;
      updateImportPreview();
    }
    importDialog.hidden = false;
    syncDialogLock();
    setTimeout(() => (mode === 'localize' ? importConfirm : importText).focus(), 0);
  }

  function closeImportDialog() {
    if (!importDialog || importBusy) return;
    importDialog.hidden = true;
    syncDialogLock();
  }

  function setImportBusy(busy, label = '') {
    importBusy = busy;
    importConfirm.disabled = busy;
    importReadClipboard.disabled = busy;
    importClear.disabled = busy;
    importText.readOnly = busy;
    importTitle.readOnly = busy;
    importConfirmText.textContent = label || (busy ? '正在处理…' : '导入并保存图片');
    importDialog.classList.toggle('is-busy', busy);
  }

  function showImportProgress(completed, total, saved = 0, failed = 0) {
    importProgress.hidden = total === 0;
    importProgressCount.textContent = `${completed}/${total}`;
    importProgressBar.style.width = total ? `${Math.round((completed / total) * 100)}%` : '0%';
    importProgressText.textContent = completed < total
      ? `正在保存网络图片 · 已成功 ${saved} 张${failed ? `，失败 ${failed} 张` : ''}`
      : `图片处理完成 · 成功 ${saved} 张${failed ? `，失败 ${failed} 张` : ''}`;
  }

  function applyImportedContent(markdown, title) {
    if (importTitleEnabled?.checked && title) {
      titleInput.value = title;
      titleCount.textContent = `${title.length}/100`;
    }
    const placement = importDialog.querySelector('input[name="importPlacement"]:checked')?.value || 'append';
    const current = source.value;
    const next = placement === 'append' && current.trim()
      ? `${current.replace(/\s+$/, '')}\n\n${markdown}`.trim()
      : markdown;
    applyEdit(next, next.length, next.length);
    importApplied = true;
  }

  function stripDuplicateTitle(markdown, title) {
    if (!title) return markdown;
    const match = String(markdown).match(/^#\s+([^\n]+)\n+/);
    if (!match) return markdown;
    const same = match[1].replace(/\s+/g, '') === title.replace(/\s+/g, '');
    return same ? markdown.slice(match[0].length) : markdown;
  }

  function renderImportFailures(savedCount = 0, failed = importFailures) {
    importFailuresList.innerHTML = '';
    importResult.hidden = !failed.length;
    if (!failed.length) return;

    importResultTitle.textContent = `${failed.length} 张图片没能保存到本地`;
    importResultDetail.textContent = `已保存 ${savedCount} 张；失败图片暂时保留原链接。`;
    importFailures.forEach((item) => {
      const row = document.createElement('li');
      const meta = document.createElement('div');
      const name = document.createElement('b');
      const reason = document.createElement('span');
      const link = document.createElement('a');
      const actions = document.createElement('div');
      const retry = document.createElement('button');
      name.textContent = item.alt || '网络图片';
      reason.textContent = item.reason || '下载失败';
      link.href = item.source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '打开原图';
      actions.className = 'import-failure-actions';
      retry.type = 'button';
      retry.className = 'import-failure-retry';
      retry.dataset.retrySource = item.source;
      retry.textContent = '重试这张';
      meta.append(name, reason);
      actions.append(retry, link);
      row.append(meta, actions);
      importFailuresList.append(row);
    });
    importSupplementHint.hidden = true;
    importSupplementFiles.value = '';
  }

  async function runImport() {
    if (importBusy) return;
    clearTimeout(importPreviewTimer);
    updateImportPreview();

    let markdown = importMarkdown.trim();
    const title = importTitle.value.trim();
    markdown = stripDuplicateTitle(markdown, title);
    if (!markdown) {
      toast('没有识别到可导入的文章内容');
      importText.focus();
      return;
    }

    setImportBusy(true, '正在导入…');
    importResult.hidden = true;
    try {
      await window.BlogDB.ready();
      const images = Util.remoteImageTool.collectRemoteImages(markdown);
      let result = { markdown, total: 0, saved: [], failed: [] };
      if (images.length) {
        showImportProgress(0, images.length, 0, 0);
        result = await window.BlogImporter.localizeImages(markdown, {
          cleanWatermark: cleanWatermarkEnabled(),
          watermarkMode: watermarkMode(),
          onProgress: ({ completed, total, saved, failed }) => showImportProgress(completed, total, saved, failed)
        });
      }
      applyImportedContent(result.markdown, title);
      importFailures = result.failed;
      setImportBusy(false);

      if (importFailures.length) {
        renderImportFailures(result.saved.length, importFailures);
        importConfirm.hidden = true;
        importResult.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        toast(`文章已导入，${result.saved.length} 张图片已保存，${importFailures.length} 张需要处理`);
      } else {
        closeImportDialog();
        toast(result.saved.length ? `文章已导入，${result.saved.length} 张图片已保存到本地` : '文章已导入');
      }
    } catch (error) {
      setImportBusy(false);
      toast(error.message || '导入失败，请重试');
    }
  }

  async function retryImportFailures() {
    if (importBusy || !importFailures.length) return;
    setImportBusy(true, '正在重试…');
    const urls = importFailures.map((item) => item.source);
    showImportProgress(0, urls.length, 0, 0);
    try {
      const result = await window.BlogImporter.localizeImages(source.value, {
        urls,
        cleanWatermark: cleanWatermarkEnabled(),
        watermarkMode: watermarkMode(),
        onProgress: ({ completed, total, saved, failed }) => showImportProgress(completed, total, saved, failed)
      });
      applyEdit(result.markdown, result.markdown.length, result.markdown.length);
      importFailures = result.failed;
      setImportBusy(false);
      if (importFailures.length) {
        renderImportFailures(result.saved.length, importFailures);
      } else {
        closeImportDialog();
        toast(`失败图片已重新保存 ${result.saved.length} 张`);
      }
    } catch (error) {
      setImportBusy(false);
      toast(error.message || '重试失败');
    }
  }

  async function retrySingleImportFailure(failure) {
    if (importBusy || !failure?.source) return;
    setImportBusy(true, '正在重新处理这张图片…');
    showImportProgress(0, 1, 0, 0);
    try {
      const result = await window.BlogImporter.localizeImages(source.value, {
        urls: [failure.source],
        cleanWatermark: cleanWatermarkEnabled(),
        watermarkMode: watermarkMode(),
        onProgress: ({ completed, total, saved, failed }) => showImportProgress(completed, total, saved, failed)
      });
      applyEdit(result.markdown, result.markdown.length, result.markdown.length);
      importFailures = importFailures.filter((item) => item.source !== failure.source).concat(result.failed);
      setImportBusy(false);
      if (result.failed.length) {
        renderImportFailures(result.saved.length, importFailures);
        toast(`这张图片仍未成功：${result.failed[0].reason || '下载失败'}`);
      } else {
        if (importFailures.length) renderImportFailures(result.saved.length, importFailures);
        else closeImportDialog();
        toast('这张图片已重新处理并保存');
      }
    } catch (error) {
      setImportBusy(false);
      toast(error.message || '这张图片重试失败');
    }
  }

  async function supplementImportImages(files) {
    const selected = Array.from(files || []).filter((file) => file?.type?.startsWith('image/'));
    if (!selected.length) {
      toast('请选择图片文件');
      return;
    }
    if (!importFailures.length) return;

    setImportBusy(true, '正在补传图片…');
    let body = source.value;
    let saved = 0;
    const remaining = [];
    for (let index = 0; index < importFailures.length; index += 1) {
      const failure = importFailures[index];
      const file = selected[index];
      if (!file) {
        remaining.push(failure);
        continue;
      }
      try {
        const image = await window.BlogDB.addImage(file, { name: file.name });
        body = window.BlogImporter.replaceImageSource(body, failure.source, image.id);
        saved += 1;
      } catch (error) {
        remaining.push({ ...failure, reason: error.message || '补传失败' });
      }
      showImportProgress(index + 1, importFailures.length, saved, remaining.length);
    }

    applyEdit(body, body.length, body.length);
    importFailures = remaining;
    setImportBusy(false);
    importSupplementHint.hidden = true;
    if (importFailures.length) {
      renderImportFailures(saved, importFailures);
      toast(`补传 ${saved} 张，仍有 ${importFailures.length} 张待处理`);
    } else {
      closeImportDialog();
      toast(`已补传并保存 ${saved} 张图片`);
    }
    importSupplementFiles.value = '';
  }

  async function readImportClipboard() {
    let html = '';
    let text = '';
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (!html && item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
          if (!text && item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
        }
      }
      if (!html && !text && navigator.clipboard?.readText) text = await navigator.clipboard.readText();
    } catch (error) {
      toast('无法直接读取剪贴板，请在粘贴区按 ⌘V / Ctrl+V');
      importText.focus();
      return;
    }

    if (!html && !text) {
      toast('剪贴板里没有文字或文章内容');
      return;
    }
    importHtml = html;
    if (!text && html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      text = doc.body?.textContent?.trim() || '';
    }
    importText.value = text;
    importPasteAt = Date.now();
    updateImportPreview();
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
      case 'import': return openImportDialog('paste');
      case 'localize-images': return openImportDialog('localize');
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
    if (event.key !== 'Escape') return;
    if (tagMenuOpen) {
      closeTagMenu();
      tagSelectBtn.focus();
      return;
    }
    closeMenus();
    closeVideoDialog();
    closePublishDialog();
    closeImportDialog();
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
      tags: selectedTags.slice(),
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
    setCategoryValue(draft.cat);
    setTagValue(draft.tags);
    summaryInput.value = draft.summary || '';
    updateSummaryCount();
    updateStats();
  }

  function updateSummaryCount() {
    summaryCount.textContent = `${summaryInput.value.length}/160`;
  }

  /* ---------------- 标签下拉选择 ---------------- */
  function tagOptionList() {
    const rows = Util.getTags();
    selectedTags.forEach((tag) => {
      if (!rows.some((item) => item.toLowerCase() === tag.toLowerCase())) rows.push(tag);
    });
    return rows;
  }

  function renderTagSelect() {
    const rows = tagOptionList();
    tagSelectOptions.innerHTML = rows.length
      ? rows.map((tag) => {
        const active = selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase());
        return `<button class="tag-option${active ? ' is-selected' : ''}" type="button" role="option" aria-selected="${active}" data-tag-option="${escapeHtml(tag)}">
          <span class="tag-option-check"><svg class="icon"><use href="#i-check"/></svg></span>
          <span class="tag-option-label">${escapeHtml(tag)}</span>
        </button>`;
      }).join('')
      : '<p class="tag-option-empty">还没有标签，在下方新建一个吧</p>';

    tagSelectValue.innerHTML = selectedTags.length
      ? selectedTags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')
      : '<span class="tag-select-placeholder">点击选择标签</span>';
    tagSelectedCount.textContent = selectedTags.length ? `已选 ${selectedTags.length}` : '可多选';
    tagSelectBtn.title = selectedTags.join('、');
  }

  function setTagValue(value) {
    const rows = Util.parseTags(value);
    selectedTags = rows.filter((tag, index) => rows.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index);
    renderTagSelect();
  }

  function openTagMenu() {
    if (!tagSelectMenu || tagMenuOpen) return;
    renderTagSelect();
    tagSelectMenu.hidden = false;
    tagMenuOpen = true;
    tagSelectBtn.setAttribute('aria-expanded', 'true');
    tagSelectOptions.querySelector('.tag-option')?.focus();
  }

  function closeTagMenu() {
    if (!tagSelectMenu || !tagMenuOpen) return;
    tagSelectMenu.hidden = true;
    tagMenuOpen = false;
    tagSelectBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleTag(tag) {
    const key = String(tag).toLowerCase();
    const index = selectedTags.findIndex((item) => item.toLowerCase() === key);
    if (index >= 0) selectedTags.splice(index, 1);
    else selectedTags.push(tag);
    renderTagSelect();
    markDirty();
  }

  function focusTagOption(tag) {
    tagSelectOptions.querySelectorAll('.tag-option').forEach((option) => {
      if (option.dataset.tagOption === tag) option.focus();
    });
  }

  function createTagFromPicker() {
    const label = tagCreateInput.value.trim();
    if (!label) {
      tagCreateInput.focus();
      return;
    }
    const key = label.toLowerCase();
    let tag = Util.getTags().find((item) => item.toLowerCase() === key);
    if (!tag) {
      try {
        tag = Util.addTag(label);
      } catch (error) {
        toast(error.message || '标签添加失败');
        return;
      }
    }
    if (!selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase())) selectedTags.push(tag);
    tagCreateInput.value = '';
    renderTagSelect();
    focusTagOption(tag);
    markDirty();
  }

  function populateCategories() {
    categorySelect.innerHTML = Util.getCategories()
      .map((item) => `<option value="${item.id}">${Util.escapeHtml(item.label)}</option>`)
      .join('');
  }

  function setCategoryValue(cat) {
    const categories = Util.getCategories();
    const id = cat || categories[0]?.id || '';
    if (!categorySelect.querySelector(`option[value="${id}"]`)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = categories.some((item) => item.id === id) ? Util.categoryLabel(id) : `${Util.categoryLabel(id)}（旧分类）`;
      categorySelect.append(option);
    }
    categorySelect.value = id;
  }

  function fillForm(article) {
    titleInput.value = article.title || '';
    source.value = article.body || '';
    setCategoryValue(article.cat);
    setTagValue(article.tags);
    summaryInput.value = article.summary || '';
    updateSummaryCount();
    updateStats();
  }

  function setPublishLabel(text) {
    const label = $('#publishText');
    if (label) label.textContent = text;
  }

  async function loadPage() {
    populateCategories();
    categorySelect.value = Util.getCategories()[0]?.id || '';
    renderTagSelect();
    updateSummaryCount();

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
      if (backLink) {
        backLink.href = `detail.html?id=${encodeURIComponent(articleId)}`;
        backLink.querySelector('span').textContent = '返回文章';
        backLink.title = '返回文章详情';
      }
    } else {
      if (articleId) {
        toast('文章不存在，已切换到新建模式');
        articleId = null;
        draftKey = draftKeyFor(null);
        history.replaceState(null, '', 'edit.html');
      }
      document.title = '写文章 · 字间';
      setPublishLabel('发布文章');
      if (backLink) {
        backLink.href = 'index.html';
        backLink.querySelector('span').textContent = '返回列表';
        backLink.title = '返回文章列表';
      }
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

  function validateBeforePublish() {
    const title = titleInput.value.trim();
    if (!title) {
      toast('先给文章起个标题吧');
      titleInput.focus();
      return false;
    }
    if (!source.value.trim()) {
      toast('正文还是空的，写点内容再发布吧');
      source.focus();
      return false;
    }
    return true;
  }

  function syncPublishConfirmLabel() {
    if (publishConfirmText) {
      publishConfirmText.textContent = articleId ? '确认保存修改' : '确认发布';
    }
  }

  function openPublishDialog() {
    if (publishing || !validateBeforePublish() || !publishDialog) return;
    if (!summaryInput.value.trim()) {
      summaryInput.value = DEFAULT_SUMMARY;
      updateSummaryCount();
    }
    closeTagMenu();
    renderTagSelect();
    syncPublishConfirmLabel();
    publishDialog.hidden = false;
    syncDialogLock();
    categorySelect.focus();
  }

  function closePublishDialog() {
    if (!publishDialog) return;
    closeTagMenu();
    publishDialog.hidden = true;
    syncDialogLock();
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
      tags: selectedTags.slice(),
      summary: summaryInput.value.trim() || Util.summarize(source.value)
    };

    publishing = true;
    publishBtn.disabled = true;
    if (publishConfirm) publishConfirm.disabled = true;
    clearTimeout(autosaveTimer);
    setPublishLabel(articleId ? '保存中…' : '发布中…');
    if (publishConfirmText) publishConfirmText.textContent = articleId ? '保存中…' : '发布中…';

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
      if (publishConfirm) publishConfirm.disabled = false;
      syncPublishConfirmLabel();
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
    markDirty();
  });

  tagSelectBtn.addEventListener('click', () => {
    if (tagMenuOpen) closeTagMenu();
    else openTagMenu();
  });

  tagSelectBtn.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' || tagMenuOpen) return;
    event.preventDefault();
    openTagMenu();
  });

  tagSelectOptions.addEventListener('click', (event) => {
    const option = event.target.closest('[data-tag-option]');
    if (!option) return;
    // 选项会随选中状态重新渲染，阻止事件冒泡到“点击外部关闭”的判断。
    event.stopPropagation();
    const tag = option.dataset.tagOption;
    toggleTag(tag);
    focusTagOption(tag);
  });

  tagSelectOptions.addEventListener('keydown', (event) => {
    const options = $$('.tag-option', tagSelectOptions);
    const index = options.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      options[Math.min(options.length - 1, index + 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index <= 0) tagSelectBtn.focus();
      else options[index - 1].focus();
    }
  });

  tagCreateBtn.addEventListener('click', createTagFromPicker);

  tagCreateInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    createTagFromPicker();
  });

  document.addEventListener('click', (event) => {
    if (tagMenuOpen && !event.target.closest('#tagSelect')) closeTagMenu();
  });

  summaryInput.addEventListener('input', () => {
    updateSummaryCount();
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
  publishBtn.addEventListener('click', openPublishDialog);

  if (publishDialog) {
    publishDialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-publish-close]')) closePublishDialog();
    });
    publishForm.addEventListener('submit', (event) => {
      event.preventDefault();
      publishArticle();
    });
  }

  if (importDialog) {
    importDialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-import-close]')) closeImportDialog();
    });
    importReadBtn.addEventListener('click', readImportClipboard);
    importClearBtn.addEventListener('click', resetImportDialog);
    importConfirm.addEventListener('click', runImport);
    importRetryFailed.addEventListener('click', retryImportFailures);
    importSupplement.addEventListener('click', () => {
      importSupplementHint.hidden = false;
      importSupplementFiles.click();
    });
    importSupplementFiles.addEventListener('change', () => supplementImportImages(importSupplementFiles.files));
    importText.addEventListener('paste', (event) => {
      const html = event.clipboardData?.getData('text/html') || '';
      importHtml = html.trim();
      importPasteAt = Date.now();
      setTimeout(updateImportPreview, 0);
    });
    importText.addEventListener('input', () => {
      if (importHtml && Date.now() - importPasteAt > 300) importHtml = '';
      queueImportPreview();
    });
    importTitle.addEventListener('input', () => {
      importTitleTouched = true;
      if (importTitle.value.trim()) importTitleEnabled.checked = true;
    });
    importWatermarkEnabled.addEventListener('change', () => {
      if (!cleanWatermarkEnabled()) importWatermarkHint.textContent = '水印清理已关闭，将保存网络原图。';
      showWatermarkPreview();
    });
    importWatermarkMode.addEventListener('change', () => {
      importWatermarkHint.textContent = `处理方式已切换为“${watermarkModeLabel()}”，正在重新生成预览…`;
      showWatermarkPreview();
    });
    importWatermarkRetry.addEventListener('click', () => showWatermarkPreview(watermarkPreviewSrc));
    importFailuresList.addEventListener('click', (event) => {
      const retry = event.target.closest('[data-retry-source]');
      if (!retry) return;
      const failure = importFailures.find((item) => item.source === retry.dataset.retrySource);
      if (failure) retrySingleImportFailure(failure);
    });
    importImages.addEventListener('click', (event) => {
      const link = event.target.closest('.import-image-item');
      if (!link) return;
      event.preventDefault();
      const src = link.dataset.src;
      if (src && importUrls.some((item) => item.src === src)) {
        importUrls = [importUrls.find((item) => item.src === src), ...importUrls.filter((item) => item.src !== src)];
        showWatermarkPreview();
      }
    });
  }

  $('#richBtn').addEventListener('click', () => toast('富文本模式尚未接入，当前使用 Markdown 编辑'));

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
