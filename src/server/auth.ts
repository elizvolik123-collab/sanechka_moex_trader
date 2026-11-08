import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { getEnv } from "./env";
import { sendMail } from "./mail";

// argon2id, параметры по рекомендации OWASP (19 МиБ памяти, 2 итерации)
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

function createAuth() {
  const env = getEnv();
  return betterAuth({
    appName: "MOEX Trader",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: prismaAdapter(db(), { provider: "postgresql" }),
    account: { modelName: "authAccount" },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      password: {
        hash: (password) => hash(password, ARGON2_OPTIONS),
        verify: ({ hash: passwordHash, password }) => verify(passwordHash, password),
      },
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Восстановление пароля — MOEX Trader",
          text:
            `Здравствуйте, ${user.name}!\n\n` +
            `Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n${url}\n\n` +
            "Если вы не запрашивали восстановление, просто проигнорируйте это письмо.",
        });
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  if (!globalForAuth.auth) globalForAuth.auth = createAuth();
  return globalForAuth.auth;
}
