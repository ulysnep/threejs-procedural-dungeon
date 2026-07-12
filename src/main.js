/**
 * HABITAT — deterministic residential floorplan generator.
 *
 * A seed drives the full program: footprint, public/private zoning, room
 * subdivision, connections, exterior openings, furniture, and presentation.
 * The generated plan is rendered as a low-profile architectural model in
 * Three.js, with no downloaded assets or server-side dependencies.
 */
import * as THREE from 'three';

/* -------------------------------------------------------------------------- */
/* Deterministic random                                                       */
/* -------------------------------------------------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const random = mulberry32(seed);
  return {
    raw: random,
    f: (a, b) => a + random() * (b - a),
    i: (a, b) => a + Math.floor(random() * (b - a + 1)),
    pick: (items) => items[Math.floor(random() * items.length)],
    chance: (probability) => random() < probability,
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/* -------------------------------------------------------------------------- */
/* Residential vocabulary and palettes                                        */
/* -------------------------------------------------------------------------- */

const ROOM = {
  FOYER: 'foyer',
  LIVING: 'living',
  DINING: 'dining',
  KITCHEN: 'kitchen',
  HALL: 'hall',
  BEDROOM: 'bedroom',
  BATHROOM: 'bathroom',
  LAUNDRY: 'laundry',
  OFFICE: 'office',
};

const ROOM_TINT = {
  foyer: 0xd8b36a,
  living: 0xe7b76d,
  dining: 0xd9a976,
  kitchen: 0x82adc2,
  hall: 0xb9aa91,
  bedroom: 0x8ca58b,
  bathroom: 0x72a9b6,
  laundry: 0x9c94af,
  office: 0xb38a72,
};

const THEMES = {
  modern: {
    label: 'MODERN', accent: '#c66b3d',
    bg: 0xe9e5dc, fog: 0xe9e5dc,
    floor: 0xc9b89f, floorAlt: 0xd8c9b6, wall: 0xf1eee7, trim: 0x433f39,
    wood: 0x9a6240, fabric: 0xb86a49, cabinet: 0xdedbd3, metal: 0x343a3c,
    tile: 0xa9c0c5, glass: 0x9ed9e8, plant: 0x52745b,
    hemi: [0xffffff, 0x9d9587, 1.45], dir: [0xfff1d8, 2.4],
  },
  warm: {
    label: 'WARM', accent: '#b86a43',
    bg: 0xeee4d5, fog: 0xeee4d5,
    floor: 0xb9825e, floorAlt: 0xd0a681, wall: 0xf3e4d0, trim: 0x584238,
    wood: 0x77452f, fabric: 0xc27b62, cabinet: 0xd0ab83, metal: 0x4a403a,
    tile: 0xb8c5be, glass: 0xa4d2dc, plant: 0x607451,
    hemi: [0xfff4df, 0x9d8066, 1.5], dir: [0xffd7a8, 2.55],
  },
  coastal: {
    label: 'COASTAL', accent: '#3286a0',
    bg: 0xe6eef0, fog: 0xe6eef0,
    floor: 0xc9bda6, floorAlt: 0xe1d8c7, wall: 0xf5f7f4, trim: 0x4f6c73,
    wood: 0xa47d58, fabric: 0x5e9fb2, cabinet: 0xe8ece8, metal: 0x52696d,
    tile: 0xa7cdd5, glass: 0x83d2e6, plant: 0x557f69,
    hemi: [0xf4ffff, 0x879da0, 1.55], dir: [0xfff7df, 2.35],
  },
  sage: {
    label: 'SAGE', accent: '#698b68',
    bg: 0xe6e8df, fog: 0xe6e8df,
    floor: 0xb69f7d, floorAlt: 0xcdbea4, wall: 0xecede6, trim: 0x465649,
    wood: 0x815d3f, fabric: 0x849b7b, cabinet: 0xb9c3ad, metal: 0x48524a,
    tile: 0xaec2b8, glass: 0x9ccfd2, plant: 0x3f704b,
    hemi: [0xf7fff0, 0x839080, 1.45], dir: [0xffeed0, 2.35],
  },
  slate: {
    label: 'SLATE', accent: '#65798c',
    bg: 0xdfe3e7, fog: 0xdfe3e7,
    floor: 0x9e9690, floorAlt: 0xb8b0aa, wall: 0xe9ecee, trim: 0x343b43,
    wood: 0x6f594b, fabric: 0x687d91, cabinet: 0xb8bec4, metal: 0x303941,
    tile: 0x91a9b4, glass: 0x8fcbd9, plant: 0x4c6b58,
    hemi: [0xf2f7ff, 0x77818c, 1.4], dir: [0xffeed5, 2.25],
  },
};

const THEME_KEYS = Object.keys(THEMES);

function houseName(rng) {
  const first = ['Alder', 'Ash', 'Cedar', 'Clover', 'Elm', 'Juniper', 'Laurel', 'Maple', 'Oak', 'Olive', 'Willow'];
  const second = ['Court', 'House', 'Landing', 'Place', 'Residence', 'Row', 'Studio', 'Terrace'];
  return `${rng.pick(first)} ${rng.pick(second)}`;
}

/* -------------------------------------------------------------------------- */
/* Floorplan generation                                                       */
/* -------------------------------------------------------------------------- */

function edgeKey(orientation, x, z) {
  return `${orientation}:${x}:${z}`;
}

function sharedBoundary(a, b) {
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const x = a.x + a.w === b.x ? b.x : a.x;
    const lo = Math.max(a.z, b.z);
    const hi = Math.min(a.z + a.d, b.z + b.d);
    if (hi > lo) return { orientation: 'v', x, lo, hi };
  }
  if (a.z + a.d === b.z || b.z + b.d === a.z) {
    const z = a.z + a.d === b.z ? b.z : a.z;
    const lo = Math.max(a.x, b.x);
    const hi = Math.min(a.x + a.w, b.x + b.w);
    if (hi > lo) return { orientation: 'h', z, lo, hi };
  }
  return null;
}

