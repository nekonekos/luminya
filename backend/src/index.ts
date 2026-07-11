import { handleCORS } from './middleware/cors';
import { handleUserRoutes } from './routes/users';

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  // 其他绑定 ...
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 处理 CORS 预检
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查
    if (path === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 用户路由
    const userResponse = await handleUserRoutes(env, request, path);
    if (userResponse) return userResponse;

    // 其他路由 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};