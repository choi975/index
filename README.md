# 项目索引 · 全局快捷键配置中心

Cloudflare Workers + D1 保存项目、独立显示排序、快捷键编号和目标平台。Cloudflare 与 GitHub Pages 页面都读取相同配置。

## 快捷键

- Alt+数字：当前标签页；Ctrl+Alt+数字：新标签页。
- 0=index、1=todo、2=badminton、3=sien-day，固定 Cloudflare，不允许修改或删除。
- 4～9 手动分配，初始 4=wenti、5=count；删除后保留空位，排序不会改变编号。
- 动态编号每次通过 GET /api/shortcuts/:number 查询 D1，响应不缓存。
- 成功查到目标就写入当前网站的 localStorage；只有网络/超时/服务器异常时使用旧缓存。成功返回 url:null 会清除该编号缓存并不跳转。
- 输入框、文本框、选择框和可编辑区域不触发快捷键。Ctrl+Alt 查询期间先打开临时标签页；空位或无缓存的故障会关闭它。

## 配置

点击“编辑”可移动项目、手动分配不重复的编号、选择 Cloudflare / GitHub Pages。固定行不能改名称、编号和 Cloudflare 目标。目标平台必须已启用；新增项目不自动占号。

修改自动同步，状态栏显示成功/故障；失败保存在本机并可重试。revision 乐观并发保护阻止旧页面覆盖新版设置。发生冲突先导出本机修改，然后点“重新同步”读取云端。按用户要求未添加管理员验证，配置 API 仍是公开可写的。

## 开发与部署

npm test
npm run build

已有数据库 index 从旧结构升级：

npx wrangler d1 migrations apply index --remote
npx wrangler deploy

全新数据库先执行 schema.sql，再部署 Worker。不要在全新结构上再次运行旧结构升级 SQL。Worker 会初始化默认项目；既有记录只迁移一次，移除 xizang，保留项目 ID。

GitHub Pages 从 main 根目录发布。修改后须同步 public/；project-shortcuts.js 的相同实现复制到各项目，badminton 内联于 HTML（其 Worker 只服务指定资源）。wenti 的构建同步独立脚本。count 只部署 Cloudflare。

## API

GET /api/projects → { projects, revision }
PUT /api/projects ← { projects, revision }，保存成功返回新 revision；过期版本返回 409。
GET /api/shortcuts/0..9 → { number, url, project, revision }。空位返回 200 + url:null；服务故障返回 503，不误清除客户端缓存。
