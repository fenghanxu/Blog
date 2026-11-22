/* ============================================================
   detail.html 交互
   - 按 URL 中的 id 从 IndexedDB 读取文章
   - Markdown 渲染、目录生成、代码复制、阅读数累计
   ============================================================ */
(() => {
  'use strict';

  const Util = window.BlogUtil;
  const $ = (selector) => document.querySelector(selector);
  const pageState = $('#pageState');
  const shell = $('#articleShell');
  const toastEl = $('#toast');
  const articleId = Util.queryParam('id');
  const resolveImages = Util.createImageResolver();

  let toastTimer = 0;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2400);
  }

  function showState(title, hint, actionText = '返回文章列表', href = 'index.html') {
    shell.hidden = true;
    pageState.hidden = false;
    pageState.innerHTML = `
      <h1>${Util.escapeHtml(title)}</h1>
      <p>${Util.escapeHtml(hint)}</p>
      <a href="${href}">${Util.escapeHtml(actionText)}</a>`;
  }

  function renderMarkdown(markdown) {
    const raw = String(markdown || '').replace(/@\[TOC\]/g, '');
    let html = '';

    if (window.marked && typeof window.marked.parse === 'function') {
      const renderer = new window.marked.Renderer();
      renderer.code = (token, info) => {
        const isString = typeof token === 'string';
        const code = isString ? token : token?.text || '';
        const rawLang = isString ? info : token?.lang;
        const lang = String(rawLang || 'text').replace(/[^a-z0-9+#.-]/gi, '') || 'text';
        return `<div class="code"><div class="code-head"><span>${Util.escapeHtml(lang)}</span>`
          + '<button class="code-copy" type="button">复制代码</button></div>'
          + `<pre><code>${Util.escapeHtml(code)}</code></pre></div>`;
      };
      window.marked.setOptions({ gfm: true, breaks: false, renderer });
      html = window.marked.parse(raw);
    } else {
      html = `<pre>${Util.escapeHtml(raw)}</pre>`;
    }

    return Util.sanitizeHtml(html);
  }

  function renderToc(headings) {
    const tocCard = $('#tocCard');
    const tocList = $('#tocList');
    if (!headings.length) {
      tocCard.hidden = true;
      return;
    }

    tocCard.hidden = false;
    $('#tocBadge').textContent = `${headings.length} 节`;
    tocList.innerHTML = headings.map((heading) => {
      const level = heading.tagName === 'H3' ? 3 : 2;
      return `<a href="#${heading.id}" class="lv-${level}" data-target="${heading.id}">${Util.escapeHtml(heading.textContent.trim())}</a>`;
    }).join('');
  }

  function bindToc() {
    const tocList = $('#tocList');
    tocList.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-target]');
      if (!link) return;
      event.preventDefault();
      const target = document.getElementById(link.dataset.target);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  }

  function bindCodeCopy() {
    document.querySelectorAll('.code-copy').forEach((button) => {
      button.addEventListener('click', async () => {
        const code = button.closest('.code')?.querySelector('code')?.innerText || '';
        try {
          await navigator.clipboard.writeText(code);
          toast('代码已复制');
        } catch (error) {
          toast('复制失败，请手动选择代码');
        }
      });
    });
  }

  async function increaseReads(article) {
    const key = `zjian.read.${article.id}`;
    const seen = sessionStorage.getItem(key);
    if (seen) return article.reads;

    sessionStorage.setItem(key, '1');
    try {
      const updated = await window.BlogDB.incrementReads(article.id);
      return updated ? updated.reads : article.reads;
    } catch (error) {
      return article.reads;
    }
  }

  async function renderArticle(article) {
    const editUrl = `edit.html?id=${encodeURIComponent(article.id)}`;
    document.title = `${article.title} · 字间`;
    $('#articleTitle').textContent = article.title;

    const summaryEl = $('#articleSummary');
    // 旧文章的摘要常被早期 72 字上限截断；识别出来后从正文展开到三行容量。
    const shortAutoSummary = Util.summarize(article.body, 72);
    const summary = article.summary === shortAutoSummary
      ? Util.summarize(article.body, 150)
      : article.summary;
    if (summary) {
      summaryEl.textContent = summary;
      summaryEl.hidden = false;
    }

    $('#articleDate').textContent = Util.formatDate(article.createdAt, true);
    $('#articleUpdated').textContent = `最后更新于 ${Util.formatDate(article.updatedAt, true)}`;
    $('#editLink').href = editUrl;
    $('#footEditLink').href = editUrl;

    const tags = article.tags || [];
    $('#articleTags').innerHTML = tags
      .map((tag) => `<span class="tag">${Util.escapeHtml(tag)}</span>`)
      .join('');

    if (tags.length) {
      $('#tagCard').hidden = false;
      $('#sideTags').innerHTML = tags
        .map((tag) => `<a class="tag" href="index.html">${Util.escapeHtml(tag)}</a>`)
        .join('');
    }

    const content = $('#articleContent');
    content.innerHTML = renderMarkdown(article.body);
    await resolveImages(content);

    const headings = Array.from(content.querySelectorAll('h2, h3'));
    headings.forEach((heading, index) => { heading.id = `heading-${index}`; });
    renderToc(headings);
    bindCodeCopy();

    const reads = await increaseReads(article);
    $('#articleReads').textContent = Util.formatReads(reads);

    pageState.hidden = true;
    shell.hidden = false;

    if (Util.queryParam('published') === '1') toast('发布成功');
    if (Util.queryParam('updated') === '1') toast('修改已保存');
  }

  async function init() {
    if (!articleId) {
      showState('没有找到这篇文章', '地址里缺少文章 id，请从文章列表重新进入。');
      return;
    }

    try {
      await window.BlogDB.ready();
      const article = await window.BlogDB.get(articleId);
      if (!article) {
        showState('文章不存在或已被删除', '它可能已经被移除，去看看其他文章吧。');
        return;
      }
      await renderArticle(article);
      bindToc();
    } catch (error) {
      showState('读取文章失败', error.message || '请检查浏览器是否允许本地存储。', '重新加载', window.location.href);
    }
  }

  init();
})();
