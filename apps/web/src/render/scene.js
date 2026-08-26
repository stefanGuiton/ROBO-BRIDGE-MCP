import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createScaraRobot } from './robot.js';
import { createWorkcell } from './workcell.js';

export function createRobotLabRenderer({ viewport, robotController, sceneState, onInteraction }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111820);
  scene.fog = new THREE.FogExp2(0x111820, 0.0005);

  const camera = new THREE.PerspectiveCamera(31, 1, 1, 5000);
  camera.position.set(930, 720, 980);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  viewport.appendChild(renderer.domElement);

  const gl = renderer.getContext();
  const debugRendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererIdentity = Object.freeze({
    backend: 'webgl2',
    threeRevision: THREE.REVISION,
    vendor: debugRendererInfo ? String(gl.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)) : null,
    renderer: debugRendererInfo ? String(gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)) : null,
    version: String(gl.getParameter(gl.VERSION))
  });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();

  RectAreaLightUniformsLib.init();
  const key = new THREE.RectAreaLight(0xfff3e0, 8.5, 550, 550);
  key.position.set(-320, 820, 450);
  key.lookAt(0, 180, 0);
  scene.add(key);
  const fill = new THREE.RectAreaLight(0xd8e8ff, 5.8, 520, 400);
  fill.position.set(620, 460, -320);
  fill.lookAt(0, 180, 0);
  scene.add(fill);
  const rim = new THREE.RectAreaLight(0xffffff, 5.4, 440, 360);
  rim.position.set(-100, 620, -700);
  rim.lookAt(0, 220, 0);
  scene.add(rim);
  const shadowKey = new THREE.DirectionalLight(0xffffff, 3.2);
  shadowKey.position.set(-300, 900, 500);
  shadowKey.castShadow = true;
  shadowKey.shadow.mapSize.set(4096, 4096);
  shadowKey.shadow.camera.left = -900;
  shadowKey.shadow.camera.right = 900;
  shadowKey.shadow.camera.top = 900;
  shadowKey.shadow.camera.bottom = -900;
  shadowKey.shadow.camera.near = 80;
  shadowKey.shadow.camera.far = 1900;
  shadowKey.shadow.bias = -0.00018;
  shadowKey.shadow.normalBias = 1.0;
  scene.add(shadowKey);
  scene.add(new THREE.HemisphereLight(0xe9f4ff, 0x1a2430, 1.5));

  const robot = createScaraRobot(robotController.getConfig());
  scene.add(robot.root);
  const workcell = createWorkcell(sceneState);
  scene.add(workcell.root);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.screenSpacePanning = true;
  controls.minDistance = 520;
  controls.maxDistance = 2200;
  controls.target.set(0, 240, 0);
  controls.update();

  const pathMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
  const path = new THREE.Line(new THREE.BufferGeometry(), pathMaterial);
  path.frustumCulled = false;
  scene.add(path);
  const targetMarker = new THREE.Mesh(
    new THREE.TorusGeometry(34, 4, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 })
  );
  targetMarker.rotation.x = Math.PI / 2;
  targetMarker.visible = false;
  scene.add(targetMarker);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const tempWorld = new THREE.Vector3();
  let dragging = false;
  let dragPointerId = null;
  let dragKind = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartZ = 0;

  function pointerNdc(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function updateRay(event) {
    pointerNdc(event);
    raycaster.setFromCamera(pointer, camera);
  }

  function beginDrag(event) {
    if (event.button !== 0) return;
    updateRay(event);
    const intersects = raycaster.intersectObject(robot.endEffectorPick, false);
    if (!intersects.length) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    dragPointerId = event.pointerId;
    dragKind = null;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartZ = robotController.getState().cartesian.zMm;
    robot.getEndEffectorWorldPosition(tempWorld);
    dragPlane.constant = -tempWorld.y;
    controls.enabled = false;
    renderer.domElement.setPointerCapture?.(event.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
    onInteraction?.({ type: 'drag_started' });
  }

  function moveDrag(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (!dragKind && Math.hypot(dx, dy) > 6) {
      dragKind = event.shiftKey || Math.abs(dy) > Math.abs(dx) * 1.12 ? 'z' : 'xy';
    }
    if (dragKind === 'z') {
      const scale = Math.max(0.45, Math.min(1.15, camera.position.distanceTo(controls.target) / 1050));
      const current = robotController.getState().cartesian;
      const result = robotController.moveEndEffector({
        xMm: current.xMm,
        yMm: current.yMm,
        zMm: dragStartZ - dy * scale
      });
      onInteraction?.({ type: 'manual_move', result });
    } else if (dragKind === 'xy') {
      updateRay(event);
      if (raycaster.ray.intersectPlane(dragPlane, hit)) {
        const current = robotController.getState().cartesian;
        const result = robotController.moveEndEffector({ xMm: hit.x, yMm: -hit.z, zMm: current.zMm });
        onInteraction?.({ type: 'manual_move', result });
      }
    }
  }

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = false;
    dragPointerId = null;
    dragKind = null;
    controls.enabled = true;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    renderer.domElement.style.cursor = 'default';
    onInteraction?.({ type: 'drag_ended' });
  }

  renderer.domElement.addEventListener('pointerdown', beginDrag, true);
  renderer.domElement.addEventListener('pointermove', moveDrag, true);
  renderer.domElement.addEventListener('pointerup', endDrag, true);
  renderer.domElement.addEventListener('pointercancel', endDrag, true);
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (dragging) return;
    updateRay(event);
    renderer.domElement.style.cursor = raycaster.intersectObject(robot.endEffectorPick, false).length ? 'grab' : 'default';
  });

  robotController.subscribe((_event, state) => robot.applyState(state));

  function displayTrajectory(trajectory, status = 'proposed') {
    const colours = { proposed: 0x38bdf8, validated: 0x22c55e, invalid: 0xef4444, warning: 0xf59e0b };
    path.material.color.setHex(colours[status] ?? colours.proposed);
    const points = trajectory.map((point) => new THREE.Vector3(point.xMm, 92 + point.zMm, -point.yMm));
    path.geometry.dispose();
    path.geometry = new THREE.BufferGeometry().setFromPoints(points);
    path.visible = points.length > 1;
    if (points.length) {
      targetMarker.position.copy(points[points.length - 1]);
      targetMarker.visible = true;
      targetMarker.material.color.setHex(colours[status] ?? colours.proposed);
    }
  }

  function clearTrajectory() {
    path.visible = false;
    targetMarker.visible = false;
  }

  function fitView() {
    camera.position.set(930, 720, 980);
    controls.target.set(0, 240, 0);
    controls.update();
  }

  function resize() {
    const rect = viewport.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }
  window.addEventListener('resize', resize);
  resize();

  let disposed = false;
  let previousFrameAt = performance.now();
  const frameIntervals = [];
  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const frameAt = performance.now();
    const interval = frameAt - previousFrameAt;
    previousFrameAt = frameAt;
    if (interval > 0 && interval < 1000) {
      frameIntervals.push(interval);
      if (frameIntervals.length > 240) frameIntervals.shift();
    }
    controls.update();
    const state = robotController.getState();
    if (state.gripper.holdingObjectId) {
      robot.getEndEffectorWorldPosition(tempWorld);
      workcell.setHeldObjectPose(state.gripper.holdingObjectId, tempWorld);
    }
    renderer.render(scene, camera);
  }
  animate();

  return {
    scene,
    camera,
    renderer,
    controls,
    robot,
    workcell,
    displayTrajectory,
    clearTrajectory,
    fitView,
    getDiagnostics() {
      const sorted = [...frameIntervals].sort((a, b) => a - b);
      const percentile = (fraction) => sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]
        : null;
      const medianIntervalMs = percentile(0.5);
      return {
        ...rendererIdentity,
        frameSampleCount: sorted.length,
        medianIntervalMs,
        p95IntervalMs: percentile(0.95),
        approximateFps: medianIntervalMs ? 1000 / medianIntervalMs : null,
        pixelRatio: renderer.getPixelRatio()
      };
    },
    setQuality(mode) {
      if (mode === 'performance') {
        renderer.setPixelRatio(1);
        shadowKey.shadow.mapSize.set(1024, 1024);
      } else if (mode === 'cinematic') {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        shadowKey.shadow.mapSize.set(4096, 4096);
      } else {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        shadowKey.shadow.mapSize.set(2048, 2048);
      }
      shadowKey.shadow.map?.dispose();
      shadowKey.shadow.map = null;
      resize();
    },
    dispose() {
      disposed = true;
      window.removeEventListener('resize', resize);
      controls.dispose();
      renderer.dispose();
      environment.dispose();
      pmrem.dispose();
    }
  };
}
