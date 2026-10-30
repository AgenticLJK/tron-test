import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { WIDTH, HEIGHT } from "./game.js";

const MAX_SEGMENTS = WIDTH * HEIGHT + 1;
const WALL_HEIGHT = 1.9;
const WALL_THICKNESS = 0.24;
const SPARKS = 36;
const HEADINGS = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };
const COLORS = { host: 0x2dd4bf, guest: 0xfb7185 };
const SLOW_FRAME_MS = 34;

function buildFloor(scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, HEIGHT),
    new THREE.MeshStandardMaterial({ color: 0x151e2d, metalness: 0.15, roughness: 0.82 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(WIDTH / 2, 0, HEIGHT / 2);
  scene.add(floor);

  const lines = [];
  for (let x = 0; x <= WIDTH; x += 5) lines.push(x, 0.01, 0, x, 0.01, HEIGHT);
  for (let z = 0; z <= HEIGHT; z += 5) lines.push(0, 0.01, z, WIDTH, 0.01, z);
  const grid = new THREE.BufferGeometry();
  grid.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
  scene.add(new THREE.LineSegments(
    grid,
    new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.22 }),
  ));

  const rim = new THREE.BoxGeometry(1, 0.3, 1);
  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0x3b4a63 });
  for (const [x, z, sx, sz] of [
    [WIDTH / 2, -0.15, WIDTH + 0.6, 0.3],
    [WIDTH / 2, HEIGHT + 0.15, WIDTH + 0.6, 0.3],
    [-0.15, HEIGHT / 2, 0.3, HEIGHT],
    [WIDTH + 0.15, HEIGHT / 2, 0.3, HEIGHT],
  ]) {
    const edge = new THREE.Mesh(rim, rimMaterial);
    edge.position.set(x, 0.15, z);
    edge.scale.set(sx, 1, sz);
    scene.add(edge);
  }
}

function buildBike(color) {
  const bike = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.5, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.25 }),
  );
  body.position.y = 0.42;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.12, 1.56),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4) }),
  );
  stripe.position.y = 0.36;
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }),
  );
  nose.position.set(0, 0.46, 0.8);
  bike.add(body, stripe, nose);
  bike.scale.setScalar(1.3);
  return bike;
}

function buildPlayer(scene, name) {
  const base = new THREE.Color(COLORS[name]);
  const material = new THREE.MeshBasicMaterial({ color: base.clone() });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX_SEGMENTS);
  walls.count = 0;
  walls.frustumCulled = false;
  walls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const bike = buildBike(COLORS[name]);
  const light = new THREE.PointLight(COLORS[name], 34, 16, 1.7);
  light.position.y = 3;
  bike.add(light);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 3, 3),
      transparent: true,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;

  const sparks = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(3) }),
    SPARKS,
  );
  sparks.frustumCulled = false;

  scene.add(walls, bike, ring, sparks);
  return { base, material, walls, bike, ring, sparks, synced: 0 };
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const rotation = new THREE.Quaternion();

function setSegment(walls, index, a, b) {
  position.set((a[0] + b[0]) / 2 + 0.5, WALL_HEIGHT / 2, (a[1] + b[1]) / 2 + 0.5);
  scale.set(
    Math.abs(a[0] - b[0]) + WALL_THICKNESS,
    WALL_HEIGHT,
    Math.abs(a[1] - b[1]) + WALL_THICKNESS,
  );
  walls.setMatrixAt(index, matrix.compose(position, rotation, scale));
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

function syncWalls(view, player, head) {
  const { walls } = view;
  const { trail } = player;
  if (trail.length < view.synced) view.synced = 0;
  for (let i = Math.max(view.synced - 1, 0); i < trail.length - 1; i += 1) {
    setSegment(walls, i, trail[i], trail[i + 1]);
  }
  setSegment(walls, trail.length - 1, trail[trail.length - 1], head);
  view.synced = trail.length;
  walls.count = trail.length;
  walls.instanceMatrix.needsUpdate = true;
}

function drawCrash(view, head, t) {
  const active = t < 1;
  view.ring.visible = active;
  view.sparks.visible = active;
  if (!active) return;

  const x = head[0] + 0.5;
  const z = head[1] + 0.5;
  view.ring.position.x = x;
  view.ring.position.z = z;
  view.ring.scale.setScalar(0.5 + t * 7);
  view.ring.material.opacity = 1 - t;

  for (let spark = 0; spark < SPARKS; spark += 1) {
    const angle = (spark / SPARKS) * Math.PI * 2 + spark;
    const reach = t * (3 + (spark % 5) * 1.3);
    const lift = (1 + (spark % 3)) * 3 * t * (1 - t);
    position.set(x + Math.cos(angle) * reach, 0.3 + lift, z + Math.sin(angle) * reach);
    scale.setScalar(1 - t);
    view.sparks.setMatrixAt(spark, matrix.compose(position, rotation, scale));
  }
  view.sparks.instanceMatrix.needsUpdate = true;
}

export function createArena(canvas, { orbit = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  scene.fog = new THREE.Fog(0x070a10, 70, 150);
  scene.add(new THREE.HemisphereLight(0x8fb4d8, 0x05070b, 0.55));
  buildFloor(scene);

  const camera = new THREE.PerspectiveCamera(36, 1.5, 1, 300);
  const views = { host: buildPlayer(scene, "host"), guest: buildPlayer(scene, "guest") };

  const composer = new EffectComposer(renderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.48, 0.5, 0.45);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let width = 0;
  let height = 0;
  let lastFrame = 0;
  let slowFrames = 0;

  function fit() {
    if (canvas.clientWidth === width && canvas.clientHeight === height) return;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function aim(now) {
    const centre = new THREE.Vector3(WIDTH / 2, 0, HEIGHT / 2 + 1.5);
    if (orbit) {
      const angle = now * 0.00006;
      camera.position.set(
        centre.x + Math.sin(angle) * 62,
        36,
        centre.z + Math.cos(angle) * 62,
      );
    } else {
      camera.position.set(centre.x, 66, centre.z + 38);
    }
    camera.lookAt(centre);
  }

  // Bloom is the most expensive step, so slower devices drop it and keep the frame rate.
  function watchSpeed(now) {
    if (lastFrame && now - lastFrame > SLOW_FRAME_MS) slowFrames += 1;
    else slowFrames = Math.max(slowFrames - 1, 0);
    lastFrame = now;
    if (slowFrames > 45) bloom.enabled = false;
  }

  return {
    render(state, motion = {}) {
      if (!canvas.clientWidth) return;
      const now = performance.now();
      const t = motion.t ?? 1;
      const crash = motion.crash ?? 1;
      fit();
      aim(now);
      watchSpeed(now);

      for (const name of ["host", "guest"]) {
        const player = state.players[name];
        const view = views[name];
        const head = headPosition(player, motion.from?.players[name], t);
        syncWalls(view, player, head);
        view.material.color.copy(view.base).multiplyScalar(player.alive ? 1.1 : 0.45);
        view.bike.visible = player.alive;
        view.bike.position.set(head[0] + 0.5, 0, head[1] + 0.5);
        view.bike.rotation.y = HEADINGS[player.dir];
        if (player.alive) {
          view.ring.visible = false;
          view.sparks.visible = false;
        } else {
          drawCrash(view, head, crash);
        }
      }
      composer.render();
    },
  };
}
