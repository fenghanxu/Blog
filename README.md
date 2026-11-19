# 字间 · 本地博客

一个纯前端的本地博客，文章保存在浏览器 IndexedDB 中，不依赖后端服务。

## 启动

在本目录运行一个静态服务器：

```bash
python3 -m http.server 8080
```

然后打开 <http://localhost:8080/>。

直接双击 `index.html` 在部分浏览器里也能用，但推荐通过本地服务器访问，行为更稳定。

## 页面与流程

| 页面 | 用途 |
| --- | --- |
| `index.html` | 文章列表，站点入口 |
| `detail.html?id=文章ID` | 阅读文章详情 |
| `edit.html` | 写新文章 |
| `edit.html?id=文章ID` | 编辑已有文章 |

完整流程：

1. 打开站点先进入文章列表。
2. 点击文章标题进入详情；每行的“编辑”按钮进入编辑器。
3. 点击“写文章”进入空白编辑器，发布后自动跳到新文章详情。
4. 在编辑器修改已有文章，点击“保存修改”回到详情。
5. 在“更多操作 → 删除文章”中删除当前文章。

> 原来的 `list.html` 已改名为 `index.html`，这样启动静态服务后默认就进入文章列表。

## 开发进度

- [x] 统一文章数据模型，封装 IndexedDB 增删改查。
- [x] 首次启动灌入演示文章，之后不会因为文章被删空而重复灌入。
- [x] 列表从数据库读取，保留分类、搜索、排序和分页。
- [x] 列表行增加编辑入口，标题与摘要区域进入详情。
- [x] 详情页按 id 读取文章并渲染 Markdown。
- [x] 编辑器支持新建、编辑、发布、保存修改和删除。
- [x] 草稿按文章区分，未修改时离开不会产生空草稿。
- [x] 图片上传与正文图片本地化。
- [x] 文章和图片的 JSON 备份、合并导入与覆盖恢复。
- [ ] 可选：接入远程接口，实现跨设备同步。

## 已实现

- IndexedDB 文章增删改查，首次启动自动写入 16 篇演示文章。
- 列表分类筛选、搜索、排序与分页。
- 详情页按 id 读取文章，Markdown 渲染、目录生成、代码复制、阅读数累计。
- 编辑页支持新建与编辑两种模式，可填写分类、标签和摘要。
- 本地草稿自动保存在 `localStorage`，按文章区分；发布或删除后清理对应草稿。
- 工具栏图片按钮支持选择、粘贴和拖拽本地图片，图片 Blob 存入 IndexedDB。
- 删除文章时会清理只被该文章引用的本地图片。
- 列表页“备份”可以导出包含文章和图片的 JSON，也支持合并导入和覆盖恢复。
- 编辑器导出的 Markdown 会把本地图片内嵌为 data URL，方便单独带走。
- Markdown 解析与 XSS 过滤库已放在 `assets/vendor/`，无需联网加载。

## 目录结构

```text
.
├── index.html              # 文章列表（入口）
├── detail.html             # 文章详情
├── edit.html               # 新建 / 编辑文章
├── assets
│   ├── css/
│   │   ├── list.css
│   │   ├── detail.css
│   │   └── edit.css
│   ├── js/
│   │   ├── shared.js       # 分类、日期、文本等公共工具
│   │   ├── seed.js         # 首次启动的演示文章
│   │   ├── db.js           # IndexedDB 数据层
│   │   ├── list.js         # 列表交互
│   │   ├── detail.js       # 详情交互
│   │   └── edit.js         # 编辑器交互
│   ├── fonts/
│   └── vendor/             # marked / DOMPurify
```

## 数据模型

数据库名 `zjian-blog`，包含三个对象仓库：

| 仓库 | 主键 | 用途 |
| --- | --- | --- |
| `articles` | `id` | 文章正文与元信息 |
| `images` | `id` | 本地图片 Blob |
| `meta` | `key` | 演示数据初始化标记 |

文章字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 文章唯一 ID |
| `title` | string | 标题 |
| `summary` | string | 摘要，留空时从正文自动截取 |
| `body` | string | Markdown 正文 |
| `cat` | string | 分类 id |
| `tags` | string[] | 标签 |
| `createdAt` | string | 创建时间（ISO） |
| `updatedAt` | string | 最后更新时间（ISO） |
| `reads` | number | 阅读数 |
| `likes` | number | 点赞数 |

统一的数据入口在 `assets/js/db.js`，页面只调用：

```js
await BlogDB.ready();
await BlogDB.list();
await BlogDB.get(id);
await BlogDB.create(payload);
await BlogDB.update(id, patch);
await BlogDB.remove(id);
await BlogDB.addImage(file);
await BlogDB.getImage(id);
const backup = await BlogDB.exportBackup();
await BlogDB.importBackup(backup, 'merge'); // 或 'replace'
```

## 图片与备份

- 编辑器工具栏的图片按钮、正文粘贴图片、把图片拖进编辑区，都会保存到本地数据库。
- Markdown 中显示为 `![名称](blog-image/图片ID)`，打开编辑页或详情页时自动换成 Blob URL。
- 备份文件是 JSON，包含全部文章和图片的 data URL，可以移到其他目录保存。
- 合并导入会跳过同 ID 的文章；覆盖恢复会先清空当前文章和图片，适合完整还原。

图片和文章都占用浏览器的 IndexedDB 配额，单张图片限制 10MB。需要长期保存时，建议定期导出备份。

## 重置演示数据

先导出备份，再在浏览器控制台执行下面语句并刷新页面：

```js
indexedDB.deleteDatabase('zjian-blog');
```

下次打开站点会重新写入 `assets/js/seed.js` 中的演示文章。

## 后续可以继续做

- 草稿箱页面与定时发布。
- 图片压缩、裁剪和批量管理。
- 备份文件的版本迁移与自动定时备份。
- 点赞、阅读统计的更细粒度去重。
- 需要跨设备同步时，再把 `db.js` 后面接一层远程 API。
