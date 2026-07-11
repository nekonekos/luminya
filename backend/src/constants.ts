// ============================================================
// 年轮标签 ID 常量（按日自动更新）
// ============================================================
export const ANNUAL_RINGS = {
  SPRING: 'user_TOR_spring',     // 新注册
  SUMMER: 'user_TOR_summer',     // 注册满200天
  AUTUMN: 'user_TOR_autumn',     // 注册满1000天
  WINTER: 'user_TOR_winter',     // 50天未登录
} as const;

// 年轮等级对应所需注册天数
export const ANNUAL_RING_DAYS: Record<string, number> = {
  [ANNUAL_RINGS.SUMMER]: 200,
  [ANNUAL_RINGS.AUTUMN]: 1000,
};

// 冬季判定阈值（未登录天数）
export const WINTER_INACTIVE_DAYS = 50;

// ============================================================
// 光谱标签 ID 常量（按日累计计算）
// ============================================================
export const SPECTRUM = {
  CANDLE: 'user_spectrum_candle',       // 新注册
  FLAME: 'user_spectrum_flame',         // 共15赞 或 70浏览
  GLOW: 'user_spectrum_glow',           // 共150赞 或 1024浏览
  LUMI: 'user_spectrum_lumi',           // 共512赞 或 8192浏览
  SUNBRIGHT: 'user_spectrum_sunbright', // 共1024赞 或 16384浏览
} as const;

// 光谱升级条件（满足其一即可）
export const SPECTRUM_THRESHOLDS = [
  { level: SPECTRUM.CANDLE, likes: 0, views: 0 },
  { level: SPECTRUM.FLAME, likes: 15, views: 70 },
  { level: SPECTRUM.GLOW, likes: 150, views: 1024 },
  { level: SPECTRUM.LUMI, likes: 512, views: 8192 },
  { level: SPECTRUM.SUNBRIGHT, likes: 1024, views: 16384 },
];

// ============================================================
// 其他业务常量
// ============================================================
export const POST_CONTENT_MAX_LENGTH = 16384;
export const COMMENT_CONTENT_MAX_LENGTH = 512;
export const IMAGE_MAX_SIZE_BYTES = 200 * 1024; // 200KB
export const DELETED_POSTS_RETENTION_DAYS = 20;
export const DELETED_POSTS_CLEANUP_MAX = 200;