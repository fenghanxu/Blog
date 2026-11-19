/* ============================================================
   index.html 数据与交互
   - 启动时从 IndexedDB 读取文章
   - 分类 / 搜索 / 排序 / 分页在本地完成
   - 点击标题进详情，点击“编辑”进编辑器
   ============================================================ */
(() => {
  'use strict';

  const Util = window.BlogUtil;
  const SORT_LABEL = { latest: '最新发布', reads: '最多阅读', likes: '最多点赞' };
  const PER_PAGE = 6;

  const state = { cat: 'all', q: '', sort: 'latest', page: 1 };
  let articles = [];

  const $ = (selector) => document.querySelector(selector);
  const listEl = $('#articleList');
  const emptyEl = $('#emptyState');
  const pagerEl = $('#pager');
  const rangeEl = $('#rangeInfo');
  const totalEl = $('#totalCount');
  const titleEl = $('#listTitle');
  const sortSelect = $('#sortSelect');
  const searchInput = $('#searchInput');
  const tabsEl = $('#tabs');
  const tabIndicator = $('#tabIndicator');
  const emptyTitle = $('.empty-title');
  const emptyHint = $('.empty-hint');
  const emptyBtn = $('.empty-btn');
  const toastEl = $('#toast');
  const backupBtn = $('#backupBtn');
  const backupModal = $('#backupModal');
  const exportBackupBtn = $('#exportBackupBtn');
  const exportBackupText = $('#exportBackupText');
  const importFile = $('#importFile');
  const backupFileLabel = $('#backupFileLabel');
  const backupFileText = $('#backupFileText');
  const backupStats = $('#backupStats');
  const deleteModal = $('#deleteModal');
  const deleteArticleName = $('#deleteArticleName');
  const confirmDeleteBtn = $('#confirmDeleteBtn');

  let toastTimer = 0;
  let pendingDeleteId = null;
  let deleteTrigger = null;
  let deleting = false;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2600);
  }

  function counts() {
    return articles.reduce((acc, item) => {
      acc[item.cat] = (acc[item.cat] || 0) + 1;
      return acc;
    }, { all: articles.length });
  }

  function paintCounts() {
    const map = counts();
    document.querySelectorAll('.tab-count').forEach((el) => {
      el.textContent = Util.pad2(map[el.dataset.count] || 0);
    });
  }

  function syncTabIndicator(animate = true) {
    const activeTab = tabsEl.querySelector('.tab.is-active');
    if (!activeTab || !tabIndicator) return;

    if (!animate) tabIndicator.classList.add('is-instant');
    tabIndicator.style.width = `${activeTab.offsetWidth}px`;
    tabIndicator.style.transform = `translate3d(${activeTab.offsetLeft}px,0,0)`;

    if (!animate) {
      tabIndicator.getBoundingClientRect();
      requestAnimationFrame(() => tabIndicator.classList.remove('is-instant'));
    }
  }

  function searchText(item) {
    return [item.title, item.summary, (item.tags || []).join(' '), Util.stripMarkdown(item.body)]
      .join(' ')
      .toLowerCase();
  }

  function filtered() {
    const query = state.q.trim().toLowerCase();
    let items = articles.filter((item) => state.cat === 'all' || item.cat === state.cat);

    if (query) items = items.filter((item) => searchText(item).includes(query));

    const sorters = {
      latest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      reads: (a, b) => b.reads - a.reads,
      likes: (a, b) => b.likes - a.likes
    };
    return items.sort(sorters[state.sort]);
  }

  function rowTemplate(item, index) {
    const tags = (item.tags || [])
      .map((tag) => `<span class="tag">${Util.escapeHtml(tag)}</span>`)
      .join('');
    const detailUrl = `detail.html?id=${encodeURIComponent(item.id)}`;
    const editUrl = `edit.html?id=${encodeURIComponent(item.id)}`;

    return `
      <article class="row" data-id="${Util.escapeHtml(item.id)}">
        <span class="idx">${Util.pad2(index)}</span>
        <a class="row-main" href="${detailUrl}" aria-label="阅读：${Util.escapeHtml(item.title)}">
          <h2 class="title">${Util.escapeHtml(item.title)}</h2>
          <p class="summary">${Util.escapeHtml(item.summary || '暂无摘要')}</p>
          <div class="tags">${tags}</div>
        </a>
        <div class="row-side">
          <div class="meta">
            <span>${Util.formatListDate(item.createdAt)}</span>
            <span class="dot">·</span>
            <span>阅读 ${Util.formatReads(item.reads)}</span>
            <span class="dot">·</span>
            <span class="likes"><svg class="icon"><use href="#i-heart"/></svg>${item.likes || 0}</span>
          </div>
          <div class="row-actions">
            <a class="edit-link" href="${editUrl}" aria-label="编辑：${Util.escapeHtml(item.title)}">
              <svg class="icon"><use href="#i-pen"/></svg>编辑
            </a>
            <button class="delete-btn" type="button" data-delete-id="${Util.escapeHtml(item.id)}" aria-label="删除：${Util.escapeHtml(item.title)}">
              <svg class="icon"><use href="#i-trash"/></svg>删除
            </button>
          </div>
        </div>
      </article>`;
  }

  function pageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (end < total - 1) pages.push('...');
    pages.push(total);
    return pages;
  }

  function paintPager(totalPages) {
    if (totalPages <= 1) {
      pagerEl.innerHTML = '';
      return;
    }

    const items = pageNumbers(state.page, totalPages).map((item) => {
      if (item === '...') return '<span class="gap">…</span>';
      const active = item === state.page;
      return `<button type="button" data-page="${item}" class="${active ? 'is-active' : ''}" aria-label="第 ${item} 页" ${active ? 'aria-current="page"' : ''}>${item}</button>`;
    });

    items.push(`<button type="button" class="next" data-next="1" ${state.page >= totalPages ? 'disabled' : ''}>下一页<svg class="icon"><use href="#i-arrow"/></svg></button>`);
    pagerEl.innerHTML = items.join('');
  }

  function setEmpty(kind, title, hint, buttonText) {
    emptyEl.hidden = false;
    listEl.hidden = true;
    emptyTitle.textContent = title;
    emptyHint.textContent = hint;
    emptyBtn.textContent = buttonText;
    emptyBtn.dataset.mode = kind;
  }

  function render() {
    const items = filtered();
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    state.page = Math.min(state.page, totalPages);

    const startIndex = (state.page - 1) * PER_PAGE;
    const pageItems = items.slice(startIndex, startIndex + PER_PAGE);

    titleEl.textContent = SORT_LABEL[state.sort];
    totalEl.textContent = `共 ${total} 篇`;

    if (!articles.length) {
      setEmpty('blank', '还没有文章', '写下第一篇，记录此刻的想法', '写第一篇文章');
      pagerEl.innerHTML = '';
      rangeEl.textContent = '显示 0-0 篇，共 0 篇';
      return;
    }

    if (!total) {
      setEmpty('filter', '没有找到相关文章', '换个关键词，或者切回“全部文章”看看', '重置筛选');
      pagerEl.innerHTML = '';
      rangeEl.textContent = '显示 0-0 篇，共 0 篇';
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;
    listEl.innerHTML = pageItems.map((item, i) => rowTemplate(item, startIndex + i + 1)).join('');
    rangeEl.textContent = `显示 ${startIndex + 1}-${startIndex + pageItems.length} 篇，共 ${total} 篇`;
    paintPager(totalPages);
  }

  async function loadArticles() {
    try {
      await window.BlogDB.ready();
      articles = await window.BlogDB.list();
      paintCounts();
      render();
    } catch (error) {
      setEmpty('error', '读取文章失败', error.message || '请刷新页面重试', '重新加载');
      totalEl.textContent = '共 0 篇';
      pagerEl.innerHTML = '';
      rangeEl.textContent = '显示 0-0 篇，共 0 篇';
    }
  }

  /* ---------------- 备份与恢复 ---------------- */
  async function refreshBackupStats() {
    if (!backupStats) return;
    backupStats.textContent = '正在统计…';
    try {
      await window.BlogDB.ready();
      const [items, imageCount] = await Promise.all([
        window.BlogDB.list(),
        window.BlogDB.countImages()
      ]);
      backupStats.textContent = `当前 ${items.length} 篇文章 · ${imageCount} 张本地图片`;
    } catch (error) {
      backupStats.textContent = '暂时无法统计';
    }
  }

  function openBackup() {
    backupModal.hidden = false;
    document.body.style.overflow = 'hidden';
    refreshBackupStats();
    backupModal.querySelector('.modal-close')?.focus();
  }

  function closeBackup() {
    backupModal.hidden = true;
    document.body.style.overflow = '';
    backupBtn.focus();
  }

  function backupFileName() {
    const now = new Date();
    const day = `${now.getFullYear()}${Util.pad2(now.getMonth() + 1)}${Util.pad2(now.getDate())}`;
    const time = `${Util.pad2(now.getHours())}${Util.pad2(now.getMinutes())}`;
    return `zjian-backup-${day}-${time}.json`;
  }

  async function downloadBackup() {
    if (exportBackupBtn.disabled) return;
    exportBackupBtn.disabled = true;
    exportBackupText.textContent = '正在打包…';

    try {
      await window.BlogDB.ready();
      const data = await window.BlogDB.exportBackup();
      if (!data.articles.length && !data.images.length) {
        toast('还没有可以备份的文章或图片');
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = backupFileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      toast(`已导出 ${data.articles.length} 篇文章、${data.images.length} 张图片`);
      refreshBackupStats();
    } catch (error) {
      toast(error.message || '备份导出失败');
    } finally {
      exportBackupBtn.disabled = false;
      exportBackupText.textContent = '下载备份';
    }
  }

  async function importBackupFile(file) {
    if (!file) return;
    backupFileLabel.classList.add('is-busy');
    backupFileText.textContent = '正在导入…';

    try {
      let data = null;
      try {
        data = JSON.parse(await file.text());
      } catch (error) {
        throw new Error('文件不是有效的 JSON 备份');
      }
      if (!data || !Array.isArray(data.articles)) {
        throw new Error('这个文件不是字间博客的备份');
      }

      const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'merge';
      if (mode === 'replace' && !window.confirm('覆盖恢复会清空当前所有文章和本地图片，且无法撤销。确定继续吗？')) {
        return;
      }

      await window.BlogDB.ready();
      const result = await window.BlogDB.importBackup(data, mode);
      const skipped = result.skipped ? `，跳过 ${result.skipped} 篇同 ID 文章` : '';
      toast(`导入完成：${result.imported} 篇文章、${result.images} 张图片${skipped}`);
      closeBackup();
      await loadArticles();
    } catch (error) {
      toast(error.message || '导入失败，请检查备份文件');
    } finally {
      backupFileLabel.classList.remove('is-busy');
      backupFileText.textContent = '选择备份文件';
      importFile.value = '';
    }
  }

  /* ---------------- 删除文章 ---------------- */
  function openDelete(id, trigger) {
    const article = articles.find((item) => item.id === id);
    if (!article) {
      toast('文章不存在或已被删除');
      return;
    }

    pendingDeleteId = id;
    deleteTrigger = trigger;
    deleteArticleName.textContent = `《${article.title}》`;
    confirmDeleteBtn.disabled = false;
    confirmDeleteBtn.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>确认删除';
    deleteModal.hidden = false;
    document.body.style.overflow = 'hidden';
    deleteModal.querySelector('.delete-cancel')?.focus();
  }

  function closeDelete() {
    if (deleting) return;
    deleteModal.hidden = true;
    document.body.style.overflow = '';
    pendingDeleteId = null;
    const trigger = deleteTrigger;
    deleteTrigger = null;
    if (trigger?.isConnected) trigger.focus();
  }

  async function confirmDeleteArticle() {
    if (!pendingDeleteId || deleting) return;

    const id = pendingDeleteId;
    deleting = true;
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = '正在删除…';

    try {
      await window.BlogDB.ready();
      const stored = await window.BlogDB.get(id);
      const usedImages = Util.localImageIds(stored?.body || '');
      await window.BlogDB.remove(id);
      await window.BlogDB.cleanupImages(usedImages).catch(() => 0);
      localStorage.removeItem(`zjian.edit.draft.${id}`);

      articles = articles.filter((item) => item.id !== id);
      paintCounts();
      render();
      deleting = false;
      closeDelete();
      toast('文章已删除');
    } catch (error) {
      deleting = false;
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>确认删除';
      toast(error.message || '删除失败，请重试');
    }
  }

  /* ---------------- 事件 ---------------- */
  listEl.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-id]');
    if (!deleteButton) return;
    event.preventDefault();
    openDelete(deleteButton.dataset.deleteId, deleteButton);
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('is-active', item === tab));
      syncTabIndicator();
      state.cat = tab.dataset.cat;
      state.page = 1;
      render();
    });
  });

  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    state.page = 1;
    render();
  });

  searchInput.addEventListener('input', () => {
    state.q = searchInput.value;
    state.page = 1;
    render();
  });

  pagerEl.addEventListener('click', (event) => {
    const pageBtn = event.target.closest('button[data-page]');
    const nextBtn = event.target.closest('button[data-next]');

    if (pageBtn) {
      state.page = Number(pageBtn.dataset.page);
    } else if (nextBtn && !nextBtn.disabled) {
      state.page += 1;
    } else {
      return;
    }

    render();
    document.querySelector('.panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  emptyBtn.addEventListener('click', () => {
    const mode = emptyBtn.dataset.mode;
    if (mode === 'blank') {
      window.location.href = 'edit.html';
      return;
    }
    if (mode === 'error') {
      window.location.reload();
      return;
    }

    state.cat = 'all';
    state.q = '';
    state.page = 1;
    searchInput.value = '';
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.cat === 'all'));
    syncTabIndicator();
    render();
    searchInput.focus();
  });

  backupBtn.addEventListener('click', openBackup);
  exportBackupBtn.addEventListener('click', downloadBackup);
  importFile.addEventListener('change', () => importBackupFile(importFile.files[0]));
  backupModal.querySelectorAll('[data-close-backup]').forEach((element) => {
    element.addEventListener('click', closeBackup);
  });
  deleteModal.querySelectorAll('[data-close-delete]').forEach((element) => {
    element.addEventListener('click', closeDelete);
  });
  confirmDeleteBtn.addEventListener('click', confirmDeleteArticle);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!deleteModal.hidden) closeDelete();
    else if (!backupModal.hidden) closeBackup();
  });

  /* ---------------- 初始化 ---------------- */
  const params = new URLSearchParams(window.location.search);
  if (params.get('deleted') === '1') toast('文章已删除');
  if (params.get('saved') === '1') toast('文章已保存');

  paintCounts();
  syncTabIndicator(false);
  window.addEventListener('resize', () => syncTabIndicator(false));
  loadArticles();
})();
