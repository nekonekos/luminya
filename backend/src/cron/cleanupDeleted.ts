export async function cleanupDeletedPosts(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const retentionSeconds = 20 * 24 * 60 * 60; // 20天
  const cutoff = now - retentionSeconds;
  const maxDelete = 200;

  const toDelete = await env.DB.prepare(
    `SELECT del_id, del_original_id FROM deleted_posts WHERE del_deleted_at <= ? LIMIT ?`
  )
    .bind(cutoff, maxDelete)
    .all();

  if (!toDelete.results?.length) return;

  for (const item of toDelete.results) {
    const originalPostId = item.del_original_id;

    // 删除关联图片（R2 + 数据库记录）
    const images = await env.DB.prepare(
      `SELECT postimg_id, postimg_url FROM post_images WHERE postimg_post_id = ?`
    )
      .bind(originalPostId)
      .all();

    for (const img of images.results) {
      const url = img.postimg_url as string;
      if (url && url !== 'N/A') {
        try {
          const path = new URL(url).pathname; // 取路径部分
          await env.R2.delete(path);
        } catch (e) {
          console.error('R2 删除失败:', url, e);
        }
      }
      await env.DB.prepare('DELETE FROM post_images WHERE postimg_id = ?')
        .bind(img.postimg_id)
        .run();
    }

    // 删除关联数据
    await env.DB.prepare('DELETE FROM post_tags WHERE pt_post_id = ?').bind(originalPostId).run();
    await env.DB.prepare('DELETE FROM comments WHERE comment_post_id = ?').bind(originalPostId).run();
    await env.DB.prepare('DELETE FROM post_likes WHERE like_post_id = ?').bind(originalPostId).run();
    // 删除回收记录本身
    await env.DB.prepare('DELETE FROM deleted_posts WHERE del_id = ?').bind(item.del_id).run();
  }
}