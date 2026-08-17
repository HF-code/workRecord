import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';

const DEVOPS_ORIGIN = 'https://devops.vzan.com';
const UPSTREAM_TIMEOUT_MS = 15_000;
const PORT = Number(process.env.PORT) || 8080;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 前端构建产物：server/dist/index.js → ../../dist
const WEB_DIST = path.resolve(__dirname, '..', '..', 'dist');

const app = Fastify({ logger: true });

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST });
} else {
  app.log.warn(`前端产物目录不存在：${WEB_DIST}，仅提供 /devops-api 转发`);
}

interface ForwardOptions {
  method: 'GET' | 'POST';
  upstreamUrl: string;
  request: FastifyRequest;
  reply: FastifyReply;
}

/**
 * 转发到运维平台：
 * - 入站 Cookie 头直接透传（用户通过其他工具把登录 cookie 写入本站域名，浏览器同源自动携带）
 * - x-csrftoken / content-type 透传
 * - Origin / Referer 固定为 devops 域（Django CSRF 校验需要）
 */
async function forwardToDevops({ method, upstreamUrl, request, reply }: ForwardOptions) {
  const headers: Record<string, string> = {
    Origin: DEVOPS_ORIGIN,
    Referer: DEVOPS_ORIGIN + '/',
  };
  const csrf = request.headers['x-csrftoken'];
  if (typeof csrf === 'string' && csrf) headers['x-csrftoken'] = csrf;
  const cookie = request.headers.cookie;
  if (typeof cookie === 'string' && cookie) headers.cookie = cookie;
  if (method === 'POST') headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(request.body ?? {}) : undefined,
      signal: controller.signal,
    });
    const body = await upstream.text();
    return reply
      .status(upstream.status)
      .header('content-type', upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8')
      .send(body);
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    request.log.warn({ err }, 'devops upstream request failed');
    return reply.status(502).send({
      detail: isTimeout ? '运维平台请求超时' : `运维平台请求失败：${(err as Error).message}`,
    });
  } finally {
    clearTimeout(timer);
  }
}

app.post('/devops-api/deploy/build', (request, reply) =>
  forwardToDevops({
    method: 'POST',
    upstreamUrl: `${DEVOPS_ORIGIN}/deploy/build`,
    request,
    reply,
  }),
);

app.get('/devops-api/deploy/branch', (request, reply) => {
  const { app: appName } = request.query as { app?: string };
  const query = appName ? `?app=${encodeURIComponent(appName)}` : '';
  return forwardToDevops({
    method: 'GET',
    upstreamUrl: `${DEVOPS_ORIGIN}/deploy/branch${query}`,
    request,
    reply,
  });
});

await app.listen({ port: PORT, host: '0.0.0.0' });
