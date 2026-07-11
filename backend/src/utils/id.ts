/**
 * 生成全局唯一 ID，使用 crypto.randomUUID()
 * 格式：标准 UUID v4，例如 "6f7a8b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c"
 */
export function generateId(): string {
  return crypto.randomUUID();
}