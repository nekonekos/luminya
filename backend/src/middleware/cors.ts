/**
 * CORS 中间件
 * 处理预检请求和添加响应头
 */

export function handleCORS(request: Request): Response | null {
  // 如果请求方法为 OPTIONS，直接返回预检响应
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  // 非预检请求返回 null，后续路由处理会添加 CORS 头
  return null;
}

/**
 * 为响应添加 CORS 头
 */
export function addCORSHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}