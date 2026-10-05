import * as THREE from 'three';
import { RoomEnvironment } from './assets/lib/RoomEnvironment.js';

/* ============================================================
   基础场景
============================================================ */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x241532);
scene.fog = new THREE.Fog(0x241532, 14, 30);

// 环境反射（玻璃/金属质感的关键）
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// 静态贴图
const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
const CAM_BASE = new THREE.Vector3(0, 3.4, 7.6);
camera.position.copy(CAM_BASE);
camera.lookAt(0, 1.5, 0);

scene.add(new THREE.HemisphereLight(0xffd9ec, 0x2a1a3a, 0.7));
const key = new THREE.DirectionalLight(0xfff2dd, 1.4);
key.position.set(4, 9, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6; key.shadow.camera.right = 6;
key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
scene.add(key);
const neon1 = new THREE.PointLight(0xff4fc3, 12, 12); neon1.position.set(-3, 4.6, 1); scene.add(neon1);
const neon2 = new THREE.PointLight(0x4fc3ff, 12, 12); neon2.position.set(3, 4.6, 1); scene.add(neon2);

/* ============================================================
   机器尺寸（游戏区域）
============================================================ */
const BOUND = { x: 2.3, z: 1.45 };          // 可活动半宽/半深
const FLOOR_Y = 0;
const CHUTE = new THREE.Vector3(-1.55, 0, 0.95);  // 出货口中心
const CHUTE_R = 0.55;

/* ============================================================
   机柜
============================================================ */
const cabinet = new THREE.Group();
scene.add(cabinet);

function box(w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? .5, metalness: opts.metal ?? .1, ...opts.mat })
  );
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.recv ?? true;
  cabinet.add(m);
  return m;
}

const PINK = 0xff5fa8, DARK = 0x3a2140;
// 底板 / 内场
box(5.6, 0.3, 4.0, 0x6b3fa0, 0, -0.15, 0, { cast: false });
const floorPad = box(5.0, 0.06, 3.4, 0xffffff, 0, 0.03, 0, { rough: .8, cast: false });   // 内场垫
floorPad.material.map = loadTex('./assets/mat.svg');
floorPad.material.needsUpdate = true;
// 边框立柱
[[-2.65, -1.85], [2.65, -1.85], [-2.65, 1.85], [2.65, 1.85]].forEach(([x, z]) =>
  box(0.3, 4.6, 0.3, PINK, x, 2.3, z, { metal: .4, rough: .3 }));
// 背板 / 顶 / 底座裙边
box(5.6, 4.6, 0.25, DARK, 0, 2.3, -1.98);
box(5.6, 0.5, 4.0, PINK, 0, 4.85, 0, { metal: .4, rough: .3 });
box(5.6, 1.1, 4.0, PINK, 0, -0.7, 0);
// 招牌 + 发光贴图
box(4.6, 0.9, 0.3, 0x2a1540, 0, 5.6, 0.6);
const sign = new THREE.Mesh(
  new THREE.PlaneGeometry(4.5, 0.88),
  new THREE.MeshBasicMaterial({ map: loadTex('./assets/marquee.svg'), transparent: true })
);
sign.position.set(0, 5.6, 0.77);
cabinet.add(sign);
// 招牌灯带
for (let i = 0; i < 9; i++) {
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff, emissive: i % 2 ? 0xff4fc3 : 0xffd54a, emissiveIntensity: 2 })
  );
  bulb.position.set(-2 + i * 0.5, 5.6, 0.78);
  cabinet.add(bulb);
}
// 玻璃柜（清漆高光 + 环境反射，才有"玻璃"存在感）
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xdff0ff, transparent: true, opacity: 0.1, roughness: 0.08,
  metalness: 0, side: THREE.DoubleSide, depthWrite: false,
  clearcoat: 0.4, clearcoatRoughness: 0.15, envMapIntensity: 0.35
});
function glass(w, h, x, y, z, ry = 0) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
  g.position.set(x, y, z); g.rotation.y = ry;
  cabinet.add(g);
}
glass(5.0, 4.3, 0, 2.35, 1.82);              // 前
glass(3.4, 4.3, -2.48, 2.35, 0, Math.PI / 2); // 左
glass(3.4, 4.3, 2.48, 2.35, 0, Math.PI / 2);  // 右

