-- =====================================================
-- LumiNya D1 Schema (v1.0 MVP)
-- 命名规范：表名_字段名，全部小写+下划线
-- =====================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  user_id              TEXT PRIMARY KEY,
  user_username        TEXT UNIQUE NOT NULL,
  user_email           TEXT UNIQUE,
  user_phone           TEXT UNIQUE,
  user_password_hash   TEXT NOT NULL,
  user_github_id       TEXT,
  user_annual_ring     TEXT NOT NULL DEFAULT 'user_TOR_spring',
  user_spectrum        TEXT NOT NULL DEFAULT 'user_spectrum_candle',
  user_registered_at   INTEGER NOT NULL,
  user_last_login_at   INTEGER NOT NULL,
  user_total_likes     INTEGER NOT NULL DEFAULT 0,
  user_total_views     INTEGER NOT NULL DEFAULT 0,
  user_created_at      INTEGER NOT NULL,
  user_updated_at      INTEGER NOT NULL
);

-- 帖子表
CREATE TABLE IF NOT EXISTS posts (
  posts_id             TEXT PRIMARY KEY,
  posts_author_id      TEXT NOT NULL,
  posts_title          TEXT NOT NULL,
  posts_content        TEXT NOT NULL,
  posts_hascover       INTEGER NOT NULL DEFAULT 0,
  posts_cover_url      TEXT NOT NULL DEFAULT 'N/A',
  posts_views          INTEGER NOT NULL DEFAULT 0,
  posts_visible        INTEGER NOT NULL DEFAULT 1,
  posts_created_at     INTEGER NOT NULL,
  posts_updated_at     INTEGER NOT NULL,
  FOREIGN KEY (posts_author_id) REFERENCES users(user_id)
);

-- 帖子图片关联表（多图支持，封面是其中一张）
CREATE TABLE IF NOT EXISTS post_images (
  postimg_id          TEXT PRIMARY KEY,
  postimg_post_id     TEXT NOT NULL,
  postimg_url         TEXT NOT NULL,
  postimg_w200        TEXT,
  postimg_w400        TEXT,
  postimg_w800        TEXT,
  postimg_created_at  INTEGER NOT NULL,
  FOREIGN KEY (postimg_post_id) REFERENCES posts(posts_id)
);

-- 标签字典表
CREATE TABLE IF NOT EXISTS tags (
  tag_id          TEXT PRIMARY KEY,
  tag_name        TEXT NOT NULL,
  tag_type        TEXT NOT NULL CHECK(tag_type IN ('preset','custom','annual_ring','spectrum')),
  tag_language    TEXT,
  tag_created_at  INTEGER NOT NULL
);

-- 帖子-标签关联表
CREATE TABLE IF NOT EXISTS post_tags (
  pt_post_id      TEXT NOT NULL,
  pt_tag_id       TEXT NOT NULL,
  PRIMARY KEY (pt_post_id, pt_tag_id),
  FOREIGN KEY (pt_post_id) REFERENCES posts(posts_id),
  FOREIGN KEY (pt_tag_id) REFERENCES tags(tag_id)
);

-- 评论表（两层楼中楼）
CREATE TABLE IF NOT EXISTS comments (
  comment_id          TEXT PRIMARY KEY,
  comment_post_id     TEXT NOT NULL,
  comment_author_id   TEXT NOT NULL,
  comment_parent_id   TEXT,
  comment_content     TEXT NOT NULL,
  comment_created_at  INTEGER NOT NULL,
  FOREIGN KEY (comment_post_id) REFERENCES posts(posts_id),
  FOREIGN KEY (comment_author_id) REFERENCES users(user_id),
  FOREIGN KEY (comment_parent_id) REFERENCES comments(comment_id)
);

-- 点赞表
CREATE TABLE IF NOT EXISTS post_likes (
  like_post_id    TEXT NOT NULL,
  like_user_id    TEXT NOT NULL,
  like_created_at INTEGER NOT NULL,
  PRIMARY KEY (like_post_id, like_user_id),
  FOREIGN KEY (like_post_id) REFERENCES posts(posts_id),
  FOREIGN KEY (like_user_id) REFERENCES users(user_id)
);

-- 软删除回收表
CREATE TABLE IF NOT EXISTS deleted_posts (
  del_id          TEXT PRIMARY KEY,
  del_original_id TEXT NOT NULL,
  del_author_id   TEXT NOT NULL,
  del_deleted_at  INTEGER NOT NULL,
  del_content     TEXT NOT NULL
);

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
  admin_id      TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL UNIQUE,
  admin_role    TEXT NOT NULL DEFAULT 'superadmin',
  FOREIGN KEY (admin_user_id) REFERENCES users(user_id)
);
-- 在 schema.sql 末尾追加
CREATE TABLE IF NOT EXISTS sessions (
  session_token    TEXT PRIMARY KEY,
  session_user_id  TEXT NOT NULL,
  session_created_at INTEGER NOT NULL,
  session_expires_at INTEGER NOT NULL,
  FOREIGN KEY (session_user_id) REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(session_user_id);

-- ======================
-- 索引（D1 单线程，适度建索引）
-- ======================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(user_username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(user_email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(user_phone);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(posts_author_id);
CREATE INDEX IF NOT EXISTS idx_posts_visible ON posts(posts_visible);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(comment_post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(comment_parent_id);
CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(postimg_post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(pt_tag_id);