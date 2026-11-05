import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('health check answers 200', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test('two players create, join and start a game on the production build', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const hostErrors = collectErrors(host);
  const guestErrors = collectErrors(guest);

  await host.goto('/');
  await host.getByLabel('Your nickname').fill('Ana');
  await host.getByRole('button', { name: 'Create a room' }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;
  await expect(host.getByRole('heading', { name: /Lobby/ })).toBeVisible();

  await guest.goto(`/r/${code}`);
  await guest.getByLabel('Your nickname').fill('Beto');
  await guest.getByRole('button', { name: 'Join' }).click();
  await expect(guest.getByText('Waiting for the host to start…')).toBeVisible();
  await expect(host.locator('.seats li')).toHaveCount(2);

  await host.getByRole('button', { name: 'Start game' }).click();

  for (const page of [host, guest]) {
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Your cards')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Keep selected tickets/ }).click();
  }
  await expect(host.locator('.turn-banner')).toContainText(/turn/i);
  await expect(guest.locator('.turn-banner')).toContainText(/turn/i);
  await host.waitForTimeout(1500);
  await host.screenshot({ path: 'test-results/board-host.png' });
  await guest.screenshot({ path: 'test-results/board-guest.png' });

  expect(hostErrors).toEqual([]);
  expect(guestErrors).toEqual([]);
  await hostCtx.close();
  await guestCtx.close();
});