function generateHouse(params) {
  const started = performance.now();
  const rng = makeRng(params.seed >>> 0);
  const bedrooms = clamp(Math.round(params.bedrooms), 1, 5);
  const bathrooms = clamp(Math.round(params.bathrooms), 1, 3);

  const hallW = 3;
  const W = 24 + bedrooms * 2 + (bathrooms === 3 ? 1 : 0) + rng.i(0, 2);
  const frontDepth = 8 + (bedrooms >= 4 ? 1 : 0) + rng.i(0, 1);
  const centeredHall = Math.floor((W - hallW) / 2);
  const hallX = clamp(centeredHall + rng.i(-1, 1), 11, W - hallW - 11);
  const leftSpecs = [{ type: ROOM.LAUNDRY, label: 'Laundry' }];
  const rightSpecs = [{ type: ROOM.BATHROOM, label: bathrooms === 1 ? 'Full Bath' : 'Hall Bath' }];
  if (bathrooms === 3) rightSpecs.unshift({ type: ROOM.BATHROOM, label: 'Powder Room' });
  if (bedrooms <= 3) rightSpecs.push({ type: ROOM.OFFICE, label: 'Study' });

  const leftReserved = bathrooms >= 2 ? 2 : 1;
  for (let index = 2; index <= bedrooms; index += 1) {
    const leftLoad = leftSpecs.length + leftReserved;
    const target = leftLoad < rightSpecs.length
      ? leftSpecs
      : (leftLoad > rightSpecs.length ? rightSpecs : (rng.chance(0.5) ? leftSpecs : rightSpecs));
    target.push({ type: ROOM.BEDROOM, label: `Bedroom ${index}` });
  }
  if (bathrooms >= 2) leftSpecs.push({ type: ROOM.BATHROOM, label: 'Primary Bath', ensuite: true });
  leftSpecs.push({ type: ROOM.BEDROOM, label: 'Primary Bedroom', primary: true });

  const minRoomDepth = (spec) => {
    if (spec.type === ROOM.BATHROOM) return spec.label === 'Powder Room' ? 3 : 4;
    if (spec.type === ROOM.LAUNDRY) return 4;
    if (spec.type === ROOM.OFFICE) return 5;
    if (spec.primary) return 7;
    return 6;
  };
  const sideDepth = (specs) => specs.reduce((sum, spec) => sum + minRoomDepth(spec), 0);
  const privateDepth = Math.max(14, sideDepth(leftSpecs), sideDepth(rightSpecs));
  const H = frontDepth + privateDepth;
  const rooms = [];

  function addRoom(type, label, x, z, w, d, extra = {}) {
    const room = {
      id: rooms.length,
      type,
      label,
      x,
      z,
      w,
      d,
      cx: x + w / 2,
      cz: z + d / 2,
      ...extra,
    };
    rooms.push(room);
    return room;
  }

  const foyer = addRoom(ROOM.FOYER, 'Entry', hallX, 0, hallW, frontDepth);
  const rightX = hallX + hallW;
  const serviceOnLeft = rng.chance(0.5);
  const publicServiceX = serviceOnLeft ? 0 : rightX;
  const publicServiceW = serviceOnLeft ? hallX : W - rightX;
  const livingX = serviceOnLeft ? rightX : 0;
  const livingW = serviceOnLeft ? W - rightX : hallX;
  const living = addRoom(ROOM.LIVING, 'Living Room', livingX, 0, livingW, frontDepth);
  const diningDepth = clamp(Math.floor(frontDepth * 0.48) + rng.i(-1, 1), 4, frontDepth - 4);
  const dining = addRoom(ROOM.DINING, 'Dining', publicServiceX, 0, publicServiceW, diningDepth);
  const kitchen = addRoom(ROOM.KITCHEN, 'Kitchen', publicServiceX, diningDepth, publicServiceW, frontDepth - diningDepth);
  const hall = addRoom(ROOM.HALL, 'Gallery', hallX, frontDepth, hallW, privateDepth);

  function splitSide(specs, x, width) {
    const made = [];
    const depths = specs.map(minRoomDepth);
    let extra = privateDepth - depths.reduce((sum, depth) => sum + depth, 0);
    const expandable = specs
      .map((spec, index) => ({ spec, index }))
      .filter(({ spec }) => spec.type === ROOM.BEDROOM || spec.type === ROOM.OFFICE)
      .map(({ index }) => index);
    const targets = expandable.length ? expandable : specs.map((_, index) => index);
    let extraIndex = rng.i(0, Math.max(0, targets.length - 1));
    while (extra > 0) {
      depths[targets[extraIndex % targets.length]] += 1;
      extraIndex += 1;
      extra -= 1;
    }
    let cursor = frontDepth;
    for (let index = 0; index < specs.length; index += 1) {
      const next = index === specs.length - 1 ? H : cursor + depths[index];
      const spec = specs[index];
      made.push(addRoom(spec.type, spec.label, x, cursor, width, next - cursor, spec));
      cursor = next;
    }
    return made;
  }

  const leftRooms = splitSide(leftSpecs, 0, hallX);
  const rightRooms = splitSide(rightSpecs, rightX, W - rightX);

  const roomGrid = new Int16Array(W * H).fill(-1);
  const gridIndex = (x, z) => z * W + x;
  for (const room of rooms) {
    for (let z = room.z; z < room.z + room.d; z += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) roomGrid[gridIndex(x, z)] = room.id;
    }
  }

  const doors = [];
  const openings = new Map();
  const adjacency = [];

  function addDoor(a, b, exterior = false) {
    let boundary;
    if (exterior) {
      boundary = { orientation: 'h', z: 0, lo: foyer.x, hi: foyer.x + foyer.w };
    } else {
      boundary = sharedBoundary(a, b);
    }
    if (!boundary) return;
    const span = boundary.hi - boundary.lo;
    const position = boundary.lo + clamp(Math.floor(span / 2), 0, Math.max(0, span - 1));
    const x = boundary.orientation === 'h' ? position : boundary.x;
    const z = boundary.orientation === 'h' ? boundary.z : position;
    const key = edgeKey(boundary.orientation, x, z);
    const door = { key, orientation: boundary.orientation, x, z, a: a.id, b: b?.id ?? -1, exterior };
    openings.set(key, door);
    doors.push(door);
    if (b) adjacency.push({ a: a.id, b: b.id });
  }

  addDoor(foyer, null, true);
  addDoor(foyer, living);
  addDoor(foyer, dining);
  addDoor(dining, kitchen);
  addDoor(foyer, hall);
  for (const room of [...leftRooms, ...rightRooms]) addDoor(hall, room);

  const primary = leftRooms.find((room) => room.primary);
  const primaryBath = leftRooms.find((room) => room.ensuite);
  if (primary && primaryBath && sharedBoundary(primary, primaryBath)) addDoor(primary, primaryBath);

  const firstPrivateRooms = [leftRooms[0], rightRooms[0]].filter(Boolean);
  const kitchenLaundry = firstPrivateRooms.find((room) => room.type === ROOM.LAUNDRY && sharedBoundary(kitchen, room));
  if (kitchenLaundry) addDoor(kitchen, kitchenLaundry);

  const windows = [];
  const windowKeys = new Set();

  function exteriorCandidates(room) {
    const candidates = [];
    if (room.z === 0) for (let x = room.x + 1; x < room.x + room.w - 1; x += 1) candidates.push({ orientation: 'h', x, z: 0 });
    if (room.z + room.d === H) for (let x = room.x + 1; x < room.x + room.w - 1; x += 1) candidates.push({ orientation: 'h', x, z: H });
    if (room.x === 0) for (let z = room.z + 1; z < room.z + room.d - 1; z += 1) candidates.push({ orientation: 'v', x: 0, z });
    if (room.x + room.w === W) for (let z = room.z + 1; z < room.z + room.d - 1; z += 1) candidates.push({ orientation: 'v', x: W, z });
    return candidates;
  }

  const windowCount = {
    living: 4, dining: 2, kitchen: 2, bedroom: 2, bathroom: 1,
    laundry: 1, office: 2, foyer: 0, hall: 0,
  };

  for (const room of rooms) {
    const candidates = exteriorCandidates(room).filter((candidate) => !openings.has(edgeKey(candidate.orientation, candidate.x, candidate.z)));
    const desired = Math.min(windowCount[room.type] ?? 1, candidates.length);
    const used = [];
    for (let index = 0; index < desired; index += 1) {
      const sampleIndex = Math.floor(((index + 1) * candidates.length) / (desired + 1)) + rng.i(-1, 1);
      let candidate = candidates[clamp(sampleIndex, 0, candidates.length - 1)];
      if (used.some((item) => Math.abs(item.x - candidate.x) + Math.abs(item.z - candidate.z) < 2)) {
        candidate = candidates.find((item) => !used.some((other) => Math.abs(other.x - item.x) + Math.abs(other.z - item.z) < 2)) ?? candidate;
      }
      const key = edgeKey(candidate.orientation, candidate.x, candidate.z);
      if (windowKeys.has(key)) continue;
      const window = { ...candidate, key, roomId: room.id, frosted: room.type === ROOM.BATHROOM };
      openings.set(key, window);
      windowKeys.add(key);
      windows.push(window);
      used.push(candidate);
    }
  }

  const walls = new Map();
  function addWall(orientation, x, z, a, b = -1) {
    const key = edgeKey(orientation, x, z);
    if (!walls.has(key)) walls.set(key, { key, orientation, x, z, a, b });
  }

  for (let z = 0; z < H; z += 1) {
    for (let x = 0; x < W; x += 1) {
      const id = roomGrid[gridIndex(x, z)];
      if (z === 0 || roomGrid[gridIndex(x, z - 1)] !== id) addWall('h', x, z, id, z > 0 ? roomGrid[gridIndex(x, z - 1)] : -1);
      if (x === 0 || roomGrid[gridIndex(x - 1, z)] !== id) addWall('v', x, z, id, x > 0 ? roomGrid[gridIndex(x - 1, z)] : -1);
      if (x === W - 1) addWall('v', W, z, id);
      if (z === H - 1) addWall('h', x, H, id);
    }
  }

  const furnishings = [];
  const addFurnishing = (room, kind, x, z, rotation = 0, layer = 'furniture', scale = 1) => {
    furnishings.push({ roomId: room.id, kind, x, z, rotation, layer, scale });
  };

  for (const room of rooms) {
    const { x, z, w, d } = room;
    const cx = room.cx;
    const cz = room.cz;
    if (room.type === ROOM.LIVING) {
      addFurnishing(room, 'sofa', x + 1.6, cz, Math.PI / 2);
      addFurnishing(room, 'coffee', cx, cz);
      addFurnishing(room, 'media', x + w - 1, cz, Math.PI / 2, 'fixtures');
      addFurnishing(room, 'rug', cx, cz, 0, 'accents', Math.min(1.5, w / 8));
      if (params.decorDensity > 0.25) addFurnishing(room, 'plant', x + w - 1.2, z + 1.2, 0, 'accents');
    } else if (room.type === ROOM.DINING) {
      addFurnishing(room, 'diningTable', cx, cz, w > d ? 0 : Math.PI / 2);
      addFurnishing(room, 'rug', cx, cz, 0, 'accents', 1.05);
    } else if (room.type === ROOM.KITCHEN) {
      addFurnishing(room, 'counter', x + w - 0.7, cz, Math.PI / 2, 'fixtures', Math.max(0.85, d / 5));
      addFurnishing(room, 'island', cx - 0.6, cz, 0, 'fixtures', Math.min(1.2, w / 7));
      addFurnishing(room, 'stool', cx - 1.4, cz - 1.1, 0, 'furniture');
      addFurnishing(room, 'stool', cx + 0.1, cz - 1.1, 0, 'furniture');
    } else if (room.type === ROOM.BEDROOM) {
      addFurnishing(room, 'bed', cx, z + d - 1.7, 0, 'furniture', room.primary ? 1.15 : 1);
      addFurnishing(room, 'dresser', x + w - 0.8, z + 1.2, Math.PI / 2, 'fixtures');
      if (params.decorDensity > 0.4) addFurnishing(room, 'plant', x + 1, z + 1, 0, 'accents', 0.8);
    } else if (room.type === ROOM.BATHROOM) {
      addFurnishing(room, room.label === 'Powder Room' ? 'sink' : 'vanity', x + 0.8, z + 1.1, Math.PI / 2, 'fixtures');
      addFurnishing(room, 'toilet', x + w - 1, z + 1.1, 0, 'fixtures');
      if (room.label !== 'Powder Room') addFurnishing(room, 'shower', x + w - 1.2, z + d - 1.2, 0, 'wet');
    } else if (room.type === ROOM.LAUNDRY) {
      addFurnishing(room, 'washer', x + 1.1, z + d - 1, 0, 'fixtures');
      addFurnishing(room, 'washer', x + 2.4, z + d - 1, 0, 'fixtures');
      addFurnishing(room, 'counter', x + w - 0.7, cz, Math.PI / 2, 'fixtures', Math.max(0.7, d / 7));
    } else if (room.type === ROOM.OFFICE) {
      addFurnishing(room, 'desk', cx, z + 1.2, 0, 'furniture');
      addFurnishing(room, 'chair', cx, z + 2.2, 0, 'furniture');
      if (params.decorDensity > 0.35) addFurnishing(room, 'plant', x + w - 1, z + d - 1, 0, 'accents');
    } else if (room.type === ROOM.FOYER) {
      addFurnishing(room, 'console', cx, z + 1.3, 0, 'fixtures');
      addFurnishing(room, 'runner', cx, cz, 0, 'accents', Math.max(0.8, d / 9));
    }
  }

  if (params.decorDensity > 0.65) {
    const hallPlantZ = frontDepth + privateDepth * rng.f(0.35, 0.7);
    addFurnishing(hall, 'plant', hall.cx, hallPlantZ, 0, 'accents', 0.75);
  }

  const area = Math.round((W * H * 3) / 10) * 10;
  return {
    params,
    seed: params.seed >>> 0,
    name: houseName(rng),
    W,
    H,
    rooms,
    roomGrid,
    walls: [...walls.values()],
    doors,
    windows,
    openings,
    adjacency,
    furnishings,
    entrance: foyer.id,
    stats: {
      bedrooms,
      bathrooms,
      rooms: rooms.filter((room) => room.type !== ROOM.HALL).length,
      area,
      windows: windows.length,
      genMs: performance.now() - started,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Three.js scene                                                             */
/* -------------------------------------------------------------------------- */

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BASE_HALF = 27;
let aspect = innerWidth / innerHeight;
const camera = new THREE.OrthographicCamera(-BASE_HALF * aspect, BASE_HALF * aspect, BASE_HALF, -BASE_HALF, -250, 500);
const cameraTarget = new THREE.Vector3();
let yaw = Math.PI / 4;
let pitch = 0.78;

function updateCamera() {
  const radius = 95;
  camera.position.set(
    cameraTarget.x + Math.cos(yaw) * Math.cos(pitch) * radius,
    cameraTarget.y + Math.sin(pitch) * radius,
    cameraTarget.z + Math.sin(yaw) * Math.cos(pitch) * radius,
  );
  camera.lookAt(cameraTarget);
  camera.updateProjectionMatrix();
}

updateCamera();

const hemi = new THREE.HemisphereLight(0xffffff, 0x8d867b, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffedd5, 2.3);
sun.position.set(-24, 42, -18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.bias = -0.0007;
scene.add(sun);

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
const SPHERE = new THREE.SphereGeometry(0.5, 14, 9);
const RING = new THREE.TorusGeometry(0.5, 0.08, 8, 24);

let plan = null;
let planRoot = null;
let stageGroups = [];
let layerGroups = {};
let floorMeshes = [];
let overlayGroup = null;
let labelGroup = null;
let levelMaterials = [];
let labelTextures = [];
let roomLights = [];
let animationStarted = 0;
let animationActive = false;
let buildProgress = 1;

function makeMaterial(color, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
  levelMaterials.push(material);
  return material;
}

function makeBasicMaterial(color, options = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.DoubleSide,
    depthWrite: options.depthWrite ?? true,
  });
  levelMaterials.push(material);
  return material;
}

function worldX(x) { return x - plan.W / 2; }
function worldZ(z) { return z - plan.H / 2; }

function addBox(parent, material, x, y, z, sx, sy, sz, rotation = 0, geometry = BOX) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(worldX(x), y, worldZ(z));
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.y = rotation;
  mesh.castShadow = sy > 0.18;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, material, x, y, z, radius, height) {
  return addBox(parent, material, x, y, z, radius * 2, height, radius * 2, 0, CYLINDER);
}

