/* ============================================================
   list.html 数据与交互
   - 分类 / 搜索 / 排序 / 分页 全部由 articles 数组驱动
   - 想加文章：往数组里追加一条即可，分类计数会自动更新
   ============================================================ */
(() => {
  'use strict';

  const articles = [
    {
      id: 'frontend-observability',
      title: '从零搭建一套可观测的前端错误监控体系',
      summary: '从采集、归一化、上报到告警，梳理一套能在真实项目里运行的监控方案。',
      tags: ['前端工程', '监控告警'],
      cat: 'frontend', date: '2025.11.12', reads: 2400, likes: 86
    },
    {
      id: 'typescript-generics',
      title: 'TypeScript 类型体操：用泛型实现安全的 API 响应映射',
      summary: '借助条件类型、映射类型与模板字面量类型，让接口响应在编译期更可靠。',
      tags: ['TypeScript', '类型系统'],
      cat: 'frontend', date: '2025.11.12', reads: 2400, likes: 86
    },
    {
      id: 'deploy-one-command',
      title: '我把重复的部署流程，收敛成了一条命令',
      summary: '把构建、测试、镜像推送和灰度发布串起来，让每次上线都可追踪、可回滚。',
      tags: ['DevOps', '自动化'],
      cat: 'engineering', date: '2025.11.10', reads: 1800, likes: 64
    },
    {
      id: 'node-cpu-profile',
      title: 'Node.js 服务性能排查：从 CPU 飙高到定位热点',
      summary: '结合火焰图与运行指标，记录一次线上 CPU 使用率异常的完整排查过程。',
      tags: ['Node.js', '性能优化'],
      cat: 'backend', date: '2025.11.09', reads: 3100, likes: 102
    },
    {
      id: 'ai-workflow',
      title: 'AI 编程助手落地之后，我的开发工作流变了',
      summary: '从补全代码到拆解任务，分享把 AI 工具融入日常工程实践后的真实体验。',
      tags: ['AI 工具', '工作流'],
      cat: 'ai', date: '2025.11.08', reads: 4200, likes: 158
    },
    {
      id: 'css-grid-dashboard',
      title: 'CSS Grid 实战：构建适配多端的数据看板',
      summary: '用最少的断点和弹性轨道，让复杂数据在桌面端与窄屏上都清晰可读。',
      tags: ['CSS', '响应式'],
      cat: 'frontend', date: '2025.11.07', reads: 1500, likes: 52
    },
    {
      id: 'swift-separator',
      title: '用 Swift 封装一个可复用的分割线组件',
      summary: '把线条绘制、颜色和约束收进一个小组件，页面布局因此简洁了不少。',
      tags: ['Swift', '组件化'],
      cat: 'frontend', date: '2025.11.05', reads: 980, likes: 31
    },
    {
      id: 'swift-copy-semantics',
      title: '深拷贝与浅拷贝：一次购票页面里的意外修改',
      summary: '值类型与引用类型的拷贝语义，往往在真实业务里才暴露得最清楚。',
      tags: ['Swift', '内存'],
      cat: 'frontend', date: '2025.11.04', reads: 2000, likes: 73
    },
    {
      id: 'api-design-details',
      title: '后端接口设计的十个细节，让前端少加三天班',
      summary: '字段命名、错误码、分页与幂等，这些细节决定了联调时的情绪稳定程度。',
      tags: ['接口设计', '协作'],
      cat: 'backend', date: '2025.11.03', reads: 2700, likes: 91
    },
    {
      id: 'code-review-dialogue',
      title: '把代码评审写成一次对话',
      summary: '评审不是挑错，而是把隐含的假设摊开讨论，让改动更容易被理解。',
      tags: ['团队协作', '代码评审'],
      cat: 'essay', date: '2025.11.02', reads: 1200, likes: 44
    },
    {
      id: 'ci-incremental-build',
      title: '用增量构建把 CI 时间砍掉一半',
      summary: '缓存粒度、依赖边界与任务编排，是构建提速里最值得先做的三件事。',
      tags: ['构建', 'CI'],
      cat: 'engineering', date: '2025.10.30', reads: 1600, likes: 58
    },
    {
      id: 'ai-maintainable-code',
      title: 'Prompt 工程之外：让 AI 稳定产出可维护的代码',
      summary: '给约束、给上下文、给小步验证，比反复调整措辞更有用。',
      tags: ['AI', 'Prompt'],
      cat: 'ai', date: '2025.10.28', reads: 3600, likes: 120
    },
    {
      id: 'cache-invalidation',
      title: '缓存失效的老问题，和三种务实的解法',
      summary: '从过期策略到主动更新，聊聊缓存一致性里那些绕不开的取舍。',
      tags: ['缓存', '架构'],
      cat: 'backend', date: '2025.10.26', reads: 2200, likes: 77
    },
    {
      id: 'log-as-product',
      title: '把日志当成产品来设计',
      summary: '字段结构、检索路径和告警粒度，决定了出问题时你有多从容。',
      tags: ['可观测性', '日志'],
      cat: 'engineering', date: '2025.10.24', reads: 1400, likes: 40
    },
    {
      id: 'writing-small-things',
      title: '关于写作这件小事',
      summary: '记录本身不会立刻带来改变，但它让思考有了可以回看的位置。',
      tags: ['随笔', '记录'],
      cat: 'essay', date: '2025.10.20', reads: 860, likes: 28
    },
    {
      id: 'redis-distributed-lock',
      title: 'Redis 分布式锁的三个坑',
      summary: '过期时间、误删与续期，每个坑都值得在真正上生产前想清楚。',
      tags: ['Redis', '并发'],
      cat: 'backend', date: '2025.10.18', reads: 2900, likes: 95
    }
  ];

  const SORT_LABEL = { latest: '最新发布', reads: '最多阅读', likes: '最多点赞' };
  const PER_PAGE = 6;

  const state = { cat: 'all', q: '', sort: 'latest', page: 1 };

  const $ = (sel) => document.querySelector(sel);
  const listEl = $('#articleList');
  const emptyEl = $('#emptyState');
  const pagerEl = $('#pager');
  const rangeEl = $('#rangeInfo');
  const totalEl = $('#totalCount');
  const titleEl = $('#listTitle');
  const sortSelect = $('#sortSelect');
  const searchInput = $('#searchInput');

  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const pad2 = (n) => String(n).padStart(2, '0');

  const formatReads = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  const toTime = (date) => new Date(date.replace(/\./g, '-')).getTime();

  function counts() {
    return articles.reduce((acc, item) => {
      acc[item.cat] = (acc[item.cat] || 0) + 1;
      return acc;
    }, {});
  }

  function paintCounts() {
    const map = counts();
    document.querySelectorAll('.tab-count').forEach((el) => {
      el.textContent = pad2(map[el.dataset.count] || 0);
    });
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let items = articles.filter((item) => state.cat === 'all' || item.cat === state.cat);

    if (q) {
      items = items.filter((item) => {
        const haystack = [item.title, item.summary, item.tags.join(' ')].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    const sorters = {
      latest: (a, b) => toTime(b.date) - toTime(a.date),
      reads: (a, b) => b.reads - a.reads,
      likes: (a, b) => b.likes - a.likes
    };
    return items.sort(sorters[state.sort]);
  }

  function rowTemplate(item, index) {
    const tags = item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
    return `
      <a class="row" href="detail.html" aria-label="${escapeHtml(item.title)}">
        <span class="idx">${pad2(index)}</span>
        <div class="row-body">
          <p class="summary">${escapeHtml(item.summary)}</p>
          <h2 class="title">${escapeHtml(item.title)}</h2>
          <div class="tags">${tags}</div>
        </div>
        <div class="meta">
          <span>${item.date}</span>
          <span class="dot">·</span>
          <span>阅读 ${formatReads(item.reads)}</span>
          <span class="dot">·</span>
          <span class="likes"><svg class="icon"><use href="#i-heart"/></svg>${item.likes}</span>
        </div>
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

  function render() {
    const items = filtered();
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    state.page = Math.min(state.page, totalPages);

    const startIndex = (state.page - 1) * PER_PAGE;
    const pageItems = items.slice(startIndex, startIndex + PER_PAGE);

    titleEl.textContent = SORT_LABEL[state.sort];
    totalEl.textContent = `共 ${total} 篇`;
    listEl.innerHTML = pageItems.map((item, i) => rowTemplate(item, startIndex + i + 1)).join('');

    const showEmpty = total === 0;
    emptyEl.hidden = !showEmpty;
    listEl.hidden = showEmpty;

    rangeEl.textContent = total
      ? `显示 ${startIndex + 1}-${startIndex + pageItems.length} 篇，共 ${total} 篇`
      : '显示 0-0 篇，共 0 篇';

    paintPager(showEmpty ? 1 : totalPages);
  }

  /* ---------------- 事件 ---------------- */
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
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

  $('#resetFilter').addEventListener('click', () => {
    state.cat = 'all';
    state.q = '';
    state.page = 1;
    searchInput.value = '';
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.cat === 'all'));
    render();
    searchInput.focus();
  });

  paintCounts();
  render();
})();
