import { hashPassword, verifyPassword } from '../utils/hash';
import { generateId } from '../utils/id';
import { issueToken } from '../middleware/auth';
import { POST_CONTENT_MAX_LENGTH } from '../constants'; // 仅示例，未用

/**
 * 用户注册接口：POST /api/users/register
 * Body: { username, email?, phone?, password }
 * 验证码留空位：TODO: captcha validation
 */
async function register(env: Env, request: Request): Promise<Response> {
  try {
    const body: any = await request.json();
    const { username, email, phone, password } = body;
    if (!username || !password) {
      return json({ error: '用户名和密码不能为空' }, 400);
    }
    // 简单校验用户名格式（仅允许字母数字下划线，长度3-20）
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return json({ error: '用户名格式不合法（3-20位字母数字下划线）' }, 400);
    }
    // TODO: 验证码校验 (空位)
    // if (!validateCaptcha(body.captcha)) return json({error:'验证码错误'},400);

    const now = Math.floor(Date.now() / 1000);
    const userId = generateId();

    // 检查用户名、邮箱、手机号唯一性
    const existingUser = await env.DB.prepare(
      `SELECT user_id FROM users WHERE user_username = ? OR user_email = ? OR user_phone = ?`
    )
      .bind(username, email || null, phone || null)
      .first();
    if (existingUser) {
      return json({ error: '用户名、邮箱或手机号已被注册' }, 409);
    }

    const hashedPassword = await hashPassword(password);

    await env.DB.prepare(
      `INSERT INTO users (user_id, user_username, user_email, user_phone, user_password_hash, 
        user_annual_ring, user_spectrum, user_registered_at, user_last_login_at, 
        user_total_likes, user_total_views, user_created_at, user_updated_at)
       VALUES (?, ?, ?, ?, ?, 'user_TOR_spring', 'user_spectrum_candle', ?, ?, 0, 0, ?, ?)`
    )
      .bind(userId, username, email || null, phone || null, hashedPassword, now, now, now, now)
      .run();

    return json({ message: '注册成功', userId }, 201);
  } catch (err: any) {
    return json({ error: '服务器内部错误' }, 500);
  }
}

/**
 * 用户登录接口：POST /api/users/login
 * Body: { account (username/email/phone), password }
 * 返回 Token 和基本用户信息
 */
async function login(env: Env, request: Request): Promise<Response> {
  try {
    const body: any = await request.json();
    const { account, password } = body;
    if (!account || !password) {
      return json({ error: '账号和密码不能为空' }, 400);
    }

    // 查询用户：支持用户名、邮箱、手机号
    const user = await env.DB.prepare(
      `SELECT * FROM users WHERE user_username = ? OR user_email = ? OR user_phone = ?`
    )
      .bind(account, account, account)
      .first();
    if (!user) {
      return json({ error: '账号或密码错误' }, 401);
    }

    const passwordValid = await verifyPassword(password, user.user_password_hash as string);
    if (!passwordValid) {
      return json({ error: '账号或密码错误' }, 401);
    }

    // 更新最近登录时间
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE users SET user_last_login_at = ? WHERE user_id = ?`
    )
      .bind(now, user.user_id)
      .run();

    // 签发 Token
    const token = await issueToken(env, user.user_id as string);

    return json({
      token,
      user: {
        userId: user.user_id,
        username: user.user_username,
        email: user.user_email,
        phone: user.user_phone,
        annualRing: user.user_annual_ring,
        spectrum: user.user_spectrum,
        registeredAt: user.user_registered_at,
      },
    });
  } catch (err: any) {
    return json({ error: '服务器内部错误' }, 500);
  }
}

/**
 * 获取当前登录用户信息：GET /api/users/me
 * 需要在请求头 Authorization: Bearer <token>
 * 调用此接口时也会自动更新 last_login_at（活跃时间记录）
 */
async function getMe(env: Env, request: Request): Promise<Response> {
  // 从 auth 中间件获取 userId（当前使用简易 token 验证，板块C完善）
  // 此处先模拟从 header 取 token 并验证
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ error: '未提供 Token' }, 401);
  }
  const token = authHeader.substring(7);
  // 调用验证函数（目前返回 null，待实现）
  const userId = await verifyToken(env, token);
  if (!userId) {
    return json({ error: 'Token 无效或已过期' }, 401);
  }

  // 查询用户信息（新增 total_likes 和 total_views）
  const user = await env.DB.prepare(
    `SELECT user_id, user_username, user_email, user_phone, user_annual_ring, user_spectrum, 
            user_registered_at, user_total_likes, user_total_views
    FROM users WHERE user_id = ?`
  )
  .bind(userId)
  .first();

  // 更新活跃时间
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`UPDATE users SET user_last_login_at = ? WHERE user_id = ?`)
    .bind(now, userId)
    .run();

  return json({
    userId: user.user_id,
    username: user.user_username,
    email: user.user_email,
    phone: user.user_phone,
    annualRing: user.user_annual_ring,
    spectrum: user.user_spectrum,
    registeredAt: user.user_registered_at,
    totalLikes: user.user_total_likes,
    totalViews: user.user_total_views,
  });
}

// 工具函数：返回 JSON 响应
function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 路由分发
export async function handleUserRoutes(
  env: Env,
  request: Request,
  path: string
): Promise<Response | null> {
  const method = request.method;
  // 注册
  if (method === 'POST' && path === '/api/users/register') {
    return register(env, request);
  }
  // 登录
  if (method === 'POST' && path === '/api/users/login') {
    return login(env, request);
  }
  // 当前用户信息
  if (method === 'GET' && path === '/api/users/me') {
    return getMe(env, request);
  }
  // 非用户相关路由返回 null，交给主路由继续匹配
  return null;
}

// 从 auth.ts 导入 verifyToken（避免循环引用，直接在文件内引用）
import { verifyToken } from '../middleware/auth';