// 玻璃铝合金边框
const frameMat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metal: .9, rough: .3 });
function glassFrame(w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  cabinet.add(m);
}
// 前玻璃：上下框 + 中梃
glassFrame(5.06, .07, .07, 0, 0.2, 1.82);
glassFrame(5.06, .07, .07, 0, 4.5, 1.82);
glassFrame(.07, 4.36, .07, 0, 2.35, 1.82);
// 侧玻璃：上下框
[-2.48, 2.48].forEach(x => {
  glassFrame(.07, .07, 3.46, x, 0.2, 0);
  glassFrame(.07, .07, 3.46, x, 4.5, 0);
});
// 出货口（黑洞 + 边框）
const hole = new THREE.Mesh(
  new THREE.CircleGeometry(CHUTE_R, 32),
  new THREE.MeshBasicMaterial({ color: 0x0a0512 })
);
hole.rotation.x = -Math.PI / 2;
hole.position.set(CHUTE.x, 0.065, CHUTE.z);
cabinet.add(hole);
const holeRing = new THREE.Mesh(
  new THREE.TorusGeometry(CHUTE_R + 0.04, 0.045, 12, 40),
  new THREE.MeshStandardMaterial({ color: 0xffd54a, metal: .7, rough: .25, emissive: 0x664400, emissiveIntensity: .4 })
);
holeRing.rotation.x = -Math.PI / 2;
holeRing.position.set(CHUTE.x, 0.07, CHUTE.z);
cabinet.add(holeRing);

/* ============================================================
   前面板：操控台（摇杆 + 投币口）
============================================================ */
// 操控台面（斜面，探出玻璃外）
const deck = new THREE.Mesh(
  new THREE.BoxGeometry(3.4, 0.16, 1.0),
  new THREE.MeshStandardMaterial({ color: 0xff5fa8, metal: .35, rough: .35 })
);
deck.position.set(0, 0.02, 2.3);
deck.rotation.x = -0.12;
deck.castShadow = true; deck.receiveShadow = true;
cabinet.add(deck);

// ---- 摇杆 ----
const joystick = new THREE.Group();
joystick.position.set(-0.95, 0.12, 2.32);
joystick.rotation.x = -0.12;
cabinet.add(joystick);

const joyBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.26, 0.08, 20),
  new THREE.MeshStandardMaterial({ color: 0x2a2a35, metal: .6, rough: .35 })
);
joyBase.castShadow = true;
joystick.add(joyBase);

// 摇杆摆杆（倾斜部分，以底座中心为轴）
const stick = new THREE.Group();
stick.position.y = 0.03;
joystick.add(stick);
const stickRod = new THREE.Mesh(
  new THREE.CylinderGeometry(0.028, 0.035, 0.42, 10),
  new THREE.MeshStandardMaterial({ color: 0xdddddd, metal: .85, rough: .25 })
);
stickRod.position.y = 0.21;
stickRod.castShadow = true;
stick.add(stickRod);
const stickBall = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 16, 12),
  new THREE.MeshStandardMaterial({ color: 0xff3355, metal: .3, rough: .25 })
);
stickBall.position.y = 0.45;
stickBall.castShadow = true;
stick.add(stickBall);

// ---- 投币口 ----
const coinSlot = new THREE.Group();
coinSlot.position.set(0.95, 0.14, 2.32);
coinSlot.rotation.x = -0.12;
cabinet.add(coinSlot);

const slotPlate = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.3, 0.06),
  new THREE.MeshStandardMaterial({ color: 0x3a3a48, metal: .7, rough: .3 })
);
slotPlate.castShadow = true;
coinSlot.add(slotPlate);
const slotHole = new THREE.Mesh(
  new THREE.BoxGeometry(0.05, 0.16, 0.02),
  new THREE.MeshBasicMaterial({ color: 0x05050a })
);
slotHole.position.set(0, 0.04, 0.035);
coinSlot.add(slotHole);
// 投币指示灯（投币时闪烁）
const slotLampMat = new THREE.MeshStandardMaterial({
  color: 0xffd54a, emissive: 0xffd54a, emissiveIntensity: 0.6
});
const slotLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), slotLampMat);
slotLamp.position.set(0, -0.09, 0.04);
coinSlot.add(slotLamp);
let slotFlash = 0;   // 投币灯闪烁计时

