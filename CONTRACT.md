# Contract

**Status:** Approved by Lucas and Bene on 2026-10-30. Changes need a pull request approved by both.

This file is the only interface between `game.js` (Lucas's agent) and `net.js` (Bene's agent).
Do not depend on anything that is not written here.

## How a match works

- The player who creates the room is the **host**. The player who joins is the **guest**.
- The host's browser runs the game and is the single source of truth.
- The guest sends only key presses, and draws the state the host sends.
- The host runs 10 ticks per second and sends the state after every tick.

## Game state

The board is 60 by 40 cells. `x` runs from 0 to 59 and `y` from 0 to 39. The origin is top left.

```js
{
  tick: 0,                      // increases by 1 each tick
  status: "waiting",            // "waiting" | "running" | "finished"
  winner: null,                 // null | "host" | "guest" | "draw"
  players: {
    host:  { x: 10, y: 20, dir: "right", trail: [[9, 20]], alive: true },
    guest: { x: 49, y: 20, dir: "left",  trail: [[50, 20]], alive: true }
  }
}
```

`dir` is one of `"up"`, `"down"`, `"left"`, `"right"`.

## `game.js` exports (Lucas's agent)

```js
createGame()                          // returns the starting state
step(state, inputs)                   // returns the next state; inputs = { host: dir|null, guest: dir|null }
draw(state, canvas)                   // draws a state; used by both host and guest
```

`step` must be pure: same input, same output, with no network calls and no randomness.

## `net.js` exports (Bene's agent)

```js
createRoom(playerName)                // returns Promise<{ roomCode, joinUrl }>
joinRoom(roomCode, playerName)        // returns Promise<void>
sendInput(dir)                        // guest to host
sendState(state)                      // host to guest
onInput(callback)                     // host: callback(dir)
onState(callback)                     // guest: callback(state)
onPlayerJoined(callback)              // host: callback(playerName)
onPlayerLeft(callback)                // both: callback()
recordMatch(result)                   // host only; returns Promise<void>
getLeaderboard()                      // returns Promise<[{ player_name, wins }]>
```

`recordMatch` takes `{ roomCode, winnerName, loserName, ticks }`. For a draw, do not call it.

## Room and channel

- A room code is 6 uppercase letters.
- The join link is `<site URL>?room=<roomCode>`.
- Each room uses one Supabase Realtime broadcast channel named `room:<roomCode>`.
- Events on the channel: `input` with `{ dir }`, `state` with the game state, and `presence` for
  joins and leaves.

## Database

```sql
create table matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  winner_name text not null,
  loser_name text not null,
  ticks integer not null,
  played_at timestamptz not null default now()
);
```

The leaderboard counts rows per `winner_name`, highest first.

Row-level security stays on. The public anon key may read and insert rows, and nothing else.
That means a player could fake a score. This is acceptable for a throwaway test.

## Decisions

- The host's browser runs the game; the guest sends only key presses.
- 10 ticks per second on a 60 by 40 board.
- Bene created the Supabase project.
- Hosting is GitHub Pages, with this repo public.
