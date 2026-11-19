/* ============================================================
   数据层：IndexedDB 文章 / 图片增删改查与备份
   - 数据库：zjian-blog
   - 对象仓库：articles（文章）、images（本地图片）、meta（元信息）
   - 对外 API 统一挂载在 window.BlogDB
   ============================================================ */
(() => {
  'use strict';

  const DB_NAME = 'zjian-blog';
  const DB_VERSION = 3;
  const STORE = 'articles';
  const META_STORE = 'meta';
  const IMAGE_STORE = 'images';
  const Util = window.BlogUtil;

  let dbPromise = null;
  let readyPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('cat', 'cat');
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(IMAGE_STORE)) {
          db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('打开数据库失败'));
      request.onblocked = () => reject(new Error('数据库被其他页面占用，请关闭其他标签页后重试'));
    });

    return dbPromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('数据库操作失败'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('数据库事务失败'));
      transaction.onabort = () => reject(transaction.error || new Error('数据库事务已取消'));
    });
  }

  const validCats = new Set(Util.CATEGORIES.map((item) => item.id));

  function normalize(input = {}, existing = null) {
    const now = new Date().toISOString();
    const body = String(input.body ?? existing?.body ?? '');
    const summary = String(input.summary ?? existing?.summary ?? '').trim();
    const cat = input.cat ?? existing?.cat;

    return {
      id: existing?.id || input.id || Util.createId(),
      title: String(input.title ?? existing?.title ?? '').trim() || '【无标题】',
      summary: summary || Util.summarize(body),
      body,
      cat: validCats.has(cat) ? cat : (existing?.cat || 'essay'),
      tags: Util.parseTags(input.tags ?? existing?.tags ?? []),
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: input.updatedAt || now,
      reads: Math.max(0, Number(input.reads ?? existing?.reads ?? 0) || 0),
      likes: Math.max(0, Number(input.likes ?? existing?.likes ?? 0) || 0)
    };
  }

  async function count() {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const total = await requestResult(tx.objectStore(STORE).count());
    await transactionDone(tx);
    return total;
  }

  async function list() {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const rows = await requestResult(tx.objectStore(STORE).getAll());
    await transactionDone(tx);
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function get(id) {
    if (!id) return null;
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const row = await requestResult(tx.objectStore(STORE).get(id));
    await transactionDone(tx);
    return row || null;
  }

  async function create(input) {
    const db = await openDB();
    const record = normalize(input);
    const tx = db.transaction(STORE, 'readwrite');
    await requestResult(tx.objectStore(STORE).add(record));
    await transactionDone(tx);
    return record;
  }

  async function update(id, patch) {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const existing = await requestResult(store.get(id));
    if (!existing) {
      tx.abort();
      throw new Error('文章不存在或已被删除');
    }
    const record = normalize({ ...existing, ...patch }, existing);
    await requestResult(store.put(record));
    await transactionDone(tx);
    return record;
  }

  async function remove(id) {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    await requestResult(tx.objectStore(STORE).delete(id));
    await transactionDone(tx);
  }

  async function addImage(file) {
    if (!file || typeof file.size !== 'number' || !file.type?.startsWith('image/')) {
      throw new Error('只能上传图片文件');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('单张图片不能超过 10MB');
    }

    const record = {
      id: `img-${Util.createId()}`,
      name: file.name || 'image',
      type: file.type,
      size: file.size,
      blob: file,
      createdAt: new Date().toISOString()
    };
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    await requestResult(tx.objectStore(IMAGE_STORE).add(record));
    await transactionDone(tx);
    return record;
  }

  async function getImage(id) {
    if (!id) return null;
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE, 'readonly');
    const image = await requestResult(tx.objectStore(IMAGE_STORE).get(id));
    await transactionDone(tx);
    return image || null;
  }

  async function getAllImages() {
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE, 'readonly');
    const images = await requestResult(tx.objectStore(IMAGE_STORE).getAll());
    await transactionDone(tx);
    return images;
  }

  async function countImages() {
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE, 'readonly');
    const total = await requestResult(tx.objectStore(IMAGE_STORE).count());
    await transactionDone(tx);
    return total;
  }

  async function cleanupImages(candidateIds = []) {
    const candidates = new Set(candidateIds.filter(Boolean));
    if (!candidates.size) return 0;

    const articles = await list();
    const used = new Set(articles.flatMap((article) => Util.localImageIds(article.body)));
    const removable = Array.from(candidates).filter((id) => !used.has(id));
    if (!removable.length) return 0;

    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    const store = tx.objectStore(IMAGE_STORE);
    removable.forEach((id) => store.delete(id));
    await transactionDone(tx);
    return removable.length;
  }

  async function exportBackup() {
    const articles = await list();
    const images = await getAllImages();
    const imagePayload = [];

    for (const image of images) {
      try {
        imagePayload.push({
          id: image.id,
          name: image.name,
          type: image.type,
          size: image.size,
          createdAt: image.createdAt,
          dataUrl: await Util.blobToDataUrl(image.blob)
        });
      } catch (error) {
        // 单张图片读取失败时跳过图片，文章备份仍然可以导出。
      }
    }

    return {
      app: 'zjian-blog',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      articles,
      images: imagePayload
    };
  }

  async function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new Error('备份中的图片格式不正确');
    }
    return (await fetch(dataUrl)).blob();
  }

  async function importBackup(payload, mode = 'merge') {
    if (!payload || !Array.isArray(payload.articles)) {
      throw new Error('不是有效的字间备份文件');
    }
    if (mode !== 'merge' && mode !== 'replace') {
      throw new Error('导入方式不正确');
    }

    const articleRecords = payload.articles
      .filter((item) => item && typeof item === 'object')
      .map((item) => normalize({
        ...item,
        body: String(item.body || ''),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
      }));

    const imageRecords = [];
    const rawImages = Array.isArray(payload.images) ? payload.images : [];
    for (const image of rawImages) {
      if (!image || !image.id || !image.dataUrl) continue;
      try {
        const blob = await dataUrlToBlob(image.dataUrl);
        imageRecords.push({
          id: String(image.id),
          name: String(image.name || 'image'),
          type: blob.type || image.type || 'image/png',
          size: blob.size,
          blob,
          createdAt: image.createdAt || new Date().toISOString()
        });
      } catch (error) {
        // 跳过损坏的图片，尽量避免阻断整份备份的恢复。
      }
    }

    const db = await openDB();
    const tx = db.transaction([STORE, IMAGE_STORE], 'readwrite');
    const done = transactionDone(tx);
    const articleStore = tx.objectStore(STORE);
    const imageStore = tx.objectStore(IMAGE_STORE);

    if (mode === 'replace') {
      articleStore.clear();
      imageStore.clear();
    }

    let imported = 0;
    let skipped = 0;

    for (const article of articleRecords) {
      if (mode === 'merge') {
        const existing = await requestResult(articleStore.get(article.id));
        if (existing) {
          skipped += 1;
          continue;
        }
      }
      articleStore.put(article);
      imported += 1;
    }

    for (const image of imageRecords) {
      if (mode === 'merge') {
        const existing = await requestResult(imageStore.get(image.id));
        if (existing) continue;
      }
      imageStore.put(image);
    }

    await done;
    return { imported, skipped, images: imageRecords.length };
  }

  async function incrementReads(id) {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const existing = await requestResult(store.get(id));
    if (!existing) {
      tx.abort();
      return null;
    }
    const record = { ...existing, reads: (Number(existing.reads) || 0) + 1 };
    await requestResult(store.put(record));
    await transactionDone(tx);
    return record;
  }

  async function seedIfEmpty() {
    const db = await openDB();
    const tx = db.transaction([STORE, META_STORE], 'readwrite');
    const done = transactionDone(tx);
    const metaStore = tx.objectStore(META_STORE);
    const seeded = await requestResult(metaStore.get('seeded'));

    if (!seeded) {
      const store = tx.objectStore(STORE);
      const total = await requestResult(store.count());
      if (total === 0 && Array.isArray(window.BLOG_SEED)) {
        window.BLOG_SEED.forEach((item) => {
          store.add(normalize({ ...item, updatedAt: item.createdAt }));
        });
      }
      await requestResult(metaStore.put({ key: 'seeded', at: new Date().toISOString() }));
    }

    await done;
  }

  function ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        await openDB();
        await seedIfEmpty();
        return true;
      })().catch((error) => {
        readyPromise = null;
        throw error;
      });
    }
    return readyPromise;
  }

  window.BlogDB = {
    addImage,
    cleanupImages,
    count,
    countImages,
    create,
    exportBackup,
    get,
    getAllImages,
    getImage,
    incrementReads,
    importBackup,
    list,
    ready,
    remove,
    update
  };
})();
