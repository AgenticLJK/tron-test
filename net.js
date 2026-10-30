import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.100.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CONNECT_TIMEOUT_MS = 10000;
const HOST_WAIT_MS = 4000;
const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const callbacks = {
  input: () => {},
  state: () => {},
  playerJoined: () => {},
  playerLeft: () => {},
};

let channel = null;
let role = null;
let guestKey = null;

function makeRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => CODE_LETTERS[byte % CODE_LETTERS.length]).join("");
}

function withTimeout(promise, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), CONNECT_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function leaveChannel() {
  const old = channel;
  channel = null;
  role = null;
  guestKey = null;
  if (old) await supabase.removeChannel(old);
}

function handleJoin({ key, newPresences }) {
  const [joined] = newPresences;
  if (role !== "host" || joined?.role !== "guest" || guestKey) return;
  guestKey = key;
  callbacks.playerJoined(joined.name);
}

function handleLeave({ key, leftPresences }) {
  const [left] = leftPresences;
  if (role === "host" && key === guestKey) {
    guestKey = null;
    callbacks.playerLeft();
  } else if (role === "guest" && left?.role === "host") {
    callbacks.playerLeft();
  }
}

function openChannel(roomCode, newRole) {
  const key = `${newRole}-${crypto.randomUUID()}`;
  const next = supabase.channel(`room:${roomCode}`, {
    config: { broadcast: { self: false }, presence: { key } },
  });

  next.on("broadcast", { event: "input" }, ({ payload }) => {
    if (role === "host") callbacks.input(payload.dir);
  });
  next.on("broadcast", { event: "state" }, ({ payload }) => {
    if (role === "guest") callbacks.state(payload);
  });
  next.on("presence", { event: "join" }, handleJoin);
  next.on("presence", { event: "leave" }, handleLeave);

  const subscribed = new Promise((resolve, reject) => {
    next.subscribe((status, error) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status !== "CLOSED") reject(error ?? new Error(`Realtime status: ${status}`));
    });
  });

  channel = next;
  role = newRole;
  return withTimeout(subscribed, "Timed out joining the room");
}

function occupants() {
  return Object.values(channel.presenceState()).flat();
}

// Presence arrives a moment after subscribing, so an empty room is only empty after a wait.
async function waitForHost() {
  const deadline = Date.now() + HOST_WAIT_MS;
  while (Date.now() < deadline) {
    if (occupants().some((player) => player.role === "host")) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export async function createRoom(playerName) {
  await leaveChannel();
  const roomCode = makeRoomCode();
  try {
    await openChannel(roomCode, "host");
    await channel.track({ role: "host", name: playerName });
  } catch (error) {
    await leaveChannel();
    throw error;
  }
  const joinUrl = `${location.origin}${location.pathname}?room=${roomCode}`;
  return { roomCode, joinUrl };
}

export async function joinRoom(roomCode, playerName) {
  await leaveChannel();
  try {
    await openChannel(roomCode, "guest");
    if (!(await waitForHost())) throw new Error("Room not found");
    if (occupants().some((player) => player.role === "guest")) throw new Error("Room is full");
    await channel.track({ role: "guest", name: playerName });
  } catch (error) {
    await leaveChannel();
    throw error;
  }
}

export function sendInput(dir) {
  if (role !== "guest") return;
  channel.send({ type: "broadcast", event: "input", payload: { dir } });
}

export function sendState(state) {
  if (role !== "host") return;
  channel.send({ type: "broadcast", event: "state", payload: state });
}

export function onInput(callback) {
  callbacks.input = callback;
}

export function onState(callback) {
  callbacks.state = callback;
}

export function onPlayerJoined(callback) {
  callbacks.playerJoined = callback;
}

export function onPlayerLeft(callback) {
  callbacks.playerLeft = callback;
}

export async function recordMatch({ roomCode, winnerName, loserName, ticks }) {
  const { error } = await supabase.from("matches").insert({
    room_code: roomCode,
    winner_name: winnerName,
    loser_name: loserName,
    ticks,
  });
  if (error) throw error;
}

export async function getLeaderboard() {
  const { data, error } = await supabase.from("matches").select("winner_name");
  if (error) throw error;
  const wins = new Map();
  for (const { winner_name } of data) wins.set(winner_name, (wins.get(winner_name) ?? 0) + 1);
  return [...wins]
    .map(([player_name, count]) => ({ player_name, wins: count }))
    .sort((a, b) => b.wins - a.wins);
}