/* ============================================================
   音效（WebAudio 合成）
============================================================ */
let AC = null;
function ac() { return AC ??= new (window.AudioContext || window.webkitAudioContext)(); }
function blip(freq, dur, type = 'sine', vol = .2, when = 0) {
  const ctx = ac(), t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur);
}
const sfx = {
  coin()  { blip(988, .09, 'square', .15); blip(1319, .25, 'square', .15, .09); },
  move()  { blip(180, .05, 'sawtooth', .03); },
  drop()  { blip(300, .5, 'sawtooth', .08); blip(150, .6, 'sawtooth', .06, .05); },
  clack() { blip(2200, .04, 'square', .12); blip(1400, .06, 'square', .1, .04); },
  slip()  { blip(500, .3, 'sawtooth', .1); blip(350, .35, 'sawtooth', .08, .1); },
  win()   { [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, .3, 'triangle', .18, i * .11)); },
  thud()  { blip(90, .18, 'sine', .25); },
};

/* ============================================================
   娃娃（简单几何体 + 球体碰撞）
============================================================ */
const dolls = [];
const dollGroup = new THREE.Group();
scene.add(dollGroup);

const PALETTE = [0xff8fb3, 0x8fd0ff, 0xffe08f, 0xb3ff9e, 0xd8a6ff, 0xffb38f, 0x9effe8, 0xff9e9e];

function makeDoll(x, z, seed) {
  const color = PALETTE[seed % PALETTE.length];
  const r = 0.26 + (seed % 3) * 0.03;         // 碰撞半径
  const g = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({ color, roughness: .65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222, roughness: .4 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat);
  body.scale.y = 1.15; body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 24, 18), mat);
  head.position.y = r * 1.35; head.castShadow = true;
  g.add(head);

  // 耳朵（随机：圆耳 / 尖耳）
  const earGeo = (seed % 2)
    ? new THREE.ConeGeometry(r * 0.28, r * 0.5, 12)
    : new THREE.SphereGeometry(r * 0.26, 12, 10);
  [-1, 1].forEach(s => {
    const ear = new THREE.Mesh(earGeo, mat);
    ear.position.set(s * r * 0.45, r * 1.95, 0);
    ear.rotation.z = -s * 0.35;
    ear.castShadow = true;
    g.add(ear);
  });

  // 眼睛 + 腮红
  [-1, 1].forEach(s => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 8, 8), dark);
    eye.position.set(s * r * 0.3, r * 1.45, r * 0.68);
    g.add(eye);
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 1 })
    );
    cheek.position.set(s * r * 0.48, r * 1.28, r * 0.6);
    g.add(cheek);
  });

  g.position.set(x, r, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  dollGroup.add(g);

  const d = {
    mesh: g, r,
    pos: g.position, vel: new THREE.Vector3(),
    angVel: (Math.random() - .5) * 2,
    held: false, gone: false,
    weight: r / 0.26                          // 越大的娃娃越重、越容易滑脱
  };
  dolls.push(d);
  return d;
}

// 初始堆放
let seed = 0;
for (let i = 0; i < 14; i++) {
  const x = -1.5 + (i % 4) * 0.92 + (Math.random() - .5) * .25;
  const z = -0.95 + Math.floor(i / 4) * 0.72 + (Math.random() - .5) * .25;
  if (Math.hypot(x - CHUTE.x, z - CHUTE.z) < CHUTE_R + 0.4) continue;
  makeDoll(x, z, seed++);
}
document.getElementById('left').textContent = dolls.length;

