import { handleCORS } from './middleware/cors';
import { handleUserRoutes } from './routes/users';
import { handlePostRoutes } from './routes/posts';
import { handleCommentRoutes } from './routes/comments';
import { handleLikeRoutes } from './routes/likes';
import { handleUploadRoutes } from './routes/uploads';
import { updateUserLevels } from './cron/updateLevels';
import { cleanupDeletedPosts } from './cron/cleanupDeleted';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 预检
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
    let response = await handleUserRoutes(env, request, path);
    if (response) return response;

    // 上传路由（需要鉴权）
    response = await handleUploadRoutes(env, request, path);
    if (response) return response;

    // 帖子路由
    response = await handlePostRoutes(env, request, path);
    if (response) return response;

    // 评论路由
    response = await handleCommentRoutes(env, request, path);
    if (response) return response;

    // 点赞路由
    response = await handleLikeRoutes(env, request, path);
    if (response) return response;

    // 404
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(updateUserLevels(env));
    ctx.waitUntil(cleanupDeletedPosts(env));
  }
};