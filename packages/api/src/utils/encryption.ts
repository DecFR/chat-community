import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)');
}

const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex');

interface EncryptedData {
  iv: string;
  encryptedData: string;
  authTag: string;
}

/**
 * 加密文本
 * @param text 要加密的明文
 * @returns 加密后的数据对象（JSON 字符串）
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  const result: EncryptedData = {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: authTag.toString('hex'),
  };

  return JSON.stringify(result);
}

/**
 * 解密文本
 * @param encryptedText 加密后的数据（JSON 字符串）
 * @returns 解密后的明文
 */
export function decrypt(encryptedText: string): string {
  try {
    const { iv, encryptedData, authTag }: EncryptedData = JSON.parse(encryptedText);

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, Buffer.from(iv, 'hex'));

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    throw new Error('消息解密失败');
  }
}

export default {
  encrypt,
  decrypt,
};
