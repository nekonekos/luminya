/**
 * 简易限流中间件（基于 IP + 内存计数）
 * 注意：Workers 无状态，重启后计数清零，仅用于轻量保护。
 * 生产环境建议接入 KV 或 Durable Objects。
 */

const requestCounts = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000; // 1 分钟窗口
const MAX_REQUESTS = 60;      // 每分钟最多请求数

/**
 * 检查请求是否超限
 * @param request 当前请求
 * @returns 如果超限返回 429 Response，否则 null
 */
export function checkRateLimit(request: Request): Response | null {
  const ip = request.headers.get('CF-Connecting-IP') || 'anonymous';
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    // 新窗口
    requestCounts.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return null;
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}