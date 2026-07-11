import { verifyToken } from '../middleware/auth';
import { generateId } from '../utils/id';
import { COMMENT_CONTENT_MAX_LENGTH } from '../constants';

// 同上辅助函数 json, badRequest, unauthorized

async function createComment(env: Env, request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return unauthorized();
  const token = authHeader.slice(7);
  const userId = await verifyToken(env, token);
  if (!userId) return unauthorized();

  let body: any;
  try { body = await request.json(); } catch { return badRequest('格式错误'); }

  const { postId, content, parentId } = body;
  if (!postId || !content) return badRequest('postId 和 content 必填');
  if (content.length > COMMENT_CONTENT_MAX_LENGTH) return badRequest('评论不能超过512字符');
  // 控制字符校验
  if (/[\x00-\x1F\x7F]/.test(content)) return badRequest('评论包含非法字符');

  // 检查帖子是否存在且可见
  const post = await env.DB.prepare('SELECT posts_id FROM posts WHERE posts_id = ? AND posts_visible = 1')
    .bind(postId).first();
  if (!post) return json({ error: '帖子不存在' }, 404);

  // 两层评论限制
  if (parentId) {
    const parent = await env.DB.prepare('SELECT comment_parent_id FROM comments WHERE comment_id = ?')
      .bind(parentId).first();
    if (!parent) return json({ error: '父评论不存在' }, 404);
    if (parent.comment_parent_id !== null) return badRequest('不允许回复二级评论');
  }

  const now = Math.floor(Date.now() / 1000);
  const commentId = generateId();
  await env.DB.prepare(
    'INSERT INTO comments (comment_id, comment_post_id, comment_author_id, comment_parent_id, comment_content, comment_created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(commentId, postId, userId, parentId || null, content, now)
    .run();

  return json({ commentId }, 201);
}

async function getComments(env: Env, request: Request, postId: string): Promise<Response> {
  const comments = await env.DB.prepare(
    'SELECT * FROM comments WHERE comment_post_id = ? ORDER BY comment_created_at ASC'
  )
    .bind(postId)
    .all();
  return json(comments.results);
}

export async function handleCommentRoutes(env: Env, request: Request, path: string): Promise<Response | null> {
  const method = request.method;
  if (method === 'POST' && path === '/api/comments') return createComment(env, request);
  const match = path.match(/^\/api\/comments\/([a-zA-Z0-9-]+)$/);
  if (match && method === 'GET') return getComments(env, request, match[1]);
  return null;
}