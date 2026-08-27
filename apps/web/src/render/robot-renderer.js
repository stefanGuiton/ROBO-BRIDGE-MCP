import { forwardKinematics } from '../robot/kinematics.js';
import { CHALLENGE_LAYOUT, UR10_DEFINITION } from '../robot/ur10-definition.js';
import { BRICK_SPEC } from '../bricks/brick-spec.js';

const TAU = Math.PI * 2;

const BRICK_COLOURS = {
  white: '#f3f5f8',
  black: '#151b25',
  red: '#ef4b4f',
  blue: '#3b78ff',
  yellow: '#ffd447',
  green: '#49c47a'
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const n = Number.parseInt(value, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbStringToRgb(value) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return hexToRgb('#7ed7ff');
  const channels = match[1].split(',').map((channel) => Number.parseFloat(channel.trim()));
  return { r: channels[0] || 0, g: channels[1] || 0, b: channels[2] || 0 };
}

function colourToRgb(value) {
  return value.startsWith('#') ? hexToRgb(value) : rgbStringToRgb(value);
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return `rgb(${clamp(r + amount)}, ${clamp(g + amount)}, ${clamp(b + amount)})`;
}

function rgba(value, alpha) {
  const { r, g, b } = colourToRgb(value);
  return `rgba(${r},${g},${b},${alpha})`;
}

class Camera {
  constructor() {
    this.focus = { xMm: 420, yMm: 0, zMm: 170 };
    this.yaw = -0.78;
    this.pitch = 0.56;
    this.scale = 0.82;
    this.offsetX = 0;
    this.offsetY = 30;
  }

  setPreset(name) {
    const presets = {
      hero: { focus: { xMm: 390, yMm: 0, zMm: 170 }, yaw: -0.76, pitch: 0.53, scale: 0.82, offsetX: 20, offsetY: 35 },
      top: { focus: { xMm: 590, yMm: 0, zMm: 100 }, yaw: -0.65, pitch: 1.03, scale: 0.94, offsetX: 0, offsetY: 20 },
      tray: { focus: { xMm: 535, yMm: -210, zMm: 95 }, yaw: -0.62, pitch: 0.78, scale: 1.24, offsetX: 75, offsetY: 70 },
      latch: { focus: { xMm: 520, yMm: -230, zMm: 62 }, yaw: -0.72, pitch: 0.52, scale: 1.68, offsetX: 70, offsetY: 80 },
      target: { focus: { xMm: 630, yMm: 170, zMm: 105 }, yaw: -0.82, pitch: 0.62, scale: 1.10, offsetX: -20, offsetY: 60 }
    };
    Object.assign(this, presets[name] ?? presets.hero);
  }

  project(point, width, height) {
    const x = point.xMm - this.focus.xMm;
    const y = point.yMm - this.focus.yMm;
    const z = point.zMm - this.focus.zMm;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const x1 = cy * x - sy * y;
    const y1 = sy * x + cy * y;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const y2 = cp * y1 + sp * z;
    const z2 = -sp * y1 + cp * z;
    return {
      x: width / 2 + this.offsetX + x1 * this.scale,
      y: height / 2 + this.offsetY - y2 * this.scale,
      depth: z2
    };
  }
}

function polygon(ctx, points, fill, stroke = null, width = 1) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function draw3dBox(ctx, camera, width, height, center, size, colour, options = {}) {
  const hx = size.xMm / 2;
  const hy = size.yMm / 2;
  const hz = size.zMm / 2;
  const points = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]
  ].map(([x, y, z]) => camera.project({ xMm: center.xMm + x, yMm: center.yMm + y, zMm: center.zMm + z }, width, height));
  const faces = [
    { ids: [0, 1, 5, 4], c: shade(colour, -28) },
    { ids: [1, 2, 6, 5], c: shade(colour, -12) },
    { ids: [2, 3, 7, 6], c: shade(colour, -20) },
    { ids: [3, 0, 4, 7], c: shade(colour, -36) },
    { ids: [4, 5, 6, 7], c: shade(colour, 18) }
  ].map((face) => ({ ...face, depth: face.ids.reduce((sum, index) => sum + points[index].depth, 0) / face.ids.length }));
  faces.sort((a, b) => a.depth - b.depth);
  for (const face of faces) {
    polygon(ctx, face.ids.map((index) => points[index]), options.alpha ? rgba(face.c, options.alpha) : face.c, options.stroke ?? 'rgba(0,0,0,.35)', 1);
  }
}