function clearPlan() {
  if (planRoot) scene.remove(planRoot);
  for (const material of levelMaterials) material.dispose();
  for (const texture of labelTextures) texture.dispose();
  levelMaterials = [];
  labelTextures = [];
  floorMeshes = [];
  roomLights = [];
  stageGroups = [];
  layerGroups = {};
  overlayGroup = null;
  labelGroup = null;
}

function makeRoomLabel(room) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(250,248,241,0.88)';
  context.beginPath();
  context.roundRect(8, 8, 368, 96, 20);
  context.fill();
  context.strokeStyle = 'rgba(45,49,51,0.18)';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#313539';
  context.textAlign = 'center';
  context.font = '600 30px system-ui, sans-serif';
  context.fillText(room.label.toUpperCase(), 192, 54);
  context.fillStyle = '#7a7a73';
  context.font = '500 20px ui-monospace, monospace';
  context.fillText(`${Math.round(room.w * 1.75)}\u2032 \u00d7 ${Math.round(room.d * 1.75)}\u2032`, 192, 83);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  labelTextures.push(texture);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  levelMaterials.push(material);
  const sprite = new THREE.Sprite(material);
  sprite.position.set(worldX(room.cx), 2.65, worldZ(room.cz));
  const scale = clamp(Math.min(room.w, room.d) * 0.72, 2.8, 5.2);
  sprite.scale.set(scale, scale * 0.29, 1);
  sprite.renderOrder = 10;
  labelGroup.add(sprite);
}

