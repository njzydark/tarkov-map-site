# 塔科夫静态地图查看器

一个面向《逃离塔科夫》地图的沉浸式 Web 查看器，使用 Rsbuild、React、TypeScript 和 Base UI 构建。项目完全运行在浏览器中，不依赖应用后端。

在线体验：[https://njzydark.github.io/tarkov-map-site/](https://njzydark.github.io/tarkov-map-site/)

## 项目截图

![地图查看器主界面](docs/screenshots/viewer.png)

![桌面端地图菜单](docs/screenshots/map-drawer.png)

## 功能

- 按区域组织地图，同一地图的 2D、3D 和内部结构版本归入同组。
- 响应式适配手机和平板，针对小屏布局、触控操作和安全区域进行优化。
- 桌面端浮动地图菜单和移动端抽屉，选择地图后自动收起。
- 快速预览与高清原图双向切换，切换过程中保持当前视野不跳变。
- 鼠标拖拽、滚轮缩放、双击缩放、手机双指缩放。
- 支持 macOS 触控板捏合，以手势中心缩放地图，不触发浏览器页面缩放。
- 滑杆、百分比输入和按钮控制 100%–800% 缩放。
- 点击顶部标题、右上角或右下角适屏按钮快速复位。
- 键盘左右方向键切换地图，`0` 复位，`M` 打开或关闭地图菜单。
- URL hash 记录当前地图，可刷新恢复或直接分享。
- 地图、缩放视野和预览/高清选择保存在当前设备的 `localStorage` 中。
- 自动预取相邻地图预览，不主动预取高清原图。

## 快速开始

```sh
npm install
npm run dev
```

默认开发地址为 `http://localhost:4173`。

生产构建：

```sh
npm run build
```

构建结果位于 `dist/`，可以使用以下命令在本地预览：

```sh
npm run preview
```

默认构建包含应用代码、预览图和缩略图，不重复复制高清原图，适合高清图片已经单独托管在相同公开路径的部署环境。

需要生成包含高清原图的完整独立站点时使用：

```sh
npm run build:pages
```

这个构建会把 `assets/maps/` 中的原图复制到 `dist/` 根目录，适合 GitHub Pages 或其他一次性上传整个静态目录的服务。

## 地图素材

原始地图存放在本地 `assets/maps/`。文件名需要以 ASCII 地图标识结尾：

```text
<显示名称>_<map-id>.png
<显示名称>_<map-id>.jpg
```

例如：

```text
中心区3D_ground-zero-3d.png
```

运行下面的命令会扫描原图并重新生成地图资源：

```sh
npm run maps:generate
```

生成内容包括：

- `previews/<map-id>.webp`：最长边 2560px、质量 82 的预览图。
- `thumbs/<map-id>.webp`：最长边 360px、质量 70 的菜单缩略图。
- `src/maps.ts`：包含地图地址、标题、分组和尺寸的前端清单。

标题、分组和排序在 `maps.config.json` 中维护。新增但未配置的图片会自动推断标题和分组；删除原图后再次生成会清理对应的旧 WebP。

也可以指定其他原图目录：

```sh
npm run maps:generate -- /path/to/maps
# 或
npm run maps:generate -- --source /path/to/maps
```

查看全部生成参数：

```sh
npm run maps:generate -- --help
```

## 图片加载策略

页面首次访问只加载当前地图预览和菜单中进入视口的缩略图。浏览器空闲时会预取相邻地图预览，但高清原图只在用户选择高清后加载。

高清加载成功后，该地图会优先使用高清版本。再次点击画质按钮可切回快速预览，这个选择同样会被保存。自动恢复高清失败时，页面会回退到预览图，并保留手动重试入口。

为了让高清图片在后续访问中直接复用浏览器缓存，部署时建议给图片设置长期缓存响应头，例如：

```text
Cache-Control: public, max-age=31536000, immutable
```

入口 `index.html` 建议使用 `no-cache`，以便及时获取最新的带哈希 JS/CSS 地址。

## 项目结构

```text
.
├── assets/maps/          # 高清原图
├── docs/screenshots/     # README 截图
├── previews/             # 自动生成的预览图
├── thumbs/               # 自动生成的缩略图
├── scripts/
│   ├── generate-maps.mjs # 地图资源生成器
│   └── deploy-s3.mjs     # 可选的 S3 上传工具
├── src/
│   ├── App.tsx           # 查看器和交互逻辑
│   ├── maps.ts           # 自动生成的地图清单
│   ├── preferences.ts    # 本地偏好存储
│   └── styles.css        # 页面样式
└── maps.config.json      # 地图标题、分组和排序
```

## 可选：上传到 S3 兼容对象存储

项目附带一个上传工具，适用于支持 S3 API 的对象存储。它不是运行或部署本项目的必要条件；也可以直接把构建文件发布到任意静态网站服务。

复制配置模板并填写实际参数：

```sh
cp .env.example .env
```

构建并上传默认的轻量 `dist/`：

```sh
npm run deploy:s3
```

上传工具会设置推荐的缓存响应头，支持 object prefix、dry-run、跳过构建和单文件失败重试。查看全部参数：

```sh
npm run deploy:s3 -- --help
```

## 可选：GitHub Pages

仓库包含 GitHub Pages 官方 Actions 工作流 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)。推送到 `main` 后会自动：

1. 使用 Node.js 22 安装锁定依赖。
2. 执行 `npm run build:pages` 生成包含高清原图的完整站点。
3. 上传 Pages artifact 并发布。

也可以在仓库 Actions 页面手动触发 `Deploy GitHub Pages`。站点地址通常为：

```text
https://<github-user>.github.io/<repository>/
```

首次发布时，工作流会尝试自动启用 GitHub Pages。若仓库或组织策略禁止自动启用，请在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**，再重新运行工作流。

项目使用相对资源地址，可以部署在 GitHub Pages 的仓库子路径下，无需修改前端路由或资源前缀。

## 地图来源与版权

本项目只提供地图浏览器代码，地图素材收集和整理自以下公开资源：

- [逃离塔科夫百科地图页](https://tarkov.muedsa.com/maps)。
- [RE3MR.se](https://reemr.se/)（3D 地图作者）。

地图图片的版权归各自作者和权利人所有。项目不会移除原图中的署名、水印或来源信息，素材仅用于地图浏览、学习交流和非商业展示。如有来源标注遗漏、授权问题或权利人要求移除，请通过仓库 Issue 联系维护者。

在复制、公开部署或重新分发地图图片前，请自行确认对应来源的许可条款；注明来源本身不代表获得再分发授权。

## Git 提交范围

仓库包含源代码、项目配置、地图原图、生成后的预览/缩略图和文档截图。以下本地内容不会进入 Git：

- `dist/` 构建产物。
- `node_modules/` 依赖目录。
- `.env`、密钥、日志和压缩包。

clone 后可以直接执行 `npm install && npm run build`；GitHub Pages 使用 `npm run build:pages`。更新地图素材后再运行 `npm run maps:generate`。
