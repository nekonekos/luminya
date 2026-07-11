/**
 * 每5分钟刷新推荐池并写入 KV
 * 权重公式：热度 = 点赞数 × 3 + 浏览数 × 0.1
 * 时间衰减：≤24h: 1.5, 24-72h: 1.0, >72h: 0.95^(天数-3)
 * 随机扰动：±20% 随机波动
 */
export async function refreshFeed(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // 1. 查询所有可见帖子（基本字段）
  const { results: posts } = await env.DB.prepare(
    `SELECT posts_id, posts_author_id, posts_title, posts_content, 
            posts_hascover, posts_cover_url, posts_views, posts_created_at
     FROM posts 
     WHERE posts_visible = 1`
  ).all();

  if (!posts || posts.length === 0) {
    // 没有帖子，清空 KV 中的推荐池
    await env.FEED_KV.put('feed:top200', '[]');
    await env.FEED_KV.put('feed:corner', '[]');
    return;
  }

  // 2. 批量获取每个帖子的点赞数（单次查询优化）
  const postIds = posts.map(p => p.posts_id as string);
  const likesMap: Record<string, number> = {};
  
  // 分批查询点赞数（避免 SQL 过长）
  const chunkSize = 50;
  for (let i = 0; i < postIds.length; i += chunkSize) {
    const batch = postIds.slice(i, i + chunkSize);
    const placeholders = batch.map(() => '?').join(',');
    const likesRows = await env.DB.prepare(
      `SELECT like_post_id, COUNT(*) as cnt
       FROM post_likes
       WHERE like_post_id IN (${placeholders})
       GROUP BY like_post_id`
    ).bind(...batch).all();
    for (const row of likesRows.results) {
      likesMap[row.like_post_id as string] = row.cnt as number;
    }
  }

  // 3. 计算每个帖子的权重
  const scoredPosts = posts.map(post => {
    const pid = post.posts_id as string;
    const likes = likesMap[pid] || 0;
    const views = (post.posts_views as number) || 0;
    const createdAt = post.posts_created_at as number;

    // 基础热度
    const baseScore = likes * 3 + views * 0.1;

    // 时间衰减系数
    const ageHours = (now - createdAt) / 3600;
    let timeDecay: number;
    if (ageHours <= 24) {
      timeDecay = 1.5;
    } else if (ageHours <= 72) {
      timeDecay = 1.0;
    } else {
      const daysSince3 = (ageHours / 24) - 3;
      timeDecay = Math.pow(0.95, daysSince3);
    }

    // 随机扰动 (±20%)
    const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 ~ 1.2

    const weight = baseScore * timeDecay * randomFactor;

    return { post, weight, likes, views };
  });

  // 4. 按权重降序排序，取 Top 200
  scoredPosts.sort((a, b) => b.weight - a.weight);
  const top200Posts = scoredPosts.slice(0, 200);

  // 5. 筛选角落之光源（72h 内发布，至少 1 赞，点赞 ≤ 5 且浏览 ≤ 50）
  const cornerPosts = scoredPosts.filter(item => {
    const ageHours = (now - (item.post.posts_created_at as number)) / 3600;
    return ageHours <= 72 && item.likes >= 1 && item.likes <= 5 && item.views <= 50;
  });
  // 随机打乱，取最多 50 个作为角落池
  const shuffledCorner = cornerPosts.sort(() => Math.random() - 0.5);
  const cornerPool = shuffledCorner.slice(0, 50).map(item => item.post.posts_id);

  // 6. 将帖子展示信息存入 KV（TTL 10分钟），同时存推荐池列表
  const kvPromises: Promise<void>[] = [];
  const top200Ids: string[] = [];

  for (const item of top200Posts) {
    const pid = item.post.posts_id as string;
    top200Ids.push(pid);

    // 获取作者信息和标签
    const author = await env.DB.prepare(
      `SELECT user_id, user_username, user_annual_ring, user_spectrum
       FROM users WHERE user_id = ?`
    ).bind(item.post.posts_author_id).first();

    const tags = await env.DB.prepare(
      `SELECT t.tag_id, t.tag_name
       FROM tags t
       JOIN post_tags pt ON t.tag_id = pt.pt_tag_id
       WHERE pt.pt_post_id = ?`
    ).bind(pid).all();

    // 生成摘要：去除 Markdown 标记，取前 100 个字符
    let summary = (item.post.posts_content as string || '')
      .replace(/#{1,6}\s/g, '') // 标题符号
      .replace(/\*\*(.*?)\*\*/g, '$1') // 粗体
      .replace(/\*(.*?)\*/g, '$1') // 斜体
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // 代码块
      .replace(/!\[.*\]\(.*\)/g, '') // 图片
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 100);

    const postDisplay = {
      posts_id: pid,
      posts_title: item.post.posts_title,
      posts_summary: summary,
      posts_hascover: item.post.posts_hascover,
      posts_cover_url: item.post.posts_cover_url,
      posts_views: item.views,
      posts_likes: item.likes,
      author: author ? {
        user_id: author.user_id,
        user_username: author.user_username,
        user_annual_ring: author.user_annual_ring,
        user_spectrum: author.user_spectrum,
      } : null,
      tags: tags.results,
    };

    kvPromises.push(
      env.FEED_KV.put(
        `feed:post:${pid}`,
        JSON.stringify(postDisplay),
        { expirationTtl: 600 } // 10分钟后过期
      )
    );
  }

  // 存储推荐池 ID 列表和角落池
  kvPromises.push(
    env.FEED_KV.put('feed:top200', JSON.stringify(top200Ids), { expirationTtl: 600 })
  );
  kvPromises.push(
    env.FEED_KV.put('feed:corner', JSON.stringify(cornerPool), { expirationTtl: 600 })
  );

  await Promise.all(kvPromises);
}