# 项目索引 · Project Index

一个同时部署在 Cloudflare Workers 与 GitHub Pages 上的个人项目入口，用于集中管理 Cloudflare Workers 与 GitHub Pages 链接。项目数据保存在 Cloudflare D1，因此不同设备打开页面时可以共享同一份数据。

## 功能

- 三列项目索引：项目、Cloudflare、GitHub Pages
- 搜索、添加、编辑和删除项目
- 分别标记项目在哪个平台部署
- Cloudflare D1 云端同步，网络不可用时回退到浏览器本地保存
- JSON 数据导入与导出
- `Alt+1` 至 `Alt+5` 在当前标签页打开常用项目，`Ctrl+Alt+1` 至 `Ctrl+Alt+5` 新建标签页打开
- 桌面端表格布局与移动端卡片布局

## 本地运行

这是一个没有构建步骤的静态网页，可直接打开 `index.html`，或使用任意静态文件服务器：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 数据说明

网页修改会同步到 Cloudflare D1；网络不可用时暂存在浏览器的 `localStorage` 中。需要迁移设备时，也可以使用页面底部的 JSON 导出与导入功能。

## Cloudflare 部署

`wrangler.jsonc` 已绑定 D1 数据库 `index`。更新静态文件后，将文件同步到 `public/`，再运行：

```powershell
npx wrangler@latest d1 execute index --remote --file=schema.sql
npx wrangler@latest deploy
```

GitHub Pages 继续从仓库根目录发布，推送到 `main` 后由仓库设置自动更新。
