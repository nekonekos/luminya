import { handleCORS, addCORSHeaders } from './middleware/cors';
import { handleUserRoutes } from './routes/users';
import { handlePostRoutes } from './routes/posts';
import { handleCommentRoutes } from './routes/comments';
import { handleLikeRoutes } from './routes/likes';
import { handleUploadRoutes } from './routes/uploads';
import { updateUserLevels } from './cron/updateLevels';
import { cleanupDeletedPosts } from './cron/cleanupDeleted';
import { refreshFeed } from './cron/refreshFeed';
import { handleFeedRoutes } from './routes/feed';

// 在 index.ts 顶部补充导入（如果有的话）
// import { addCORSHeaders } from './middleware/cors';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const path = url.pathname;
    // 图片代理：从 R2 读取 /posts/* 或 /avatars/* 路径的文件
    if (path.startsWith('/posts/') || path.startsWith('/avatars/')) {
      // 去掉开头的 '/'
      const key = path.substring(1);
      console.log('Image request:', path, 'key:', key);
      const object = await env.R2.get(key);
      if (!object) {
        return new Response('Not Found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=31536000');
      return new Response(object.body, { headers });
    }
    // 健康检查
    if (path === '/api/health') {
      return addCORSHeaders(new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      }));
    }
    
    // 安全调用辅助函数：捕获异常并返回带 CORS 的 500
    const safeCall = async (handler: Function): Promise<Response | null> => {
      try {
        return await handler();
      } catch (e) {
        console.error(e); // 记录错误，方便排错
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    };

    // 用户路由
    let response = await safeCall(() => handleUserRoutes(env, request, path));
    if (response) return addCORSHeaders(response);

    response = await safeCall(() => handleUploadRoutes(env, request, path));
    if (response) return addCORSHeaders(response);

    response = await safeCall(() => handlePostRoutes(env, request, path));
    if (response) return addCORSHeaders(response);

    response = await safeCall(() => handleCommentRoutes(env, request, path));
    if (response) return addCORSHeaders(response);

    response = await safeCall(() => handleLikeRoutes(env, request, path));
    if (response) return addCORSHeaders(response);

    response = await safeCall(() => handleFeedRoutes(env, request, path));
    if (response) return addCORSHeaders(response);

    // 404
    return addCORSHeaders(new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateUserLevels(env));
    ctx.waitUntil(cleanupDeletedPosts(env));
    if (event.cron === '*/5 * * * *') {
      ctx.waitUntil(refreshFeed(env));
    }
  }
};