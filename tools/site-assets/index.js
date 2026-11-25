/* ============================================================
   只读列表页：分类 / 标签 / 搜索 / 排序 / 分页
   数据来自页面内嵌的 JSON，没有任何写操作
   ============================================================ */
(() => {
  'use strict';

  const dataEl = document.getElementById('blogData');
  if (!dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const ARTICLES = data.articles || [];
  const CATEGORIES = data.categories || [];
  const TAGS = data.tags || [];
  const PER_PAGE = data.perPage || 20;

  const $ = (selector) => document.querySelector(selector);
  const listEl = $('#articleList');
  const emptyEl = $('#emptyState');
  const pagerEl = $('#pager');
  const rangeEl = $('#rangeInfo');
  const totalEl = $('#totalCount');
  const titleEl = $('#listTitle');
  const searchEl = $('#searchInput');
  const sortEl = $('#sortSelect');

  const categoryFilterBtn = $('#categoryFilterBtn');
  const categoryMenu = $('#categoryMenu');
  const tagFilterBtn = $('#tagFilterBtn');
  const tagMenu = $('#tagMenu');

  const state = { cat: 'all', tag: '', q: '', sort: 'latest', page: 1 };

  const SORT_LABEL = { latest: '最新发布', reads: '最多阅读', likes: '最多喜欢' };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatReads(value) {
    const num = Number(value);
    const safe = Number.isFinite(num) ? Math.min(15.9, Math.max(5.1, num)) : 5.1;
    return `${safe.toFixed(1)}k+`;
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso || '').slice(0, 10);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function currentSet() {
    const q = state.q.trim().toLowerCase();
    let rows = ARTICLES.filter((item) => {
      if (state.cat !== 'all' && item.cat !== state.cat) return false;
      if (state.tag && !(item.tags || []).includes(state.tag)) return false;
      if (q) {
        const haystack = [item.title, item.summary, item.catLabel, (item.tags || []).join(' ')].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sorters = {
      latest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      reads: (a, b) => (b.reads || 0) - (a.reads || 0),
      likes: (a, b) => (b.likes || 0) - (a.likes || 0)
    };
    const bySort = sorters[state.sort] || sorters.latest;
    rows = rows.sort((a, b) => {
      if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1;
      return bySort(a, b);
    });
    return rows;
  }

  function rowTemplate(item) {
    const tags = (item.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');
    return `
      <a class="row${item.pinnedAt ? ' is-pinned' : ''}" href="${esc(item.url)}" target="_blank" rel="noopener">
        <span class="row-cat"><span class="category-badge">${esc(item.catLabel)}</span></span>
        <span class="row-main">
          <h2 class="title">${esc(item.title)}</h2>
          <p class="summary">${esc(item.summary || '暂无摘要')}</p>
          <span class="tags">${tags}</span>
        </span>
        <span class="row-side">
          <span class="meta">
            <span>${esc(formatDate(item.createdAt))}</span>
            <span class="dot">·</span>
            <span>阅读 ${esc(formatReads(item.reads))}</span>
          </span>
        </span>
      </a>`;
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

  function renderPager(totalPages, totalRows, start, end) {
    rangeEl.textContent = totalRows
      ? `显示 ${start + 1}-${end} 篇，共 ${totalRows} 篇`
      : '共 0 篇';

    if (totalPages <= 1) {
      pagerEl.innerHTML = '';
      return;
    }

    const numbers = pageNumbers(state.page, totalPages).map((page) => (
      page === '...'
        ? '<span class="gap">…</span>'
        : `<button type="button" class="${page === state.page ? 'is-active' : ''}" data-page="${page}" aria-current="${page === state.page ? 'page' : 'false'}">${page}</button>`
    )).join('');

    pagerEl.innerHTML = `${numbers}
      <button type="button" class="next" data-page="${Math.min(totalPages, state.page + 1)}" ${state.page >= totalPages ? 'disabled' : ''}>
        下一页<svg class="icon"><use href="#i-arrow"/></svg>
      </button>`;
  }

  function render() {
    const rows = currentSet();
    const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PER_PAGE;
    const end = Math.min(start + PER_PAGE, rows.length);
    const visible = rows.slice(start, end);

    totalEl.textContent = `共 ${rows.length} 篇`;
    titleEl.textContent = state.q
      ? `搜索：${state.q}`
      : state.tag
        ? `标签：${state.tag}`
        : state.cat === 'all'
          ? '全部文章'
          : (CATEGORIES.find((item) => item.id === state.cat) || {}).label || '全部文章';

    if (!visible.length) {
      listEl.innerHTML = '';
      listEl.hidden = true;
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = visible.map(rowTemplate).join('');
    }

    renderPager(totalPages, rows.length, start, end);
  }

  /* ---------------- 分类 / 标签菜单 ---------------- */

  function renderCategoryMenu() {
    const counts = {};
    ARTICLES.forEach((item) => { counts[item.cat] = (counts[item.cat] || 0) + 1; });
    const items = CATEGORIES.map((cat) => `
      <button class="category-menu-item${state.cat === cat.id ? ' is-active' : ''}" type="button" role="menuitemradio" aria-checked="${state.cat === cat.id}" data-cat="${esc(cat.id)}">
        <span>${esc(cat.label)}</span><span class="category-menu-count">${pad2(counts[cat.id] || 0)}</span>
      </button>`).join('');

    categoryMenu.innerHTML = `
      <button class="category-menu-item${state.cat === 'all' ? ' is-active' : ''}" type="button" role="menuitemradio" aria-checked="${state.cat === 'all'}" data-cat="all">
        <span>全部文章</span><span class="category-menu-count">${pad2(ARTICLES.length)}</span>
      </button>${items}`;
    categoryFilterBtn.querySelector('span').textContent = state.cat === 'all'
      ? '分类'
      : (CATEGORIES.find((item) => item.id === state.cat) || {}).label || '分类';
  }

  function renderTagMenu() {
    const items = TAGS.map((tag) => `
      <button class="category-menu-item${state.tag === tag.name ? ' is-active' : ''}" type="button" role="menuitemradio" aria-checked="${state.tag === tag.name}" data-tag="${esc(tag.name)}">
        <span>${esc(tag.name)}</span><span class="category-menu-count">${pad2(tag.count)}</span>
      </button>`).join('');

    tagMenu.innerHTML = `
      <button class="category-menu-item${state.tag ? '' : ' is-active'}" type="button" role="menuitemradio" aria-checked="${!state.tag}" data-tag="">
        <span>全部标签</span><span class="category-menu-count">${pad2(TAGS.length)}</span>
      </button>${items}`;
    tagFilterBtn.querySelector('span').textContent = state.tag || '标签';
  }

  function closeMenus(except) {
    if (except !== categoryMenu) { categoryMenu.hidden = true; categoryFilterBtn.setAttribute('aria-expanded', 'false'); }
    if (except !== tagMenu) { tagMenu.hidden = true; tagFilterBtn.setAttribute('aria-expanded', 'false'); }
  }

  categoryFilterBtn.addEventListener('click', () => {
    const willOpen = categoryMenu.hidden;
    closeMenus(categoryMenu);
    categoryMenu.hidden = !willOpen;
    categoryFilterBtn.setAttribute('aria-expanded', String(willOpen));
  });

  tagFilterBtn.addEventListener('click', () => {
    const willOpen = tagMenu.hidden;
    closeMenus(tagMenu);
    tagMenu.hidden = !willOpen;
    tagFilterBtn.setAttribute('aria-expanded', String(willOpen));
  });

  categoryMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cat]');
    if (!button) return;
    state.cat = button.dataset.cat;
    state.page = 1;
    closeMenus();
    renderCategoryMenu();
    render();
  });

  tagMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (!button) return;
    state.tag = button.dataset.tag || '';
    state.page = 1;
    closeMenus();
    renderTagMenu();
    render();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.category-filter')) return;
    closeMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenus();
  });

  /* ---------------- 搜索 / 排序 / 分页 ---------------- */

  let searchTimer = 0;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = searchEl.value;
      state.page = 1;
      render();
    }, 120);
  });

  sortEl.addEventListener('change', () => {
    state.sort = sortEl.value;
    state.page = 1;
    render();
  });

  pagerEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    state.page = Number(button.dataset.page);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#resetFilter').addEventListener('click', () => {
    state.cat = 'all';
    state.tag = '';
    state.q = '';
    state.page = 1;
    searchEl.value = '';
    renderCategoryMenu();
    renderTagMenu();
    render();
  });

  /* ---------------- 启动 ---------------- */

  renderCategoryMenu();
  renderTagMenu();
  render();
})();
