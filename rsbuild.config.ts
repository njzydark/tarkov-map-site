import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { createReadStream, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const originalRoot = resolve(projectRoot, 'assets/maps');
const originalPattern = /\.(?:png|jpe?g)$/i;

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: '塔科夫地图终端',
    meta: {
      description: '逃离塔科夫中文地图查看器，支持缩放、拖拽和高清原图。',
      'theme-color': '#0b0f0c',
    },
  },
  output: {
    assetPrefix: './',
    copy: [
      { from: './previews', to: 'previews' },
      { from: './thumbs', to: 'thumbs' },
    ],
    distPath: {
      root: 'dist',
    },
  },
  server: {
    port: 4173,
    setup: ({ server }) => {
      server.middlewares.use((request, response, next) => {
        if (!request.url) return next();
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (!originalPattern.test(pathname)) return next();
        const file = resolve(originalRoot, `.${pathname}`);
        if (!file.startsWith(`${originalRoot}/`) || !existsSync(file)) return next();
        const extension = extname(file).toLowerCase();
        response.setHeader('Content-Type', extension === '.png' ? 'image/png' : 'image/jpeg');
        createReadStream(file).pipe(response);
      });
    },
  },
});