/* ---------- 简化物理：重力 + 地面 + 墙 + 球-球 ---------- */
function physics(dt) {
  for (const d of dolls) {
    if (d.held || d.gone) continue;
    d.vel.y -= 9.8 * dt;
    d.pos.addScaledVector(d.vel, dt);
    d.mesh.rotation.y += d.angVel * dt;
    d.angVel *= 0.98;

    // 出货口：在洞口上方则无地板
    const overHole = Math.hypot(d.pos.x - CHUTE.x, d.pos.z - CHUTE.z) < CHUTE_R * 0.85;
    if (!overHole && d.pos.y < FLOOR_Y + d.r) {
      d.pos.y = FLOOR_Y + d.r;
      if (d.vel.y < -1.2) sfx.thud();
      d.vel.y *= -0.25;
      d.vel.x *= 0.9; d.vel.z *= 0.9;
    }
    // 墙壁
    if (d.pos.x < -BOUND.x + d.r) { d.pos.x = -BOUND.x + d.r; d.vel.x *= -0.4; }
    if (d.pos.x >  BOUND.x - d.r) { d.pos.x =  BOUND.x - d.r; d.vel.x *= -0.4; }
    if (d.pos.z < -BOUND.z + d.r) { d.pos.z = -BOUND.z + d.r; d.vel.z *= -0.4; }
    if (d.pos.z >  BOUND.z - d.r) { d.pos.z =  BOUND.z - d.r; d.vel.z *= -0.4; }

    // 掉进出奖口
    if (d.pos.y < -1.2 && !d.gone) {
      d.gone = true;
      dollGroup.remove(d.mesh);
      onPrize(d);
    }
  }
  // 球-球碰撞
  for (let i = 0; i < dolls.length; i++) {
    const a = dolls[i];
    if (a.gone || a.held) continue;
    for (let j = i + 1; j < dolls.length; j++) {
      const b = dolls[j];
      if (b.gone || b.held) continue;
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dy, dz), min = a.r + b.r;
      if (dist > 0 && dist < min) {
        const nx = dx / dist, ny = dy / dist, nz = dz / dist, push = (min - dist) / 2;
        a.pos.x -= nx * push; a.pos.y -= ny * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.y += ny * push; b.pos.z += nz * push;
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny + (b.vel.z - a.vel.z) * nz;
        if (rel < 0) {
          const imp = -rel * 0.5;
          a.vel.x -= nx * imp; a.vel.y -= ny * imp; a.vel.z -= nz * imp;
          b.vel.x += nx * imp; b.vel.y += ny * imp; b.vel.z += nz * imp;
        }
      }
    }
  }
}

/* ============================================================
   抓钩系统：横梁小车 + 弹簧摆线缆 + 双关节三爪
============================================================ */
const gantry = new THREE.Group();
scene.add(gantry);

// 轨道
const railMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metal: .8, rough: .25 });
const railX = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 0.12), railMat);
railX.position.set(0, 4.35, 0);
gantry.add(railX);

// 小车（沿 X），滑块（沿 Z）
const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5),
  new THREE.MeshStandardMaterial({ color: 0xffd54a, metal: .5, rough: .3 }));
carriage.castShadow = true;
gantry.add(carriage);

const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8),
  new THREE.MeshStandardMaterial({ color: 0x888888, metal: .8, rough: .3 }));
gantry.add(cable);

// 爪头
const clawHead = new THREE.Group();
const hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12),
  new THREE.MeshStandardMaterial({ color: 0xdddddd, metal: .85, rough: .2 }));
hub.castShadow = true;
clawHead.add(hub);

