import { verifyToken } from '../middleware/auth';
import { generateId } from '../utils/id';

// 简单的 JSON 响应辅助
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 获取预设标签列表（支持搜索）
async function listPresetTags(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  let tags;
  if (q) {
    tags = await env.DB.prepare(
      `SELECT tag_id, tag_name FROM tags WHERE tag_type = 'preset' AND tag_name LIKE ? ORDER BY tag_created_at ASC`
    )
      .bind(`%${q}%`)
      .all();
  } else {
    tags = await env.DB.prepare(
      `SELECT tag_id, tag_name FROM tags WHERE tag_type = 'preset' ORDER BY tag_created_at ASC`
    ).all();
  }
  return json(tags.results);
}

// 管理员创建预设标签
async function createPresetTag(env: Env, request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: '请先登录' }, 401);
  const token = authHeader.slice(7);
  const userId = await verifyToken(env, token);
  if (!userId) return json({ error: '登录已过期' }, 401);

  // 检查管理员权限
  const admin = await env.DB.prepare('SELECT admin_id FROM admins WHERE admin_user_id = ?')
    .bind(userId)
    .first();
  if (!admin) return json({ error: '无权限' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: '格式错误' }, 400); }
  const { tagName, language } = body;
  if (!tagName) return json({ error: '标签名不能为空' }, 400);

  // 标签名只允许字母、数字、下划线、连字符，不允许空格和特殊字符
  if (/[\s\W]/.test(tagName) && !/^[a-zA-Z0-9_-]+$/.test(tagName))
    return json({ error: '标签名只能包含字母、数字、下划线、连字符' }, 400);

  const tagId = `preset_${tagName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  const existing = await env.DB.prepare('SELECT tag_id FROM tags WHERE tag_id = ?')
    .bind(tagId)
    .first();
  if (existing) return json({ error: '标签ID已存在' }, 409);

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'INSERT INTO tags (tag_id, tag_name, tag_type, tag_language, tag_created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(tagId, tagName, 'preset', language || null, now)
    .run();

  return json({ tagId, tagName }, 201);
}

// 用户发帖时自动创建 custom 标签（内部函数）
export async function ensureCustomTag(env: Env, tagName: string): Promise<string> {
  // 格式校验
  if (/[\s\W]/.test(tagName)) throw new Error('标签名包含非法字符');
  const tagId = `custom_${tagName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  const existing = await env.DB.prepare('SELECT tag_id FROM tags WHERE tag_id = ?')
    .bind(tagId)
    .first();
  if (!existing) {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO tags (tag_id, tag_name, tag_type, tag_created_at) VALUES (?, ?, ?, ?)'
    )
      .bind(tagId, tagName, 'custom', now)
      .run();
  }
  return tagId;
}

// 搜索标签（预设 + 自定义混合，用于输入提示）
async function searchTags(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  if (!q) return json([]);
  const tags = await env.DB.prepare(
    `SELECT tag_id, tag_name, tag_type FROM tags WHERE tag_name LIKE ? ORDER BY tag_type DESC, tag_created_at ASC LIMIT 20`
  )
    .bind(`%${q}%`)
    .all();
  return json(tags.results);
}

// 按预设标签获取帖子列表
async function getPostsByTag(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tagId = url.searchParams.get('tagId');
  if (!tagId) return json({ error: '缺少tagId' }, 400);

  // 必须是预设标签
  const tag = await env.DB.prepare('SELECT tag_id FROM tags WHERE tag_id = ? AND tag_type = ?')
    .bind(tagId, 'preset')
    .first();
  if (!tag) return json({ error: '标签不存在或不可搜索' }, 404);

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = await env.DB.prepare(
    `SELECT p.posts_id, p.posts_title, p.posts_hascover, p.posts_cover_url, p.posts_views, p.posts_created_at
     FROM posts p
     JOIN post_tags pt ON p.posts_id = pt.pt_post_id
     WHERE pt.pt_tag_id = ? AND p.posts_visible = 1
     ORDER BY p.posts_created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(tagId, limit, offset)
    .all();

  const total = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM posts p JOIN post_tags pt ON p.posts_id = pt.pt_post_id
     WHERE pt.pt_tag_id = ? AND p.posts_visible = 1`
  )
    .bind(tagId)
    .first();

  return json({
    posts: posts.results,
    total: (total as any).count,
    page,
  });
}

// 路由分发
export async function handleTagRoutes(
  env: Env,
  request: Request,
  path: string
): Promise<Response | null> {
  const method = request.method;
  if (method === 'GET' && path === '/api/tags/presets') return listPresetTags(env, request);
  if (method === 'GET' && path === '/api/tags/search') return searchTags(env, request);
  if (method === 'GET' && path === '/api/tags/posts') return getPostsByTag(env, request);
  if (method === 'POST' && path === '/api/admin/tags') return createPresetTag(env, request);
  return null;
}