import { decryptSecret, encryptSecret, parseKeyring, type Keyring } from "./crypto";
import { getEnv } from "./env";

let keyring: Keyring | undefined;

function getKeyring(): Keyring {
  if (!keyring) {
    const env = getEnv();
    keyring = parseKeyring(env.TOKEN_ENCRYPTION_KEYS, env.TOKEN_ENCRYPTION_KEY_VERSION);
  }
  return keyring;
}

export function encryptToken(token: string) {
  return encryptSecret(token, getKeyring());
}

/** Расшифровка только на сервере, непосредственно перед запросом к API брокера. */
export function decryptToken(blob: Uint8Array): string {
  return decryptSecret(blob, getKeyring());
}
