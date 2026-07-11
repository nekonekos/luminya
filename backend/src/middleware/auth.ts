import { generateId } from '../utils/id';

const TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 天

export async function issueToken(env: Env, userId: string): Promise<string> {
  const token = generateId();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'INSERT INTO sessions (session_token, session_user_id, session_created_at, session_expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(token, userId, now, now + TOKEN_EXPIRY_SECONDS)
    .run();
  return token;
}

export async function verifyToken(env: Env, token: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare(
    'SELECT session_user_id FROM sessions WHERE session_token = ? AND session_expires_at > ?'
  )
    .bind(token, now)
    .first();
  if (!session) return null;
  // 同时更新用户活跃时间
  await env.DB.prepare('UPDATE users SET user_last_login_at = ? WHERE user_id = ?')
    .bind(now, session.session_user_id)
    .run();
  return session.session_user_id as string;
}