function drawBrick(ctx, camera, width, height, brick, ghost = false) {
  const colour = BRICK_COLOURS[brick.colour] ?? BRICK_COLOURS.white;
  draw3dBox(ctx, camera, width, height, brick.position, {
    xMm: BRICK_SPEC.lengthMm,
    yMm: BRICK_SPEC.widthMm,
    zMm: BRICK_SPEC.bodyHeightMm
  }, ghost ? '#7ed7ff' : colour, {
    alpha: ghost ? 0.22 : null,
    stroke: ghost ? 'rgba(114,221,255,.8)' : 'rgba(0,0,0,.35)'
  });
  if (ghost) return;
  const topZ = brick.position.zMm + BRICK_SPEC.bodyHeightMm / 2 + BRICK_SPEC.studHeightMm;
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iy = 0; iy < 2; iy += 1) {
      const point = camera.project({
        xMm: brick.position.xMm + (ix - 1.5) * BRICK_SPEC.studPitchMm,
        yMm: brick.position.yMm + (iy - 0.5) * BRICK_SPEC.studPitchMm,
        zMm: topZ
      }, width, height);
      const radius = Math.max(1.5, 2.25 * camera.scale);
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, radius, radius * 0.55, 0, 0, TAU);
      ctx.fillStyle = shade(colour, 30);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

function drawSegment(ctx, p1, p2, widthPx, body, outline = '#1b2532') {
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = widthPx + 8;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.strokeStyle = body;
  ctx.lineWidth = widthPx;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = Math.max(2, widthPx * 0.15);
  ctx.beginPath();
  ctx.moveTo(p1.x - 2, p1.y - 2);
  ctx.lineTo(p2.x - 2, p2.y - 2);
  ctx.stroke();
}

function drawJoint(ctx, point, radius, accent = true) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius + 5, 0, TAU);
  ctx.fillStyle = '#172231';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, TAU);
  const gradient = ctx.createRadialGradient(point.x - radius * 0.4, point.y - radius * 0.5, 2, point.x, point.y, radius);
  gradient.addColorStop(0, '#edf4f7');
  gradient.addColorStop(0.58, '#aebac2');
  gradient.addColorStop(1, '#5d6b75');
  ctx.fillStyle = gradient;
  ctx.fill();
  if (accent) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.46, 0, TAU);
    ctx.fillStyle = '#39bcd8';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.29, 0, TAU);
    ctx.fillStyle = '#172231';
    ctx.fill();
  }
}

export class RobotRenderer {
  constructor(canvas, controller, { board = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.controller = controller;
    this.board = board;
    this.camera = new Camera();
    this.camera.setPreset('hero');
    this.running = false;
    this.lastFrame = 0;
    this.fps = 0;
    this.frameTimes = [];
    this.drag = null;
    this.installCameraControls();
  }

  installCameraControls() {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.drag = { x: event.clientX, y: event.clientY, yaw: this.camera.yaw, pitch: this.camera.pitch };
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      this.camera.yaw = this.drag.yaw + (event.clientX - this.drag.x) * 0.006;
      this.camera.pitch = Math.max(0.18, Math.min(1.35, this.drag.pitch + (event.clientY - this.drag.y) * 0.004));
      this.render();
    });
    const end = (event) => {
      if (!this.drag) return;
      this.drag = null;
      this.canvas.releasePointerCapture?.(event.pointerId);
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.camera.scale = Math.max(0.45, Math.min(2.2, this.camera.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
      this.render();
    }, { passive: false });
  }

