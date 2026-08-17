import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Mint (or reuse) the anonymous guest session via the landing gate. */
export async function loginAsGuest(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  // Demo wallet bootstrap resets guests to 1000 pts once per load.
  await expect(page.getByTestId("animated-balance").first()).toBeVisible({
    timeout: 20_000,
  }).catch(() => undefined);
}

/** Parse the first animated-balance / HUD / top-bar numeric points read-out. */
export async function readBalance(page: Page): Promise<number> {
  const hud = page.getByTestId("hud-balance").getByTestId("animated-balance");
  if ((await hud.count()) > 0) {
    const text = (await hud.first().innerText()).replace(/[^\d.-]/g, "");
    const n = Number(text);
    if (Number.isFinite(n)) return n;
  }
  const animated = page.getByTestId("animated-balance").first();
  if ((await animated.count()) > 0) {
    const text = (await animated.innerText()).replace(/[^\d.-]/g, "");
    const n = Number(text);
    if (Number.isFinite(n)) return n;
  }
  const top = page.getByTestId("topbar-balance");
  await expect(top).toBeVisible({ timeout: 20_000 });
  const text = (await top.innerText()).replace(/[^\d.-]/g, "");
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(`Could not parse balance from "${await top.innerText()}"`);
  return n;
}

export async function waitForBalanceChange(
  page: Page,
  previous: number,
  { timeout = 45_000 }: { timeout?: number } = {},
): Promise<number> {
  await expect
    .poll(async () => readBalance(page), { timeout })
    .not.toBe(previous);
  return readBalance(page);
}

/** Read the Supabase auth user id from the browser session (localStorage). */
export async function getSessionUserId(page: Page): Promise<string> {
  const userId = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.includes("auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as {
          user?: { id?: string };
          currentSession?: { user?: { id?: string } };
        };
        const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
        if (id) return id;
      } catch {
        /* ignore */
      }
    }
    return null;
  });
  if (!userId) throw new Error("Could not read Supabase session user id from localStorage");
  return userId;
}
