import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Шифрование секретов (API-токенов брокеров) алгоритмом AES-256-GCM.
 * Формат blob: version(1) | iv(12) | authTag(16) | ciphertext.
 * Версия ключа хранится в самом blob, поэтому ключи можно ротировать без миграции данных.
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = 1 + IV_LENGTH + TAG_LENGTH;

export type Keyring = {
  current: number;
  keys: Map<number, Buffer>;
};

/** Разбирает строку вида "1:base64key,2:base64key". */
export function parseKeyring(spec: string, currentVersion: number): Keyring {
  const keys = new Map<number, Buffer>();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const sep = part.indexOf(":");
    if (sep <= 0) throw new Error("TOKEN_ENCRYPTION_KEYS: ожидается формат версия:ключ");
    const version = Number(part.slice(0, sep));
    if (!Number.isInteger(version) || version < 1 || version > 255) {
      throw new Error("TOKEN_ENCRYPTION_KEYS: версия ключа должна быть целым числом 1..255");
    }
    const key = Buffer.from(part.slice(sep + 1), "base64");
    if (key.length !== 32) throw new Error(`TOKEN_ENCRYPTION_KEYS: ключ версии ${version} должен быть 32 байта`);
    keys.set(version, key);
  }
  if (!keys.has(currentVersion)) {
    throw new Error(`TOKEN_ENCRYPTION_KEYS: нет ключа текущей версии ${currentVersion}`);
  }
  return { current: currentVersion, keys };
}

export function encryptSecret(plaintext: string, keyring: Keyring): { blob: Uint8Array<ArrayBuffer>; keyVersion: number } {
  const key = keyring.keys.get(keyring.current)!;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = new Uint8Array(HEADER_LENGTH + ciphertext.length);
  blob[0] = keyring.current;
  blob.set(iv, 1);
  blob.set(tag, 1 + IV_LENGTH);
  blob.set(ciphertext, HEADER_LENGTH);
  return { blob, keyVersion: keyring.current };
}

export function decryptSecret(blob: Uint8Array, keyring: Keyring): string {
  if (blob.length <= HEADER_LENGTH) throw new Error("Повреждённый зашифрованный секрет");
  const version = blob[0];
  const key = keyring.keys.get(version);
  if (!key) throw new Error(`Нет ключа шифрования версии ${version}`);
  const buf = Buffer.from(blob);
  const iv = buf.subarray(1, 1 + IV_LENGTH);
  const tag = buf.subarray(1 + IV_LENGTH, HEADER_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(HEADER_LENGTH)), decipher.final()]).toString("utf8");
}

/** Последние 4 символа — единственное, что о токене можно показать пользователю. */
export function secretHint(secret: string): string {
  return secret.slice(-4);
}
