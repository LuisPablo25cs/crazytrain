import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Three browsers play a whole game through the UI with every expansion rule on.
// A short-train copy of the starter map (uploaded in the lobby) keeps the game quick.

type Card = string;
interface Route {
  id: string;
  from: string;
  to: string;
  length: number;
  color: string;
  kind: string;
  ferryLocomotives: number;
}
interface View {
  version: number;
  phase: string;
  currentPlayer: number;
  turnNumber: number;
  me: { index: number; hand: Record<Card, number> } | null;
  routeOwners: Record<string, number>;
  turn: { kind: string };
  drawPileCount: number;
  discardCount: number;
  market: (Card | null)[];
}
type W = { __rails: { store: { getState(): { game: { version: number; view: View } | null; map: { doc: { routes: Route[] } } | null } }; setUi(p: Record<string, unknown>): void } };

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as W).__rails.store.getState();
    return s.game ? { ...s.game.view, version: s.game.version } : null;
  });

async function waitForVersionAbove(page: Page, version: number) {
  await expect.poll(async () => (await state(page))?.version ?? 0, { timeout: 10_000 }).toBeGreaterThan(version);
}

/** Routes the hand can plausibly pay for, tunnels first so the tunnel prompt gets exercised. */
async function candidates(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const s = (window as unknown as W).__rails.store.getState();
    const v = s.game!.view;
    const hand = v.me!.hand;
    const loco = hand.locomotive ?? 0;
    const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'white'];
    return s.map!.doc.routes
      .filter((r) => v.routeOwners[r.id] === undefined)
      .filter((r) => {
        if (r.kind === 'ferry' && loco < r.ferryLocomotives) return false;
        const best = r.color === 'gray' ? Math.max(...colors.map((c) => hand[c] ?? 0)) : (hand[r.color] ?? 0);
        return best + loco >= r.length;
      })
      .sort((a, b) => (a.kind === 'tunnel' ? -1 : 0) - (b.kind === 'tunnel' ? -1 : 0) || b.length - a.length)
      .map((r) => r.id);
  });
}

test('three players finish a full game through the UI with all expansion rules on', async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync('test-results', { recursive: true });
  const starter = JSON.parse(readFileSync('assets/maps/north-america.map.json', 'utf8'));
  const quick = { ...starter, id: 'quick-game', name: 'Quick game', rules: { trainsPerPlayer: 9 } };
  writeFileSync('test-results/quick.map.json', JSON.stringify(quick));

  const pages: Page[] = [];
  const errors: string[] = [];
  for (let i = 0; i < 3; i++) {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    pages.push(page);
  }
  const [host] = pages as [Page];
  await host.goto('/?e2e');
  await host.getByLabel('Your nickname').fill('Ana');
  await host.getByRole('button', { name: 'Create a room' }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{5}/);
  const code = new URL(host.url()).pathname.split('/').pop()!;
  for (const [i, name] of ['Beto', 'Caro'].entries()) {
    const p = pages[i + 1]!;
    await p.goto(`/r/${code}?e2e`);
    await p.getByLabel('Your nickname').fill(name);
    await p.getByRole('button', { name: 'Join' }).click();
  }
  await expect(host.locator('.seats li')).toHaveCount(3);
  for (const label of ['Tunnels', 'Ferries', 'Stations', 'Long tickets']) {
    await expect(host.getByRole('checkbox', { name: new RegExp(label) })).toBeChecked();
  }
  await host.locator('input[type=file]').setInputFiles('test-results/quick.map.json');
  for (const p of pages) await expect(p.getByText('Quick game')).toBeVisible();
  await host.getByRole('button', { name: 'Start game' }).click();
  for (const p of pages) await p.getByRole('button', { name: /Keep selected tickets/ }).click();

  const seen = new Set<string>();
  for (let step = 0; step < 400; step++) {
    const views = await Promise.all(pages.map(state));
    if (views.every((v) => v?.phase === 'finished')) break;
    const v0 = views[0]!;
    if (v0.phase !== 'playing') {
      await host.waitForTimeout(100);
      continue;
    }
    const page = pages[v0.currentPlayer]!;
    const v = (await state(page))!;
    const before = v.version;

    if (v.turn.kind === 'tunnel') {
      seen.add('tunnel prompt');
      const pay = page.locator('.modal .payment').first();
      if (await pay.isVisible()) await pay.click();
      else await page.getByRole('button', { name: 'Withdraw' }).click();
    } else if (v.turn.kind === 'choosingTickets') {
      await page.getByRole('button', { name: /Keep selected tickets/ }).click();
    } else if (v.turn.kind === 'secondDraw') {
      await page.getByRole('button', { name: /Draw pile/ }).click();
    } else {
      let acted = false;
      // Build one station per player early on.
      if (v.turnNumber > 3 && v.turnNumber < 9) {
        const station = page.getByRole('button', { name: /Build station/ });
        if (await station.isEnabled()) {
          await station.click();
          const city = await page.evaluate(() => {
            const s = (window as unknown as W).__rails.store.getState() as unknown as {
              game: { view: View & { stations: { cityId: string }[] } };
              map: { doc: { routes: Route[] } };
            };
            const taken = new Set(s.game.view.stations.map((st) => st.cityId));
            const me = s.game.view.me!.index;
            return s.map.doc.routes.find((r) => !taken.has(r.from) && s.game.view.routeOwners[r.id] !== me)!.from;
          });
          await page.evaluate((c) => (window as unknown as W).__rails.setUi({ selectedCity: c }), city);
          const pay = page.locator('.modal .payment').first();
          if (await pay.isVisible()) {
            await pay.click();
            seen.add('station');
            acted = true;
          } else {
            await page.getByRole('button', { name: 'Cancel' }).first().click();
          }
        }
      }
      if (!acted) {
        for (const id of (await candidates(page)).slice(0, 12)) {
          await page.evaluate((routeId) => (window as unknown as W).__rails.setUi({ selectedRoute: routeId }), id);
          const pay = page.locator('.claim-dialog .payment').first();
          if (await pay.isVisible({ timeout: 300 }).catch(() => false)) {
            await pay.click();
            seen.add('claim');
            acted = true;
            break;
          }
        }
        if (!acted) await page.evaluate(() => (window as unknown as W).__rails.setUi({ selectedRoute: null }));
      }
      if (!acted) {
        if (v.drawPileCount + v.discardCount > 0) await page.getByRole('button', { name: /Draw pile/ }).click();
        else if (await page.getByRole('button', { name: 'Pass' }).isVisible()) await page.getByRole('button', { name: 'Pass' }).click();
        else await page.locator('.market-cards button.card:not([disabled])').first().click();
      }
    }
    await waitForVersionAbove(page, before);
  }

  for (const p of pages) {
    await expect(p.getByRole('dialog', { name: 'Game over' })).toBeVisible();
    await expect(p.locator('.winner')).toContainText('Winner');
    await expect(p.locator('.end-screen tbody tr')).toHaveCount(3);
  }
  await host.screenshot({ path: 'test-results/end-screen.png' });
  expect(seen.has('claim')).toBe(true);
  expect(seen.has('station')).toBe(true);
  console.log(`UI paths exercised: ${[...seen].join(', ')}`);

  await host.getByRole('button', { name: 'Back to lobby' }).click();
  for (const p of pages) await expect(p.getByRole('heading', { name: /Lobby/ })).toBeVisible();
  expect(errors).toEqual([]);
});
