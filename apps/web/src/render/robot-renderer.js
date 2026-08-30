import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { forwardKinematics } from '../robot/kinematics.js';
import { CHALLENGE_LAYOUT, UR10_DEFINITION } from '../robot/ur10-definition.js';
import { RealGripperVisual, THREE } from './real-gripper-visual.js';
import { Ur10Visual } from './ur10-visual.js';
import { ColorGrader } from '../player/color-grading.js';
import { HeldBrickController } from '../player/held-brick-controller.js';
import { fixedStepAdvance } from '../player/math.js';
import { PlacedBrickBatcher } from '../player/placed-brick-batcher.js';
import { PlayerCapsuleSolver } from '../player/player-collision.js';
import { PlayerController } from '../player/player-controller.js';

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

export class RobotRenderer {
  constructor(canvas, controller, { board = null, playerSettings = null, humanBuildAdapter = null } = {}) {
    this.canvas = canvas;
    this.controller = controller;
    this.board = board;
    this.playerSettings = playerSettings;
    this.humanBuildAdapter = humanBuildAdapter;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8eef5);
    this.scene.fog = null;
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.02;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(48, 1, 1, 2600);
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
    this.highlightedBrickId = null;
    this.lastPreviewSignature = '';
    this.lastBatchSignature = '';
    this.physicsAccumulator = 0;
    this.physicsStepSeconds = 1 / Math.max(30, playerSettings?.physicsHz ?? 240);
    this.maximumSubsteps = Math.max(1, playerSettings?.maximumSubsteps ?? 8);
    this.buildLighting();
    this.buildWorkcell();
    this.buildRobot();
    this.gripper = new RealGripperVisual(this.scene);
    this.batcher = new PlacedBrickBatcher(this.scene, playerSettings ?? {});
    if (playerSettings && humanBuildAdapter) this.installPlayerRuntime();
    this.installCameraControls();
    if (this.player) this.setPlayerMode(true);
    else this.setView('hero');
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c0cc, 1.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(145, -270, 380);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -760;
    key.shadow.camera.right = 760;
    key.shadow.camera.top = 620;
    key.shadow.camera.bottom = -620;
    key.shadow.camera.near = 20;
    key.shadow.camera.far = 1600;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9dcff, 0.85);
    fill.position.set(705, 240, 220);
    this.scene.add(fill);
  }

  buildWorkcell() {
    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0xd7dde5, roughness: 0.82, metalness: 0.02 });
    this.workSurface = makeBox(
      { xMm: 1280, yMm: 720, zMm: 8 },
      { xMm: 380, yMm: 0, zMm: -4 },
      tableMaterial
    );
    this.workSurface.name = 'MAIN_DEMO_BUILD_SURFACE';
    this.workSurface.userData.playerSurface = true;
    this.scene.add(this.workSurface);
    const grid = new THREE.GridHelper(1180, 30, 0xb6c2ce, 0xd5dde6);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(380, 0, 0.5);
    grid.material.opacity = 0.18;
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
    this.ur10 = new Ur10Visual(this.scene);
    this.tcpMarker = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    this.scene.add(this.tcpMarker);
    this.tcpRing = new THREE.Mesh(new THREE.TorusGeometry(15, 1.4, 8, 32), new THREE.MeshBasicMaterial({ color: 0x59e1ff }));
    this.tcpRing.rotation.x = Math.PI / 2;
    this.scene.add(this.tcpRing);
  }

  installPlayerRuntime() {
    const obstacles = [
      { kind: 'WORKTABLE', minX: -260, maxX: 1020, minY: -360, maxY: 360, minZ: -8, maxZ: 0 },
      { kind: 'ROBOT_BASE', minX: -120, maxX: 120, minY: -120, maxY: 120, minZ: 0, maxZ: 310 }
    ];
    this.playerCollision = new PlayerCapsuleSolver(this.playerSettings, obstacles);
    this.player = new PlayerController(this.camera, this.canvas, this.playerSettings, this.playerCollision);
    this.heldVisual = new HeldBrickController(this.playerSettings);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.playerSettings.unlimitedPickupReach
      ? this.playerSettings.farClipMm
      : this.playerSettings.maximumPickupDistanceMm;
    this.ndcCentre = new THREE.Vector2(0, 0);
    this.heldGhost = this.makeHeldGhost();
    this.scene.add(this.heldGhost);
    this.colorGrader = new ColorGrader(this.webgl, this.playerSettings);
    this.player.onPrimary = () => this.primaryPlayerAction();
    this.player.onRotate = () => {
      const result = this.humanBuildAdapter.rotate(1);
      if (result.ok) this.lastPreviewSignature = '';
    };
    this.player.onWheel = (deltaY) => {
      const step = this.playerSettings.cameraZoomWheelStep;
      this.playerSettings.cameraZoom = Math.max(
        this.playerSettings.cameraZoomMin,
        Math.min(this.playerSettings.cameraZoomMax, this.playerSettings.cameraZoom + (deltaY > 0 ? -step : step))
      );
      this.camera.zoom = this.playerSettings.cameraZoom;
      this.camera.updateProjectionMatrix();
    };
    for (const button of document.querySelectorAll('[data-player-action]')) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const action = button.dataset.playerAction;
        if (action === 'rotate') this.player.onRotate();
        if (action === 'primary') this.primaryPlayerAction();
        if (action === 'drop') this.dropHeldBrick();
      });
    }
  }

  makeHeldGhost() {
    const group = new THREE.Group();
    group.name = 'MAIN_DEMO_HELD_BRICK';
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x22c47a,
      roughness: 0.31,
      metalness: 0,
      clearcoat: 0.25,
      transparent: true,
      opacity: 0.82,
      depthWrite: true
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BRICK_SPEC.lengthMm, BRICK_SPEC.widthMm, BRICK_SPEC.bodyHeightMm),
      material
    );
    body.castShadow = true;
    group.add(body);
    const studGeometry = new THREE.CylinderGeometry(
      BRICK_SPEC.studDiameterMm / 2,
      BRICK_SPEC.studDiameterMm / 2,
      BRICK_SPEC.studHeightMm,
      16
    );
    studGeometry.rotateX(Math.PI / 2);
    const studs = new THREE.InstancedMesh(studGeometry, material, 8);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    let index = 0;
    const z = BRICK_SPEC.bodyHeightMm / 2 + BRICK_SPEC.studHeightMm / 2;
    for (const x of [-12, -4, 4, 12]) {
      for (const y of [-4, 4]) {
        matrix.compose(new THREE.Vector3(x, y, z), quaternion, scale);
        studs.setMatrixAt(index++, matrix);
      }
    }
    studs.instanceMatrix.needsUpdate = true;
    studs.castShadow = true;
    group.add(studs);
    group.visible = false;
    group.userData.material = material;
    return group;
  }

  setPlayerMode(enabled) {
    if (!this.player) return false;
    this.player.setEnabled(enabled);
    if (enabled) {
      this.drag = null;
      this.camera.fov = this.playerSettings.fovDeg;
      this.camera.near = this.playerSettings.nearClipMm;
      this.camera.far = this.playerSettings.farClipMm;
      this.camera.zoom = this.playerSettings.cameraZoom;
      this.camera.updateProjectionMatrix();
      if (!this.playerInitialized) {
        this.player.setLookAt(
          new THREE.Vector3(380, -980, 560),
          new THREE.Vector3(470, 0, 90)
        );
        this.playerInitialized = true;
      } else {
        this.player.syncCamera();
      }
    } else {
      this.setView('hero');
    }
    return true;
  }

  primaryPlayerAction() {
    if (!this.player?.enabled) return { ok: false, reason: 'player_mode_disabled' };
    if (this.humanBuildAdapter.active) {
      const result = this.humanBuildAdapter.release();
      if (result.ok) {
        this.heldVisual.clear();
        this.heldGhost.visible = false;
        this.lastPreviewSignature = '';
      }
      return result;
    }
    if (!this.highlightedBrickId) return { ok: false, reason: 'no_pick_target' };
    const brick = this.controller.getBricks().find((candidate) => candidate.id === this.highlightedBrickId);
    const result = this.humanBuildAdapter.pickup(this.highlightedBrickId);
    if (result.ok && brick) {
      this.heldVisual.pickup(brick);
      this.heldGhost.userData.material.color.setHex(BRICK_COLOURS[brick.colour] ?? BRICK_COLOURS.white);
      this.heldGhost.visible = true;
      this.highlightedBrickId = null;
    }
    return result;
  }

  dropHeldBrick() {
    const result = this.humanBuildAdapter.drop();
    if (result.ok) {
      this.heldVisual.clear();
      this.heldGhost.visible = false;
      this.lastPreviewSignature = '';
    }
    return result;
  }

  brickIdFromHit(hit) {
    return hit?.object?.userData?.brickId ?? this.batcher.brickIdFromHit(hit);
  }

  centreHits(objects) {
    this.raycaster.setFromCamera(this.ndcCentre, this.camera);
    return this.raycaster.intersectObjects(objects, false);
  }

  updatePlayerInteraction() {
    if (!this.player?.enabled) return;
    const bricks = this.controller.getBricks();
    const active = this.humanBuildAdapter.active;
    if (!active) {
      const pickMeshes = [
        ...this.brickMeshes.values(),
        ...this.batcher.pickMeshes()
      ].filter((mesh) => mesh.visible);
      const hit = this.centreHits(pickMeshes)[0] ?? null;
      this.highlightedBrickId = this.brickIdFromHit(hit);
      for (const [id, mesh] of this.brickMeshes) {
        const highlighted = id === this.highlightedBrickId;
        mesh.material.emissive?.setHex(highlighted ? 0xffffff : 0x000000);
        mesh.material.emissiveIntensity = highlighted ? 0.28 : 0;
      }
      return;
    }
    const carried = bricks.find((brick) => brick.id === active.brickId);
    if (!carried) return;
    const supportMeshes = [
      ...this.targetMeshes.values(),
      ...this.brickMeshes.values(),
      ...this.batcher.pickMeshes(),
      this.workSurface
    ].filter((mesh) => mesh.visible);
    const hits = this.centreHits(supportMeshes);
    let candidate = null;
    for (const hit of hits) {
      const targetId = hit.object.userData?.targetId;
      if (targetId) {
        const target = this.board.getTarget(targetId);
        if (target) candidate = this.humanBuildAdapter.placementEngine.targetCandidate(target, carried);
      } else {
        const supportId = this.brickIdFromHit(hit);
        if (supportId && supportId !== carried.id) {
          const support = bricks.find((brick) => brick.id === supportId);
          if (support) {
            candidate = this.humanBuildAdapter.placementEngine.connectionCandidate(
              support,
              { xMm: hit.point.x, yMm: hit.point.y, zMm: hit.point.z },
              carried,
              bricks
            );
          }
        } else if (hit.object.userData?.playerSurface) {
          const point = { xMm: hit.point.x, yMm: hit.point.y, zMm: hit.point.z };
          const target = this.humanBuildAdapter.placementEngine.nearestTarget(point);
          candidate = target
            ? this.humanBuildAdapter.placementEngine.targetCandidate(target, carried)
            : this.humanBuildAdapter.placementEngine.matCandidate(point, carried, bricks);
        }
      }
      if (candidate) break;
    }
    if (!candidate) {
      const pivot = this.player.getHoldPivot();
      candidate = {
        type: 'CARRY',
        status: 'CARRYING',
        valid: false,
        blockedReason: 'no_snap_target',
        placementType: null,
        position: { xMm: pivot.x, yMm: pivot.y, zMm: pivot.z },
        yawRad: this.humanBuildAdapter.placementEngine.rotationQuarterTurns * Math.PI / 2,
        carriedBrickId: carried.id,
        connection: null
      };
    }
    const signature = JSON.stringify(candidate);
    if (signature !== this.lastPreviewSignature) {
      this.humanBuildAdapter.setPreview(candidate);
      this.heldVisual.setCandidate(candidate.type === 'CARRY' ? null : candidate);
      this.lastPreviewSignature = signature;
    }
  }

  syncHeldGhost() {
    const pose = this.heldVisual?.getVisualPose();
    if (!pose) {
      if (this.heldGhost) this.heldGhost.visible = false;
      return;
    }
    this.heldGhost.visible = true;
    this.heldGhost.position.set(pose.position.xMm, pose.position.yMm, pose.position.zMm);
    this.heldGhost.quaternion.fromArray(pose.quaternion);
    const valid = pose.candidate?.valid;
    const blocked = pose.candidate && !pose.candidate.valid;
    this.heldGhost.userData.material.opacity = blocked ? 0.48 : valid ? 0.9 : 0.82;
    this.heldGhost.userData.material.emissive.setHex(blocked ? 0xff3300 : valid ? 0x22c47a : 0x000000);
    this.heldGhost.userData.material.emissiveIntensity = blocked || valid ? 0.22 : 0;
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
        mesh.userData.targetId = target.id;
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
    const placedIds = new Set([
      ...(this.board?.getTargets?.() ?? []).map((target) => target.occupiedBy).filter(Boolean),
      ...(this.board?.getPlacements?.() ?? []).map((placement) => placement.brickId)
    ]);
    const batchSignature = `${this.controller.getState().worldRevision}:${[...placedIds].sort().join(',')}`;
    if (batchSignature !== this.lastBatchSignature) {
      this.batcher.rebuild(bricks, placedIds);
      this.lastBatchSignature = batchSignature;
    }
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
        body.userData.brickId = brick.id;
        this.scene.add(body);
        mesh = body;
        this.brickMeshes.set(brick.id, mesh);
      }
      mesh.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
      mesh.rotation.z = brick.yawRad ?? 0;
      mesh.visible = !placedIds.has(brick.id) && brick.heldBy !== 'human';
    }
    for (const [id, mesh] of this.brickMeshes) {
      if (!seen.has(id)) { this.scene.remove(mesh); this.brickMeshes.delete(id); }
    }
  }

  updateRobot() {
    const state = this.controller.getState();
    const fk = forwardKinematics(state.jointsRad, UR10_DEFINITION);
    if (!fk.ok) return;
    this.ur10.update(state.jointsRad, fk.frames);
    this.tcpMarker.position.set(fk.tcp.xMm, fk.tcp.yMm, fk.tcp.zMm);
    this.tcpRing.position.copy(this.tcpMarker.position);
    this.gripper.update(fk.frames[6], state.gripper.jawGapMm);
  }

  setView(view) {
    if (this.player?.enabled) this.player.setEnabled(false);
    const presets = {
      hero: { focus: [390, 0, 165], yaw: -0.8621700547, pitch: 0.4069542207, radius: 1402.052424 },
      top: { focus: [590, 0, 130], yaw: -0.72, pitch: 1.25, radius: 1600 },
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
      if (this.player?.enabled) return;
      this.drag = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch, focus: this.focus.clone(), mode: event.button === 0 ? 'orbit' : 'pan' };
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.player?.enabled) return;
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
      if (this.player?.enabled) return;
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
    this.updatePlayerInteraction();
    this.syncHeldGhost();
    if (this.colorGrader && this.playerSettings.colorGradingEnabled) this.colorGrader.render(this.scene, this.camera);
    else this.webgl.render(this.scene, this.camera);
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
        if (this.player?.enabled) {
          const advance = fixedStepAdvance(
            this.physicsAccumulator,
            Math.min(delta / 1000, this.playerSettings.maximumCatchupS),
            this.physicsStepSeconds,
            this.maximumSubsteps
          );
          this.physicsAccumulator = advance.accumulator;
          for (let index = 0; index < advance.steps; index += 1) {
            this.player.physicsStep(this.physicsStepSeconds);
            this.heldVisual.step(this.physicsStepSeconds, this.player);
          }
        }
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
      gripper: this.gripper.getStatus(),
      ur10: this.ur10.getStatus(),
      player: this.player?.getState() ?? null,
      heldBrick: this.heldVisual?.getVisualPose() ?? null,
      placedBatch: this.batcher.getDiagnostics(),
      colorGrading: this.colorGrader?.getDiagnostics() ?? null
    };
  }
}
