import { verifyToken } from '../middleware/auth';
import { generateId } from '../utils/id';
import { POST_CONTENT_MAX_LENGTH } from '../constants';
import { ensureCustomTag } from './tags';

// ---------- 辅助函数 ----------
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function badRequest(msg: string) {
  return json({ error: msg }, 400);
}

function unauthorized() {
  return json({ error: '请先登录' }, 401);
}

// ---------- 发帖 ----------
async function createPost(env: Env, request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return unauthorized();
  const token = authHeader.slice(7);
  const userId = await verifyToken(env, token);
  if (!userId) return unauthorized();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return badRequest('请求格式错误');
  }

  const { title, content, tags, coverImageId } = body;
  if (!title || !content) return badRequest('标题和内容不能为空');
  if (content.length > POST_CONTENT_MAX_LENGTH) return badRequest('内容超过16384字符');
  if (!/^[\p{L}\p{N}\s\p{P}]+$/u.test(content)) return badRequest('内容包含非法控制字符'); // 简单校验

  const now = Math.floor(Date.now() / 1000);
  const postId = generateId();

  // 封面处理
  let hasCover = 0;
  let coverUrl = 'N/A';
  if (coverImageId) {
    const img = await env.DB.prepare('SELECT postimg_url FROM post_images WHERE postimg_id = ?')
      .bind(coverImageId)
      .first();
    if (img) {
      hasCover = 1;
      coverUrl = img.postimg_url as string;
    }
  }

  // 插入帖子
  await env.DB.prepare(
    `INSERT INTO posts (posts_id, posts_author_id, posts_title, posts_content, posts_hascover, posts_cover_url, posts_created_at, posts_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(postId, userId, title, content, hasCover, coverUrl, now, now)
    .run();

  // 关联图片（如果有）
  if (coverImageId) {
    await env.DB.prepare('UPDATE post_images SET postimg_post_id = ? WHERE postimg_id = ?')
      .bind(postId, coverImageId)
      .run();
  }
  // 其他图片从前端提交的 imageIds 数组关联
  if (body.imageIds && Array.isArray(body.imageIds)) {
    for (const imgId of body.imageIds) {
      await env.DB.prepare('UPDATE post_images SET postimg_post_id = ? WHERE postimg_id = ?')
        .bind(postId, imgId)
        .run();
    }
  }

  // 标签处理
  // 在 createPost 里，原来是类似:
// if (tags && Array.isArray(tags)) {
//   for (const tagId of tags) {
//     await env.DB.prepare('INSERT INTO post_tags ...')
//   }
// }

// 替换为 ↓
if (tags && Array.isArray(tags)) {
  const { ensureCustomTag } = await import('../routes/tags'); // 引入刚刚导出的函数
  for (const tagName of tags) {
    let tagId = tagName;
    // 先检查是否已经是预设标签 ID
    const tag = await env.DB.prepare('SELECT tag_id FROM tags WHERE tag_id = ?')
      .bind(tagId)
      .first();
    if (!tag) {
      // 不是 ID，就当作自定义标签名，自动创建
      try {
        tagId = await ensureCustomTag(env, tagName);
      } catch (e) {
        // 非法标签名，直接跳过
        continue;
      }
    }
    await env.DB.prepare(
      'INSERT INTO post_tags (pt_post_id, pt_tag_id) VALUES (?, ?)'
    )
      .bind(postId, tagId)
      .run();
  }
}

  return json({ postId }, 201);
}

// ---------- 帖子详情（浏览量+1）----------
async function getPost(env: Env, request: Request, postId: string): Promise<Response> {
  const post = await env.DB.prepare(
    'SELECT * FROM posts WHERE posts_id = ? AND posts_visible = 1'
  )
    .bind(postId)
    .first();
  if (!post) return json({ error: '帖子不存在' }, 404);

  // 浏览量增加（仅已登录用户）
  const authHeader = request.headers.get('Authorization');
  let userId: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    userId = await verifyToken(env, token);
  }
  if (userId) {
    await env.DB.prepare('UPDATE posts SET posts_views = posts_views + 1 WHERE posts_id = ?')
      .bind(postId)
      .run();
    post.posts_views = (post.posts_views as number) + 1; // 更新返回值
  }

  // 关联标签
  const tags = await env.DB.prepare(
    'SELECT t.tag_id, t.tag_name FROM tags t JOIN post_tags pt ON t.tag_id = pt.pt_tag_id WHERE pt.pt_post_id = ?'
  )
    .bind(postId)
    .all();
  // 关联图片
  const images = await env.DB.prepare('SELECT * FROM post_images WHERE postimg_post_id = ?')
    .bind(postId)
    .all();

  return json({
    ...post,
    tags: tags.results,
    images: images.results,
  });
}

// ---------- 帖子列表（简易分页）----------
async function listPosts(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = await env.DB.prepare(
    'SELECT posts_id, posts_title, posts_hascover, posts_cover_url, posts_views, posts_created_at FROM posts WHERE posts_visible = 1 ORDER BY posts_created_at DESC LIMIT ? OFFSET ?'
  )
    .bind(limit, offset)
    .all();
  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM posts WHERE posts_visible = 1')
    .first();

  return json({
    posts: posts.results,
    total: (total as any).count,
    page,
  });
}

// ---------- 删除帖子（软删除）----------
async function deletePost(env: Env, request: Request, postId: string): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return unauthorized();
  const token = authHeader.slice(7);
  const userId = await verifyToken(env, token);
  if (!userId) return unauthorized();

  const post = await env.DB.prepare('SELECT posts_author_id, posts_content FROM posts WHERE posts_id = ? AND posts_visible = 1')
    .bind(postId)
    .first();
  if (!post) return json({ error: '帖子不存在' }, 404);
  if (post.posts_author_id !== userId) return json({ error: '无权删除' }, 403);

  const now = Math.floor(Date.now() / 1000);
  // 标记不可见
  await env.DB.prepare('UPDATE posts SET posts_visible = 0 WHERE posts_id = ?').bind(postId).run();
  // 插入回收表
  await env.DB.prepare(
    'INSERT INTO deleted_posts (del_id, del_original_id, del_author_id, del_deleted_at, del_content) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(generateId(), postId, userId, now, post.posts_content)
    .run();

  return json({ message: '帖子已删除' });
}

// ---------- 路由分发 ----------
export async function handlePostRoutes(env: Env, request: Request, path: string): Promise<Response | null> {
  const method = request.method;
  const match = path.match(/^\/api\/posts\/([a-zA-Z0-9-]+)$/);
  if (match) {
    const postId = match[1];
    if (method === 'GET') return getPost(env, request, postId);
    if (method === 'DELETE') return deletePost(env, request, postId);
  }
  if (method === 'POST' && path === '/api/posts') return createPost(env, request);
  if (method === 'GET' && path === '/api/posts') return listPosts(env, request);
  return null;
}