function renderFurniture(item, theme) {
  const groups = {
    furniture: layerGroups.props,
    fixtures: layerGroups.torches,
    accents: layerGroups.particles,
    wet: layerGroups.liquids,
  };
  const parent = groups[item.layer] ?? layerGroups.props;
  const x = item.x;
  const z = item.z;
  const r = item.rotation;
  const s = item.scale;
  const wood = makeMaterial(theme.wood);
  const fabric = makeMaterial(theme.fabric);
  const pale = makeMaterial(0xf0eee8);
  const dark = makeMaterial(theme.metal, { roughness: 0.45, metalness: 0.35 });
  const cabinet = makeMaterial(theme.cabinet);
  const tile = makeMaterial(theme.tile, { roughness: 0.45 });

  if (item.kind === 'sofa') {
    addBox(parent, fabric, x, 0.38, z, 2.8 * s, 0.56, 1.05 * s, r);
    addBox(parent, fabric, x - Math.sin(r) * 0.38, 0.92, z - Math.cos(r) * 0.38, 2.8 * s, 0.8, 0.28, r);
    addBox(parent, fabric, x + Math.cos(r) * 1.32 * s, 0.62, z - Math.sin(r) * 1.32 * s, 0.24, 0.85, 1.1 * s, r);
    addBox(parent, fabric, x - Math.cos(r) * 1.32 * s, 0.62, z + Math.sin(r) * 1.32 * s, 0.24, 0.85, 1.1 * s, r);
  } else if (item.kind === 'coffee') {
    addBox(parent, wood, x, 0.38, z, 1.6, 0.12, 0.9, r);
    addBox(parent, dark, x, 0.19, z, 1.25, 0.34, 0.6, r);
  } else if (item.kind === 'media' || item.kind === 'console' || item.kind === 'dresser') {
    addBox(parent, cabinet, x, 0.42, z, 1.65, 0.7, 0.55, r);
    if (item.kind === 'media') addBox(parent, dark, x, 1.12, z, 1.5, 0.9, 0.08, r);
  } else if (item.kind === 'rug' || item.kind === 'runner') {
    const width = item.kind === 'runner' ? 1.25 : 3.2 * s;
    const depth = item.kind === 'runner' ? 4.6 * s : 2.45 * s;
    addBox(parent, fabric, x, 0.075, z, width, 0.035, depth, r);
  } else if (item.kind === 'plant') {
    addCylinder(parent, makeMaterial(0xb87c54), x, 0.35, z, 0.38 * s, 0.65 * s);
    const crown = new THREE.Mesh(SPHERE, makeMaterial(theme.plant));
    crown.position.set(worldX(x), 1.12 * s, worldZ(z));
    crown.scale.set(0.8 * s, 1.15 * s, 0.8 * s);
    crown.castShadow = true;
    parent.add(crown);
  } else if (item.kind === 'diningTable') {
    addBox(parent, wood, x, 0.76, z, 2.8, 0.14, 1.35, r);
    addBox(parent, dark, x, 0.38, z, 1.9, 0.7, 0.75, r);
    for (const offset of [-1.7, 1.7]) {
      addBox(parent, fabric, x + Math.cos(r) * offset, 0.47, z - Math.sin(r) * offset, 0.64, 0.76, 0.64, r);
    }
    for (const offset of [-0.9, 0.9]) {
      addBox(parent, fabric, x - Math.sin(r) * offset, 0.47, z - Math.cos(r) * offset, 0.64, 0.76, 0.64, r);
    }
  } else if (item.kind === 'counter' || item.kind === 'island') {
    const length = item.kind === 'counter' ? 3.4 * s : 2.7 * s;
    addBox(parent, cabinet, x, 0.48, z, length, 0.92, 0.78, r);
    addBox(parent, dark, x, 0.98, z, length + 0.12, 0.1, 0.9, r);
  } else if (item.kind === 'stool' || item.kind === 'chair') {
    addBox(parent, wood, x, 0.5, z, 0.58, 0.12, 0.58, r);
    addBox(parent, wood, x, 0.28, z, 0.42, 0.52, 0.42, r);
    if (item.kind === 'chair') addBox(parent, wood, x, 0.9, z + 0.24, 0.58, 0.75, 0.12, r);
  } else if (item.kind === 'bed') {
    addBox(parent, wood, x, 0.25, z, 2.25 * s, 0.38, 3.2 * s, r);
    addBox(parent, pale, x, 0.55, z, 2.12 * s, 0.36, 3.02 * s, r);
    addBox(parent, fabric, x, 0.78, z + 0.75 * s, 2.08 * s, 0.12, 1.35 * s, r);
    addBox(parent, fabric, x - 0.56 * s, 0.88, z - 1.02 * s, 0.85 * s, 0.22, 0.58 * s, r);
    addBox(parent, fabric, x + 0.56 * s, 0.88, z - 1.02 * s, 0.85 * s, 0.22, 0.58 * s, r);
    addBox(parent, wood, x, 0.92, z + 1.55 * s, 2.35 * s, 1.25, 0.18, r);
  } else if (item.kind === 'vanity' || item.kind === 'sink') {
    addBox(parent, cabinet, x, 0.46, z, item.kind === 'sink' ? 0.9 : 1.5, 0.85, 0.65, r);
    addBox(parent, pale, x, 0.93, z, item.kind === 'sink' ? 1 : 1.6, 0.1, 0.72, r);
    addBox(parent, makeBasicMaterial(theme.glass, { transparent: true, opacity: 0.55 }), x, 1.65, z, 1.2, 0.9, 0.04, r);
  } else if (item.kind === 'toilet') {
    addBox(parent, pale, x, 0.55, z, 0.75, 0.62, 1, r);
    addBox(parent, pale, x, 0.9, z + 0.33, 0.8, 0.85, 0.3, r);
  } else if (item.kind === 'shower') {
    addBox(parent, tile, x, 0.1, z, 1.65, 0.16, 1.65, r);
    const glass = makeBasicMaterial(theme.glass, { transparent: true, opacity: 0.28, depthWrite: false });
    addBox(parent, glass, x - 0.77, 1.02, z, 0.06, 1.75, 1.55, r);
    addBox(parent, glass, x, 1.02, z - 0.77, 1.55, 1.75, 0.06, r);
  } else if (item.kind === 'washer') {
    addBox(parent, cabinet, x, 0.65, z, 1.05, 1.25, 1.05, r);
    const ring = new THREE.Mesh(RING, dark);
    ring.position.set(worldX(x), 0.7, worldZ(z - 0.54));
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(0.52);
    parent.add(ring);
  } else if (item.kind === 'desk') {
    addBox(parent, wood, x, 0.78, z, 2.25, 0.12, 0.85, r);
    addBox(parent, dark, x, 0.4, z, 1.55, 0.7, 0.5, r);
    addBox(parent, dark, x, 1.18, z, 0.85, 0.62, 0.06, r);
  }
}

