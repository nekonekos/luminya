import { handleCORS } from './middleware/cors';
// 路由模块将在后续板块注入，目前占位

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. 处理 CORS 预检
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;

    // 2. 解析 URL 路径
    const url = new URL(request.url);
    const path = url.pathname;

    // 3. 简易路由分发（后续改用 itty-router 或自制更好路由）
    // 当前仅占位，防止 404 报错
    if (path === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. 其他路由返回 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};