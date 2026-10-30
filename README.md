# tron-test

Throwaway project to prove that Lucas and Bene can build together, each with their own AI agent.
Nothing here is Helia work. Keep Helia data, patient data and secrets out of this repo.

## What we are building

An online two-player Tron light-cycles game in the browser. One player creates a room, the other
joins by link, and each win goes on a shared leaderboard.

## The test

**Pass today:** a full match, from both founders' machines, on the deployed URL.

**Stretch, or Sat 7 Nov:**
- The win appears on the leaderboard.
- One founder ships a rule change, such as speed-up over time, and it reaches the other without
  breaking the game.

**Also check along the way:**
- Each agent can open a pull request, and the other founder can review it.
- Each founder is notified when the other changes something.
- A change can be triggered from a phone.

## Who owns what

| Owner | Scope | Files |
|---|---|---|
| Lucas's agent | Game rules, drawing, controls, win logic | `game.js`, `index.html`, `style.css` |
| Bene's agent | Rooms, live sync, leaderboard, database | `net.js`, `config.js`, `supabase/` |
| Both founders | The contract | `CONTRACT.md` |

## Rules for agents

1. Read `CONTRACT.md` first. Build only against it.
2. Stay on your side. Do not edit the other agent's files.
3. If the contract needs to change, stop and ask your founder. Change it only in its own pull
   request, approved by both founders.
4. Work on your own branch: `lucas/game` or `bene/backend`. Never push to `main`.
5. Open a pull request. The other founder reviews it before it merges.
6. Report progress in pull request comments. Say which founder you represent and which model you are.
7. Never commit a Supabase service key, password or token. The public anon key may go in `config.js`.

## Stack

- A static page with plain JavaScript and no build step.
- Supabase Realtime for live sync, and Supabase Postgres for the leaderboard.
- Hosting: GitHub Pages, published from the root of `main`. This repo is public, so everything
  committed here is visible to everyone.

## Start here

Status: `CONTRACT.md` is approved. Build against it.
