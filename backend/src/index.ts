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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsResponse = handleCORS(request);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查
    if (path === '/api/health') {
      return addCORSHeaders(new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    // 用户路由
    let response = await handleUserRoutes(env, request, path);
    if (response) return addCORSHeaders(response);

    response = await handleUploadRoutes(env, request, path);
    if (response) return addCORSHeaders(response);

    response = await handlePostRoutes(env, request, path);
    if (response) return addCORSHeaders(response);

    response = await handleCommentRoutes(env, request, path);
    if (response) return addCORSHeaders(response);

    response = await handleLikeRoutes(env, request, path);
    if (response) return addCORSHeaders(response);

    response = await handleFeedRoutes(env, request, path);
    if (response) return addCORSHeaders(response);

    // 404
    return addCORSHeaders(new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }));
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(updateUserLevels(env));
    ctx.waitUntil(cleanupDeletedPosts(env));
    if (event.cron === '*/5 * * * *') {
      ctx.waitUntil(refreshFeed(env));
    }
  }
};