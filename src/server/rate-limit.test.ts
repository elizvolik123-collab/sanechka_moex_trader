import { describe, expect, it } from "vitest";
import { clientIp, isRateLimited } from "./rate-limit";

describe("isRateLimited", () => {
  it("пропускает до лимита, затем блокирует до конца окна", () => {
    const t0 = 1_000_000;
    const key = `test-${Math.random()}`;
    expect([1, 2, 3].map((i) => isRateLimited(key, 3, 1000, t0 + i))).toEqual([false, false, false]);
    expect(isRateLimited(key, 3, 1000, t0 + 10)).toBe(true);
    // окно сдвинулось — самые ранние запросы истекли
    expect(isRateLimited(key, 3, 1000, t0 + 1002)).toBe(false);
  });

  it("ключи независимы", () => {
    const t = 2_000_000;
    expect(isRateLimited("a-ip", 1, 1000, t)).toBe(false);
    expect(isRateLimited("b-ip", 1, 1000, t)).toBe(false);
    expect(isRateLimited("a-ip", 1, 1000, t + 1)).toBe(true);
  });
});

describe("clientIp", () => {
  it("первый адрес из X-Forwarded-For", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
