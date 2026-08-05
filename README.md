# 项目索引 · Project Index

一个部署在 GitHub Pages 上的个人项目入口，用于集中管理 Cloudflare Workers 与 GitHub Pages 链接。

## 功能

- 三列项目索引：项目、Cloudflare、GitHub Pages
- 搜索、添加、编辑和删除项目
- 分别标记项目在哪个平台部署
- 浏览器本地自动保存
- JSON 数据导入与导出
- 桌面端表格布局与移动端卡片布局

## 本地运行

这是一个没有构建步骤的静态网页，可直接打开 `index.html`，或使用任意静态文件服务器：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 数据说明

网页修改保存在浏览器的 `localStorage` 中，不会上传任何账号信息或密钥。需要迁移设备时，可以使用页面底部的 JSON 导出与导入功能。
