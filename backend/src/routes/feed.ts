/**
 * 推荐流接口
 * GET /api/feed?cursor=<base64>&limit=10
 */
export async function handleFeedRoutes(
  env: Env,
  request: Request,
  path: string
): Promise<Response | null> {
  if (request.method !== 'GET' || path !== '/api/feed') return null;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 20);
  let cursorStr = url.searchParams.get('cursor') || '';

  // 1. 从 KV 获取推荐池列表和角落池
  const top200Str = await env.FEED_KV.get('feed:top200');
  const cornerStr = await env.FEED_KV.get('feed:corner');

  const allIds: string[] = top200Str ? JSON.parse(top200Str) : [];
  const cornerIds: string[] = cornerStr ? JSON.parse(cornerStr) : [];

  if (allIds.length === 0) {
    return new Response(JSON.stringify({ posts: [], next_cursor: null, has_more: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. 解析 cursor（base64 编码的 offset）
  let offset = 0;
  if (cursorStr) {
    try {
      const decoded = atob(cursorStr);
      const parsed = JSON.parse(decoded);
      offset = parsed.offset || 0;
    } catch {
      offset = 0;
    }
  }

  // 3. 构建返回的帖子 ID 列表（混合角落之光）
  // 规则：每5条插入一条角落帖（从角落池随机取，避免重复）
  const resultIds: string[] = [];
  const usedCorner = new Set<string>();
  let cornerIndex = 0;

  for (let i = offset; i < allIds.length && resultIds.length < limit; i++) {
    // 正常添加推荐帖
    if (resultIds.length > 0 && (resultIds.length + 1) % 6 === 0) {
      // 当前应插入角落帖（第5、11、17... 即 (index+1) % 6 == 0）
      if (cornerIds.length > 0) {
        // 随机选一个未使用过的角落帖
        const availableCorners = cornerIds.filter(c => !usedCorner.has(c));
        if (availableCorners.length > 0) {
          const pick = availableCorners[Math.floor(Math.random() * availableCorners.length)];
          resultIds.push(pick);
          usedCorner.add(pick);
        } else {
          // 角落帖用完，继续加推荐帖
          resultIds.push(allIds[i]);
        }
      } else {
        resultIds.push(allIds[i]);
      }
    } else {
      resultIds.push(allIds[i]);
    }
  }

  // 4. 从 KV 读取每一条帖子的展示数据
  const postsData = [];
  for (const pid of resultIds) {
    const dataStr = await env.FEED_KV.get(`feed:post:${pid}`);
    if (dataStr) {
      postsData.push(JSON.parse(dataStr));
    }
  }

  // 5. 生成下一个 cursor
  const nextOffset = offset + limit;
  const hasMore = nextOffset < allIds.length;
  const nextCursor = hasMore
    ? btoa(JSON.stringify({ offset: nextOffset }))
    : null;

  return new Response(
    JSON.stringify({
      posts: postsData,
      next_cursor: nextCursor,
      has_more: hasMore,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}