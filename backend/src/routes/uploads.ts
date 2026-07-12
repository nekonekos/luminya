import { verifyToken } from '../middleware/auth';
import { generateId } from '../utils/id';
import { IMAGE_MAX_SIZE_BYTES } from '../constants';
function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
async function uploadImage(env: Env, request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: '请先登录' }, 401);
  const token = authHeader.slice(7);
  const userId = await verifyToken(env, token);
  if (!userId) return json({ error: '请先登录' }, 401);

  // 只接受 multipart/form-data
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return json({ error: '请使用 multipart/form-data 上传' }, 400);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') return json({ error: '未找到文件' }, 400);

  // 校验大小
  if (file.size > IMAGE_MAX_SIZE_BYTES) return json({ error: '图片大小不能超过200KB' }, 400);

  // 校验格式：仅允许 webp（也可以放宽为 image/webp）
  if (file.type !== 'image/webp') return json({ error: '仅支持 WebP 格式' }, 400);

  // 额外校验：文件头是否为 WebP (RIFF)
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const isWebP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!isWebP) return json({ error: '文件不是有效的 WebP' }, 400);

  // 生成唯一文件名
  const imgId = generateId();
  const ext = 'webp';
  const key = `posts/${imgId}.${ext}`;

  // 上传到 R2
  await env.R2.put(key, arrayBuffer, {
    httpMetadata: { contentType: 'image/webp' },
  });

  // 构造原图 URL（假设 R2 公开访问 URL 前缀为 /r2/ 或绑定自定义域）
  const baseUrl = `https://api.luminya.cn/${key}`;
  // 对于缩略图，我们使用 Cloudflare Image Resizing 参数（需在 Worker 域名或自定义域启用）
  // 如果不启用，直接记录相同 URL；前端可通过 ?width=200 获取变体
  const w200 = `${baseUrl}?width=200`;
  const w400 = `${baseUrl}?width=400`;
  const w800 = `${baseUrl}?width=800`;

  const now = Math.floor(Date.now() / 1000);
  // 插入 post_images 表，但不关联帖子（等发帖时再关联）
  await env.DB.prepare(
    'INSERT INTO post_images (postimg_id, postimg_post_id, postimg_url, postimg_w200, postimg_w400, postimg_w800, postimg_created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(imgId, null, baseUrl, w200, w400, w800, now)
    .run();

  return json({
    imageId: imgId,
    urls: { original: baseUrl, w200, w400, w800 },
  }, 201);
}

export async function handleUploadRoutes(env: Env, request: Request, path: string): Promise<Response | null> {
  if (request.method === 'POST' && path === '/api/uploads') return uploadImage(env, request);
  return null;
}