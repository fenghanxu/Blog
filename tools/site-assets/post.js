/* ============================================================
   只读文章页：目录跳转 / 代码复制 / 图片放大
   没有阅读计数、没有编辑入口
   ============================================================ */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const toastEl = $('#toast');
  let toastTimer = 0;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2000);
  }

  /* ---------------- 目录 ---------------- */

  const tocLinks = Array.from(document.querySelectorAll('#tocList a[data-target]'));

  document.getElementById('tocList')?.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-target]');
    if (!link) return;
    event.preventDefault();
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top, behavior: 'smooth' });
    history.replaceState(null, '', '#' + link.dataset.target);
  });

  if (tocLinks.length && 'IntersectionObserver' in window) {
    const headings = tocLinks
      .map((link) => document.getElementById(link.dataset.target))
      .filter(Boolean);
    const active = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => active.set(entry.target.id, entry));
      const visible = headings
        .filter((heading) => active.get(heading.id)?.isIntersecting)
        .sort((a, b) => a.offsetTop - b.offsetTop)[0];
      tocLinks.forEach((link) => link.classList.toggle('is-active', Boolean(visible) && link.dataset.target === visible.id));
    }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });
    headings.forEach((heading) => observer.observe(heading));
  }

  /* ---------------- 代码复制 ---------------- */

  document.querySelectorAll('.code-copy').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.code')?.querySelector('code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        toast('代码已复制');
      } catch (error) {
        const range = document.createRange();
        const node = button.closest('.code')?.querySelector('code');
        if (!node) return toast('复制失败，请手动选择');
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        toast('已选中代码，请按 ⌘C 复制');
      }
    });
  });

  /* ---------------- 图片放大 ---------------- */

  const lightbox = $('#lightbox');
  const lightboxImg = $('#lightboxImg');
  if (lightbox && lightboxImg) {
    const images = Array.from(document.querySelectorAll('.content img')).filter((img) => !img.classList.contains('is-missing'));
    let current = 0;

    function open(index) {
      current = (index + images.length) % images.length;
      const img = images[current];
      lightboxImg.src = img.currentSrc || img.src;
      lightboxImg.alt = img.alt || '';
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    function close() {
      lightbox.hidden = true;
      lightboxImg.removeAttribute('src');
      document.body.style.overflow = '';
    }

    images.forEach((img, index) => {
      img.addEventListener('click', () => open(index));
    });

    lightbox.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) close();
    });

    document.addEventListener('keydown', (event) => {
      if (lightbox.hidden) return;
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowLeft' && images.length > 1) open(current - 1);
      else if (event.key === 'ArrowRight' && images.length > 1) open(current + 1);
    });
  }
})();
