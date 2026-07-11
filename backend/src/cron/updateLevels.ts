import { ANNUAL_RING_DAYS, WINTER_INACTIVE_DAYS, SPECTRUM_THRESHOLDS } from '../constants';

/**
 * 计算年轮标签
 */
function computeAnnualRing(registeredAt: number, lastLoginAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const nowDate = new Date(now * 1000);
  const lastLoginDate = new Date(lastLoginAt * 1000);
  const diffDays = Math.floor(
    (nowDate.getTime() - lastLoginDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays >= WINTER_INACTIVE_DAYS) {
    return 'user_TOR_winter';
  }
  const registerDate = new Date(registeredAt * 1000);
  const registerDays = Math.floor(
    (nowDate.getTime() - registerDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (registerDays >= (ANNUAL_RING_DAYS['user_TOR_autumn'] || 1000)) {
    return 'user_TOR_autumn';
  } else if (registerDays >= (ANNUAL_RING_DAYS['user_TOR_summer'] || 200)) {
    return 'user_TOR_summer';
  }
  return 'user_TOR_spring';
}

/**
 * 计算光谱标签（只升不降）
 */
function computeSpectrum(likes: number, views: number): string {
  for (let i = SPECTRUM_THRESHOLDS.length - 1; i >= 0; i--) {
    const { level, likes: reqLikes, views: reqViews } = SPECTRUM_THRESHOLDS[i];
    if (likes >= reqLikes || views >= reqViews) {
      return level;
    }
  }
  return 'user_spectrum_candle';
}

/**
 * 每日更新所有用户的年轮和光谱等级
 */
export async function updateUserLevels(env: Env): Promise<void> {
  const batchSize = 50;
  let offset = 0;
  let hasMore = true;
  const now = Math.floor(Date.now() / 1000);

  while (hasMore) {
    const users = await env.DB.prepare(
      `SELECT user_id, user_registered_at, user_last_login_at, user_annual_ring, user_spectrum
       FROM users
       ORDER BY user_id
       LIMIT ? OFFSET ?`
    )
      .bind(batchSize, offset)
      .all();

    if (users.results.length === 0) {
      hasMore = false;
      break;
    }

    for (const user of users.results) {
      const userId = user.user_id;

      // 汇总累计被赞数
      const likesResult = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM post_likes WHERE like_post_id IN
         (SELECT posts_id FROM posts WHERE posts_author_id = ? AND posts_visible = 1)`
      )
        .bind(userId)
        .first();
      const totalLikes = likesResult ? (likesResult as any).count : 0;

      // 汇总累计浏览量
      const viewsResult = await env.DB.prepare(
        `SELECT COALESCE(SUM(posts_views), 0) as total FROM posts WHERE posts_author_id = ? AND posts_visible = 1`
      )
        .bind(userId)
        .first();
      const totalViews = viewsResult ? (viewsResult as any).total : 0;

      // 更新统计字段
      await env.DB.prepare(
        `UPDATE users SET user_total_likes = ?, user_total_views = ?, user_updated_at = ? WHERE user_id = ?`
      )
        .bind(totalLikes, totalViews, now, userId)
        .run();

      // 计算新等级
      const newAnnualRing = computeAnnualRing(user.user_registered_at as number, user.user_last_login_at as number);
      const currentSpectrum = user.user_spectrum as string;
      const newSpectrum = computeSpectrum(totalLikes, totalViews);

      // 只更新发生变化的字段
      const updates: string[] = [];
      const params: any[] = [];
      if (newAnnualRing !== user.user_annual_ring) {
        updates.push('user_annual_ring = ?');
        params.push(newAnnualRing);
      }
      // 光谱只升不降
      const spectrumOrder = [
        'user_spectrum_candle',
        'user_spectrum_flame',
        'user_spectrum_glow',
        'user_spectrum_lumi',
        'user_spectrum_sunbright',
      ];
      const currentIndex = spectrumOrder.indexOf(currentSpectrum);
      const newIndex = spectrumOrder.indexOf(newSpectrum);
      if (newIndex > currentIndex) {
        updates.push('user_spectrum = ?');
        params.push(newSpectrum);
      }
      if (updates.length > 0) {
        params.push(userId);
        await env.DB.prepare(
          `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`
        )
          .bind(...params)
          .run();
      }
    }

    offset += batchSize;
    if (users.results.length < batchSize) hasMore = false;
  }
}