const prongs = [];
const armMat = new THREE.MeshStandardMaterial({ color: 0xc8c8d2, metal: .9, rough: .22 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x6f6f80, metal: .9, rough: .3 });
for (let i = 0; i < 3; i++) {
  const pivot = new THREE.Group();
  pivot.rotation.y = (i / 3) * Math.PI * 2;
  pivot.position.y = -0.04;

  // 第一关节：肩关节 + 上臂
  const shoulder = new THREE.Group();
  shoulder.position.x = 0.12;
  const joint1 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), jointMat);
  joint1.castShadow = true;
  shoulder.add(joint1);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.42, 10), armMat);
  upper.position.y = -0.21;
  upper.castShadow = true;
  shoulder.add(upper);

  // 第二关节：肘关节 + 指节（内勾）
  const elbow = new THREE.Group();
  elbow.position.y = -0.42;
  const joint2 = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), jointMat);
  joint2.castShadow = true;
  elbow.add(joint2);
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.42, 10), armMat);
  fore.position.y = -0.21;
  fore.castShadow = true;
  elbow.add(fore);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.16, 8), jointMat);
  tip.position.y = -0.48;
  tip.rotation.x = Math.PI;
  tip.castShadow = true;
  elbow.add(tip);

  shoulder.add(elbow);
  pivot.add(shoulder);
  clawHead.add(pivot);
  prongs.push({ seg1: shoulder, seg2: elbow });
}
scene.add(clawHead);

// 爪状态
const claw = {
  x: 0, z: 0,               // 小车目标控制点（实际位置由输入积分）
  vx: 0, vz: 0,
  headPos: new THREE.Vector3(0, 3.9, 0),   // 爪头实际位置（带弹簧摆动）
  headVel: new THREE.Vector3(),
  prongOpen: 1,              // 1=全开 0=闭合
  prongOpenTarget: 1,
  held: null,
  grip: 0, slipAt: Infinity, age: 0,
};

const HEAD_Y_TOP = 4.35 - 0.45;   // 缆绳最短时爪头高度
const HEAD_Y_BOTTOM = 0.55;       // 落地时爪头高度
const DOWN_SPEED = 1.55;          // 下钩速度（电机匀速）
const UP_SPEED = 1.9;             // 上升速度

function setProngOpen(open01) {   // 1=全开 0=闭合
  claw.prongOpenTarget = open01;
}

/* ============================================================
   难度模式
============================================================ */
const MODES = {
  easy: {   // 简单：判定宽松，抓住就绝不会滑脱
    grabR: 0.8, baseP: 0.9, pScale: 0.1,
    slip: () => Infinity
  },
  normal: { // 普通：真实机台手感，握力差会滑脱
    grabR: 0.65, baseP: 0.45, pScale: 0.55,
    slip: q => THREE.MathUtils.lerp(1.2, 8.0, Math.pow(q, 1.5)) * (0.8 + Math.random() * 0.5)
  },
  hard: {   // 困难：黑心机台，判定窄、爪力弱
    grabR: 0.55, baseP: 0.3, pScale: 0.5,
    slip: q => THREE.MathUtils.lerp(0.4, 4.0, Math.pow(q, 1.5)) * (0.7 + Math.random() * 0.6)
  },
};
let mode = MODES[localStorage.getItem('claw-mode')] || MODES.normal;
let modeName = MODES[localStorage.getItem('claw-mode')] ? localStorage.getItem('claw-mode') : 'normal';

document.querySelectorAll('#modes button').forEach(btn => {
  if (btn.dataset.mode === modeName) btn.classList.add('on');
  btn.addEventListener('click', () => {
    modeName = btn.dataset.mode;
    mode = MODES[modeName];
    localStorage.setItem('claw-mode', modeName);
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b === btn));
  });
});

/* ============================================================
   游戏状态机
============================================================ */
const S = { IDLE: 'IDLE', READY: 'READY', DOWN: 'DOWN', GRAB: 'GRAB', UP: 'UP', RETURN: 'RETURN', RELEASE: 'RELEASE' };
let state = S.IDLE;
let stateT = 0;
let coins = 0, prizes = 0;
const PLAY_TIME = 20;
let timeLeft = 0;

const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const bannerEl = document.getElementById('banner');

function setState(s) {
  state = s; stateT = 0;
  const label = {
    IDLE: 'INSERT COIN', READY: 'WASD 移动 · 空格下钩！',
    DOWN: '下钩中…', GRAB: '抓取！', UP: '上升中…',
    RETURN: '运送中…', RELEASE: '松爪！'
  }[s];
  statusEl.textContent = label;
  timerEl.style.display = s === S.READY ? 'block' : 'none';
  if (s === S.READY) timeLeft = PLAY_TIME;
}