function buildScene(nextPlan) {
  clearPlan();
  plan = nextPlan;
  const theme = THEMES[plan.params.themeKey];
  planRoot = new THREE.Group();
  scene.add(planRoot);

  const foundation = new THREE.Group();
  const floors = new THREE.Group();
  const walls = new THREE.Group();
  const structureDetails = new THREE.Group();
  const openings = new THREE.Group();
  const furnishingStage = new THREE.Group();
  labelGroup = new THREE.Group();
  overlayGroup = new THREE.Group();
  layerGroups = {
    props: new THREE.Group(),
    torches: new THREE.Group(),
    particles: new THREE.Group(),
    liquids: new THREE.Group(),
    lights: new THREE.Group(),
  };

  for (const group of [foundation, floors, walls, structureDetails, openings, furnishingStage, labelGroup, overlayGroup]) planRoot.add(group);
  for (const group of Object.values(layerGroups)) furnishingStage.add(group);
  stageGroups = [foundation, floors, walls, structureDetails, openings, furnishingStage];

  const slabMaterial = makeMaterial(0xb9b5ad, { roughness: 0.92 });
  addBox(foundation, slabMaterial, plan.W / 2, -0.23, plan.H / 2, plan.W + 1.1, 0.34, plan.H + 1.1);

  for (const room of plan.rooms) {
    const isWet = room.type === ROOM.BATHROOM || room.type === ROOM.KITCHEN || room.type === ROOM.LAUNDRY;
    const base = new THREE.Color(isWet ? theme.tile : theme.floor);
    const alternate = new THREE.Color(theme.floorAlt);
    base.lerp(alternate, room.id % 3 === 0 ? 0.16 : 0.04);
    const material = makeMaterial(base.getHex(), { roughness: isWet ? 0.55 : 0.86 });
    const floor = addBox(floors, material, room.cx, -0.025, room.cz, room.w - 0.08, 0.12, room.d - 0.08);
    floor.userData.baseColor = base.getHex();
    floor.userData.zoneColor = ROOM_TINT[room.type];
    floorMeshes.push(floor);
    if (isWet) {
      const wetMaterial = makeBasicMaterial(theme.tile, { transparent: true, opacity: 0.13 });
      addBox(layerGroups.liquids, wetMaterial, room.cx, 0.045, room.cz, room.w - 0.22, 0.025, room.d - 0.22);
    }
    if (room.type !== ROOM.HALL) makeRoomLabel(room);
  }

  const wallMaterial = makeMaterial(theme.wall, { roughness: 0.9 });
  const trimMaterial = makeMaterial(theme.trim, { roughness: 0.65 });
  for (const wall of plan.walls) {
    if (plan.openings.has(wall.key)) continue;
    if (wall.orientation === 'h') {
      addBox(walls, wallMaterial, wall.x + 0.5, 1.02, wall.z, 1.04, 1.95, 0.16);
      addBox(structureDetails, trimMaterial, wall.x + 0.5, 0.16, wall.z, 1.04, 0.12, 0.2);
    } else {
      addBox(walls, wallMaterial, wall.x, 1.02, wall.z + 0.5, 0.16, 1.95, 1.04);
      addBox(structureDetails, trimMaterial, wall.x, 0.16, wall.z + 0.5, 0.2, 0.12, 1.04);
    }
  }

  const glassMaterial = makeBasicMaterial(theme.glass, { transparent: true, opacity: 0.42, depthWrite: false });
  const frameMaterial = makeMaterial(theme.trim, { roughness: 0.45, metalness: 0.08 });
  for (const window of plan.windows) {
    const horizontal = window.orientation === 'h';
    const cx = horizontal ? window.x + 0.5 : window.x;
    const cz = horizontal ? window.z : window.z + 0.5;
    addBox(openings, wallMaterial, cx, 0.34, cz, horizontal ? 1.04 : 0.16, 0.62, horizontal ? 0.16 : 1.04);
    addBox(openings, wallMaterial, cx, 1.82, cz, horizontal ? 1.04 : 0.16, 0.34, horizontal ? 0.16 : 1.04);
    addBox(openings, glassMaterial, cx, 1.12, cz, horizontal ? 0.82 : 0.05, 0.92, horizontal ? 0.05 : 0.82);
    addBox(openings, frameMaterial, cx, 0.65, cz, horizontal ? 1.02 : 0.13, 0.09, horizontal ? 0.13 : 1.02);
    addBox(openings, frameMaterial, cx, 1.59, cz, horizontal ? 1.02 : 0.13, 0.09, horizontal ? 0.13 : 1.02);
    if (window.frosted) {
      addBox(layerGroups.liquids, makeBasicMaterial(0xdaf4f2, { transparent: true, opacity: 0.34 }), cx, 1.12, cz, horizontal ? 0.78 : 0.04, 0.85, horizontal ? 0.04 : 0.78);
    }
  }

  const doorMaterial = makeMaterial(theme.wood, { roughness: 0.74 });
  for (const door of plan.doors) {
    const horizontal = door.orientation === 'h';
    const cx = horizontal ? door.x + 0.5 : door.x;
    const cz = horizontal ? door.z : door.z + 0.5;
    addBox(openings, frameMaterial, cx, 1.9, cz, horizontal ? 1.1 : 0.18, 0.16, horizontal ? 0.18 : 1.1);
    if (horizontal) {
      addBox(openings, frameMaterial, door.x + 0.03, 0.98, door.z, 0.12, 1.85, 0.19);
      addBox(openings, frameMaterial, door.x + 0.97, 0.98, door.z, 0.12, 1.85, 0.19);
      const leaf = addBox(openings, doorMaterial, cx + 0.24, 0.93, cz + 0.32, 0.82, 1.65, 0.09, door.exterior ? -0.72 : 0.62);
      leaf.castShadow = true;
    } else {
      addBox(openings, frameMaterial, door.x, 0.98, door.z + 0.03, 0.19, 1.85, 0.12);
      addBox(openings, frameMaterial, door.x, 0.98, door.z + 0.97, 0.19, 1.85, 0.12);
      addBox(openings, doorMaterial, cx + 0.32, 0.93, cz + 0.24, 0.09, 1.65, 0.82, door.exterior ? 0.72 : -0.62);
    }
  }

  for (const item of plan.furnishings) renderFurniture(item, theme);

  const lineMaterial = new THREE.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.7 });
  levelMaterials.push(lineMaterial);
  const positions = [];
  for (const edge of plan.adjacency) {
    const a = plan.rooms[edge.a];
    const b = plan.rooms[edge.b];
    positions.push(worldX(a.cx), 0.31, worldZ(a.cz), worldX(b.cx), 0.31, worldZ(b.cz));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const circulation = new THREE.LineSegments(geometry, lineMaterial);
  overlayGroup.add(circulation);

  const lightMarkerMaterial = makeBasicMaterial(theme.accent);
  for (const room of plan.rooms.filter((entry) => entry.type !== ROOM.HALL).slice(0, 10)) {
    const point = new THREE.PointLight(0xffe6c3, 0.18, 8, 2);
    point.position.set(worldX(room.cx), 3.4, worldZ(room.cz));
    layerGroups.lights.add(point);
    roomLights.push(point);
    addCylinder(layerGroups.lights, lightMarkerMaterial, room.cx, 2.32, room.cz, 0.14, 0.08);
  }

  overlayGroup.visible = Boolean(el.tGraph.checked);
  labelGroup.visible = true;
  applyZoneOverlay(el.tHeat.checked);
  applyLayerVisibility();
  applyThemeEnvironment(theme);

  cameraTarget.set(0, 0, 0);
  camera.zoom = clamp(44 / Math.max(plan.W, plan.H), 0.78, 1.35);
  updateCamera();
}

