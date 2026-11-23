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

  const state = { cat: 'all', tag: '', q: '', sort: 'latest', page: 1 };
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
  const categoryFilter = $('#categoryFilter');
  const categoryFilterBtn = $('#categoryFilterBtn');
  const categoryMenu = $('#categoryMenu');
  const tagFilter = $('#tagFilter');
  const tagFilterBtn = $('#tagFilterBtn');
  const tagMenu = $('#tagMenu');
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
  const categoryModal = $('#categoryModal');
  const categoryForm = $('#categoryForm');
  const categoryInput = $('#categoryInput');
  const categoryList = $('#categoryList');
  const categoryTotal = $('#categoryTotal');
  const categoryError = $('#categoryError');
  const categoryAddBtn = $('#categoryAddBtn');
  const tagModal = $('#tagModal');
  const tagForm = $('#tagForm');
  const tagInput = $('#tagInput');
  const tagList = $('#tagList');
  const tagTotal = $('#tagTotal');
  const tagError = $('#tagError');
  const tagAddBtn = $('#tagAddBtn');

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

  function renderCategories() {
    const map = counts();
    const categories = Util.getCategories();
    const items = categories.map((category) => `
      <button class="category-menu-item${state.cat === category.id ? ' is-active' : ''}" type="button" role="menuitemradio" aria-checked="${state.cat === category.id}" data-cat="${Util.escapeHtml(category.id)}">
        <span>${Util.escapeHtml(category.label)}</span><span class="category-menu-count">${Util.pad2(map[category.id] || 0)}</span>
      </button>`);
    categoryMenu.innerHTML = `
      <button class="category-menu-item${state.cat === 'all' ? ' is-active' : ''}" type="button" role="menuitemradio" aria-checked="${state.cat === 'all'}" data-cat="all">
        <span>全部文章</span><span class="category-menu-count">${Util.pad2(map.all || 0)}</span>
      </button>
      ${items.join('')}
      <div class="category-menu-divider" role="separator"></div>
      <button class="category-menu-edit" type="button" role="menuitem" data-category-edit>
        <span>分类编辑</span><svg class="icon"><use href="#i-pen"/></svg>
      </button>`;
    if (state.cat !== 'all' && !categories.some((item) => item.id === state.cat) && !articles.some((item) => item.cat === state.cat)) {
      state.cat = 'all';
    }
    categoryFilterBtn.querySelector('span').textContent = state.cat === 'all' ? '分类' : (categories.find((item) => item.id === state.cat)?.label || '分类');
  }

  function openCategoryMenu() {
    renderCategories();
    categoryMenu.hidden = false;
    categoryFilterBtn.setAttribute('aria-expanded', 'true');
    categoryMenu.querySelector('.category-menu-item')?.focus();
  }

  function closeCategoryMenu() {
    categoryMenu.hidden = true;
    categoryFilterBtn.setAttribute('aria-expanded', 'false');
  }

  function selectCategory(cat) {
    state.cat = cat;
    state.page = 1;
    closeCategoryMenu();
    render();
    renderCategories();
    categoryFilterBtn.focus();
  }

  function syncAllCategories() {
    renderCategories();
    renderTags();
  }

  function tagCounts() {
    return articles.reduce((map, item) => {
      (item.tags || []).forEach((tag) => { map[tag] = (map[tag] || 0) + 1; });
      return map;
    }, {});
  }

  function renderTags() {
    const map = tagCounts();
    const tags = Util.getTags();
    tagMenu.innerHTML = `${tags.map((tag) => `
        <button class="category-menu-item${state.tag === tag ? ' is-active' : ''}" type="button" role="menuitemradio" aria-checked="${state.tag === tag}" data-tag="${Util.escapeHtml(tag)}">
          <span>${Util.escapeHtml(tag)}</span><span class="category-menu-count">${Util.pad2(map[tag] || 0)}</span>
        </button>`).join('')}
      <div class="category-menu-divider" role="separator"></div>
      <button class="category-menu-edit" type="button" role="menuitem" data-tag-edit>
        <span>标签编辑</span><svg class="icon"><use href="#i-pen"/></svg>
      </button>`;
    if (state.tag && !tags.includes(state.tag)) state.tag = '';
    tagFilterBtn.querySelector('span').textContent = state.tag || '标签';
  }

  function openTagMenu() {
    renderTags();
    tagMenu.hidden = false;
    tagFilterBtn.setAttribute('aria-expanded', 'true');
    tagMenu.querySelector('.category-menu-item')?.focus();
  }

  function closeTagMenu() {
    tagMenu.hidden = true;
    tagFilterBtn.setAttribute('aria-expanded', 'false');
  }

  function selectTag(tag) {
    state.tag = tag && tag !== state.tag ? tag : '';
    state.page = 1;
    closeTagMenu();
    render();
    renderTags();
    tagFilterBtn.focus();
  }

  function searchText(item) {
    return [item.title, item.summary, (item.tags || []).join(' '), Util.stripMarkdown(item.body)]
      .join(' ')
      .toLowerCase();
  }

  function pinTime(item) {
    const time = item?.pinnedAt ? new Date(item.pinnedAt).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function unpinTime(item) {
    const time = item?.unpinnedAt ? new Date(item.unpinnedAt).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function filtered() {
    const query = state.q.trim().toLowerCase();
    let items = articles.filter((item) => (state.cat === 'all' || item.cat === state.cat)
      && (!state.tag || (item.tags || []).includes(state.tag)));

    if (query) items = items.filter((item) => searchText(item).includes(query));

    const sorters = {
      latest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      reads: (a, b) => b.reads - a.reads,
      likes: (a, b) => b.likes - a.likes
    };
    const bySort = sorters[state.sort];

    // 置顶文章始终排在前面；取消置顶的文章排在所有非置顶文章之前。
    return items.sort((a, b) => {
      const aPinned = pinTime(a);
      const bPinned = pinTime(b);
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aUnpinned = unpinTime(a);
      const bUnpinned = unpinTime(b);
      if (aUnpinned !== bUnpinned) return bUnpinned - aUnpinned;

      return bySort(a, b);
    });
  }

  function rowTemplate(item, index) {
    const tags = (item.tags || [])
      .map((tag) => `<span class="tag">${Util.escapeHtml(tag)}</span>`)
      .join('');
    const detailUrl = `detail.html?id=${encodeURIComponent(item.id)}`;
    const editUrl = `edit.html?id=${encodeURIComponent(item.id)}`;
    const pinned = Boolean(item.pinnedAt);
    const pinText = pinned ? '取消置顶' : '置顶';

    return `
      <article class="row${pinned ? ' is-pinned' : ''}" data-id="${Util.escapeHtml(item.id)}">
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
            <button class="pin-btn${pinned ? ' is-pinned' : ''}" type="button" data-pin-id="${Util.escapeHtml(item.id)}" data-pinned="${pinned}" aria-pressed="${pinned}" aria-label="${pinText}：${Util.escapeHtml(item.title)}" title="${pinText}">
              <svg class="icon"><use href="#i-pin"/></svg><span>${pinText}</span>
            </button>
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
      renderCategories();
      renderTags();
      render();
    } catch (error) {
      setEmpty('error', '读取文章失败', error.message || '请刷新页面重试', '重新加载');
      totalEl.textContent = '共 0 篇';
      pagerEl.innerHTML = '';
      rangeEl.textContent = '显示 0-0 篇，共 0 篇';
    }
  }

  /* ---------------- 分类编辑 ---------------- */
  function showCategoryError(message = '') {
    categoryError.textContent = message;
    categoryError.hidden = !message;
  }

  function categoryUsage() {
    return articles.reduce((map, item) => {
      map[item.cat] = (map[item.cat] || 0) + 1;
      return map;
    }, {});
  }

  function renderCategoryManager() {
    const categories = Util.getCategories();
    const usage = categoryUsage();
    categoryList.innerHTML = categories.map((category) => {
      const used = usage[category.id] || 0;
      const title = used ? `这个分类下还有 ${used} 篇文章，暂不能删除` : '删除分类';
      return `
        <div class="category-tile${used ? ' is-used' : ''}" data-category-id="${Util.escapeHtml(category.id)}" title="${used ? `有 ${used} 篇文章使用` : '暂无文章使用'}">
          <button class="category-name" type="button" data-rename-category="${Util.escapeHtml(category.id)}" title="点击文字可重命名分类">
            <span>${Util.escapeHtml(category.label)}</span>
            <svg class="icon category-edit-icon" aria-hidden="true"><use href="#i-pen"/></svg>
          </button>
          <button class="category-tile-close" type="button" data-delete-category="${Util.escapeHtml(category.id)}" title="${title}" aria-label="删除分类：${Util.escapeHtml(category.label)}" ${used || categories.length <= 1 ? 'disabled' : ''}>
            <svg class="icon"><use href="#i-close"/></svg>
          </button>
        </div>`;
    }).join('');
    categoryTotal.textContent = `共 ${categories.length} 个`;
  }

  function openCategoryModal() {
    showCategoryError();
    renderCategoryManager();
    categoryModal.hidden = false;
    document.body.style.overflow = 'hidden';
    categoryModal.querySelector('.modal-close')?.focus();
  }

  function closeCategoryModal() {
    categoryModal.hidden = true;
    document.body.style.overflow = '';
    categoryFilterBtn.focus();
  }

  function syncCategoryViews() {
    renderCategoryManager();
    syncAllCategories();
    render();
  }

  function updateCategoryAddState() {
    const disabled = !categoryInput.value.trim();
    categoryAddBtn.disabled = disabled;
    categoryAddBtn.setAttribute('aria-disabled', String(disabled));
  }

  function detectCategoryChange(event) {
    if (event.key === 'zjian.categories' && event.newValue !== event.oldValue) {
      syncCategoryViews();
    }
  }

  function loadCategoriesFromStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem('zjian.categories') || 'null');
      if (Array.isArray(stored) && stored.length) {
        Util.applyCategories(stored);
      }
    } catch (error) {
      // 本地分类数据损坏时保留当前内存中的分类。
    }
    if (!categoryModal.hidden) syncCategoryViews();
    else {
      syncAllCategories();
      render();
    }
  }

  function startCategoryRename(id) {
    const tile = categoryList.querySelector(`[data-category-id="${CSS.escape(id)}"]`);
    const category = Util.getCategories().find((item) => item.id === id);
    if (!tile || !category || tile.classList.contains('is-editing')) return;

    const nameButton = tile.querySelector('.category-name');
    const closeButton = tile.querySelector('.category-tile-close');
    const input = document.createElement('input');
    input.className = 'category-rename-input';
    input.type = 'text';
    input.maxLength = 16;
    input.value = category.label;
    input.setAttribute('aria-label', '新的分类名称');
    tile.classList.add('is-editing');
    tile.insertBefore(input, nameButton);
    nameButton.hidden = true;
    if (closeButton) closeButton.hidden = true;

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (!save) {
        input.remove();
        nameButton.hidden = false;
        if (closeButton) closeButton.hidden = false;
        tile.classList.remove('is-editing');
        return;
      }
      try {
        Util.renameCategory(id, input.value);
        showCategoryError();
        syncCategoryViews();
        toast('分类名称已更新');
      } catch (error) {
        finished = false;
        showCategoryError(error.message);
        input.focus();
        input.select();
      }
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(false));
    input.focus();
    input.select();
  }

  /* ---------------- 标签编辑 ---------------- */
  function showTagError(message = '') {
    tagError.textContent = message;
    tagError.hidden = !message;
  }

  function tagUsage() {
    return articles.reduce((map, item) => {
      (item.tags || []).forEach((tag) => { map[tag] = (map[tag] || 0) + 1; });
      return map;
    }, {});
  }

  function renderTagManager() {
    const tags = Util.getTags();
    const usage = tagUsage();
    tagList.innerHTML = tags.map((tag) => {
      const used = usage[tag] || 0;
      return `
        <div class="category-tile${used ? ' is-used' : ''}" data-tag-name="${Util.escapeHtml(tag)}">
          <span class="category-name tag-name" title="${used ? `有 ${used} 篇文章使用` : '暂无文章使用'}">${Util.escapeHtml(tag)}</span>
          <button class="category-tile-close" type="button" data-delete-tag="${Util.escapeHtml(tag)}" title="${used ? `这个标签下还有 ${used} 篇文章，暂不能删除` : '删除标签'}" aria-label="删除标签：${Util.escapeHtml(tag)}" ${used ? 'disabled' : ''}>
            <svg class="icon"><use href="#i-close"/></svg>
          </button>
        </div>`;
    }).join('');
    tagTotal.textContent = `共 ${tags.length} 个`;
  }

  function openTagModal() {
    showTagError();
    renderTagManager();
    tagModal.hidden = false;
    document.body.style.overflow = 'hidden';
    tagModal.querySelector('.modal-close')?.focus();
  }

  function closeTagModal() {
    tagModal.hidden = true;
    document.body.style.overflow = '';
    tagFilterBtn.focus();
  }

  function updateTagAddState() {
    const disabled = !tagInput.value.trim();
    tagAddBtn.disabled = disabled;
    tagAddBtn.setAttribute('aria-disabled', String(disabled));
  }

  function syncTagViews() {
    if (!tagModal.hidden) renderTagManager();
    renderTags();
    render();
  }

  function loadTagsFromStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem('zjian.tags') || 'null');
      if (Array.isArray(stored) && stored.length) {
        const incoming = stored.map((tag) => String(tag || '').trim()).filter(Boolean);
        if (JSON.stringify(incoming) !== JSON.stringify(Util.getTags())) {
          Util.applyTags(incoming);
        }
      }
    } catch (error) {
      // 本地标签数据损坏时保留当前内存中的标签。
    }
    if (!tagModal.hidden) renderTagManager();
    renderTags();
    render();
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
      renderCategories();
      renderTags();
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

  const pinning = new Set();

  async function togglePin(button) {
    const id = button.dataset.pinId;
    if (!id || pinning.has(id)) return;
    const item = articles.find((row) => row.id === id);
    if (!item) return;

    const nextPinned = !item.pinnedAt;
    pinning.add(id);
    button.disabled = true;

    try {
      await window.BlogDB.ready();
      const saved = await window.BlogDB.setPinned(id, nextPinned);
      const index = articles.findIndex((row) => row.id === id);
      if (index >= 0) articles[index] = { ...articles[index], ...saved };
      state.page = 1;
      render();
      [...listEl.querySelectorAll('[data-pin-id]')]
        .find((element) => element.dataset.pinId === id)?.focus();
      toast(nextPinned ? '文章已置顶' : '已取消置顶，文章排在非置顶文章首位');
    } catch (error) {
      button.disabled = false;
      toast(error.message || '操作失败，请重试');
    } finally {
      pinning.delete(id);
    }
  }

  /* ---------------- 事件 ---------------- */
  listEl.addEventListener('click', (event) => {
    const pinButton = event.target.closest('[data-pin-id]');
    if (pinButton) {
      event.preventDefault();
      togglePin(pinButton);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-id]');
    if (!deleteButton) return;
    event.preventDefault();
    openDelete(deleteButton.dataset.deleteId, deleteButton);
  });

  categoryFilterBtn.addEventListener('click', () => {
    if (categoryMenu.hidden) openCategoryMenu();
    else closeCategoryMenu();
  });
  categoryMenu.addEventListener('click', (event) => {
    if (event.target.closest('[data-category-edit]')) {
      closeCategoryMenu();
      openCategoryModal();
      return;
    }
    const item = event.target.closest('[data-cat]');
    if (item) selectCategory(item.dataset.cat);
  });
  document.addEventListener('click', (event) => {
    if (!categoryFilter.contains(event.target)) closeCategoryMenu();
  });
  categoryMenu.addEventListener('keydown', (event) => {
    const items = [...categoryMenu.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  });
  tagFilterBtn.addEventListener('click', () => {
    if (tagMenu.hidden) {
      closeCategoryMenu();
      openTagMenu();
    } else closeTagMenu();
  });
  tagMenu.addEventListener('click', (event) => {
    if (event.target.closest('[data-tag-edit]')) {
      closeTagMenu();
      openTagModal();
      return;
    }
    const item = event.target.closest('[data-tag]');
    if (item) selectTag(item.dataset.tag || '');
  });
  tagMenu.addEventListener('keydown', (event) => {
    const items = [...tagMenu.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!tagFilter.contains(event.target)) closeTagMenu();
  });
  tagForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      Util.addTag(tagInput.value);
      tagInput.value = '';
      updateTagAddState();
      showTagError();
      renderTagManager();
      syncTagViews();
      toast('标签已添加');
      tagInput.focus();
    } catch (error) {
      showTagError(error.message);
      tagInput.focus();
    }
  });
  tagInput.addEventListener('input', () => {
    showTagError();
    updateTagAddState();
  });
  tagList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-tag]');
    if (!button) return;
    try {
      const wasSelected = state.tag === button.dataset.deleteTag;
      Util.deleteTag(button.dataset.deleteTag);
      if (wasSelected) state.tag = '';
      showTagError();
      renderTagManager();
      syncTagViews();
      toast('标签已删除');
    } catch (error) {
      showTagError(error.message);
    }
  });
  tagModal.querySelectorAll('[data-close-tag]').forEach((element) => {
    element.addEventListener('click', closeTagModal);
  });
  updateTagAddState();
  categoryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const category = Util.addCategory(categoryInput.value);
      categoryInput.value = '';
      updateCategoryAddState();
      showCategoryError();
      syncCategoryViews();
      toast(`已添加分类「${category.label}」`);
      categoryInput.focus();
    } catch (error) {
      showCategoryError(error.message);
      categoryInput.focus();
    }
  });
  categoryInput.addEventListener('input', () => {
    showCategoryError();
    updateCategoryAddState();
  });
  categoryList.addEventListener('click', (event) => {
    const renameButton = event.target.closest('[data-rename-category]');
    if (renameButton) {
      startCategoryRename(renameButton.dataset.renameCategory);
      return;
    }
    const button = event.target.closest('[data-delete-category]');
    if (!button) return;
    const category = Util.getCategories().find((item) => item.id === button.dataset.deleteCategory);
    if (!category) return;
    try {
      Util.deleteCategory(category.id);
      syncCategoryViews();
      toast(`已删除分类「${category.label}」`);
    } catch (error) {
      showCategoryError(error.message);
    }
  });
  categoryModal.querySelectorAll('[data-close-category]').forEach((element) => {
    element.addEventListener('click', closeCategoryModal);
  });
  updateCategoryAddState();

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
    state.tag = '';
    state.q = '';
    state.page = 1;
    searchInput.value = '';
    renderCategories();
    renderTags();
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
    if (!categoryMenu.hidden) {
      closeCategoryMenu();
      categoryFilterBtn.focus();
    } else if (!tagMenu.hidden) {
      closeTagMenu();
      tagFilterBtn.focus();
    } else if (!tagModal.hidden) closeTagModal();
    else if (!categoryModal.hidden) closeCategoryModal();
    else if (!deleteModal.hidden) closeDelete();
    else if (!backupModal.hidden) closeBackup();
  });
  window.addEventListener('storage', detectCategoryChange);
  window.addEventListener('storage', (event) => {
    if (event.key === 'zjian.tags' && event.newValue !== event.oldValue) loadTagsFromStorage();
  });
  window.addEventListener('focus', loadCategoriesFromStorage);
  window.addEventListener('focus', loadTagsFromStorage);
  window.addEventListener('pageshow', loadCategoriesFromStorage);
  window.addEventListener('pageshow', loadTagsFromStorage);

  /* ---------------- 初始化 ---------------- */
  const params = new URLSearchParams(window.location.search);
  if (params.get('deleted') === '1') toast('文章已删除');
  if (params.get('saved') === '1') toast('文章已保存');

  renderCategories();
  renderTags();
  loadArticles();
})();
