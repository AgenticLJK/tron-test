export const WIDTH = 60;
export const HEIGHT = 40;

const VECTORS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

const COLORS = {
  host: { line: "#2dd4bf", glow: "rgba(45, 212, 191, 0.55)" },
  guest: { line: "#fb7185", glow: "rgba(251, 113, 133, 0.55)" },
};

export function createGame() {
  return {
    tick: 0,
    status: "waiting",
    winner: null,
    players: {
      host: { x: 10, y: 20, dir: "right", trail: [[9, 20]], alive: true },
      guest: { x: 49, y: 20, dir: "left", trail: [[50, 20]], alive: true },
    },
  };
}

function turn(player, input) {
  if (!input || !VECTORS[input] || input === OPPOSITE[player.dir]) return player.dir;
  return input;
}

function advance(player, input) {
  const dir = turn(player, input);
  const [dx, dy] = VECTORS[dir];
  return {
    x: player.x + dx,
    y: player.y + dy,
    dir,
    trail: [...player.trail, [player.x, player.y]],
    alive: true,
  };
}

function hitsWall(player) {
  return player.x < 0 || player.y < 0 || player.x >= WIDTH || player.y >= HEIGHT;
}

function hitsTrail(player, trails) {
  return trails.some((trail) => trail.some(([x, y]) => x === player.x && y === player.y));
}

export function step(state, inputs = {}) {
  if (state.status !== "running") return state;

  const host = advance(state.players.host, inputs.host);
  const guest = advance(state.players.guest, inputs.guest);
  const trails = [host.trail, guest.trail];
  const sameCell = host.x === guest.x && host.y === guest.y;

  host.alive = !(hitsWall(host) || hitsTrail(host, trails) || sameCell);
  guest.alive = !(hitsWall(guest) || hitsTrail(guest, trails) || sameCell);

  let winner = null;
  if (!host.alive && !guest.alive) winner = "draw";
  else if (!guest.alive) winner = "host";
  else if (!host.alive) winner = "guest";

  return {
    tick: state.tick + 1,
    status: winner ? "finished" : "running",
    winner,
    players: { host, guest },
  };
}

function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height };
}

function drawGrid(ctx, width, height, cell) {
  ctx.fillStyle = "#0b0f17";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(148, 163, 184, 0.13)";
  const dot = Math.max(1, cell * 0.07);
  for (let x = 5; x < WIDTH; x += 5) {
    for (let y = 5; y < HEIGHT; y += 5) {
      ctx.beginPath();
      ctx.arc(x * cell, y * cell, dot, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function headPosition(player, previous, t) {
  if (!player.alive || !previous) return [player.x, player.y];
  return [
    previous.x + (player.x - previous.x) * t,
    previous.y + (player.y - previous.y) * t,
  ];
}

function drawPlayer(ctx, player, color, cell, head) {
  const centre = ([x, y]) => [(x + 0.5) * cell, (y + 0.5) * cell];
  const points = [...player.trail, head].map(centre);

  ctx.save();
  ctx.globalAlpha = player.alive ? 1 : 0.45;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = cell * 0.5;
  ctx.strokeStyle = color.line;
  ctx.shadowColor = color.glow;
  ctx.shadowBlur = cell * 1.1;
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();

  const [x, y] = points[points.length - 1];
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, cell * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// `motion` is optional: { from: previousState, t: 0..1 } slides each head between ticks.
export function draw(state, canvas, motion = {}) {
  const ctx = canvas.getContext("2d");
  const { width, height } = fitCanvas(canvas);
  const cell = width / WIDTH;
  const t = motion.t ?? 1;

  drawGrid(ctx, width, height, cell);
  for (const name of ["host", "guest"]) {
    const player = state.players[name];
    const head = headPosition(player, motion.from?.players[name], t);
    drawPlayer(ctx, player, COLORS[name], cell, head);
  }
}
