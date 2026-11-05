import { expect, test, type Page } from '@playwright/test';

interface RailsHook {
  store: { getState(): { game: { view: GameViewLite } | null; map: { doc: { routes: { id: string }[]; cities: { id: string }[] } } | null } };
  setUi(patch: Record<string, unknown>): void;
}
interface GameViewLite {
  currentPlayer: number;
  me: { index: number } | null;
  routeOwners: Record<string, number>;
  stations: { cityId: string }[];
  turn: { kind: string };
}

async function view(page: Page): Promise<GameViewLite> {
  return page.evaluate(() => (window as unknown as { __rails: RailsHook }).__rails.store.getState().game!.view);
}

async function isMyTurn(page: Page): Promise<boolean> {
  const v = await view(page);
  return v.me !== null && v.currentPlayer === v.me.index && v.turn.kind === 'await';
}

/** Select each free route in turn until the claim dialog offers a payment; returns whether it claimed. */
async function tryClaim(page: Page): Promise<boolean> {
  const ids = await page.evaluate(() => {
    const s = (window as unknown as { __rails: RailsHook }).__rails.store.getState();
    return s.map!.doc.routes.map((r) => r.id).filter((id) => s.game!.view.routeOwners[id] === undefined);
  });
  for (const id of ids) {
    await page.evaluate((routeId) => (window as unknown as { __rails: RailsHook }).__rails.setUi({ selectedRoute: routeId }), id);
    const pay = page.locator('.claim-dialog .payment').first();
    if (await pay.isVisible()) {
      await pay.click();
      await expect(page.locator('.event-log')).toContainText('claimed', { timeout: 5000 });
      return true;
    }
  }
  await page.evaluate(() => (window as unknown as { __rails: RailsHook }).__rails.setUi({ selectedRoute: null }));
  return false;
}

test('players draw, claim a route and build a station through the UI', async ({ browser }) => {
  // Software WebGL in headless browsers draws the board image slowly.
  test.setTimeout(150_000);
  const pages: Page[] = [];
  for (let i = 0; i < 2; i++) pages.push(await (await browser.newContext()).newPage());
  const [host, guest] = pages as [Page, Page];
  const errors: string[] = [];
  for (const p of pages) p.on('pageerror', (e) => errors.push(e.message));

  await host.goto('/?e2e');
  await host.getByLabel('Your nickname').fill('Ana');
  await host.getByRole('button', { name: 'Create a room' }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{5}/);
  const code = new URL(host.url()).pathname.split('/').pop()!;
  await guest.goto(`/r/${code}?e2e`);
  await guest.getByLabel('Your nickname').fill('Beto');
  await guest.getByRole('button', { name: 'Join' }).click();
  await expect(host.locator('.seats li')).toHaveCount(2);
  await host.getByRole('button', { name: 'Start game' }).click();
  for (const p of pages) {
    await p.getByRole('button', { name: /Keep selected tickets/ }).click();
  }
  await expect(host.locator('.turn-banner')).toContainText(/turn/i);

  let claimed = false;
  let built = false;
  for (let turn = 0; turn < 30 && !(claimed && built); turn++) {
    const active = (await isMyTurn(host)) ? host : guest;
    await expect.poll(() => isMyTurn(active)).toBe(true);
    if (!claimed && (await tryClaim(active))) {
      claimed = true;
    } else if (claimed && !built) {
      // Station: pick the first highlighted candidate city through the store, then pay.
      await active.getByRole('button', { name: /Build station/ }).click();
      const city = await active.evaluate(() => {
        const s = (window as unknown as { __rails: RailsHook }).__rails.store.getState();
        const taken = new Set(s.game!.view.stations.map((st) => st.cityId));
        return s.map!.doc.cities.find((c) => !taken.has(c.id))!.id;
      });
      await active.evaluate((cityId) => (window as unknown as { __rails: RailsHook }).__rails.setUi({ selectedCity: cityId }), city);
      const pay = active.locator('.modal .payment').first();
      if (await pay.isVisible()) {
        await pay.click();
        await expect(active.locator('.event-log')).toContainText('built a station');
        built = true;
      } else {
        await active.getByRole('button', { name: 'Cancel' }).first().click();
        await active.getByRole('button', { name: /Draw pile/ }).click();
        await active.getByRole('button', { name: /Draw pile/ }).click();
      }
    } else {
      await active.getByRole('button', { name: /Draw pile/ }).click();
      await expect.poll(async () => (await view(active)).turn.kind).toBe('secondDraw');
      await active.getByRole('button', { name: /Draw pile/ }).click();
    }
    await expect.poll(async () => (await view(active)).currentPlayer).not.toBe((await view(active)).me!.index);
  }
  expect(claimed).toBe(true);
  expect(built).toBe(true);
  await host.waitForTimeout(800);
  await host.screenshot({ path: 'test-results/board-after-play.png' });
  // Zoom to the claimed route to check train cars and the station model.
  await host.evaluate(() => {
    const r = (window as unknown as { __rails: RailsHook & { store: { getState(): { map: { index: { cities: Map<string, { x: number; y: number }>; routes: Map<string, { from: string }> } } } } } }).__rails;
    const s = r.store.getState() as unknown as { game: { view: GameViewLite }; map: { index: { cities: Map<string, { x: number; y: number }>; routes: Map<string, { from: string }> } } };
    const routeId = Object.keys(s.game.view.routeOwners)[0]!;
    const city = s.map.index.cities.get(s.map.index.routes.get(routeId)!.from)!;
    r.setUi({ focus: { x: city.x, y: city.y, zoom: 120, nonce: 99 } });
  });
  await host.waitForTimeout(1500);
  await host.screenshot({ path: 'test-results/board-zoom.png' });
  expect(errors).toEqual([]);
});