function applyThemeEnvironment(theme) {
  scene.background = new THREE.Color(theme.bg);
  scene.fog = new THREE.FogExp2(theme.fog, 0.0024);
  renderer.setClearColor(theme.bg);
  hemi.color.setHex(theme.hemi[0]);
  hemi.groundColor.setHex(theme.hemi[1]);
  hemi.intensity = theme.hemi[2];
  sun.color.setHex(theme.dir[0]);
  sun.intensity = theme.dir[1];
  document.documentElement.style.setProperty('--accent', theme.accent);
}

/* -------------------------------------------------------------------------- */
/* UI and animation                                                           */
/* -------------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const el = {
  seed: $('seed'), dice: $('dice'), forge: $('forge'),
  rooms: $('rooms'), loops: $('loops'), decor: $('decor'),
  vRooms: $('vRooms'), vLoops: $('vLoops'), vDecor: $('vDecor'), vTheme: $('vTheme'),
  tGraph: $('tGraph'), tHeat: $('tHeat'), tAnim: $('tAnim'), tPost: $('tPost'),
  dname: $('dname'), dsub: $('dsub'), collapse: $('collapse'), panel: $('panel'),
  sRooms: $('sRooms'), sEdges: $('sEdges'), sCrit: $('sCrit'), sTiles: $('sTiles'),
  sLights: $('sLights'), sMs: $('sMs'), sCalls: $('sCalls'), sTris: $('sTris'), sFps: $('sFps'),
};

const pipelineItems = [...document.querySelectorAll('#pipe li')];
let selectedTheme = 'auto';
const layerVisibility = { props: true, torches: true, particles: true, liquids: true, lights: true };

function resolveTheme(seed) {
  if (selectedTheme !== 'auto') return selectedTheme;
  return THEME_KEYS[(seed >>> 0) % THEME_KEYS.length];
}

function setThemeSelection(key) {
  selectedTheme = key;
  document.querySelectorAll('#chips .chip').forEach((chip) => chip.classList.toggle('on', chip.dataset.t === key));
}

function applyLayerVisibility() {
  if (!planRoot) return;
  for (const [key, group] of Object.entries(layerGroups)) group.visible = layerVisibility[key] !== false;
}

function applyZoneOverlay(enabled) {
  for (const floor of floorMeshes) floor.material.color.setHex(enabled ? floor.userData.zoneColor : floor.userData.baseColor);
}

function setPipelineStage(stage, done = false) {
  pipelineItems.forEach((item, index) => {
    item.classList.toggle('active', !done && index === stage);
    item.classList.toggle('done', done || index < stage);
  });
}

function setBuildProgress(progress) {
  buildProgress = clamp(progress, 0, 1);
  const scaled = buildProgress * stageGroups.length;
  stageGroups.forEach((group, index) => {
    const local = clamp(scaled - index, 0, 1);
    const eased = 1 - (1 - local) ** 3;
    group.visible = local > 0.001;
    group.scale.y = Math.max(0.001, eased);
  });
  labelGroup.visible = scaled > 3.2;
  overlayGroup.visible = Boolean(el.tGraph.checked) && scaled > 3.2;
  setPipelineStage(Math.min(5, Math.floor(scaled)), buildProgress >= 1);
  if (buildProgress >= 1) applyLayerVisibility();
}

function finishAnimation() {
  animationActive = false;
  setBuildProgress(1);
}

function forge(animate = true) {
  const seed = Math.max(1, Math.floor(Number(el.seed.value) || 1));
  el.seed.value = seed;
  const themeKey = resolveTheme(seed);
  const params = {
    seed,
    themeKey,
    bedrooms: Number(el.rooms.value),
    bathrooms: Number(el.loops.value),
    decorDensity: Number(el.decor.value) / 100,
  };
  const nextPlan = generateHouse(params);
  buildScene(nextPlan);
  const theme = THEMES[themeKey];
  el.vTheme.textContent = selectedTheme === 'auto' ? `AUTO · ${theme.label}` : theme.label;
  el.dname.textContent = nextPlan.name;
  el.dsub.textContent = `${nextPlan.stats.bedrooms} bed · ${nextPlan.stats.bathrooms} bath · ${nextPlan.stats.area.toLocaleString()} sq ft`;
  el.sRooms.textContent = nextPlan.stats.bedrooms;
  el.sEdges.textContent = nextPlan.stats.bathrooms;
  el.sCrit.textContent = nextPlan.stats.rooms;
  el.sTiles.textContent = nextPlan.stats.area.toLocaleString();
  el.sLights.textContent = nextPlan.stats.windows;
  el.sMs.textContent = `${nextPlan.stats.genMs.toFixed(1)} ms`;

  if (animate && el.tAnim.checked && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animationStarted = performance.now();
    animationActive = true;
    setBuildProgress(0.001);
  } else {
    finishAnimation();
  }
}

let sliderDebounce = null;
function scheduleForge() {
  clearTimeout(sliderDebounce);
  sliderDebounce = setTimeout(() => forge(false), 180);
}

el.rooms.addEventListener('input', () => {
  el.vRooms.textContent = el.rooms.value;
  scheduleForge();
});
el.loops.addEventListener('input', () => {
  el.vLoops.textContent = el.loops.value;
  scheduleForge();
});
el.decor.addEventListener('input', () => {
  el.vDecor.textContent = `${el.decor.value}%`;
  scheduleForge();
});
el.seed.addEventListener('change', () => forge(true));
el.dice.addEventListener('click', () => {
  el.seed.value = 1 + Math.floor(Math.random() * 999999);
  forge(true);
});
el.forge.addEventListener('click', () => forge(true));

document.querySelectorAll('#chips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    setThemeSelection(chip.dataset.t);
    forge(true);
  });
});

document.querySelectorAll('#objchips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const key = chip.dataset.o;
    layerVisibility[key] = !layerVisibility[key];
    chip.classList.toggle('on', layerVisibility[key]);
    chip.setAttribute('aria-pressed', String(layerVisibility[key]));
    applyLayerVisibility();
  });
});

el.tGraph.addEventListener('change', () => {
  if (overlayGroup) overlayGroup.visible = el.tGraph.checked && buildProgress * 6 > 3.2;
});
el.tHeat.addEventListener('change', () => applyZoneOverlay(el.tHeat.checked));
el.tPost.addEventListener('change', () => {
  renderer.shadowMap.enabled = el.tPost.checked;
  renderer.toneMappingExposure = el.tPost.checked ? 1.05 : 0.92;
  forge(false);
});
el.collapse.addEventListener('click', () => {
  el.panel.classList.toggle('min');
  el.collapse.textContent = el.panel.classList.contains('min') ? '+' : '−';
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === 'KeyR') {
    el.seed.value = 1 + Math.floor(Math.random() * 999999);
    forge(true);
  } else if (event.code === 'KeyT') {
    const current = resolveTheme(Number(el.seed.value));
    const next = THEME_KEYS[(THEME_KEYS.indexOf(current) + 1) % THEME_KEYS.length];
    setThemeSelection(next);
    forge(true);
  } else if (event.code === 'KeyG') {
    el.tGraph.checked = !el.tGraph.checked;
    el.tGraph.dispatchEvent(new Event('change'));
  } else if (event.code === 'KeyH') {
    el.tHeat.checked = !el.tHeat.checked;
    el.tHeat.dispatchEvent(new Event('change'));
  } else if (event.code === 'KeyP') {
    el.tPost.checked = !el.tPost.checked;
    el.tPost.dispatchEvent(new Event('change'));
  } else if (event.code === 'Space' && animationActive) {
    event.preventDefault();
    finishAnimation();
  }
});

/* -------------------------------------------------------------------------- */
/* Camera interaction and frame loop                                           */
/* -------------------------------------------------------------------------- */

