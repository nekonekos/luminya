import { verifyToken } from '../middleware/auth';

async function toggleLike(env: Env, request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: '请先登录' }, 401);
  const token = authHeader.slice(7);
  const userId = await verifyToken(env, token);
  if (!userId) return json({ error: '请先登录' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: '格式错误' }, 400); }
  const { postId } = body;
  if (!postId) return json({ error: '缺少 postId' }, 400);

  // 检查帖子是否存在
  const post = await env.DB.prepare('SELECT posts_id FROM posts WHERE posts_id = ? AND posts_visible = 1')
    .bind(postId).first();
  if (!post) return json({ error: '帖子不存在' }, 404);

  const existing = await env.DB.prepare('SELECT * FROM post_likes WHERE like_post_id = ? AND like_user_id = ?')
    .bind(postId, userId).first();
  if (existing) {
    // 取消点赞
    await env.DB.prepare('DELETE FROM post_likes WHERE like_post_id = ? AND like_user_id = ?')
      .bind(postId, userId).run();
    return json({ liked: false });
  } else {
    // 点赞
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('INSERT INTO post_likes (like_post_id, like_user_id, like_created_at) VALUES (?, ?, ?)')
      .bind(postId, userId, now).run();
    return json({ liked: true });
  }
}

export async function handleLikeRoutes(env: Env, request: Request, path: string): Promise<Response | null> {
  if (request.method === 'POST' && path === '/api/likes') return toggleLike(env, request);
  return null;
}