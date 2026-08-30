import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { TRACK } from "./core/track.js";

const palette = {
  sky: 0xf4f7fb,
  ground: 0xdde7d5,
  ravine: 0xc4d6e4,
  deck: 0xaeb9c4,
  deckEdge: 0x758393,
  rail: 0x4d5967,
  sleeper: 0x8b6c52,
  support: 0x38a169,
  unsupported: 0xd64545,
  locomotive: 0xe66b2e,
  carriage: 0x2b78c5,
};

const TRACK_SAMPLE_STEP = 1;

export class TrainScene {
  constructor(canvas, simulation) {
    this.canvas = canvas;
    this.simulation = simulation;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.sky, 65, 125);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
    this.camera.position.set(-10, 15, 28);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 90;
    this.followTrain = true;
    this.showSupportDebug = true;
    this.showGuideDebug = false;
    this.showPhysicsDebug = false;
    this.trainGroups = [];
    this.couplerMeshes = [];
    this.trainBodyInstances = null;
    this.couplerInstances = null;
    this.guideMarkers = [];
    this.segmentVisuals = new Map();
    this.trackInstances = null;
    this.physicsLines = null;
    this.physicsDebugMaterial = new THREE.LineBasicMaterial({ vertexColors: true });
    this.lastPhysicsDebugAt = 0;
    this.lastFollowX = null;
    this.lastFollowZ = null;
    this.axisX = new THREE.Vector3(1, 0, 0);
    this.axisY = new THREE.Vector3(0, 1, 0);
    this.tempPosition = new THREE.Vector3();
    this.tempTangent = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();
    this.tempScale = new THREE.Vector3();
    this.tempMatrix = new THREE.Matrix4();
    this.tempMidpoint = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();
    this.supportColor = new THREE.Color(palette.support);
    this.unsupportedColor = new THREE.Color(palette.unsupported);
    this.#buildLighting();
    this.#buildEnvironment();
    this.#buildTrack();
    this.#buildTrainResources();
    this.rebuildTrain();
    this.setSideView();
    this.resize();
  }

  #buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa9b49c, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-20, 34, 24);
    this.scene.add(sun);
  }

  #buildEnvironment() {
    const bankMaterial = new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 0.92 });
    const bankGeometry = new THREE.BoxGeometry(32, 1.8, 30);
    const leftBank = new THREE.Mesh(bankGeometry, bankMaterial);
    leftBank.position.set(-34, -1.05, 0);
    const rightBank = new THREE.Mesh(bankGeometry, bankMaterial);
    rightBank.position.x = 34;
    this.scene.add(leftBank, rightBank);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 30),
      new THREE.MeshStandardMaterial({ color: palette.ravine, roughness: 0.55, metalness: 0.08 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -7.45;
    this.scene.add(water);

    const grid = new THREE.GridHelper(96, 48, 0xbac5cf, 0xd7dee5);
    grid.position.y = -7.42;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    this.scene.add(grid);
  }

  #setTrackMatrix(mesh, index, sample, alongLength, lateralOffset, verticalOffset, scaleY = 1, scaleZ = 1) {
    this.tempTangent.set(sample.tangent.x, sample.tangent.y, sample.tangent.z);
    this.tempQuaternion.setFromUnitVectors(this.axisX, this.tempTangent);
    this.tempPosition.set(
      sample.position.x + sample.lateral.x * lateralOffset + sample.vertical.x * verticalOffset,
      sample.position.y + sample.lateral.y * lateralOffset + sample.vertical.y * verticalOffset,
      sample.position.z + sample.lateral.z * lateralOffset + sample.vertical.z * verticalOffset,
    );
    this.tempScale.set(alongLength, scaleY, scaleZ);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    mesh.setMatrixAt(index, this.tempMatrix);
  }

  #buildTrack() {
    const count = Math.ceil((TRACK.endS - TRACK.startS) / TRACK_SAMPLE_STEP);
    const whiteStandard = (roughness, metalness = 0) => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness,
      metalness,
    });
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, TRACK.deckWidth), whiteStandard(0.82), count);
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.14, 0.12), whiteStandard(0.32, 0.62), count * 2);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.12, 2.35), whiteStandard(0.9), count);
    const debug = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.28, TRACK.deckWidth + 0.8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }),
      this.simulation.supportMap.segments.length,
    );
    const deckColor = new THREE.Color(palette.deck);
    const railColor = new THREE.Color(palette.rail);
    const sleeperColor = new THREE.Color(palette.sleeper);

    for (let index = 0; index < count; index += 1) {
      const startS = TRACK.startS + index * TRACK_SAMPLE_STEP;
      const endS = Math.min(TRACK.endS, startS + TRACK_SAMPLE_STEP);
      const middleS = (startS + endS) / 2;
      const sample = this.simulation.centreline.sample(middleS);
      const length = (endS - startS) / Math.max(0.25, sample.tangent.x) * 0.985;
      const segment = this.simulation.supportMap.segmentAt(middleS);
      const visual = this.segmentVisuals.get(segment.id) ?? { deckIndices: [], railIndices: [], sleeperIndices: [], debugIndex: segment.id };
      this.segmentVisuals.set(segment.id, visual);

      this.#setTrackMatrix(deck, index, sample, length, 0, -TRACK.railTopY);
      deck.setColorAt(index, deckColor);
      visual.deckIndices.push(index);

      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const railIndex = index * 2 + sideIndex;
        const side = sideIndex === 0 ? -1 : 1;
        this.#setTrackMatrix(rails, railIndex, sample, length, side * TRACK.gauge / 2, -0.07);
        rails.setColorAt(railIndex, railColor);
        visual.railIndices.push(railIndex);
      }

      this.#setTrackMatrix(sleepers, index, sample, 1, 0, -(TRACK.railTopY - 0.26));
      sleepers.setColorAt(index, sleeperColor);
      visual.sleeperIndices.push(index);
    }

    for (const segment of this.simulation.supportMap.segments) {
      const middleS = (segment.startS + segment.endS) / 2;
      const sample = this.simulation.centreline.sample(middleS);
      const length = (segment.endS - segment.startS) / Math.max(0.25, sample.tangent.x) * 0.98;
      this.#setTrackMatrix(debug, segment.id, sample, length, 0, -(TRACK.railTopY + 0.52));
      debug.setColorAt(segment.id, segment.supported ? this.supportColor : this.unsupportedColor);
    }
    debug.visible = this.showSupportDebug;
    for (const mesh of [deck, rails, sleepers, debug]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    this.trackInstances = { deck, rails, sleepers, debug, deckColor, railColor, sleeperColor };

    const pierMaterial = new THREE.MeshStandardMaterial({ color: palette.deckEdge, roughness: 0.85 });
    const pierGeometry = new THREE.BoxGeometry(2.3, 7.2, 5.4);
    for (const x of [-19, 19]) {
      const sample = this.simulation.centreline.sample(x);
      const pier = new THREE.Mesh(pierGeometry, pierMaterial);
      pier.position.set(sample.position.x, -3.75, sample.position.z);
      this.scene.add(pier);
    }
    this.syncSupports();
  }

  #buildTrainResources() {
    this.trainResources = {
      bodyGeometry: new THREE.BoxGeometry(3, 1, 1.36),
      bodyMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.08 }),
      couplerGeometry: new THREE.CylinderGeometry(0.075, 0.075, 1, 8),
      couplerMaterial: new THREE.MeshStandardMaterial({ color: 0x394653, metalness: 0.65, roughness: 0.35 }),
      guideGeometry: new THREE.SphereGeometry(0.14, 8, 6),
    };
  }

  rebuildTrain() {
    if (this.trainGroups.length === this.simulation.bodies.length) {
      this.lastFollowX = null;
      this.lastFollowZ = null;
      this.sync(1);
      this.setSideView();
      return;
    }
    if (this.trainBodyInstances) this.scene.remove(this.trainBodyInstances);
    if (this.couplerInstances) this.scene.remove(this.couplerInstances);
    this.guideMarkers.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.material.dispose();
    });
    this.trainGroups = [];
    this.couplerMeshes = [];
    this.guideMarkers = [];

    this.trainBodyInstances = new THREE.InstancedMesh(
      this.trainResources.bodyGeometry,
      this.trainResources.bodyMaterial,
      this.simulation.bodies.length,
    );
    this.trainBodyInstances.frustumCulled = false;
    const locomotiveColor = new THREE.Color(palette.locomotive);
    const carriageColor = new THREE.Color(palette.carriage);
    this.simulation.bodies.forEach((entry, index) => {
      const transform = new THREE.Object3D();
      transform.scale.set(1, entry.halfHeight * 2, 1);
      this.trainGroups.push(transform);
      this.trainBodyInstances.setColorAt(index, index === 0 ? locomotiveColor : carriageColor);
    });
    this.trainBodyInstances.instanceColor.needsUpdate = true;
    this.scene.add(this.trainBodyInstances);

    this.couplerInstances = new THREE.InstancedMesh(
      this.trainResources.couplerGeometry,
      this.trainResources.couplerMaterial,
      Math.max(1, this.simulation.bodies.length - 1),
    );
    this.couplerInstances.count = Math.max(0, this.simulation.bodies.length - 1);
    this.couplerInstances.frustumCulled = false;
    this.scene.add(this.couplerInstances);
    for (let index = 0; index < this.simulation.bodies.length * 2; index += 1) {
      const marker = new THREE.Mesh(
        this.trainResources.guideGeometry,
        new THREE.MeshBasicMaterial({ color: palette.support }),
      );
      marker.visible = this.showGuideDebug;
      this.scene.add(marker);
      this.guideMarkers.push(marker);
    }
    this.lastFollowX = null;
    this.lastFollowZ = null;
    this.sync(1);
    this.setSideView();
  }

  sync(alpha = 1) {
    const states = this.simulation.getRenderStates();
    states.forEach((state, index) => {
      const group = this.trainGroups[index];
      if (!group) return;
      group.position.lerpVectors(state.previousPosition, state.currentPosition, alpha);
      group.quaternion.slerpQuaternions(state.previousRotation, state.currentRotation, alpha);
      group.updateMatrix();
      this.trainBodyInstances.setMatrixAt(index, group.matrix);
    });
    this.trainBodyInstances.instanceMatrix.needsUpdate = true;
    for (let index = 0; index < this.couplerInstances.count; index += 1) {
      const a = this.trainGroups[index].position;
      const b = this.trainGroups[index + 1].position;
      this.tempMidpoint.addVectors(a, b).multiplyScalar(0.5);
      this.tempDirection.subVectors(b, a);
      const length = this.tempDirection.length();
      this.tempQuaternion.setFromUnitVectors(this.axisY, this.tempDirection.normalize());
      this.tempScale.set(1, length, 1);
      this.tempMatrix.compose(this.tempMidpoint, this.tempQuaternion, this.tempScale);
      this.couplerInstances.setMatrixAt(index, this.tempMatrix);
    }
    this.couplerInstances.instanceMatrix.needsUpdate = true;
    this.simulation.guideTelemetry.forEach((guide, index) => {
      const marker = this.guideMarkers[index];
      if (!marker || !guide.position) return;
      marker.visible = this.showGuideDebug;
      marker.position.set(guide.position.x, guide.position.y, guide.position.z);
      marker.material.color.setHex(guide.supported && guide.release > 0 ? palette.support : palette.unsupported);
      marker.scale.setScalar(0.65 + guide.release * 0.65);
    });
    this.#syncPhysicsDebug();
  }

  syncSupports() {
    if (!this.trackInstances) return;
    for (const segment of this.simulation.supportMap.segments) {
      const visual = this.segmentVisuals.get(segment.id);
      if (!visual) continue;
      const supported = segment.supported;
      const color = supported ? null : this.unsupportedColor;
      for (const index of visual.deckIndices) this.trackInstances.deck.setColorAt(index, color ?? this.trackInstances.deckColor);
      for (const index of visual.railIndices) this.trackInstances.rails.setColorAt(index, color ?? this.trackInstances.railColor);
      for (const index of visual.sleeperIndices) this.trackInstances.sleepers.setColorAt(index, color ?? this.trackInstances.sleeperColor);
      this.trackInstances.debug.setColorAt(visual.debugIndex, supported ? this.supportColor : this.unsupportedColor);
    }
    this.trackInstances.debug.visible = this.showSupportDebug;
    for (const mesh of Object.values(this.trackInstances)) {
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  #syncPhysicsDebug() {
    if (!this.showPhysicsDebug || !this.simulation.world) {
      if (this.physicsLines) this.physicsLines.visible = false;
      return;
    }
    const now = performance.now();
    if (now - this.lastPhysicsDebugAt < 66) return;
    this.lastPhysicsDebugAt = now;
    const { vertices, colors } = this.simulation.world.debugRender();
    const rgb = new Float32Array((colors.length / 4) * 3);
    for (let source = 0, target = 0; source < colors.length; source += 4) {
      rgb[target++] = colors[source];
      rgb[target++] = colors[source + 1];
      rgb[target++] = colors[source + 2];
    }
    if (this.physicsLines) {
      this.scene.remove(this.physicsLines);
      this.physicsLines.geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    this.physicsLines = new THREE.LineSegments(geometry, this.physicsDebugMaterial);
    this.scene.add(this.physicsLines);
  }

  setSideView() {
    const position = this.simulation.getRenderStates()[0]?.currentPosition ?? { x: 0, y: 0, z: 0 };
    this.camera.position.set(position.x, position.y + 8.5, position.z + 25);
    this.controls.target.set(position.x, position.y - 0.5, position.z);
    this.controls.update();
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.followTrain && this.trainGroups[0]) {
      const position = this.trainGroups[0].position;
      if (this.lastFollowX === null) {
        this.lastFollowX = position.x;
        this.lastFollowZ = position.z;
      }
      const deltaX = (position.x - this.lastFollowX) * 0.075;
      const deltaZ = (position.z - this.lastFollowZ) * 0.075;
      this.camera.position.x += deltaX;
      this.camera.position.z += deltaZ;
      this.controls.target.x += deltaX;
      this.controls.target.z += deltaZ;
      this.lastFollowX += deltaX;
      this.lastFollowZ += deltaZ;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  getRenderStats() {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
}