function insertCoin() {
  coins++;
  document.getElementById('coins').textContent = coins;
  sfx.coin();
  slotFlash = 0.6;
  if (state === S.IDLE) setState(S.READY);
}

function startDrop() {
  if (state !== S.READY) return;
  coins = Math.max(0, coins - 1);
  document.getElementById('coins').textContent = coins;
  sfx.drop();
  setProngOpen(1);
  setState(S.DOWN);
}

function showBanner(text, miss = false) {
  bannerEl.textContent = text;
  bannerEl.className = 'hud show' + (miss ? ' miss' : '');
  setTimeout(() => bannerEl.classList.remove('show'), 1800);
}

function onPrize(d) {
  prizes++;
  document.getElementById('prizes').textContent = prizes;
  document.getElementById('left').textContent = dolls.filter(x => !x.gone).length;
  showBanner('GET!! 🎉');
  sfx.win();
}

function endPlay(won) {
  if (!won) { showBanner('可惜了…', true); }
  claw.held = null;
  setProngOpen(1);
  setState(coins > 0 ? S.READY : S.IDLE);
}

/* ============================================================
   输入
============================================================ */
const keys = {};
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyC') insertCoin();
  if (e.code === 'Space') startDrop();
});
addEventListener('keyup', e => keys[e.code] = false);
document.getElementById('coin-btn').addEventListener('click', insertCoin);

// 鼠标：拖拽水平环视（限幅）+ 轻微视差
let mx = 0, my = 0;
let yaw = 0, targetYaw = 0, dragging = false, lastX = 0, downX = 0, downY = 0;
const CAM_LOOK = new THREE.Vector3(0, 1.6, 0);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', e => {
  dragging = true; lastX = e.clientX; downX = e.clientX; downY = e.clientY;
  renderer.domElement.style.cursor = 'grabbing';
});
addEventListener('pointerup', e => {
  dragging = false;
  renderer.domElement.style.cursor = 'grab';
  // 原地点击（非拖拽）命中投币口 → 投币
  if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
    const ndc = new THREE.Vector2(
      (e.clientX / innerWidth) * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObjects([slotPlate, slotHole, slotLamp]).length) insertCoin();
  }
});
addEventListener('mousemove', e => {
  if (dragging) {
    targetYaw = THREE.MathUtils.clamp(targetYaw - (e.clientX - lastX) * 0.0035, -0.6, 0.6);
    lastX = e.clientX;
  }
  mx = (e.clientX / innerWidth - .5);
  my = (e.clientY / innerHeight - .5);
});

