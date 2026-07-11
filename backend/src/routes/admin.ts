/**
 * 管理员路由
 * 提供管理员权限验证、添加管理员、管理员列表等 MVP 功能
 */

import { verifyToken } from '../middleware/auth';

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 内部函数：检查当前用户是否为管理员
async function isAdmin(env: Env, userId: string): Promise<boolean> {
  const admin = await env.DB.prepare('SELECT admin_id FROM admins WHERE admin_user_id = ?')
    .bind(userId)
    .first();
  return !!admin;
}

/**
 * 添加管理员（需要现有管理员权限）
 * POST /api/admin/add
 * Body: { userId }
 */
async function addAdmin(env: Env, request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: '请先登录' }, 401);
  const token = authHeader.slice(7);
  const currentUserId = await verifyToken(env, token);
  if (!currentUserId) return json({ error: '登录已过期' }, 401);

  if (!(await isAdmin(env, currentUserId))) return json({ error: '无管理员权限' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: '格式错误' }, 400); }
  const { userId } = body;
  if (!userId) return json({ error: '缺少 userId' }, 400);

  // 检查用户是否存在
  const user = await env.DB.prepare('SELECT user_id FROM users WHERE user_id = ?')
    .bind(userId)
    .first();
  if (!user) return json({ error: '用户不存在' }, 404);

  // 检查是否已是管理员
  const existing = await env.DB.prepare('SELECT admin_id FROM admins WHERE admin_user_id = ?')
    .bind(userId)
    .first();
  if (existing) return json({ error: '该用户已是管理员' }, 409);

  const adminId = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO admins (admin_id, admin_user_id, admin_role) VALUES (?, ?, ?)'
  )
    .bind(adminId, userId, 'superadmin')
    .run();

  return json({ message: '管理员添加成功' }, 201);
}

/**
 * 获取管理员列表（需要管理员权限）
 * GET /api/admin/list
 */
async function listAdmins(env: Env, request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: '请先登录' }, 401);
  const token = authHeader.slice(7);
  const currentUserId = await verifyToken(env, token);
  if (!currentUserId) return json({ error: '登录已过期' }, 401);
  if (!(await isAdmin(env, currentUserId))) return json({ error: '无管理员权限' }, 403);

  const admins = await env.DB.prepare(
    `SELECT a.admin_id, a.admin_user_id, a.admin_role, u.user_username 
     FROM admins a JOIN users u ON a.admin_user_id = u.user_id`
  ).all();

  return json(admins.results);
}

// 路由分发
export async function handleAdminRoutes(
  env: Env,
  request: Request,
  path: string
): Promise<Response | null> {
  if (request.method === 'POST' && path === '/api/admin/add') return addAdmin(env, request);
  if (request.method === 'GET' && path === '/api/admin/list') return listAdmins(env, request);
  return null;
}