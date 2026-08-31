import { BRICK_SPEC } from '../bricks/brick-spec.js';
import { forwardKinematics } from '../robot/kinematics.js';
import { UR10_DEFINITION } from '../robot/ur10-definition.js';
import { RealGripperVisual, THREE } from './real-gripper-visual.js';
import { Ur10Visual } from './ur10-visual.js';
import { ColorGrader } from '../player/color-grading.js';
import { HeldBrickController } from '../player/held-brick-controller.js';
import { LooseBrickPhysics } from '../player/loose-brick-physics.js';
import { fixedStepAdvance } from '../player/math.js';
import { PlacedBrickBatcher } from '../player/placed-brick-batcher.js';
import { PlayerCapsuleSolver } from '../player/player-collision.js';
import { PlayerController } from '../player/player-controller.js';
import { V8Workbench } from './v8-workbench.js';

const BRICK_COLOURS = {
  white: 0xf3f5f8, black: 0x151b25, red: 0xef4b4f,
  blue: 0x3b78ff, yellow: 0xffd447, green: 0x49c47a
};

function toneMappingFromSetting(value) {
  if (value === 'Linear') return THREE.LinearToneMapping;
  if (value === 'None') return THREE.NoToneMapping;
  return THREE.ACESFilmicToneMapping;
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
    this.scene.background = new THREE.Color(0xe9eef3).multiplyScalar(playerSettings?.backgroundBrightness ?? 1.4);
    this.scene.fog = null;
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = toneMappingFromSetting(playerSettings?.toneMapping);
    this.webgl.toneMappingExposure = playerSettings?.exposure ?? 1.05;
    this.webgl.shadowMap.enabled = playerSettings?.shadowsEnabled ?? true;
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(playerSettings?.fovDeg ?? 62, 1, playerSettings?.nearClipMm ?? 2, playerSettings?.farClipMm ?? 12000);
    this.camera.up.set(0, 0, 1);
    this.focus = new THREE.Vector3(0, 50, 1050);
    this.yaw = -0.82;
    this.pitch = 0.47;
    this.radius = 2450;
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
    this.machineRoot = new THREE.Group();
    this.machineRoot.name = 'AUTHORITATIVE_UR10_MACHINE_FRAME';
    this.scene.add(this.machineRoot);
    this.buildLighting();
    this.buildWorkcell();
    this.applyMachineTransform();
    this.buildRobot();
    this.gripper = new RealGripperVisual(this.machineRoot);
    this.batcher = new PlacedBrickBatcher(this.machineRoot, playerSettings ?? {});
    this.loosePhysics = new LooseBrickPhysics(controller, playerSettings ?? {});
    this.controller.subscribe((event) => {
      if (event.type === 'reset' || event.type === 'world_reset') this.loosePhysics.clear();
    });
    if (playerSettings && humanBuildAdapter) this.installPlayerRuntime();
    this.installCameraControls();
    if (this.player) this.setPlayerMode(true);
    else this.setView('hero');
  }

  buildLighting() {
    if (this.lightingRoot) this.scene.remove(this.lightingRoot);
    this.lightingRoot = new THREE.Group();
    this.lightingRoot.name = 'MAIN_DEMO_V8_LIGHTING';
    this.scene.add(this.lightingRoot);
    const s = this.playerSettings;
    this.lightingRoot.add(new THREE.HemisphereLight(0xffffff, 0x8290a0, s.environmentIntensity));
    const key = new THREE.DirectionalLight(0xfff2dd, s.keyLightIntensity);
    key.position.set(s.keyXmm, s.keyYmm, s.keyZmm);
    key.castShadow = true;
    key.shadow.mapSize.set(s.shadowMapResolution, s.shadowMapResolution);
    key.shadow.bias = s.shadowBias;
    key.shadow.normalBias = s.shadowNormalBias;
    key.shadow.camera.left = -1700;
    key.shadow.camera.right = 1700;
    key.shadow.camera.top = 1700;
    key.shadow.camera.bottom = -1700;
    key.shadow.camera.near = 50;
    key.shadow.camera.far = 6000;
    key.target.position.set(s.tableXmm, s.tableYmm, s.tableTopHeightMm);
    this.lightingRoot.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xdbeaff, s.fillIntensity);
    fill.position.set(1200, -1500, 1500);
    this.lightingRoot.add(fill);
    const rim = new THREE.DirectionalLight(0xfff0da, s.rimIntensity);
    rim.position.set(400, 1700, 1700);
    this.lightingRoot.add(rim);
  }

  buildWorkcell() {
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.86, metalness: 0 })
    );
    this.floor.name = 'MAIN_DEMO_V8_FLOOR';
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.workbench = new V8Workbench(this.scene, this.playerSettings);
    this.workSurface = this.workbench.mat;
  }

  applyMachineTransform() {
    const s = this.playerSettings;
    this.machineRoot.position.set(s.robotMountXmm, s.robotMountYmm, s.robotMountZmm);
    this.machineRoot.rotation.set(0, 0, THREE.MathUtils.degToRad(s.robotMountYawDeg));
    this.machineRoot.updateMatrixWorld(true);
  }

  machinePointFromWorld(point) {
    this.machineRoot.updateMatrixWorld(true);
    return this.machineRoot.worldToLocal(point.clone());
  }

  playerObstacles() {
    const s = this.playerSettings;
    return [
      ...this.workbench.collisionBoxes(),
      {
        kind: 'ROBOT_BASE',
        minX: s.robotMountXmm - 125,
        maxX: s.robotMountXmm + 125,
        minY: s.robotMountYmm - 125,
        maxY: s.robotMountYmm + 125,
        minZ: s.robotMountZmm,
        maxZ: s.robotMountZmm + 310
      }
    ];
  }

  buildRobot() {
    this.ur10 = new Ur10Visual(this.machineRoot);
    this.tcpMarker = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    this.machineRoot.add(this.tcpMarker);
    this.tcpRing = new THREE.Mesh(new THREE.TorusGeometry(15, 1.4, 8, 32), new THREE.MeshBasicMaterial({ color: 0x59e1ff }));
    this.tcpRing.rotation.x = Math.PI / 2;
    this.machineRoot.add(this.tcpRing);
  }

  installPlayerRuntime() {
    this.playerCollision = new PlayerCapsuleSolver(this.playerSettings, this.playerObstacles());
    this.player = new PlayerController(this.camera, this.canvas, this.playerSettings, this.playerCollision);
    this.machinePlayerProxy = {
      getHoldPivot: (output) => this.machineRoot.worldToLocal(this.player.getHoldPivot(output))
    };
    this.heldVisual = new HeldBrickController(this.playerSettings);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.playerSettings.unlimitedPickupReach
      ? this.playerSettings.farClipMm
      : this.playerSettings.maximumPickupDistanceMm;
    this.ndcCentre = new THREE.Vector2(0, 0);
    this.heldGhost = this.makeHeldGhost();
    this.machineRoot.add(this.heldGhost);
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
      transparent: false,
      opacity: 1,
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
        const s = this.playerSettings;
        const radius = Math.max(0, s.playerCollisionDiameterMm * 0.5);
        const spawn = this.workbench.worldPoint(new THREE.Vector3(
          338,
          -s.tableDepthMm / 2 - radius - s.playerCollisionSkinMm - s.playerSpawnBehindTableMm - 1250,
          s.playerEyeHeightMm
        ));
        const target = this.workbench.worldPoint(new THREE.Vector3(
          s.matXmm,
          s.matYmm,
          s.tableTopHeightMm + s.matThicknessMm + 220
        ));
        this.player.setLookAt(
          spawn,
          target
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
    if (!this.humanBuildAdapter.active && this.highlightedMoreBricks) {
      this.moreBricksHandler?.();
      return { ok: true, action: 'more_bricks' };
    }
    if (this.humanBuildAdapter.active) {
      const pose = this.heldVisual.getVisualPose();
      let result = this.humanBuildAdapter.release();
      if (!result.ok && result.keepHolding && pose) {
        result = this.humanBuildAdapter.drop(pose.position);
        if (result.ok) this.loosePhysics.launch(result.brick.id, {
          position: result.brick.position,
          quaternion: pose.quaternion,
          velocityMmS: pose.velocityMmS,
          angularVelocityRadS: pose.angularVelocityRadS,
          yawRad: pose.yawRad
        });
      }
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
    const pose = this.heldVisual.getVisualPose();
    const result = this.humanBuildAdapter.drop(pose?.position ?? null);
    if (result.ok) {
      if (pose) this.loosePhysics.launch(result.brick.id, {
        position: result.brick.position,
        quaternion: pose.quaternion,
        velocityMmS: pose.velocityMmS,
        angularVelocityRadS: pose.angularVelocityRadS,
        yawRad: pose.yawRad
      });
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
        ...this.batcher.pickMeshes(),
        this.workbench.moreBricksButton
      ].filter((mesh) => mesh.visible);
      const hit = this.centreHits(pickMeshes)[0] ?? null;
      this.highlightedMoreBricks = Boolean(hit?.object?.userData?.moreBricks);
      this.highlightedBrickId = this.highlightedMoreBricks ? null : this.brickIdFromHit(hit);
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
              (() => {
                const point = this.machinePointFromWorld(hit.point);
                return { xMm: point.x, yMm: point.y, zMm: point.z };
              })(),
              carried,
              bricks
            );
          }
        } else if (hit.object.userData?.playerSurface) {
          const local = this.machinePointFromWorld(hit.point);
          const point = { xMm: local.x, yMm: local.y, zMm: local.z };
          const target = this.humanBuildAdapter.placementEngine.nearestTarget(point);
          candidate = target
            ? this.humanBuildAdapter.placementEngine.targetCandidate(target, carried)
            : this.humanBuildAdapter.placementEngine.matCandidate(point, carried, bricks);
        }
      }
      if (candidate) break;
    }
    if (!candidate) {
      const pivot = this.machinePointFromWorld(this.player.getHoldPivot());
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
    this.heldGhost.userData.material.opacity = 1;
    this.heldGhost.userData.material.transparent = false;
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
        this.machineRoot.add(mesh);
        this.targetMeshes.set(target.id, mesh);
      }
      mesh.visible = !target.occupiedBy;
      mesh.position.set(target.position.xMm, target.position.yMm, target.position.zMm);
      mesh.rotation.z = target.yawRad ?? 0;
    }
    for (const [id, mesh] of this.targetMeshes) {
      if (!seen.has(id)) { this.machineRoot.remove(mesh); this.targetMeshes.delete(id); }
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
        this.machineRoot.add(body);
        mesh = body;
        this.brickMeshes.set(brick.id, mesh);
      }
      mesh.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
      if (Array.isArray(brick.freeQuaternion) && brick.freeQuaternion.length === 4) mesh.quaternion.fromArray(brick.freeQuaternion).normalize();
      else mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), brick.yawRad ?? 0);
      mesh.visible = !placedIds.has(brick.id) && brick.heldBy !== 'human';
    }
    for (const [id, mesh] of this.brickMeshes) {
      if (!seen.has(id)) { this.machineRoot.remove(mesh); this.brickMeshes.delete(id); }
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
      hero: { focus: [0, 50, 1020], yaw: -1.03, pitch: 0.30, radius: 2550 },
      top: { focus: [0, 50, 1120], yaw: -Math.PI / 2, pitch: 1.42, radius: 2300 },
      tray: { focus: [-60, -175, 1210], yaw: -1.02, pitch: 0.52, radius: 720 },
      latch: { focus: [-40, -180, 1240], yaw: -0.92, pitch: 0.42, radius: 430 },
      target: { focus: [95, 220, 1210], yaw: -1.02, pitch: 0.52, radius: 720 }
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
    const cap = this.player?.mobileMode
      ? this.playerSettings.mobilePixelRatioCap
      : this.playerSettings.pixelRatioCap;
    const pixelRatio = Math.min(cap ?? 1, window.devicePixelRatio || 1);
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
        const advance = fixedStepAdvance(
          this.physicsAccumulator,
          Math.min(delta / 1000, this.playerSettings?.maximumCatchupS ?? 0.25),
          this.physicsStepSeconds,
          this.maximumSubsteps
        );
        this.physicsAccumulator = advance.accumulator;
        for (let index = 0; index < advance.steps; index += 1) {
          if (this.player?.enabled) {
            this.player.physicsStep(this.physicsStepSeconds);
            this.heldVisual.step(this.physicsStepSeconds, this.machinePlayerProxy);
          }
          this.loosePhysics.step(this.physicsStepSeconds);
        }
      }
      this.lastFrame = now;
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }

  setMoreBricksHandler(handler) { this.moreBricksHandler = handler; }

  applySettings(key = '*') {
    const tableChanged = key === '*' || /^(table|leg|mat|gridVisible|gridColor|gridOpacity)/.test(key);
    const mountChanged = key === '*' || /^robotMount/.test(key);
    const lightingChanged = key === '*' || /^(backgroundBrightness|environmentIntensity|keyLight|keyX|keyY|keyZ|fillIntensity|rimIntensity|shadow|exposure|toneMapping)/.test(key);
    const collisionChanged = tableChanged || mountChanged || key === '*' || /^playerCollision/.test(key);
    const brickMaterialChanged = key === '*' || /^(brickRoughness|brickMetalness)$/.test(key);
    if (tableChanged) {
      this.workbench.rebuild();
      this.workSurface = this.workbench.mat;
    }
    if (mountChanged) this.applyMachineTransform();
    if (collisionChanged) this.playerCollision?.setObstacles(this.playerObstacles());
    if (lightingChanged) {
      this.scene.background = new THREE.Color(0xe9eef3).multiplyScalar(this.playerSettings.backgroundBrightness);
      this.webgl.toneMappingExposure = this.playerSettings.exposure;
      this.webgl.toneMapping = toneMappingFromSetting(this.playerSettings.toneMapping);
      this.webgl.shadowMap.enabled = this.playerSettings.shadowsEnabled;
      this.buildLighting();
    }
    if (brickMaterialChanged) {
      this.batcher.applyMaterialSettings();
      for (const mesh of this.looseBrickMeshes.values()) {
        mesh.material.roughness = this.playerSettings.brickRoughness ?? 0.31;
        mesh.material.metalness = this.playerSettings.brickMetalness ?? 0;
        mesh.material.needsUpdate = true;
      }
    }
    this.physicsStepSeconds = 1 / Math.max(30, this.playerSettings.physicsHz ?? 240);
    this.maximumSubsteps = Math.max(1, this.playerSettings.maximumSubsteps ?? 8);
    if (this.raycaster) {
      this.raycaster.far = this.playerSettings.unlimitedPickupReach
        ? Number.POSITIVE_INFINITY
        : this.playerSettings.pickupReachMm;
    }
    this.camera.fov = this.playerSettings.fovDeg;
    this.camera.near = this.playerSettings.nearClipMm;
    this.camera.far = this.playerSettings.farClipMm;
    this.camera.zoom = this.playerSettings.cameraZoom;
    this.camera.updateProjectionMatrix();
    this.render();
  }

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
      looseBrickPhysics: this.loosePhysics?.getState() ?? [],
      placedBatch: this.batcher.getDiagnostics(),
      colorGrading: this.colorGrader?.getDiagnostics() ?? null
    };
  }
}
