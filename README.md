# Rails

A browser game in the style of Ticket to Ride for 2 to 7 friends. It plays on a flat, top-down 2D map of North America, with the Europe expansion rules (tunnels, ferries, stations, long tickets). Friends join a room by code. There are no accounts.

The plan behind it is in [docs/plans/2026-10-12-2348-feat-low-poly-rails-online-game-plan.md](docs/plans/2026-10-12-2348-feat-low-poly-rails-online-game-plan.md).

## Quick start

You need Node 22.12 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The server runs on port 3001, and Vite forwards the socket to it.

### Playing several players in one browser

All windows of one browser share the saved seat token, so a second window would take over the first player's seat. For local testing, add `?seat=<label>` to each window's address so each window keeps its own player:

- `http://localhost:5173/?seat=a` creates the room.
- `http://localhost:5173/r/ABCDE?seat=b` joins as a second player.
- `http://localhost:5173/r/ABCDE?seat=c` joins as a third.

Separate browsers or separate browser profiles also work.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server and client with live reload |
| `npm test` | All unit and integration tests (Vitest) |
| `npm run test:e2e` | Builds, then runs the browser smoke tests (Playwright) |
| `npm run typecheck` | TypeScript checks for every package |
| `npm run lint` | ESLint |
| `npm run build` | Production build (client to `apps/client/dist`, server to `apps/server/dist`) |
| `npm start` | Runs the production build on `PORT` (default 3001) |
| `npm run validate:maps` | Validates every `*.map.json` in `assets/maps` and prints balance stats |
| `npm run build:map` | Rebuilds the starter map from `assets/maps/sources/north-america` |
| `npm run export:schema` | Writes JSON Schemas for maps and themes to `assets/maps/` |

The first `npm run test:e2e` needs the browser: `npx playwright install chromium`.

## Project layout

```text
packages/shared   Zod schemas (map, rules, theme, protocol) and the pure rules engine
apps/server       Express + Socket.IO: rooms, lobby, authoritative game state
apps/client       React + react-three-fiber: lobby, HUD, top-down board
assets/maps/      Map files; assets/maps/sources holds the inputs for the starter map
assets/train_*    Original artwork (cards, slot images); assets/web holds the web-sized copies
tools/            Map build, validation and schema export scripts
```

The server owns the game state. After every action it sends each player a view with hidden information removed: other players' hands, the deck order, unrevealed tickets, and the random seed. Games live in memory.

## Customizing

### Maps

A map is one JSON file: cities (map-space `x`, `y`), routes (`length`, `color`, `kind`: normal, tunnel or ferry, optional `parallelGroup` for double or triple lanes, optional bend `path`), tickets (`regular` or `long`), terrain (land and lake polygons, or a background image) and optional rule overrides. [assets/maps/map.schema.json](assets/maps/map.schema.json) describes the format. Add this line to a map file to get autocomplete and checks in VS Code:

```json
"$schema": "./map.schema.json"
```

The host can upload a map file in the lobby. The server validates it and lists every problem. To check a map yourself, put it in `assets/maps` and run `npm run validate:maps`.

A map can use a picture as its ground: `terrain.image` gives its `src`, its size in map units, and a `surround` color drawn around it. `src` must be a file under `assets/maps/images` (served as `/maps/<file>`) or an inline `data:image/...` URI. Uploaded maps can only use the inline form. Without an image, the board draws generated low-poly land from `terrain.land` and `terrain.lakes`.

The starter map uses `assets/maps/images/north-america.jpg`, converted from `assets/maps/sources/Omar Mapa.png`. That picture uses a plain latitude/longitude grid, and its numbers live in the `projection` block of `assets/maps/sources/north-america/meta.json`. To swap in a different picture of the same kind:

1. Run `python tools/map-build/fit-image.py <picture.png> assets/maps/sources/north-america/land.geojson`. It needs numpy and Pillow, and prints the pixel position and scale that best match real coastlines.
2. Put those numbers and the picture size in `meta.json`.
3. Save a JPEG of the picture in `assets/maps/images`.
4. Run `npm run build:map`.

Cities outside the picture need a `nudge`. Churchill, for example, is above the top edge of the current one.

The starter map is generated from real coordinates. To change it, edit `assets/maps/sources/north-america/*.json` (cities, routes, tickets) and run `npm run build:map`:

- A route color of `"auto"` picks the least-used card color.
- A ticket's `"points": "auto"` uses the shortest path in trains.
- A city's `"nudge": [dx, dy]` moves it after projection, to give short routes room.

The build prints routes whose train slots would look cramped. The coastlines come from Natural Earth (public domain). See `tools/map-build/prepare-terrain.ts` to regenerate them.

The future map editor only needs to read and write this same file.

### Map editor (temporary)

`npm run dev` turns on a map editor for the default map at http://localhost:5173/editor. Everything in the map is editable:

- **Cities:** add (N, then click the map), rename, mark as major, move, delete. Deleting a city also removes its routes and tickets.
- **Routes:** add (L, then click two cities), add a lane beside a route (A, up to 3), delete (Del).
- **Route properties:** color, length (1 to 10 trains), kind (normal, tunnel, ferry), and the locomotives a ferry needs. Length and kind apply to every lane of a route; color is per lane.
- **Bend:** select a route and drag the circle on it sideways to curve it into an arc, or use the Bend slider. All lanes of a route bend together, and the curve shows in the game too. Bending re-flows hand-placed slots along the new curve. "Remove bend" makes it straight again.
- **Slots:** move, rotate, resize, straighten, or return them to automatic placement along the route.
- **Preview:** "Show as claimed" (T) and "Trains on every route" draw train cars on the slots. The preview is never saved.

