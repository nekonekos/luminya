/**
 * 图片校验工具函数
 * 校验 WebP 格式、文件大小、Magic bytes
 */

// 从 constants 引入最大体积（200KB）
import { IMAGE_MAX_SIZE_BYTES } from '../constants';

/**
 * 校验上传的图片是否符合要求
 * @param arrayBuffer 图片的 ArrayBuffer
 * @param size 文件大小（字节）
 * @returns { valid: boolean, reason?: string }
 */
export function validateWebPImage(
  arrayBuffer: ArrayBuffer,
  size: number
): { valid: boolean; reason?: string } {
  // 1. 大小校验
  if (size > IMAGE_MAX_SIZE_BYTES) {
    return { valid: false, reason: `图片大小不能超过 ${IMAGE_MAX_SIZE_BYTES / 1024}KB` };
  }

  // 2. 文件头 Magic bytes 校验（WebP: RIFF .... WEBP）
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 12) {
    return { valid: false, reason: '文件太小，不是有效的 WebP' };
  }

  const isRIFF =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isWEBP =
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

  if (!isRIFF || !isWEBP) {
    return { valid: false, reason: '不是有效的 WebP 文件（文件头校验失败）' };
  }

  return { valid: true };
}