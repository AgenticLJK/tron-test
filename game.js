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
  host: { line: "#2dd4bf", glow: "rgba(45, 212, 191, 0.28)" },
  guest: { line: "#fb7185", glow: "rgba(251, 113, 133, 0.28)" },
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

function drawBoard(ctx, width, height, cell) {
  const glow = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, width * 0.62,
  );
  glow.addColorStop(0, "#111a28");
  glow.addColorStop(1, "#080b12");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.055)";
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.beginPath();
  for (let x = 5; x < WIDTH; x += 5) {
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, height);
  }
  for (let y = 5; y < HEIGHT; y += 5) {
    ctx.moveTo(0, y * cell);
    ctx.lineTo(width, y * cell);
  }
  ctx.stroke();
}

function headPosition(player, previous, t) {
  if (!player.alive) {
    return [
      Math.min(Math.max(player.x, 0), WIDTH - 1),
      Math.min(Math.max(player.y, 0), HEIGHT - 1),
    ];
  }
  if (!previous) return [player.x, player.y];
  return [
    previous.x + (player.x - previous.x) * t,
    previous.y + (player.y - previous.y) * t,
  ];
}

function tracePath(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

function drawHead(ctx, x, y, color, cell) {
  const halo = ctx.createRadialGradient(x, y, 0, x, y, cell * 2.6);
  halo.addColorStop(0, color.glow);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, cell * 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, cell * 0.44, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(ctx, player, color, cell, head) {
  const centre = ([x, y]) => [(x + 0.5) * cell, (y + 0.5) * cell];
  const points = [...player.trail, head].map(centre);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = player.alive ? 1 : 0.4;

  tracePath(ctx, points);
  ctx.strokeStyle = color.glow;
  ctx.lineWidth = cell * 1.05;
  ctx.shadowColor = color.line;
  ctx.shadowBlur = cell * 1.6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = color.line;
  ctx.lineWidth = cell * 0.42;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = cell * 0.1;
  ctx.stroke();

  const [x, y] = points[points.length - 1];
  if (player.alive) drawHead(ctx, x, y, color, cell);
  ctx.restore();
}

function drawCrash(ctx, head, color, cell, t) {
  const x = (head[0] + 0.5) * cell;
  const y = (head[1] + 0.5) * cell;
  const fade = 1 - t;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = cell * 0.22 * fade;
  ctx.beginPath();
  ctx.arc(x, y, cell * (0.5 + t * 6), 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = color.line;
  for (let spark = 0; spark < 16; spark += 1) {
    const angle = (spark / 16) * Math.PI * 2 + spark;
    const reach = cell * (1 + t * (5 + (spark % 4) * 1.6));
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, cell * 0.2 * fade, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// `motion` is optional. { from: previousState, t: 0..1 } slides heads between ticks.
// { crash: 0..1 } plays the crash burst for players who are out.
export function draw(state, canvas, motion = {}) {
  const ctx = canvas.getContext("2d");
  const { width, height } = fitCanvas(canvas);
  const cell = width / WIDTH;
  const t = motion.t ?? 1;

  drawBoard(ctx, width, height, cell);
  for (const name of ["host", "guest"]) {
    const player = state.players[name];
    const head = headPosition(player, motion.from?.players[name], t);
    drawPlayer(ctx, player, COLORS[name], cell, head);
    if (!player.alive && motion.crash < 1) drawCrash(ctx, head, COLORS[name], cell, motion.crash);
  }
}