The side panel lists every control and checks the map as you edit. Saving is only possible when the map is valid. For example, every city needs a route, and there must be enough tickets for 7 players. "Recalculate all ticket points" sets every ticket to its shortest path in trains.

**The map file is the design.** Save validates the map and writes `assets/maps/north-america.map.json`, marked `"edited": true`. New rooms use it at once; rooms already open keep their map. A route you have not placed by hand stays automatic and follows its cities.

The lat/lon files in `assets/maps/sources` only seed a map. `npm run build:map` refuses to overwrite an edited map; `npm run build:map -- --force` regenerates it from the sources and **discards editor changes**.

Lengths 9 and 10 score 27 and 32 points. These are placeholders until the rebalance.

The editor only runs when the server is started with `--editor` (as `npm run dev` does) or with `RAILS_EDITOR=1`. `npm start` and Render never enable it, because it writes files on the server.

### Artwork

Slot images live in `assets/train_placeholders` as `<color>_<def|ferry|tunnel>.png`. Pink is the game's "purple" card color.

Train cards live in `assets/train_cards` (`<Color>.png`, with `rainbow.png` as the locomotive).

After changing any artwork, run `python tools/assets/prepare-art.py` (needs Pillow). It writes small web copies to `assets/web/slots` and `assets/web/cards`, which the server serves at `/art`, and lists any image that is missing. Grey slots can be named `grey_*` or `gray_*`.

City names on the board use lettering from the Canva design "Assets Crazy Train-1". Which style a city gets (snow, earthquake, volcano, tsunami) follows the hazard list in `assets/city_labels/hazards.json`, and `assets/city_labels/pages.json` says which Canva page holds each city. To update them, export all pages of the design as PNG with a transparent background into `assets/city_labels/export`, then run `python tools/assets/prepare-city-labels.py` (needs numpy and Pillow). It writes `assets/web/cities/<city-id>.webp` and lists cities that still need a page. Cities without art keep their plain text name.

### Rules

All game numbers are in [packages/shared/src/rules/defaults.ts](packages/shared/src/rules/defaults.ts): trains, stations, deck, scoring, ticket deals, parallel lanes per player count, player limits and player colors. Values are applied in this order:

1. The defaults.
2. A map file's `rules` section (for example `"rules": { "trainsPerPlayer": 40 }`).
3. The host's lobby switches for tunnels, ferries, stations and long tickets.

Raising the player limit only needs `players.max` and enough `playerColors`.

### Themes

Themes are JSON files in [apps/client/src/theme/themes](apps/client/src/theme/themes): card colors, player colors, terrain, board, UI and lighting. To add one, copy `classic.json`, change the `id` and colors, and add it to the `THEMES` list in `apps/client/src/theme/themes.ts`. A broken theme falls back to the default. Players pick a theme from the menu, and the choice is saved in their browser.

## Seasons mode

Pick **Seasons** in the lobby (Classic stays available) and a game length of 1 to 5 years. Each round is one
month. Each month a disaster may strike a city that is prone to it; the map stores each city's risk
(`hazards`, editable in the editor's city panel), and real seasons apply (hurricanes June to November,
tornados March to June, snow in winter). Damaged routes stop connecting until their owner repairs them,
which takes a turn. Unrepaired routes are lost after a year (points come off, trains go back). Some
ground needs **excavator** cards, a few of which are in the deck. All the numbers live in `rules.seasons`
(`packages/shared/src/rules/defaults.ts`), and a map can override them.

To try it, open the editor's **Player view**, which starts in Seasons mode and has a **Strike** button to
make any disaster hit any city right away. The announcement animations come from `assets/animations`;
run `python tools/assets/prepare-art.py` after changing them.

## Animations

`npm run dev`, then open http://localhost:5173/animations (hidden, only there while the editor is on).
Pick a hurricane, snow storm, tsunami, earthquake or volcano, drag the sliders and colors with a live
preview, and **Save GIF** writes `assets/animations/<name>.gif` plus `<name>.json` with its settings.
The Saved buttons load those settings back, and a new file name keeps several versions of one animation.

Each animation is one file in `apps/client/src/animations/`, drawn entirely in code. Every setting is one
line in its `params` list, and the page builds the control from that line. Anything counted "per loop"
must stay a whole number, which is what makes the GIF loop without a jump. To add an animation, copy a
file and add it to `index.ts`.

## House rules worth knowing

- **Stations:** you choose the borrowed route when you build the station. It must touch the station's city and must not be your own. At the end it counts for your tickets only if another player owns it.
- **Parallel lanes:** lanes are drawn side by side like on the physical board. With 2 to 3 players only one lane of each group can be claimed. With 4 or more, all can. One player never takes two lanes of the same group.
- **Market:** when 3 locomotives show, the face-up cards are replaced, at most 3 times in a row.
- **Passing:** you can pass only when no other action is possible. If every player passes in a row, the game ends.
- **Host:** if the host drops for 30 seconds, the host role moves to the next connected player. The host can skip a disconnected player's turn.

## Deploying to Render

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint**, pick the repository, and apply. `render.yaml` sets the build (`npm ci --include=dev && npm run build`), the start command (`npm start`), the health check (`/healthz`) and Node 22.
3. Open the service URL, create a room and share the link.

Free-tier caveats:

- A free instance sleeps after about 15 minutes without traffic. The first visit after that takes up to a minute. Open the URL a few minutes before game night.
- Before relying on it, check that an idle-but-connected game is not put to sleep: keep a game open for 20+ minutes. If the instance sleeps anyway, use a paid instance (about $7/month), which never sleeps.
- A deploy or restart ends every game in progress, because games live in memory. Automatic deploys are off in `render.yaml`. Deploy by hand, never during a game.
