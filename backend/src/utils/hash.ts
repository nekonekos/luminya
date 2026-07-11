/**
 * 密码哈希工具：基于 Web Crypto API 的 PBKDF2
 * 使用 SHA-256 作为伪随机函数，迭代 100,000 次
 * 盐值随机生成，并与哈希拼接存储（格式：salt:hash）
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 256; // 比特
const SALT_LENGTH = 16; // 字节

export async function hashPassword(password: string): Promise<string> {
  // 生成随机盐
  const saltBuffer = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  // 将密码转为 ArrayBuffer
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  // 派生密钥
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH
  );
  // 盐和哈希都转为十六进制字符串，用冒号连接
  const saltHex = bufferToHex(saltBuffer);
  const hashHex = bufferToHex(new Uint8Array(derivedBits));
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, originalHash] = storedHash.split(':');
  if (!saltHex || !originalHash) return false;

  const saltBuffer = hexToBuffer(saltHex);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH
  );
  const computedHashHex = bufferToHex(new Uint8Array(derivedBits));
  // 恒定时间比较（防时序攻击）
  return timingSafeEqual(computedHashHex, originalHash);
}

// 辅助函数：Buffer -> 十六进制字符串
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 辅助函数：十六进制字符串 -> Uint8Array
function hexToBuffer(hex: string): Uint8Array {
  const length = hex.length / 2;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// 恒定时间字符串比较
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}