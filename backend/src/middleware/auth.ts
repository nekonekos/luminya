/**
 * 极简 Token 机制：登录后生成随机 Token，存入 D1 sessions 表（待建）
 * 后续请求通过 Authorization Header 传递 Token 进行校验
 * 当前板块仅提供签发和校验逻辑骨架，实际表结构和完整校验在板块 C 完善
 */
import { generateId } from '../utils/id';

export interface UserTokenPayload {
  userId: string;
}

// 签发 Token（目前返回纯随机字符串，不编码任何信息）
export async function issueToken(env: Env, userId: string): Promise<string> {
  const token = generateId();
  const now = Math.floor(Date.now() / 1000);
  // 插入 sessions 表（表未建，先注释，后续完善）
  // await env.DB.prepare('INSERT INTO sessions ...').bind(...).run();
  return token;
}

// 验证 Token，返回 userId（占位实现）
export async function verifyToken(env: Env, token: string): Promise<string | null> {
  // TODO: 查询 sessions 表，检查 token 是否存在且未过期
  return null;
}