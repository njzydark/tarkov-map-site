# Garage 静态地图查看器（Rsbuild + React + Base UI）

这是一个使用 Rsbuild、React 和 Base UI 构建的静态项目。

查看器会使用浏览器 `localStorage` 在当前设备保存：最后查看的地图，以及每张地图各自的缩放比例和视野中心。URL hash 中明确指定的地图优先于本地记录。地图抽屉开合状态不缓存，选择地图后会自动关闭。

## 开发

```sh
npm install
npm run dev
```

## 构建

```sh
npm run build
```

发布 `dist/` 目录。构建产物包含：

- `index.html` 和 `static/`：应用程序资源。
- `previews/`：最长边 2560px 的中清 WebP。
- `thumbs/`：最长边 360px 的侧栏缩略图。

原始地图存放在本地 `assets/maps/`，不会复制到 `dist/`，并已通过 `.gitignore` 排除。部署时，`dist/` 中的全部内容与 17 张原图应位于同一个 Garage bucket 根目录。

## 从原图重新生成地图资源

项目内置了缩略图生成命令。默认读取项目内的 `assets/maps/`，识别其中的 PNG/JPG 文件，重建 `previews/`、`thumbs/` 和 `src/maps.ts`：

```sh
npm run maps:generate
```

也可以指定其他原图目录：

```sh
npm run maps:generate -- /path/to/maps
# 等价写法
npm run maps:generate -- --source /path/to/maps
```

原图文件名应遵循 `<中文名称>_<英文标识>.png/jpg`，例如：

```text
中心区3D_ground-zero-3d.png
```

脚本默认生成最长边 2560px、质量 82 的预览图，以及最长边 360px、质量 70 的缩略图。标题、分组和排序维护在 `maps.config.json`；新增但未配置的图片会自动推断标题并归组。已从原图目录移除的地图，其旧 WebP 衍生文件也会被清理。

参数可通过帮助查看：

```sh
npm run maps:generate -- --help
```

## Garage 配置

启用静态网站（管理员方式）：

```sh
garage bucket website --allow --index-document index.html YOUR_BUCKET
```

使用 AWS CLI 上传时，将下面的地址和 bucket 名替换为实际值：

```sh
aws --endpoint-url https://YOUR_S3_ENDPOINT s3 cp dist/index.html s3://YOUR_BUCKET/index.html \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'no-cache'

aws --endpoint-url https://YOUR_S3_ENDPOINT s3 cp dist/previews s3://YOUR_BUCKET/previews \
  --recursive \
  --content-type 'image/webp' \
  --cache-control 'public, max-age=31536000, immutable'

aws --endpoint-url https://YOUR_S3_ENDPOINT s3 cp dist/thumbs s3://YOUR_BUCKET/thumbs \
  --recursive \
  --content-type 'image/webp' \
  --cache-control 'public, max-age=31536000, immutable'

aws --endpoint-url https://YOUR_S3_ENDPOINT s3 cp dist/static s3://YOUR_BUCKET/static \
  --recursive \
  --cache-control 'public, max-age=31536000, immutable'
```

如果原图此前未设置长期缓存，可按扩展名分别重新复制元数据。不要对 `index.html` 使用 immutable 缓存。

JavaScript/CSS 使用内容哈希文件名，可同样设置长期 immutable 缓存。`index.html` 继续使用 `no-cache`。

## 一键构建并上传到 Garage/S3

项目也内置了 S3 上传命令，不依赖本机 `aws` CLI。它默认先执行生产构建，再将 `dist/` 中的文件上传到指定 S3 API endpoint 和 bucket：

```sh
AWS_ACCESS_KEY_ID='YOUR_KEY' \
AWS_SECRET_ACCESS_KEY='YOUR_SECRET' \
npm run deploy:s3 -- \
  --endpoint https://YOUR_S3_API_ENDPOINT \
  --bucket YOUR_BUCKET
```

推荐先复制环境变量模板并填写 Garage 配置：

```sh
cp .env.example .env
```

`deploy:s3` 会自动读取项目根目录的 `.env`。真实 `.env` 已被 Git 忽略，`.env.example` 只包含可提交的占位值。也可以不创建 `.env`，直接导出环境变量：

```sh
export S3_ENDPOINT='https://YOUR_S3_API_ENDPOINT'
export S3_BUCKET='YOUR_BUCKET'
export S3_REGION='garage'
export AWS_ACCESS_KEY_ID='YOUR_KEY'
export AWS_SECRET_ACCESS_KEY='YOUR_SECRET'
npm run deploy:s3
```

支持标准 AWS profile 凭证链，也可以加 `--prefix maps` 上传到 bucket 子路径。常用选项：

```sh
# 只查看将上传哪些文件，不发送请求
npm run deploy:s3 -- --endpoint https://S3_ENDPOINT --bucket BUCKET --dry-run

# 不重新构建，直接上传当前 dist
npm run deploy:s3 -- --endpoint https://S3_ENDPOINT --bucket BUCKET --no-build
```

上传脚本会为 `index.html` 设置 `no-cache`，其余带稳定/内容哈希文件名的静态资源设置一年 immutable 缓存。它会覆盖同名对象，但不会删除 bucket 中旧的哈希文件，也不会自动上传 `assets/maps/` 中的高清原图。

## Git 提交范围

仓库只提交源代码和项目配置。以下内容全部保留在本地但不会进入 Git：

- `assets/` 中的高清原始图片
- `previews/` 和 `thumbs/` 中的生成图片
- `dist/` 构建产物
- `node_modules/` 依赖目录
- `.env*`、密钥、日志和压缩包

首次 clone 后需要自行将高清图放入 `assets/maps/`，再执行 `npm run maps:generate`。

注意：`--endpoint` 使用 Garage 的 S3 API 地址，不是 website 访问地址。完整参数见：

```sh
npm run deploy:s3 -- --help
```