  setView(view) {
    this.camera.setPreset(view);
    this.render();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  drawGrid(width, height) {
    const { ctx, camera } = this;
    ctx.fillStyle = '#071019';
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.52, height * 0.52, 40, width * 0.52, height * 0.52, width * 0.62);
    glow.addColorStop(0, 'rgba(32,58,76,.55)');
    glow.addColorStop(1, 'rgba(3,8,13,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const table = [
      { xMm: -120, yMm: -480, zMm: 0 }, { xMm: 860, yMm: -480, zMm: 0 },
      { xMm: 860, yMm: 480, zMm: 0 }, { xMm: -120, yMm: 480, zMm: 0 }
    ].map((point) => camera.project(point, width, height));
    polygon(ctx, table, '#101b25', '#293947', 1.5);

    ctx.strokeStyle = 'rgba(100,160,188,.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 800; x += 80) {
      const a = camera.project({ xMm: x, yMm: -430, zMm: 1 }, width, height);
      const b = camera.project({ xMm: x, yMm: 430, zMm: 1 }, width, height);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let y = -400; y <= 400; y += 80) {
      const a = camera.project({ xMm: 0, yMm: y, zMm: 1 }, width, height);
      const b = camera.project({ xMm: 820, yMm: y, zMm: 1 }, width, height);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  drawWorkcell(width, height) {
    const { ctx, camera } = this;
    const tray = CHALLENGE_LAYOUT.tray;
    draw3dBox(ctx, camera, width, height, {
      xMm: (tray.minX + tray.maxX) / 2,
      yMm: (tray.minY + tray.maxY) / 2,
      zMm: tray.floorZ / 2
    }, { xMm: tray.maxX - tray.minX, yMm: tray.maxY - tray.minY, zMm: tray.floorZ }, '#374958');
    const wallHeight = tray.wallHeight;
    const wallThickness = 6;
    draw3dBox(ctx, camera, width, height, { xMm: tray.minX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + wallHeight / 2 }, { xMm: wallThickness, yMm: tray.maxY - tray.minY, zMm: wallHeight }, '#486172');
    draw3dBox(ctx, camera, width, height, { xMm: tray.maxX, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ + wallHeight / 2 }, { xMm: wallThickness, yMm: tray.maxY - tray.minY, zMm: wallHeight }, '#486172');
    draw3dBox(ctx, camera, width, height, { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.minY, zMm: tray.floorZ + wallHeight / 2 }, { xMm: tray.maxX - tray.minX, yMm: wallThickness, zMm: wallHeight }, '#486172');
    draw3dBox(ctx, camera, width, height, { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.maxY, zMm: tray.floorZ + wallHeight / 2 }, { xMm: tray.maxX - tray.minX, yMm: wallThickness, zMm: wallHeight }, '#486172');

    const board = CHALLENGE_LAYOUT.board;
    draw3dBox(ctx, camera, width, height, {
      xMm: (board.minX + board.maxX) / 2,
      yMm: (board.minY + board.maxY) / 2,
      zMm: board.surfaceZ / 2
    }, { xMm: board.maxX - board.minX, yMm: board.maxY - board.minY, zMm: board.surfaceZ }, '#c8d1d8');
    for (const target of this.board?.getTargets?.() ?? []) {
      if (!target.occupiedBy) drawBrick(ctx, camera, width, height, { colour: target.colour ?? 'white', position: target.position }, true);
    }

    for (const brick of this.controller.getBricks()) drawBrick(ctx, camera, width, height, brick, false);
  }

  drawRobot(width, height) {
    const state = this.controller.getState();
    const fk = forwardKinematics(state.jointsRad, UR10_DEFINITION);
    if (!fk.ok) return;
    const { ctx, camera } = this;
    draw3dBox(ctx, camera, width, height, { xMm: 0, yMm: 0, zMm: 45 }, { xMm: 145, yMm: 145, zMm: 90 }, '#73818a');
    const points = fk.jointPositions.map((point) => camera.project(point, width, height));
    const flange = camera.project(fk.flange, width, height);
    const tcp = camera.project(fk.tcp, width, height);
    const linkPairs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]];
    const widths = [42, 50, 47, 38, 34, 31];
    for (let index = 0; index < linkPairs.length; index += 1) {
      const [a, b] = linkPairs[index];
      drawSegment(ctx, points[a], points[b], Math.max(13, widths[index] * camera.scale), '#c8d1d5');
    }
    for (let index = 1; index < points.length; index += 1) drawJoint(ctx, points[index], Math.max(8, 16 * camera.scale), index < 6);
    drawSegment(ctx, flange, tcp, Math.max(8, 14 * camera.scale), '#384957', '#111820');
    ctx.beginPath();
    ctx.ellipse(tcp.x, tcp.y, Math.max(6, 11 * camera.scale), Math.max(3, 5 * camera.scale), 0, 0, TAU);
    ctx.fillStyle = '#efb23d';
    ctx.fill();
    ctx.strokeStyle = '#161c22';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(89,225,255,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tcp.x, tcp.y, Math.max(8, 12 * camera.scale), 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tcp.x - 18, tcp.y);
    ctx.lineTo(tcp.x + 18, tcp.y);
    ctx.moveTo(tcp.x, tcp.y - 18);
    ctx.lineTo(tcp.x, tcp.y + 18);
    ctx.stroke();
  }

  drawLabels(width, height) {
    const { ctx, camera } = this;
    const tray = camera.project({ xMm: 520, yMm: -230, zMm: 52 }, width, height);
    const target = camera.project({ xMm: 655, yMm: 220, zMm: 45 }, width, height);
    ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    for (const [point, label] of [[tray, 'PICK TRAY'], [target, 'BUILD TARGET']]) {
      ctx.fillStyle = 'rgba(6,14,21,.85)';
      const measurement = ctx.measureText(label).width;
      ctx.fillRect(point.x - measurement / 2 - 8, point.y - 13, measurement + 16, 20);
      ctx.fillStyle = '#90dcee';
      ctx.fillText(label, point.x, point.y + 2);
    }
  }

  render() {
    const { width, height } = this.resize();
    this.drawGrid(width, height);
    this.drawWorkcell(width, height);
    this.drawRobot(width, height);
    this.drawLabels(width, height);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = (now) => {
      if (!this.running) return;
      if (this.lastFrame) {
        const delta = now - this.lastFrame;
        this.frameTimes.push(delta);
        if (this.frameTimes.length > 120) this.frameTimes.shift();
        const average = this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length;
        this.fps = 1000 / average;
      }
      this.lastFrame = now;
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
  }

  getPerformance() {
    const times = [...this.frameTimes].sort((a, b) => a - b);
    return {
      fps: this.fps,
      meanFrameMs: times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : 0,
      p95FrameMs: times.length ? times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] : 0,
      maxFrameMs: times.at(-1) ?? 0
    };
  }
}
