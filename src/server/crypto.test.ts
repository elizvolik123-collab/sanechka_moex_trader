import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseKeyring, secretHint } from "./crypto";

const key = () => randomBytes(32).toString("base64");

describe("crypto: AES-256-GCM", () => {
  it("шифрует и расшифровывает токен", () => {
    const keyring = parseKeyring(`1:${key()}`, 1);
    const { blob, keyVersion } = encryptSecret("t.secret-token", keyring);
    expect(keyVersion).toBe(1);
    expect(Buffer.from(blob).toString("utf8")).not.toContain("secret-token");
    expect(decryptSecret(blob, keyring)).toBe("t.secret-token");
  });

  it("каждый раз использует новый IV", () => {
    const keyring = parseKeyring(`1:${key()}`, 1);
    const a = encryptSecret("same", keyring).blob;
    const b = encryptSecret("same", keyring).blob;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("обнаруживает подмену шифротекста", () => {
    const keyring = parseKeyring(`1:${key()}`, 1);
    const { blob } = encryptSecret("token", keyring);
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptSecret(blob, keyring)).toThrow();
  });

  it("не расшифровывает чужим ключом", () => {
    const { blob } = encryptSecret("token", parseKeyring(`1:${key()}`, 1));
    expect(() => decryptSecret(blob, parseKeyring(`1:${key()}`, 1))).toThrow();
  });

  it("поддерживает ротацию: старые токены читаются после смены текущего ключа", () => {
    const k1 = key();
    const old = encryptSecret("old-token", parseKeyring(`1:${k1}`, 1)).blob;
    const rotated = parseKeyring(`1:${k1},2:${key()}`, 2);
    expect(decryptSecret(old, rotated)).toBe("old-token");
    const fresh = encryptSecret("new-token", rotated);
    expect(fresh.keyVersion).toBe(2);
    expect(decryptSecret(fresh.blob, rotated)).toBe("new-token");
  });

  it("валидирует конфигурацию ключей", () => {
    expect(() => parseKeyring("1:c2hvcnQ=", 1)).toThrow(/32 байта/);
    expect(() => parseKeyring(`1:${key()}`, 2)).toThrow(/текущей версии/);
    expect(() => parseKeyring("abc", 1)).toThrow();
  });

  it("показывает только последние 4 символа", () => {
    expect(secretHint("t.abcdefgh1234")).toBe("1234");
  });
});