/* ============================================================
   主循环
============================================================ */
const clock = new THREE.Clock();
let moveSfxT = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.033);
  stateT += dt;

  /* ---- 小车控制（带惯性，"重"手感）---- */
  if (state === S.READY) {
    const ax = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const az = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    claw.vx += ax * 9 * dt;
    claw.vz += az * 9 * dt;
    if ((ax || az) && (moveSfxT -= dt) <= 0) { sfx.move(); moveSfxT = 0.12; }
    timeLeft -= dt;
    timerEl.textContent = `剩余 ${Math.ceil(timeLeft)} 秒`;
    if (timeLeft <= 0) startDrop();
  }
  if (state === S.RETURN) {
    // 自动驶向出货口
    const tx = CHUTE.x, tz = CHUTE.z;
    claw.vx += THREE.MathUtils.clamp((tx - claw.x) * 6, -3, 3) * dt * 3;
    claw.vz += THREE.MathUtils.clamp((tz - claw.z) * 6, -3, 3) * dt * 3;
  }
  // 阻尼 + 限位（机械感：撞到轨道尽头会顿一下）
  claw.vx *= Math.pow(0.0015, dt);
  claw.vz *= Math.pow(0.0015, dt);
  claw.x = THREE.MathUtils.clamp(claw.x + claw.vx * dt, -BOUND.x + 0.2, BOUND.x - 0.2);
  claw.z = THREE.MathUtils.clamp(claw.z + claw.vz * dt, -BOUND.z + 0.2, BOUND.z - 0.2);
  if (Math.abs(claw.x) >= BOUND.x - 0.21) claw.vx = 0;
  if (Math.abs(claw.z) >= BOUND.z - 0.21) claw.vz = 0;

  /* ---- 缆绳长度 / 状态推进 ---- */
  let targetY = HEAD_Y_TOP;
  if (state === S.DOWN) {
    targetY = HEAD_Y_BOTTOM;
    if (claw.headPos.y <= HEAD_Y_BOTTOM + 0.03) { setState(S.GRAB); setProngOpen(0); sfx.clack(); }
  } else if (state === S.GRAB) {
    targetY = HEAD_Y_BOTTOM;
    if (stateT > 0.8) { tryGrab(); setState(S.UP); }
  } else if (state === S.UP) {
    targetY = HEAD_Y_TOP;
    if (claw.headPos.y >= HEAD_Y_TOP - 0.05) setState(S.RETURN);
  } else if (state === S.RETURN) {
    targetY = HEAD_Y_TOP;
    if (Math.hypot(claw.x - CHUTE.x, claw.z - CHUTE.z) < 0.12 && stateT > 0.5) {
      setState(S.RELEASE);
      setProngOpen(1);
      sfx.clack();
    }
  } else if (state === S.RELEASE) {
    targetY = HEAD_Y_TOP;
    if (stateT === dt && claw.held) releaseHeld(true);   // 第一帧松爪
    if (stateT > 0.9) endPlay(claw.held === 'won');
  }

  /* ---- 爪头弹簧摆（水平）+ 电机匀速收放缆（垂直）---- */
  const stiff = 26, damp = 5.2;
  claw.headVel.x += ((claw.x - claw.headPos.x) * stiff - claw.headVel.x * damp) * dt;
  claw.headVel.z += ((claw.z - claw.headPos.z) * stiff - claw.headVel.z * damp) * dt;
  claw.headPos.x += claw.headVel.x * dt;
  claw.headPos.z += claw.headVel.z * dt;
  // 垂直方向：收缆电机匀速，到点即停（真实机台手感）
  const dy = targetY - claw.headPos.y;
  const spd = dy < 0 ? DOWN_SPEED : UP_SPEED;
  claw.headPos.y += THREE.MathUtils.clamp(dy, -spd * dt, spd * dt);

  // 爪头与娃娃的接触碰撞（只有真实接触才推开，不再"隔空推人"）
  if (state === S.DOWN || state === S.GRAB) {
    for (const d of dolls) {
      if (d.gone || d.held) continue;
      const dx = d.pos.x - claw.headPos.x, dz = d.pos.z - claw.headPos.z;
      const dist = Math.hypot(dx, dz);
      const contactR = 0.3 + d.r;
      if (dist < contactR && Math.abs(claw.headPos.y - d.pos.y) < 0.6) {
        const overlap = contactR - dist;
        if (dist > 0.01) {
          d.vel.x += dx / dist * overlap * 5 * dt;
          d.vel.z += dz / dist * overlap * 5 * dt;
        }
      }
    }
  }

  /* ---- 爪子开合动画（双关节联动：肩外张 + 肘内勾）---- */
  claw.prongOpen += (claw.prongOpenTarget - claw.prongOpen) * Math.min(1, dt * 6);
  const po = claw.prongOpen;
  prongs.forEach(p => {
    p.seg1.rotation.z = THREE.MathUtils.lerp(0.15, 0.95, po);    // 肩：闭合→张开
    p.seg2.rotation.z = THREE.MathUtils.lerp(-1.25, -0.5, po);   // 肘：内勾→伸直
  });

  /* ---- 摇杆随爪子移动同步倾斜 ---- */
  const tiltX = THREE.MathUtils.clamp(claw.vz * 0.28, -0.35, 0.35);
  const tiltZ = THREE.MathUtils.clamp(-claw.vx * 0.28, -0.35, 0.35);
  stick.rotation.x += (tiltX - stick.rotation.x) * Math.min(1, dt * 10);
  stick.rotation.z += (tiltZ - stick.rotation.z) * Math.min(1, dt * 10);

  /* ---- 投币指示灯闪烁 ---- */
  if (slotFlash > 0) {
    slotFlash -= dt;
    slotLampMat.emissiveIntensity = 2.5 + Math.sin(slotFlash * 35) * 1.5;
  } else {
    slotLampMat.emissiveIntensity = 0.6;
  }

  /* ---- 同步网格 ---- */
  carriage.position.set(claw.x, 4.35, claw.z);
  clawHead.position.copy(claw.headPos);
  // 爪头随摆动倾斜
  clawHead.rotation.z = THREE.MathUtils.clamp(-claw.headVel.x * 0.12, -0.3, 0.3);
  clawHead.rotation.x = THREE.MathUtils.clamp(claw.headVel.z * 0.12, -0.3, 0.3);
  // 缆绳
  const top = new THREE.Vector3(claw.x, 4.28, claw.z);
  const mid = top.clone().add(claw.headPos).multiplyScalar(0.5);
  cable.position.copy(mid);
  const len = top.distanceTo(claw.headPos);
  cable.scale.set(1, len, 1);
  cable.lookAt(claw.headPos);
  cable.rotateX(Math.PI / 2);

  /* ---- 被抓娃娃跟随 + 滑脱 ---- */
  if (claw.held && claw.held !== 'won') {
    const d = claw.held;
    claw.age += dt;
    // 跟随点：爪尖下方，随滑脱进度逐渐下垂
    const slip01 = THREE.MathUtils.clamp(claw.age / claw.slipAt, 0, 1);
    const droop = slip01 * 0.35;
    const jiggle = Math.sin(claw.age * 22) * 0.02 * (0.3 + slip01);
    d.pos.set(
      claw.headPos.x + jiggle,
      Math.max(claw.headPos.y - 0.45 - d.r - droop, FLOOR_Y + d.r),
      claw.headPos.z + Math.cos(claw.age * 19) * 0.015
    );
    d.mesh.rotation.z = jiggle * 4;
    d.vel.set(0, 0, 0);
    if (claw.age >= claw.slipAt && state !== S.RELEASE) {
      releaseHeld(false);
      sfx.slip();
    }
  }

  physics(dt);

  // 相机：拖拽水平环视 + 轻微视差
  yaw += (targetYaw - yaw) * Math.min(1, dt * 6);
  const camOff = CAM_BASE.clone().sub(CAM_LOOK);
  camOff.applyAxisAngle(UP_AXIS, yaw + mx * 0.06);
  camera.position.set(
    CAM_LOOK.x + camOff.x,
    CAM_BASE.y - my * 0.5,
    CAM_LOOK.z + camOff.z
  );
  camera.lookAt(CAM_LOOK);

  renderer.render(scene, camera);
}

