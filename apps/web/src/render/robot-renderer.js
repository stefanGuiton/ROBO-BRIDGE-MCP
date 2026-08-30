import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { forwardKinematics } from '../robot/kinematics.js';
import { CHALLENGE_LAYOUT, UR10_DEFINITION } from '../robot/ur10-definition.js';
import { RealGripperVisual, THREE } from './real-gripper-visual.js';

const BRICK_COLOURS = {
  white: 0xf3f5f8, black: 0x151b25, red: 0xef4b4f,
  blue: 0x3b78ff, yellow: 0xffd447, green: 0x49c47a
};

function physicalMaterial(options) {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.36,
    metalness: 0.65,
    clearcoat: 0.12,
    clearcoatRoughness: 0.28,
    ...options
  });
}

function makeBox(size, centre, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.xMm, size.yMm, size.zMm), material);
  mesh.position.set(centre.xMm, centre.yMm, centre.zMm);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function setSegment(mesh, start, end) {
  const a = new THREE.Vector3(start.xMm, start.yMm, start.zMm);
  const b = new THREE.Vector3(end.xMm, end.yMm, end.zMm);
  const direction = b.clone().sub(a);
  const length = Math.max(0.001, direction.length());
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

export class RobotRenderer {
  constructor(canvas, controller, { board = null } = {}) {
    this.canvas = canvas;
    this.controller = controller;
    this.board = board;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8eef5);
    this.scene.fog = new THREE.FogExp2(0xe8eef5, 0.00042);
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.08;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 5000);
    this.camera.up.set(0, 0, 1);
    this.focus = new THREE.Vector3(420, 0, 170);
    this.yaw = -0.82;
    this.pitch = 0.47;
    this.radius = 1450;
    this.running = false;
    this.lastFrame = 0;
    this.fps = 0;
    this.frameTimes = [];
    this.drag = null;
    this.brickMeshes = new Map();
    this.targetMeshes = new Map();
    this.buildLighting();
    this.buildWorkcell();
    this.buildRobot();
    this.gripper = new RealGripperVisual(this.scene);
    this.installCameraControls();
    this.setView('hero');
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xb9dcff, 0x071019, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(450, -650, 1100);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -900;
    key.shadow.camera.right = 900;
    key.shadow.camera.top = 900;
    key.shadow.camera.bottom = -900;
    key.shadow.camera.near = 100;
    key.shadow.camera.far = 2400;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x74d7ff, 1.6);
    fill.position.set(-350, 700, 550);
    this.scene.add(fill);
    const rim = new THREE.PointLight(0xffb34f, 130000, 1700, 2);
    rim.position.set(800, 300, 650);
    this.scene.add(rim);
  }

  buildWorkcell() {
    const tableMaterial = physicalMaterial({ color: 0xdfe7ef, roughness: 0.72, metalness: 0.08 });
    this.scene.add(makeBox(
      { xMm: 1100, yMm: 900, zMm: 50 },
      { xMm: 380, yMm: 0, zMm: -25 },
      tableMaterial
    ));
    const grid = new THREE.GridHelper(1000, 20, 0xa9bac9, 0xcbd6e0);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(380, 0, 0.5);
    grid.material.opacity = 0.32;
    grid.material.transparent = true;
    this.scene.add(grid);

    const tray = CHALLENGE_LAYOUT.tray;
    const trayMaterial = physicalMaterial({ color: 0x405768, metalness: 0.45, roughness: 0.42 });
    this.scene.add(makeBox(
      { xMm: tray.maxX - tray.minX, yMm: tray.maxY - tray.minY, zMm: tray.floorZ },
      { xMm: (tray.minX + tray.maxX) / 2, yMm: (tray.minY + tray.maxY) / 2, zMm: tray.floorZ / 2 },
      trayMaterial
    ));
    const wallThickness = 6;
    const wallZ = tray.floorZ + tray.wallHeight / 2;
    for (const spec of [
      [{ xMm: wallThickness, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, { xMm: tray.minX, yMm: (tray.minY + tray.maxY) / 2, zMm: wallZ }],
      [{ xMm: wallThickness, yMm: tray.maxY - tray.minY, zMm: tray.wallHeight }, { xMm: tray.maxX, yMm: (tray.minY + tray.maxY) / 2, zMm: wallZ }],
      [{ xMm: tray.maxX - tray.minX, yMm: wallThickness, zMm: tray.wallHeight }, { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.minY, zMm: wallZ }],
      [{ xMm: tray.maxX - tray.minX, yMm: wallThickness, zMm: tray.wallHeight }, { xMm: (tray.minX + tray.maxX) / 2, yMm: tray.maxY, zMm: wallZ }]
    ]) this.scene.add(makeBox(spec[0], spec[1], trayMaterial));

    const board = CHALLENGE_LAYOUT.board;
    this.scene.add(makeBox(
      { xMm: board.maxX - board.minX, yMm: board.maxY - board.minY, zMm: board.surfaceZ },
      { xMm: (board.minX + board.maxX) / 2, yMm: (board.minY + board.maxY) / 2, zMm: board.surfaceZ / 2 },
      physicalMaterial({ color: 0xc8d1d8, metalness: 0.18, roughness: 0.48 })
    ));
  }

  buildRobot() {
    this.robotGroup = new THREE.Group();
    this.scene.add(this.robotGroup);
    const aluminium = physicalMaterial({ color: 0xb5b5b5, metalness: 0.82, roughness: 0.34, clearcoat: 0 });
    const blue = physicalMaterial({ color: 0xa8c3d1, metalness: 0, roughness: 0.34, clearcoat: 0.18 });
    const dark = physicalMaterial({ color: 0x505050, metalness: 0, roughness: 0.82, clearcoat: 0 });
    this.robotGroup.add(makeBox({ xMm: 165, yMm: 165, zMm: 90 }, { xMm: 0, yMm: 0, zMm: 45 }, dark));
    this.linkMeshes = [];
    const radii = [33, 39, 36, 29, 26, 24];
    for (let index = 0; index < 6; index += 1) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radii[index], radii[index], 1, 28), index % 2 ? aluminium : blue);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.robotGroup.add(mesh);
      this.linkMeshes.push(mesh);
    }
    this.jointMeshes = [];
    for (let index = 0; index < 7; index += 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(index === 0 ? 42 : 34, 28, 18), index % 2 ? dark : blue);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.robotGroup.add(mesh);
      this.jointMeshes.push(mesh);
    }
    this.tcpMarker = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    this.scene.add(this.tcpMarker);
    this.tcpRing = new THREE.Mesh(new THREE.TorusGeometry(15, 1.4, 8, 32), new THREE.MeshBasicMaterial({ color: 0x59e1ff }));
    this.tcpRing.rotation.x = Math.PI / 2;
    this.scene.add(this.tcpRing);
  }

  syncTargets() {
    const targets = this.board?.getTargets?.() ?? [];
    const seen = new Set();
    for (const target of targets) {
      seen.add(target.id);
      let mesh = this.targetMeshes.get(target.id);
      if (!mesh) {
        const colour = BRICK_COLOURS[target.colour] ?? BRICK_COLOURS.white;
        mesh = makeBox(
          { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm },
          target.position,
          new THREE.MeshStandardMaterial({ color: colour, transparent: true, opacity: 0.22, depthWrite: false })
        );
        this.scene.add(mesh);
        this.targetMeshes.set(target.id, mesh);
      }
      mesh.visible = !target.occupiedBy;
      mesh.position.set(target.position.xMm, target.position.yMm, target.position.zMm);
      mesh.rotation.z = target.yawRad ?? 0;
    }
    for (const [id, mesh] of this.targetMeshes) {
      if (!seen.has(id)) { this.scene.remove(mesh); this.targetMeshes.delete(id); }
    }
  }

  syncBricks() {
    const bricks = this.controller.getBricks();
    const seen = new Set();
    for (const brick of bricks) {
      seen.add(brick.id);
      let mesh = this.brickMeshes.get(brick.id);
      if (!mesh) {
        const body = makeBox(
          { xMm: BRICK_SPEC.lengthMm, yMm: BRICK_SPEC.widthMm, zMm: BRICK_SPEC.bodyHeightMm },
          brick.position,
          new THREE.MeshPhysicalMaterial({ color: BRICK_COLOURS[brick.colour] ?? BRICK_COLOURS.white, roughness: 0.38, metalness: 0, clearcoat: 0.25 })
        );
        body.name = `BRICK_${brick.id}`;
        this.scene.add(body);
        mesh = body;
        this.brickMeshes.set(brick.id, mesh);
      }
      mesh.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
      mesh.rotation.z = brick.yawRad ?? 0;
    }
    for (const [id, mesh] of this.brickMeshes) {
      if (!seen.has(id)) { this.scene.remove(mesh); this.brickMeshes.delete(id); }
    }
  }

  updateRobot() {
    const state = this.controller.getState();
    const fk = forwardKinematics(state.jointsRad, UR10_DEFINITION);
    if (!fk.ok) return;
    for (let index = 0; index < this.linkMeshes.length; index += 1) setSegment(this.linkMeshes[index], fk.jointPositions[index], fk.jointPositions[index + 1]);
    for (let index = 0; index < this.jointMeshes.length; index += 1) this.jointMeshes[index].position.set(fk.jointPositions[index].xMm, fk.jointPositions[index].yMm, fk.jointPositions[index].zMm);
    this.tcpMarker.position.set(fk.tcp.xMm, fk.tcp.yMm, fk.tcp.zMm);
    this.tcpRing.position.copy(this.tcpMarker.position);
    this.gripper.update(fk.frames[6], state.gripper.jawGapMm);
  }

  setView(view) {
    const presets = {
      hero: { focus: [390, 0, 170], yaw: -0.82, pitch: 0.48, radius: 1450 },
      top: { focus: [590, 0, 90], yaw: -0.72, pitch: 1.25, radius: 1180 },
      tray: { focus: [535, -220, 95], yaw: -0.82, pitch: 0.58, radius: 760 },
      latch: { focus: [520, -230, 70], yaw: -0.92, pitch: 0.42, radius: 430 },
      target: { focus: [635, 205, 90], yaw: -1.02, pitch: 0.52, radius: 720 }
    };
    const preset = presets[view] ?? presets.hero;
    this.focus.set(...preset.focus);
    this.yaw = preset.yaw;
    this.pitch = preset.pitch;
    this.radius = preset.radius;
    this.updateCamera();
    this.render();
  }

  updateCamera() {
    const horizontal = this.radius * Math.cos(this.pitch);
    this.camera.position.set(
      this.focus.x + horizontal * Math.cos(this.yaw),
      this.focus.y + horizontal * Math.sin(this.yaw),
      this.focus.z + this.radius * Math.sin(this.pitch)
    );
    this.camera.lookAt(this.focus);
  }

  installCameraControls() {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch, focus: this.focus.clone(), mode: event.button === 0 ? 'orbit' : 'pan' };
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (this.drag.mode === 'orbit') {
        this.yaw = this.drag.yaw - dx * 0.006;
        this.pitch = Math.max(0.12, Math.min(1.42, this.drag.pitch + dy * 0.004));
      } else {
        const scale = this.radius / 850;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.focus.copy(this.drag.focus).addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      }
      this.updateCamera();
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
      this.radius = Math.max(250, Math.min(2600, this.radius * (event.deltaY > 0 ? 1.08 : 0.92)));
      this.updateCamera();
      this.render();
    }, { passive: false });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.webgl.setPixelRatio(pixelRatio);
    if (this.canvas.width !== Math.round(width * pixelRatio) || this.canvas.height !== Math.round(height * pixelRatio)) this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.resize();
    this.syncTargets();
    this.syncBricks();
    this.updateRobot();
    this.webgl.render(this.scene, this.camera);
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

  stop() { this.running = false; }

  getPerformance() {
    const times = [...this.frameTimes].sort((a, b) => a - b);
    return {
      fps: this.fps,
      meanFrameMs: times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : 0,
      p95FrameMs: times.length ? times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] : 0,
      maxFrameMs: times.at(-1) ?? 0,
      gripper: this.gripper.getStatus()
    };
  }
}
