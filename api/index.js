// Vercel Serverless 入口：把请求转发给编译后的 Fastify 应用。
// 仅云端部署使用；本地/Docker 部署不经过此文件（仍走 apps/server/dist/index.js 直接监听）。
import app from '../apps/server/dist/index.js';

export default async function handler(req, res) {
  await app.ready();
  app.server.emit('request', req, res);
}

export const config = { maxDuration: 30 };