/* ---- 抓取判定：对中程度 + 娃娃重量 决定握力 ---- */
function tryGrab() {
  let best = null, bestDist = mode.grabR;
  for (const d of dolls) {
    if (d.gone || d.held) continue;
    const dist = Math.hypot(d.pos.x - claw.headPos.x, d.pos.z - claw.headPos.z);
    if (dist < bestDist && d.pos.y < 1.2) { best = d; bestDist = dist; }
  }
  if (!best) return;
  const center01 = 1 - bestDist / mode.grabR;           // 越正越好抓
  const gripQuality = center01 / best.weight;           // 大娃娃更难
  if (Math.random() < Math.min(mode.baseP + gripQuality * mode.pScale, 0.99)) {
    best.held = true;
    claw.held = best;
    claw.age = 0;
    // 握力越好，能挂越久；差的会在上升/运送途中滑落（简单模式不滑脱）
    claw.slipAt = mode.slip(gripQuality);
    claw.grip = gripQuality;
  }
}

function releaseHeld(overChute) {
  const d = claw.held;
  if (!d || d === 'won') return;
  d.held = false;
  d.vel.set(claw.headVel.x * 0.5, 0, claw.headVel.z * 0.5);
  d.mesh.rotation.z = 0;
  claw.held = overChute ? 'won' : null;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setState(S.IDLE);
tick();
