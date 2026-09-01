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
import {
  applyV8BrickGeometry,
  applyV8BrickMaterial,
  colourHex,
  createV8BrickVisual,
  disposeV8BrickVisual,
  V8BrickGeometryFactory
} from '../player/v8-brick-visual.js';

const BRICK_COLOURS = {
  white: 0xf3f5f8, black: 0x151b25, red: 0xef4b4f,
  blue: 0x3b78ff, yellow: 0xffd447, green: 0x49c47a
};

function toneMappingFromSetting(value) {
  if (value === 'Neutral') return THREE.NeutralToneMapping;
  if (value === 'Linear') return THREE.LinearToneMapping;
  if (value === 'None') return THREE.NoToneMapping;
  return THREE.ACESFilmicToneMapping;
}

function blackbodyColour(kelvin = 5778) {
  const temperature = Math.max(1000, Math.min(40000, Number(kelvin))) / 100;
  const red = temperature <= 66 ? 255 : 329.698727446 * ((temperature - 60) ** -0.1332047592);
  const green = temperature <= 66
    ? 99.4708025861 * Math.log(temperature) - 161.1195681661
    : 288.1221695283 * ((temperature - 60) ** -0.0755148492);
  const blue = temperature >= 66 ? 255 : temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.044792731;
  return new THREE.Color(
    Math.max(0, Math.min(255, red)) / 255,
    Math.max(0, Math.min(255, green)) / 255,
    Math.max(0, Math.min(255, blue)) / 255
  );
}