const canvas = renderer.domElement;
let dragging = false;
let orbiting = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  orbiting = event.shiftKey || event.button === 2;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  if (orbiting) {
    yaw -= dx * 0.007;
    pitch = clamp(pitch + dy * 0.005, 0.38, 1.18);
  } else {
    const scale = 0.055 / camera.zoom;
    cameraTarget.x -= (Math.cos(yaw) * dx + Math.sin(yaw) * dy) * scale;
    cameraTarget.z -= (Math.sin(yaw) * dx - Math.cos(yaw) * dy) * scale;
  }
  updateCamera();
});

function endDrag(event) {
  dragging = false;
  orbiting = false;
  if (event?.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  camera.zoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.001), 0.42, 2.8);
  camera.updateProjectionMatrix();
}, { passive: false });

window.addEventListener('resize', () => {
  aspect = innerWidth / innerHeight;
  camera.left = -BASE_HALF * aspect;
  camera.right = BASE_HALF * aspect;
  camera.top = BASE_HALF;
  camera.bottom = -BASE_HALF;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});

let lastFrame = performance.now();
let fpsClock = 0;
let fpsFrames = 0;

function tick(now) {
  requestAnimationFrame(tick);
  if (animationActive) {
    const progress = (now - animationStarted) / 3300;
    if (progress >= 1) finishAnimation();
    else setBuildProgress(progress);
  }

  renderer.info.reset();
  renderer.render(scene, camera);
  const delta = Math.min(100, now - lastFrame);
  lastFrame = now;
  fpsClock += delta;
  fpsFrames += 1;
  if (fpsClock >= 500) {
    el.sFps.textContent = Math.round((fpsFrames * 1000) / fpsClock);
    el.sCalls.textContent = renderer.info.render.calls;
    el.sTris.textContent = renderer.info.render.triangles.toLocaleString();
    fpsClock = 0;
    fpsFrames = 0;
  }
}

el.vRooms.textContent = el.rooms.value;
el.vLoops.textContent = el.loops.value;
el.vDecor.textContent = `${el.decor.value}%`;
setThemeSelection('auto');
forge(true);
requestAnimationFrame(tick);
