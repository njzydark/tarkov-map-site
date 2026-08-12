# 塔科夫静态地图查看器

一个面向《逃离塔科夫》地图的沉浸式 Web 查看器，使用 Rsbuild、React、TypeScript 和 Base UI 构建。项目完全运行在浏览器中，不依赖应用后端。

## 项目截图

![地图查看器主界面](docs/screenshots/viewer.png)

![桌面端地图菜单](docs/screenshots/map-drawer.png)

## 功能

- 按区域组织地图，同一地图的 2D、3D 和内部结构版本归入同组。
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
├── assets/maps/          # 本地高清原图，不提交 Git
├── docs/screenshots/     # README 截图
├── previews/             # 自动生成的预览图，不提交 Git
├── thumbs/               # 自动生成的缩略图，不提交 Git
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

构建并上传 `dist/`：

```sh
npm run deploy:s3
```

同时上传 `assets/maps/` 中的高清原图：

```sh
npm run deploy:s3:all
```

上传工具会设置推荐的缓存响应头，支持 object prefix、dry-run、跳过构建和单文件失败重试。查看全部参数：

```sh
npm run deploy:s3 -- --help
```

## 可选：GitHub Pages

GitHub Pages 可以托管本项目的静态构建结果，仓库站点地址通常为：

```text
https://<github-user>.github.io/<repository>/
```

本仓库的地图原图和 WebP 衍生图不会提交到 `main`，因此仅靠 GitHub Actions checkout 无法生成完整站点。若使用 GitHub Pages，应从包含本地地图素材的环境执行构建，并将完整 `dist/` 发布到专用 `gh-pages` 分支；这样可以继续保持 `main` 只提交源代码。

项目使用相对资源地址，可以部署在 GitHub Pages 的仓库子路径下，无需修改前端路由或资源前缀。

## 地图来源与版权

本项目只提供地图浏览器代码，地图素材收集和整理自以下公开资源：

- [逃离塔科夫百科地图页](https://tarkov.muedsa.com/maps)。
- [RE3MR.se](https://reemr.se/)（3D 地图作者）。

地图图片的版权归各自作者和权利人所有。项目不会移除原图中的署名、水印或来源信息，素材仅用于地图浏览、学习交流和非商业展示。如有来源标注遗漏、授权问题或权利人要求移除，请通过仓库 Issue 联系维护者。

在复制、公开部署或重新分发地图图片前，请自行确认对应来源的许可条款；注明来源本身不代表获得再分发授权。

## Git 提交范围

仓库只提交源代码、项目配置和文档截图。以下本地内容不会进入 Git：

- `assets/` 中的高清原图。
- `previews/` 和 `thumbs/` 中的衍生图片。
- `dist/` 构建产物。
- `node_modules/` 依赖目录。
- `.env`、密钥、日志和压缩包。

首次 clone 后需要自行准备 `assets/maps/` 中的原图，再执行 `npm run maps:generate`。