function makeBox(size, centre, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.xMm, size.yMm, size.zMm), material);
  mesh.position.set(centre.xMm, centre.yMm, centre.zMm);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class RobotRenderer {
  constructor(canvas, controller, { board = null, playerSettings = null, humanBuildAdapter = null, fastPlacement = null } = {}) {
    this.canvas = canvas;
    this.controller = controller;
    this.board = board;
    this.playerSettings = playerSettings;
    this.humanBuildAdapter = humanBuildAdapter;
    this.fastPlacement = fastPlacement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9eef3).multiplyScalar(playerSettings?.backgroundBrightness ?? 1.4);
    this.scene.fog = null;
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = toneMappingFromSetting(playerSettings?.toneMapping);
    this.webgl.toneMappingExposure = playerSettings?.exposure ?? 1.05;
    this.webgl.shadowMap.enabled = playerSettings?.shadowsEnabled ?? true;
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    this.webgl.shadowMap.autoUpdate = false;
    this.webgl.shadowMap.needsUpdate = true;
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
    this.protectedBrickId = null;
    this.lastPreviewSignature = '';
    this.lastBatchSignature = '';
    this.physicsAccumulator = 0;
    this.frameBricks = [];
    this.lastShadowUpdateAt = -Infinity;
    this.resizeDirty = true;
    this.lastPixelRatio = null;
    this.snapAnimation = null;
    this.physicsStepSeconds = 1 / Math.max(30, playerSettings?.physicsHz ?? 240);
    this.maximumSubsteps = Math.max(1, playerSettings?.maximumSubsteps ?? 8);
    this.machineRoot = new THREE.Group();
    this.machineRoot.name = 'AUTHORITATIVE_UR10_MACHINE_FRAME';
    this.scene.add(this.machineRoot);
    this.buildLighting();
    this.buildWorkcell();
    this.applyMachineTransform();
    this.configurePlacementFrame();
    this.buildRobot();
    this.gripper = new RealGripperVisual(this.machineRoot, playerSettings);
    this.brickFactory = new V8BrickGeometryFactory(playerSettings ?? {});
    this.batcher = new PlacedBrickBatcher(this.machineRoot, playerSettings ?? {});
    this.loosePhysics = new LooseBrickPhysics(controller, playerSettings ?? {});
    this.controller.subscribe((event) => {
      if (event.type === 'reset' || event.type === 'world_reset') {
        this.loosePhysics.clear();
        this.snapAnimation = null;
      }
    });
    if (playerSettings && humanBuildAdapter) this.installPlayerRuntime();
    this.installCameraControls();
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { this.resizeDirty = true; });
    this.resizeObserver?.observe(canvas);
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
    const sunIntensity = Number(s.sunStrength ?? s.keyLightIntensity) * (2 ** Number(s.sunExposureEV ?? 0));
    const key = new THREE.DirectionalLight(blackbodyColour(s.sunTemperatureK), sunIntensity);
    const elevation = THREE.MathUtils.degToRad(Number(s.sunElevationDeg ?? 38));
    const azimuth = THREE.MathUtils.degToRad(Number(s.sunAzimuthDeg ?? 315));
    const radius = 3000;
    key.position.set(
      s.tableXmm + Math.cos(elevation) * Math.cos(azimuth) * radius,
      s.tableYmm + Math.cos(elevation) * Math.sin(azimuth) * radius,
      s.tableTopHeightMm + Math.sin(elevation) * radius
    );
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
    this.webgl.shadowMap.needsUpdate = true;
  }

  buildWorkcell() {
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({
        color: this.playerSettings.floorColor ?? 0xdfe4e8,
        roughness: this.playerSettings.floorRoughness ?? 0.86,
        metalness: this.playerSettings.floorMetalness ?? 0
      })
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

  configurePlacementFrame() {
    const engine = this.humanBuildAdapter?.placementEngine;
    if (!engine || !this.workbench) return;
    const settings = this.playerSettings;
    const surfaceZ = settings.tableTopHeightMm + settings.matThicknessMm + settings.matStudHeightMm;
    const centre = this.machinePointFromWorld(this.workbench.worldPoint(new THREE.Vector3(settings.matXmm, settings.matYmm, surfaceZ)));
    const xAxis = this.machinePointFromWorld(this.workbench.worldPoint(new THREE.Vector3(settings.matXmm + 1, settings.matYmm, surfaceZ)));
    engine.configureTableFrame({
      centre: { xMm: centre.x, yMm: centre.y },
      yawRad: Math.atan2(xAxis.y - centre.y, xAxis.x - centre.x),
      placementSurfaceZMm: centre.z,
      widthMm: settings.matWidthMm,
      depthMm: settings.matDepthMm
    });
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
    this.ur10 = new Ur10Visual(this.machineRoot, this.playerSettings);
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
    this.snapPreview = this.makeSnapPreview();
    this.machineRoot.add(this.snapPreview.group);
    this.lookaheadPreviews = [this.snapPreview];
    for (let index = 1; index < 5; index += 1) {
      const visuals = this.makeSnapPreview();
      visuals.group.name = `MAIN_DEMO_LOOKAHEAD_GHOST_${String.fromCharCode(65 + index)}`;
      this.machineRoot.add(visuals.group);
      this.lookaheadPreviews.push(visuals);
    }
    this.colorGrader = new ColorGrader(this.webgl, this.playerSettings);
    this.player.onPrimary = () => this.primaryPlayerAction();
    this.player.onRotate = () => this.rotateHeldToNextValid(1);
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
        if (action === 'rotate-left') this.rotateHeldToNextValid(-1);
        if (action === 'primary') this.primaryPlayerAction();
        if (action === 'drop') this.dropHeldBrick();
      });
    }
  }

  rotateHeldToNextValid(direction = 1) {
    const active = this.humanBuildAdapter.active;
    const carried = active ? this.frameBricks.find((brick) => brick.id === active.brickId) : null;
    const preview = active?.preview ?? null;
    let evaluateCandidate = null;
    if (carried && preview?.type === 'BRICK') {
      const support = this.frameBricks.find((brick) => brick.id === preview.supportBrickId);
      if (support) {
        const hitPoint = preview.pivot ?? this.humanBuildAdapter.graph.connectorWorld(support, preview.supportSide ?? 'M', true);
        evaluateCandidate = () => this.humanBuildAdapter.placementEngine.connectionCandidate(
          support,
          hitPoint,
          carried,
          this.frameBricks
        );
      }
    } else if (carried && preview?.type === 'MAT') {
      const point = preview.position;
      evaluateCandidate = () => this.humanBuildAdapter.placementEngine.matCandidate(point, carried, this.frameBricks);
    }
    const result = this.humanBuildAdapter.rotate(direction, evaluateCandidate);
    if (!result.ok) return result;
    if (result.candidate) {
      this.heldVisual.setCandidate(result.candidate);
      this.lastPreviewSignature = JSON.stringify(result.candidate);
    } else {
      this.lastPreviewSignature = '';
    }
    return result;
  }

  makeHeldGhost() {
    const body = createV8BrickVisual({ colour: 'green', displayHex: 0x22c47a }, this.playerSettings, this.brickFactory);
    body.name = 'MAIN_DEMO_HELD_BRICK';
    body.visible = false;
    return body;
  }

  makeSnapPreview() {
    const group = new THREE.Group();
    group.name = 'MAIN_DEMO_V8_SNAP_PREVIEW';
    group.visible = false;
    const ghost = createV8BrickVisual({ colour: 'green', displayHex: 0x21c77a }, this.playerSettings, this.brickFactory, { ghost: true });
    group.add(ghost);
    const markerGeometry = new THREE.CylinderGeometry(3.1, 3.1, 0.75, 12);
    markerGeometry.rotateX(Math.PI / 2);
    const supportMarks = new THREE.InstancedMesh(
      markerGeometry,
      new THREE.MeshBasicMaterial({ color: 0x35d6ff, transparent: true, opacity: 0.82, depthTest: false }),
      8
    );
    const carriedMarks = new THREE.InstancedMesh(
      markerGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.88, depthTest: false }),
      8
    );
    supportMarks.renderOrder = 30;
    carriedMarks.renderOrder = 30;
    group.add(supportMarks, carriedMarks);
    const pivot = new THREE.Mesh(
      new THREE.RingGeometry(5.4, 7, 18),
      new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide })
    );
    pivot.renderOrder = 31;
    group.add(pivot);
    return { group, ghost, supportMarks, carriedMarks, pivot };
  }

  fillSnapMarkers(mesh, brick, side, top, pose = null) {
    const graph = this.humanBuildAdapter.placementEngine.graph;
    const settings = this.playerSettings;
    const position = pose?.position ?? brick.position;
    const yawRad = pose?.yawRad ?? brick.yawRad ?? 0;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yawRad);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    let index = 0;
    for (const cell of graph.connectorCells(side)) {
      const local = graph.studLocal(cell.ix, cell.iy, top);
      local.z = top
        ? settings.brickBodyHeightMm / 2 + settings.studHeightMm + 0.45
        : -settings.brickBodyHeightMm / 2 - 0.45;
      const rotated = new THREE.Vector3(local.x, local.y, local.z).applyQuaternion(quaternion);
      rotated.add(new THREE.Vector3(position.xMm, position.yMm, position.zMm));
      matrix.compose(rotated, new THREE.Quaternion(), scale);
      mesh.setMatrixAt(index, matrix);
      index += 1;
    }
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
  }

  syncPreviewVisual(preview, visuals) {
    if (!preview || preview.type === 'CARRY' || preview.status === 'NONE') {
      visuals.group.visible = false;
      return;
    }
    visuals.group.visible = true;
    const position = preview.previewPosition ?? preview.position;
    const yawRad = preview.previewYawRad ?? preview.yawRad ?? 0;
    visuals.ghost.position.set(position.xMm, position.yMm, position.zMm);
    visuals.ghost.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), yawRad);
    const overhang = preview.valid && preview.overhang && this.playerSettings.connectionOverhangGhostStyle === 'Yellow';
    const proposalColour = preview.status === 'STALE' ? 0xe5a52e : preview.valid ? 0x35d6ff : 0xe34f45;
    visuals.ghost.userData.material.color.setHex(preview.proposal ? proposalColour : preview.valid ? (overhang ? 0xe5b72e : 0x21c77a) : 0xe34f45);
    visuals.ghost.userData.material.opacity = this.playerSettings.ghostOpacity * (preview.opacityScale ?? 1);
    const connectionVisible = preview.type === 'BRICK';
    visuals.supportMarks.visible = connectionVisible && this.playerSettings.connectionStudHighlightEnabled !== false;
    visuals.carriedMarks.visible = connectionVisible && this.playerSettings.connectionStudHighlightEnabled !== false;
    visuals.pivot.visible = connectionVisible && this.playerSettings.connectionPivotMarkerEnabled !== false;
    if (!connectionVisible) return;
    const bricks = this.controller.getBricks();
    const support = bricks.find((brick) => brick.id === preview.supportBrickId);
    const carried = bricks.find((brick) => brick.id === preview.carriedBrickId);
    if (!support || !carried) { visuals.group.visible = false; return; }
    this.fillSnapMarkers(visuals.supportMarks, support, preview.supportSide, true);
    this.fillSnapMarkers(visuals.carriedMarks, carried, preview.carriedSide, false, { position, yawRad });
    visuals.pivot.position.set(preview.pivot.xMm, preview.pivot.yMm, preview.pivot.zMm + this.playerSettings.studHeightMm + 1.2);
  }

  syncSnapPreview() {
    const visualsPool = this.lookaheadPreviews ?? [this.snapPreview];
    if (this.snapAnimation) {
      for (const visuals of visualsPool) visuals.group.visible = false;
      return;
    }
    const humanPreview = this.humanBuildAdapter?.getPreview?.();
    if (humanPreview) {
      this.syncPreviewVisual(humanPreview, visualsPool[0]);
      for (let index = 1; index < visualsPool.length; index += 1) visualsPool[index].group.visible = false;
      return;
    }
    const previews = this.fastPlacement?.getRenderPreviews?.() ?? [];
    for (let index = 0; index < visualsPool.length; index += 1) {
      this.syncPreviewVisual(previews[index] ?? null, visualsPool[index]);
    }
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
          s.playerInitialXmm ?? 0,
          -s.tableDepthMm / 2 - radius - s.playerCollisionSkinMm - Math.max(0, s.playerInitialDistanceBehindTableMm ?? s.playerSpawnBehindTableMm ?? 0),
          s.playerEyeHeightMm
        ));
        const target = this.workbench.worldPoint(new THREE.Vector3(
          s.playerInitialLookAtXmm ?? s.matXmm,
          s.playerInitialLookAtYmm ?? s.matYmm,
          s.playerInitialLookAtZmm ?? (s.tableTopHeightMm + s.matThicknessMm + s.matStudHeightMm + 35)
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
    if (this.humanBuildAdapter.active) return this.releaseHeldPlacement();
    if (this.protectedBrickId) return { ok: false, reason: 'supporting_brick', brickId: this.protectedBrickId };
    if (!this.highlightedBrickId) return { ok: false, reason: 'no_pick_target' };
    const brick = this.controller.getBricks().find((candidate) => candidate.id === this.highlightedBrickId);
    const result = this.humanBuildAdapter.pickup(this.highlightedBrickId);
    if (result.ok && brick) {
      this.heldVisual.pickup(brick);
      this.heldGhost.userData.material.color.setHex(colourHex(brick));
      this.heldGhost.visible = true;
      this.highlightedBrickId = null;
    }
    return result;
  }

  undoPlayerAction() {
    const result = this.humanBuildAdapter.undo();
    if (!result.ok) return result;
    this.heldVisual.clear();
    this.heldGhost.visible = false;
    this.snapAnimation = null;
    this.highlightedBrickId = null;
    this.protectedBrickId = null;
    this.lastPreviewSignature = '';
    this.lastBatchSignature = '';
    return result;
  }

  releaseHeldPlacement() {
    const pose = this.heldVisual.getVisualPose();
    const result = this.humanBuildAdapter.release();
    if (result.ok) {
      this.beginSnapAnimation(pose, result.brick);
      this.heldVisual.clear();
      this.lastPreviewSignature = '';
    }
    return result;
  }

  beginSnapAnimation(pose, brick) {
    if (!pose || !brick) {
      this.snapAnimation = null;
      this.heldGhost.visible = false;
      return;
    }
    this.snapAnimation = {
      brickId: brick.id,
      position: new THREE.Vector3(pose.position.xMm, pose.position.yMm, pose.position.zMm),
      targetPosition: new THREE.Vector3(brick.position.xMm, brick.position.yMm, brick.position.zMm),
      velocityMmS: new THREE.Vector3(...(pose.velocityMmS ?? [0, 0, 0])),
      quaternion: new THREE.Quaternion().fromArray(pose.quaternion),
      targetQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), brick.yawRad ?? 0),
      elapsed: 0
    };
    this.heldGhost.userData.material.color.setHex(colourHex(brick));
    this.heldGhost.userData.material.emissive.setHex(0x000000);
    this.heldGhost.userData.material.emissiveIntensity = 0;
    this.heldGhost.visible = true;
    this.lastBatchSignature = '';
  }

  stepSnapAnimation(dt) {
    const animation = this.snapAnimation;
    if (!animation) return;
    const settings = this.playerSettings;
    animation.elapsed += dt;
    const omega = 2 * Math.PI * Math.max(0.1, settings.snapNaturalFrequencyHz ?? 13);
    const error = new THREE.Vector3().copy(animation.position).sub(animation.targetPosition);
    animation.velocityMmS
      .addScaledVector(animation.velocityMmS, -2 * (settings.snapDampingRatio ?? 0.74) * omega * dt)
      .addScaledVector(error, -omega * omega * dt);
    animation.position.addScaledVector(animation.velocityMmS, dt);
    if (animation.position.z < animation.targetPosition.z) animation.position.z = animation.targetPosition.z;
    const duration = Math.max(1e-6, settings.snapDurationS ?? 0.18);
    const t = Math.max(0, Math.min(1, animation.elapsed / duration));
    const ease = 1 - Math.pow(1 - t, 3);
    animation.quaternion.slerp(animation.targetQuaternion, ease).normalize();
    const bounce = (settings.snapOvershootMm ?? 0.35) * Math.exp(-7 * t) * Math.sin(t * Math.PI * 3);
    animation.position.z = Math.max(animation.targetPosition.z, animation.position.z + bounce * dt * 8);
    if (animation.elapsed < duration) return;
    animation.position.copy(animation.targetPosition);
    animation.quaternion.copy(animation.targetQuaternion);
    this.snapAnimation = null;
    this.heldGhost.visible = false;
    this.lastBatchSignature = '';
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

  updatePlayerInteraction(bricks = this.frameBricks) {
    if (!this.player?.enabled) return;
    const active = this.humanBuildAdapter.active;
    if (!active) {
      const pickMeshes = [
        ...this.brickMeshes.values(),
        ...this.batcher.pickMeshes(),
        this.workbench.moreBricksButton
      ].filter((mesh) => mesh.visible);
      const hit = this.centreHits(pickMeshes)[0] ?? null;
      this.highlightedMoreBricks = Boolean(hit?.object?.userData?.moreBricks);
      this.workbench.setMoreBricksHighlighted(this.highlightedMoreBricks);
      const aimedBrickId = this.highlightedMoreBricks ? null : this.brickIdFromHit(hit);
      this.protectedBrickId = aimedBrickId && !this.humanBuildAdapter.graph.isTopmost(aimedBrickId) ? aimedBrickId : null;
      this.highlightedBrickId = this.protectedBrickId ? null : aimedBrickId;
      for (const [id, mesh] of this.brickMeshes) {
        const highlighted = id === this.highlightedBrickId;
        const protectedBrick = id === this.protectedBrickId;
        mesh.material.emissive?.setHex(protectedBrick ? 0xff8a24 : highlighted ? 0xffffff : 0x000000);
        mesh.material.emissiveIntensity = protectedBrick ? 0.24 : highlighted ? 0.28 : 0;
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
    this.workbench.setMoreBricksHighlighted(false);
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
    document.body.classList.toggle('mobile-carry', Boolean(this.snapAnimation || this.heldVisual?.getVisualPose()));
    if (this.snapAnimation) {
      this.heldGhost.visible = true;
      this.heldGhost.position.copy(this.snapAnimation.position);
      this.heldGhost.quaternion.copy(this.snapAnimation.quaternion);
      this.heldGhost.userData.material.opacity = 1;
      this.heldGhost.userData.material.transparent = false;
      return;
    }
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
      mesh.visible = this.playerSettings.robotTargetsVisible === true && !target.occupiedBy;
      mesh.position.set(target.position.xMm, target.position.yMm, target.position.zMm);
      mesh.rotation.z = target.yawRad ?? 0;
    }
    for (const [id, mesh] of this.targetMeshes) {
      if (!seen.has(id)) { this.machineRoot.remove(mesh); this.targetMeshes.delete(id); }
    }
  }

  syncBricks(bricks = this.frameBricks) {
    const placedIds = new Set([
      ...(this.board?.getTargets?.() ?? []).map((target) => target.occupiedBy).filter(Boolean),
      ...(this.board?.getPlacements?.() ?? []).map((placement) => placement.brickId)
    ]);
    const animatedBrickId = this.snapAnimation?.brickId ?? null;
    const batchPlacedIds = new Set([...placedIds].filter((id) => id !== animatedBrickId));
    const brickById = new Map(bricks.map((brick) => [brick.id, brick]));
    const batchSignature = `${animatedBrickId ?? '-'}:${[...batchPlacedIds].sort().map((id) => {
      const brick = brickById.get(id);
      return brick ? `${id}:${brick.position.xMm}:${brick.position.yMm}:${brick.position.zMm}:${brick.yawRad ?? 0}:${brick.colour}` : id;
    }).join('|')}`;
    if (batchSignature !== this.lastBatchSignature) {
      this.batcher.rebuild(bricks, batchPlacedIds);
      this.lastBatchSignature = batchSignature;
    }
    const seen = new Set();
    for (const brick of bricks) {
      seen.add(brick.id);
      let mesh = this.brickMeshes.get(brick.id);
      if (!mesh) {
        const body = createV8BrickVisual(brick, this.playerSettings, this.brickFactory);
        body.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
        body.name = `BRICK_${brick.id}`;
        body.userData.brickId = brick.id;
        this.machineRoot.add(body);
        mesh = body;
        this.brickMeshes.set(brick.id, mesh);
      }
      mesh.position.set(brick.position.xMm, brick.position.yMm, brick.position.zMm);
      if (Array.isArray(brick.freeQuaternion) && brick.freeQuaternion.length === 4) mesh.quaternion.fromArray(brick.freeQuaternion).normalize();
      else mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), brick.yawRad ?? 0);
      mesh.visible = brick.id !== animatedBrickId && !batchPlacedIds.has(brick.id) && brick.heldBy !== 'human';
    }
    for (const [id, mesh] of this.brickMeshes) {
      if (!seen.has(id)) { this.machineRoot.remove(mesh); disposeV8BrickVisual(mesh); this.brickMeshes.delete(id); }
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

  getUserCameraConfig() {
    this.camera.updateMatrixWorld(true);
    this.machineRoot.updateWorldMatrix(true, false);
    const worldPosition = this.camera.getWorldPosition(new THREE.Vector3());
    const worldDirection = this.camera.getWorldDirection(new THREE.Vector3());
    const worldQuaternion = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
    const worldTarget = worldPosition.clone().addScaledVector(worldDirection, 1000);
    const worldUpPoint = worldPosition.clone().add(worldUp);
    const localPosition = this.machineRoot.worldToLocal(worldPosition.clone());
    const localTarget = this.machineRoot.worldToLocal(worldTarget.clone());
    const localUp = this.machineRoot.worldToLocal(worldUpPoint.clone()).sub(localPosition).normalize();
    return {
      position: localPosition.toArray(),
      target: localTarget.toArray(),
      up: localUp.toArray(),
      projection: 'perspective',
      fovYDeg: this.camera.getEffectiveFOV(),
      nearMm: this.camera.near,
      farMm: this.camera.far
    };
  }

  captureInspectionCamera(descriptor, { widthPx = 640, heightPx = 360, quality = 0.82 } = {}) {
    if (!descriptor?.position || !descriptor?.target) throw new Error('invalid_camera_descriptor');
    const width = Math.max(160, Math.min(960, Math.round(Number(widthPx) || 640)));
    const height = Math.max(90, Math.min(540, Math.round(Number(heightPx) || 360)));
    const aspect = width / height;
    let camera;
    if (descriptor.projection === 'perspective') {
      camera = new THREE.PerspectiveCamera(descriptor.fovYDeg ?? 62, aspect, descriptor.nearMm ?? 2, descriptor.farMm ?? 12000);
    } else {
      const halfWidth = Number(descriptor.halfWidth);
      if (!Number.isFinite(halfWidth) || halfWidth <= 0) throw new Error('invalid_camera_descriptor');
      const halfHeight = halfWidth / aspect;
      camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, descriptor.nearMm ?? 1, descriptor.farMm ?? 2600);
    }
    this.machineRoot.updateWorldMatrix(true, false);
    const localPosition = new THREE.Vector3().fromArray(descriptor.position);
    const localTarget = new THREE.Vector3().fromArray(descriptor.target);
    const localUp = new THREE.Vector3().fromArray(descriptor.up ?? [0, 0, 1]).normalize();
    const worldPosition = this.machineRoot.localToWorld(localPosition.clone());
    const worldTarget = this.machineRoot.localToWorld(localTarget.clone());
    const worldUpPoint = this.machineRoot.localToWorld(localPosition.clone().add(localUp));
    camera.position.copy(worldPosition);
    camera.up.copy(worldUpPoint.sub(worldPosition).normalize());
    camera.lookAt(worldTarget);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false
    });
    const pixels = new Uint8Array(width * height * 4);
    const previousTarget = this.webgl.getRenderTarget();
    try {
      this.webgl.setRenderTarget(target);
      this.webgl.clear();
      this.webgl.render(this.scene, camera);
      this.webgl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    } finally {
      this.webgl.setRenderTarget(previousTarget);
      target.dispose();
    }
    const rowBytes = width * 4;
    const row = new Uint8Array(rowBytes);
    for (let top = 0, bottom = height - 1; top < bottom; top += 1, bottom -= 1) {
      const topOffset = top * rowBytes;
      const bottomOffset = bottom * rowBytes;
      row.set(pixels.subarray(topOffset, topOffset + rowBytes));
      pixels.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes);
      pixels.set(row, bottomOffset);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('snapshot_canvas_unavailable');
    const image = context.createImageData(width, height);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
    return {
      ok: true,
      cameraId: descriptor.id,
      worldRevision: descriptor.worldRevision,
      widthPx: width,
      heightPx: height,
      mimeType: 'image/jpeg',
      dataUrl: canvas.toDataURL('image/jpeg', Math.max(0.5, Math.min(0.95, Number(quality) || 0.82)))
    };
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
    if (!this.resizeDirty && this.lastPixelRatio === pixelRatio) return;
    this.lastPixelRatio = pixelRatio;
    this.webgl.setPixelRatio(pixelRatio);
    if (this.canvas.width !== Math.round(width * pixelRatio) || this.canvas.height !== Math.round(height * pixelRatio)) this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.resizeDirty = false;
  }

  render() {
    this.resize();
    this.frameBricks = this.controller.getBricks();
    this.syncTargets();
    this.syncBricks(this.frameBricks);
    this.updateRobot();
    this.updatePlayerInteraction(this.frameBricks);
    this.syncHeldGhost();
    this.syncSnapPreview();
    const shadowInterval = 1000 / Math.max(1, Number(this.playerSettings?.shadowUpdateHz ?? 60));
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    if (this.webgl.shadowMap.enabled && now - this.lastShadowUpdateAt >= shadowInterval) {
      this.webgl.shadowMap.needsUpdate = true;
      this.lastShadowUpdateAt = now;
    }
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
          this.stepSnapAnimation(this.physicsStepSeconds);
          this.loosePhysics.step(this.physicsStepSeconds);
        }
      }
      this.lastFrame = now;
      this.workbench.update(now);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }

  setMoreBricksHandler(handler) { this.moreBricksHandler = handler; }

  launchSpawnedBricks(bricks) {
    for (const brick of bricks ?? []) {
      this.loosePhysics.launch(brick.id, {
        position: brick.position,
        yawRad: brick.yawRad ?? 0,
        velocityMmS: (brick.initialVelocityMps ?? [0, 0, 0]).map((value) => value * 1000),
        angularVelocityRadS: brick.initialAngularVelocityRadS ?? [0, 0, 0]
      });
    }
  }

  applySettings(key = '*') {
    this.ur10?.applySettings?.(key);
    const tableChanged = key === '*' || /^(table|leg|mat|gridVisible|gridColor|gridOpacity)/.test(key);
    const mountChanged = key === '*' || /^robotMount/.test(key);
    const lightingChanged = key === '*' || /^(backgroundBrightness|environmentIntensity|keyLight|keyX|keyY|keyZ|fillIntensity|rimIntensity|shadow|sun|exposure|toneMapping)/.test(key);
    const floorChanged = key === '*' || /^floor/.test(key);
    const collisionChanged = tableChanged || mountChanged || key === '*' || /^playerCollision/.test(key);
    const brickGeometryChanged = key === '*' || /^(brickLengthMm|brickWidthMm|brickBodyHeightMm|studPitchMm|studDiameterMm|studHeightMm)$/.test(key);
    const brickMaterialChanged = key === '*' || /^(brickRoughness|brickMetalness)$/.test(key);
    if (tableChanged) {
      this.workbench.rebuild();
      this.workSurface = this.workbench.mat;
    }
    if (mountChanged) this.applyMachineTransform();
    if (tableChanged || mountChanged) this.configurePlacementFrame();
    if (collisionChanged) this.playerCollision?.setObstacles(this.playerObstacles());
    if (lightingChanged) {
      this.scene.background = new THREE.Color(0xe9eef3).multiplyScalar(this.playerSettings.backgroundBrightness);
      this.webgl.toneMappingExposure = this.playerSettings.exposure;
      this.webgl.toneMapping = toneMappingFromSetting(this.playerSettings.toneMapping);
      this.webgl.shadowMap.enabled = this.playerSettings.shadowsEnabled;
      this.buildLighting();
    }
    if (floorChanged && this.floor?.material) {
      this.floor.material.color.set(this.playerSettings.floorColor);
      this.floor.material.roughness = this.playerSettings.floorRoughness;
      this.floor.material.metalness = this.playerSettings.floorMetalness;
      this.floor.material.needsUpdate = true;
    }
    this.gripper?.applySettings?.(key);
    if (brickGeometryChanged) {
      this.brickFactory.rebuild();
      this.batcher.rebuildGeometry();
      applyV8BrickGeometry(this.heldGhost, this.playerSettings, this.brickFactory);
      for (const visuals of this.lookaheadPreviews ?? [this.snapPreview]) {
        applyV8BrickGeometry(visuals.ghost, this.playerSettings, this.brickFactory);
      }
      for (const mesh of this.brickMeshes.values()) applyV8BrickGeometry(mesh, this.playerSettings, this.brickFactory);
      this.lastBatchSignature = '';
    }
    if (brickMaterialChanged) {
      this.batcher.applyMaterialSettings();
      applyV8BrickMaterial(this.heldGhost, this.playerSettings);
      for (const visuals of this.lookaheadPreviews ?? [this.snapPreview]) {
        applyV8BrickMaterial(visuals.ghost, this.playerSettings);
      }
      const bricks = new Map(this.controller.getBricks().map((brick) => [brick.id, brick]));
      for (const [id, mesh] of this.brickMeshes) applyV8BrickMaterial(mesh, this.playerSettings, bricks.get(id));
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
      interaction: {
        highlightedBrickId: this.highlightedBrickId,
        protectedBrickId: this.protectedBrickId,
        highlightedMoreBricks: Boolean(this.highlightedMoreBricks),
        preview: this.humanBuildAdapter?.getPreview?.() ?? null,
        snapAnimating: Boolean(this.snapAnimation),
        snapBrickId: this.snapAnimation?.brickId ?? null
      },
      looseBrickPhysics: this.loosePhysics?.getState() ?? [],
      placedBatch: this.batcher.getDiagnostics(),
      colorGrading: this.colorGrader?.getDiagnostics() ?? null,
      renderer: {
        drawCalls: this.webgl.info.render.calls,
        triangles: this.webgl.info.render.triangles,
        lines: this.webgl.info.render.lines,
        points: this.webgl.info.render.points,
        pixelRatio: this.webgl.getPixelRatio(),
        shadowUpdateHz: this.playerSettings?.shadowUpdateHz ?? 60
      }
    };
  }
}
