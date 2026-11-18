# UX Audit: Crazy Train Classic HUD, first playtest

**Perspective**: UX Engineer
**Date**: 2026-11-17
**Plan**: Playtest findings A–F against the Classic HUD (`apps/client/src/ui/hud/classic/`)

## Plan Summary
A real game with friends worked end to end, but players could not follow each other's turns, could not
control zoom, could not see the map while choosing tickets, had no rules to consult, and were surprised
that double routes only accept one player in a three-player game.

## User Journey Map
| Step | What the player does | Status | Why |
|---|---|---|---|
| 1. Join a room | Lobby, pick expansions | WARN | Rules are one-line hints; the double-route rule is not mentioned anywhere |
| 2. Choose starting tickets | Dialog over the board | FAIL | 78% scrim plus a 920px dialog hides the cities the tickets name (C) |
| 3. Wait for my turn | Watch others | FAIL | The only record is a small text log in the right column; nothing happens on the board or the plaques (A) |
| 4. Read the board | Scroll wheel, drag | WARN | Zoom works by wheel only; no visible control, no keyboard, hard on trackpads (B) |
| 5. Claim a route | Click route, popover | OK | Popover explains cost and shortfalls |
| 5b. Read who owns what | Look at the board | FAIL | Placed trains are flat bars in the player colour on top of same-shaped coloured slots; a red train on a red or orange route reads as an empty route (F) |
| 6. Claim the second lane of a double route | Click the free lane | FAIL | Lane is only dimmed; the reason appears after clicking and reads like an error (E) |
| 7. Draw tickets mid-game | Same dialog | FAIL | Same as step 2, and now the player's own network is hidden too (C) |
| 8. Unsure about a rule | Look for help | FAIL | No rules anywhere in the game (D) |

## Verdict: APPROVE WITH CHANGES
The core loop is sound. All six findings are feedback and discoverability gaps, not broken logic.

## Critical Issues (Must Fix)
| # | Issue | Step | Impact on user | Fix |
|---|---|---|---|---|
| A | Other players' turns are invisible | 3 | Players miss claims that block their tickets, and waiting feels dead | **Activity feed on the board.** (1) A toast under the header for every rival action, with the card art: "Bruno took [blue card]", "Carmen claimed Denver – Omaha +7". Stays 3 s, queue of 2. (2) The acting player's plaque pulses and shows a small icon of the action (card, route, ticket). (3) Rival claims use the same roll-in train, and the camera does NOT move; instead a brass ring pings the route, and an arrow on the screen edge points to it when it is off screen. (4) Market cards taken by a rival fly to that player's plaque. (5) Keep the log, collapsed by default, as history. |
| C | Ticket choice hides the map | 2, 7 | Players choose tickets blind; this is the most important decision in the game | **Dock the dialog instead of covering the board.** Turn the centered modal into a bottom sheet (tickets in one row, about 240px tall) with no scrim, so the board stays visible and pannable. Hovering or focusing a ticket highlights its cities and draws a dashed line between them; kept tickets stay highlighted in brass, returning ones are not shown. Add a "Hide · see map" button (key: M or hold Space) that collapses the sheet to a tab reading "Choosing tickets · 3 kept". On first open the camera fits all offered cities. |
| E | Double routes look broken with 2–3 players | 6 | Players think the game has a bug and lose trust | This is the rule working (`parallelLanes`: both lanes open only at 4+ players, as in the board game), but nothing says so. (1) When one lane is claimed and the other closes, draw the closed lane hatched with a small lock, not just dimmed. (2) Hover tooltip: "Closed: with 2–3 players only one lane of a double route can be used." (3) In the popover show it as a quiet note (parchment), not a red error, with a "Why?" link to the rules page. (4) Show the rule in the lobby as a line under the player count ("Double routes: one lane, 4+ players: both") and let the host change it, since your group may prefer both lanes open at 3. |
| F | Placed trains do not look different enough from an empty route | 5b | Players misread ownership, try to claim taken routes and miscount rivals' networks | **Make "claimed" a different shape, not just a different colour.** (1) When a route is claimed, its slots lose their route colour and become a neutral dark rail bed, so the only colour left is the owner's. (2) Train cars get a real car silhouette: rounded ends, dark ink outline, a lighter roof stripe and couplers between cars, slightly raised with a soft shadow, so a train reads as an object sitting on the track. (3) Each player also gets a mark on the roof (dot, bar, chevron, diamond...) so ownership never depends on colour alone; the same mark appears on their plaque. (4) Hovering a plaque lights that player's whole network and dims the rest. (5) Player colours that sit close to a route colour (red, yellow, green, blue all collide today) are shifted a step darker or lighter than the route palette. |

## Recommendations
| # | Issue | Impact | Fix |
|---|---|---|---|
| B | Zoom is wheel-only and undiscoverable | Trackpad and touch users cannot zoom precisely; nobody knows the limits | Add a vertical control on the right edge of the board, above the actions: **+**, **−**, **fit map** (replaces "Reset view" in the tools row), 44px targets. Keys: + / − / 0. Double-click zooms in on the point. Pinch on trackpads. A small zoom readout is not needed; disable + or − at the limits. City search already recenters, keep it. |
| D | No rules for new players | First-timers ask the table instead of the game | **"?" button in the header plaque** opening a rules sheet (side panel, not a modal, so the board stays visible). Three tabs: *Your turn* (the three actions with pictures of the real cards and tickets), *Scoring* (route points table, tickets, longest trail), *Special routes* (tunnel, ferry, station, double routes; only the ones enabled in this room). Plus **first-game hints**: the first time a player meets a tunnel, a ferry, a closed lane or the last round, a one-line coach mark explains it once. Reuse the lobby `ruleHelp` strings so there is one source. |
| 6 | Status line is the only turn cue | Players miss that it is their turn | On "your turn": plaque pulse, header line turns brass for 2 s, optional sound. |
| 7 | Rival hands are not shown | Hard to judge who is close to claiming | Plaque shows card and ticket counts (already in the tooltip; make them visible in the full-size plaque). |

## Nice-to-Haves
| # | Suggestion | Rationale |
|---|---|---|
| 1 | "Replay last round" button in the log | Catches up a player who looked away |
| 2 | Ticket hover in the fan draws the same dashed line as in the choice sheet | One pattern for "show me this ticket" |
| 3 | Colour-blind marks on route slots too | F adds marks to trains; empty slots still rely on colour |

## Interaction Consistency Check
- Hover-to-highlight cities already exists in the ticket fan and the choice dialog; C extends it, it does not add a new pattern.
- The roll-in train and score pop already exist for my own claims; A reuses them for rivals.
- The claim popover already uses a red note for "cannot pay"; E must NOT reuse red for a rule that is nobody's mistake.
- "Reset view" moves from the tools row into the zoom control (B); remove the old button so there is one place.

## Verdict Details
- Discoverability: CONCERNS (zoom, rules, double-route rule)
- Flow Completeness: PASS
- Error Recovery: PASS
- Feedback & Status: CONCERNS (rival turns, closed lanes, route ownership)
- Consistency: PASS
