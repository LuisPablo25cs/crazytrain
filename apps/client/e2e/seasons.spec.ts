import { expect, test, type Page } from '@playwright/test';

interface RailsHook {
  store: { getState(): { game: { view: { currentPlayer: number; me: { index: number } | null; turn: { kind: string }; month: number } } | null } };
}

async function state(page: Page) {
  return page.evaluate(() => (window as unknown as { __rails: RailsHook }).__rails.store.getState().game!.view);
}

test('a Seasons game shows the calendar and moves to the next month after a round', async ({ browser }) => {
  test.setTimeout(120_000);
  const pages: Page[] = [];
  for (let i = 0; i < 2; i++) pages.push(await (await browser.newContext()).newPage());
  const [host, guest] = pages as [Page, Page];
  const errors: string[] = [];
  for (const p of pages) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  }

  await host.goto('/?e2e');
  await host.getByLabel('Your nickname').fill('Ana');
  await host.getByRole('button', { name: 'Create a room' }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{5}/);
  const code = new URL(host.url()).pathname.split('/').pop()!;
  await host.getByText('Seasons', { exact: true }).click();
  await host.getByRole('combobox').filter({ hasText: 'year' }).selectOption('2');

  await guest.goto(`/r/${code}?e2e`);
  await guest.getByLabel('Your nickname').fill('Beto');
  await guest.getByRole('button', { name: 'Join' }).click();
  // The guest sees the host's choice.
  await expect(guest.locator('.mode-option.chosen')).toContainText('Seasons');
  await expect(host.locator('.seats li')).toHaveCount(2);
  await host.getByRole('button', { name: 'Start game' }).click();
  for (const p of pages) await p.getByRole('button', { name: /Keep selected tickets/ }).click();

  for (const p of pages) {
    await expect(p.locator('.season-clock')).toContainText('January, year 1');
    await expect(p.locator('.season-clock')).toContainText('24 months left');
  }

  // Each player draws two cards: one round, one month.
  for (let turn = 0; turn < 2; turn++) {
    const active = (await state(host)).currentPlayer === (await state(host)).me!.index ? host : guest;
    await active.getByRole('button', { name: /Draw pile/ }).click();
    await expect.poll(async () => (await state(active)).turn.kind).toBe('secondDraw');
    await active.getByRole('button', { name: /Draw pile/ }).click();
    await expect.poll(async () => (await state(active)).currentPlayer).not.toBe((await state(active)).me!.index);
  }
  for (const p of pages) await expect(p.locator('.season-clock')).toContainText('February, year 1');
  await host.screenshot({ path: 'test-results/seasons-board.png' });
  expect(errors).toEqual([]);
});
