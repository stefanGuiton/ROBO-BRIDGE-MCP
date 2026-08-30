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

export class TrainScene {
  constructor(canvas, simulation) {
    this.canvas = canvas;
    this.simulation = simulation;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.sky, 65, 125);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
    this.camera.position.set(-10, 15, 28);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.guideMarkers = [];
    this.segmentVisuals = new Map();
    this.physicsLines = null;
    this.lastFollowX = null;
    this.#buildLighting();
    this.#buildEnvironment();
    this.#buildTrack();
    this.rebuildTrain();
    this.setSideView();
    this.resize();
  }

  #buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa9b49c, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-20, 34, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    this.scene.add(sun);
  }

  #buildEnvironment() {
    const bankMaterial = new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 0.92 });
    const leftBank = new THREE.Mesh(new THREE.BoxGeometry(32, 1.8, 30), bankMaterial);
    leftBank.position.set(-34, -1.05, 0);
    leftBank.receiveShadow = true;
    const rightBank = leftBank.clone();
    rightBank.position.x = 34;
    this.scene.add(leftBank, rightBank);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 30),
      new THREE.MeshStandardMaterial({ color: palette.ravine, roughness: 0.55, metalness: 0.08 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -7.45;
    water.receiveShadow = true;
    this.scene.add(water);

    const grid = new THREE.GridHelper(96, 48, 0xbac5cf, 0xd7dee5);
    grid.position.y = -7.42;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    this.scene.add(grid);
  }

  #buildTrack() {
    const deckGeometry = new THREE.BoxGeometry(TRACK.segmentLength - 0.05, 0.3, TRACK.deckWidth);
    const railGeometry = new THREE.BoxGeometry(TRACK.segmentLength - 0.08, 0.14, 0.12);
    const sleeperGeometry = new THREE.BoxGeometry(0.18, 0.12, 2.35);
    const deckMaterial = new THREE.MeshStandardMaterial({ color: palette.deck, roughness: 0.82 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: palette.rail, metalness: 0.62, roughness: 0.32 });
    const sleeperMaterial = new THREE.MeshStandardMaterial({ color: palette.sleeper, roughness: 0.9 });
    const lostDeckMaterial = new THREE.MeshStandardMaterial({
      color: palette.unsupported,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const lostTrackMaterial = new THREE.MeshStandardMaterial({
      color: palette.unsupported,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const supportOk = new THREE.MeshBasicMaterial({ color: palette.support, transparent: true, opacity: 0.16 });
    const supportLost = new THREE.MeshBasicMaterial({ color: palette.unsupported, transparent: true, opacity: 0.34 });

    for (const segment of this.simulation.supportMap.segments) {
      const midpoint = (segment.startS + segment.endS) / 2;
      const group = new THREE.Group();
      const deck = new THREE.Mesh(deckGeometry, deckMaterial);
      deck.receiveShadow = true;
      deck.position.y = 0;
      group.add(deck);
      const trackParts = [];
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(railGeometry, railMaterial);
        rail.position.set(0, TRACK.railTopY - 0.07, side * TRACK.gauge / 2);
        rail.castShadow = true;
        group.add(rail);
        trackParts.push(rail);
      }
      for (let index = 0; index < 6; index += 1) {
        const sleeper = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
        sleeper.position.set(-2.5 + index, 0.26, 0);
        sleeper.receiveShadow = true;
        group.add(sleeper);
        trackParts.push(sleeper);
      }
      group.position.x = midpoint;
      this.scene.add(group);

      const debug = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK.segmentLength - 0.12, 0.28, TRACK.deckWidth + 0.8),
        supportOk,
      );
      debug.position.set(midpoint, -0.52, 0);
      this.scene.add(debug);
      this.segmentVisuals.set(segment.id, {
        group,
        deck,
        trackParts,
        debug,
        materials: { deckMaterial, railMaterial, sleeperMaterial, lostDeckMaterial, lostTrackMaterial, supportOk, supportLost },
      });
    }

    const bridgePierMaterial = new THREE.MeshStandardMaterial({ color: palette.deckEdge, roughness: 0.85 });
    for (const x of [-19, 19]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.3, 7.2, 5.4), bridgePierMaterial);
      pier.position.set(x, -3.75, 0);
      pier.castShadow = true;
      pier.receiveShadow = true;
      this.scene.add(pier);
    }
    this.syncSupports();
  }

  rebuildTrain() {
    this.trainGroups.forEach((group) => this.scene.remove(group));
    this.couplerMeshes.forEach((mesh) => this.scene.remove(mesh));
    this.guideMarkers.forEach((mesh) => this.scene.remove(mesh));
    this.trainGroups = [];
    this.couplerMeshes = [];
    this.guideMarkers = [];

    this.simulation.bodies.forEach((entry, index) => {
      const locomotive = index === 0;
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: locomotive ? palette.locomotive : palette.carriage,
        roughness: 0.5,
        metalness: 0.08,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, entry.halfHeight * 2, 1.36), bodyMaterial);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(locomotive ? 1.15 : 2.55, 0.25, 1.2),
        new THREE.MeshStandardMaterial({ color: locomotive ? 0x7d3322 : 0xe7edf4, roughness: 0.55 }),
      );
      roof.position.y = entry.halfHeight + 0.12;
      roof.position.x = locomotive ? -0.45 : 0;
      roof.castShadow = true;
      group.add(roof);
      const bogieMaterial = new THREE.MeshStandardMaterial({ color: 0x26323d, roughness: 0.7 });
      for (const x of [-0.95, 0.95]) {
        for (const z of [-0.73, 0.73]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), bogieMaterial);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(x, -entry.halfHeight, z);
          wheel.castShadow = true;
          group.add(wheel);
        }
      }
      this.scene.add(group);
      this.trainGroups.push(group);
    });

    const couplerGeometry = new THREE.CylinderGeometry(0.075, 0.075, 1, 10);
    const couplerMaterial = new THREE.MeshStandardMaterial({ color: 0x394653, metalness: 0.65, roughness: 0.35 });
    for (let index = 0; index < this.simulation.bodies.length - 1; index += 1) {
      const coupler = new THREE.Mesh(couplerGeometry, couplerMaterial);
      coupler.castShadow = true;
      this.scene.add(coupler);
      this.couplerMeshes.push(coupler);
    }

    const guideGeometry = new THREE.SphereGeometry(0.14, 12, 8);
    for (let index = 0; index < this.simulation.bodies.length * 2; index += 1) {
      const marker = new THREE.Mesh(guideGeometry, new THREE.MeshBasicMaterial({ color: palette.support }));
      marker.visible = this.showGuideDebug;
      this.scene.add(marker);
      this.guideMarkers.push(marker);
    }
    this.lastFollowX = null;
    this.sync();
    this.setSideView();
  }

  sync() {
    const transforms = this.simulation.getBodyTransforms();
    transforms.forEach((transform, index) => {
      const group = this.trainGroups[index];
      if (!group) return;
      group.position.set(transform.translation.x, transform.translation.y, transform.translation.z);
      group.quaternion.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
    });
    this.couplerMeshes.forEach((mesh, index) => {
      const a = this.trainGroups[index].position;
      const b = this.trainGroups[index + 1].position;
      const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const direction = new THREE.Vector3().subVectors(b, a);
      mesh.position.copy(midpoint);
      mesh.scale.set(1, direction.length(), 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    });
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
    for (const segment of this.simulation.supportMap.segments) {
      const visual = this.segmentVisuals.get(segment.id);
      if (!visual) continue;
      visual.deck.material = segment.supported ? visual.materials.deckMaterial : visual.materials.lostDeckMaterial;
      visual.trackParts.forEach((part, index) => {
        part.material = segment.supported
          ? (index < 2 ? visual.materials.railMaterial : visual.materials.sleeperMaterial)
          : visual.materials.lostTrackMaterial;
      });
      visual.debug.material = segment.supported ? visual.materials.supportOk : visual.materials.supportLost;
      visual.debug.visible = this.showSupportDebug;
    }
  }

  #syncPhysicsDebug() {
    if (this.physicsLines) {
      this.scene.remove(this.physicsLines);
      this.physicsLines.geometry.dispose();
      this.physicsLines = null;
    }
    if (!this.showPhysicsDebug || !this.simulation.world) return;
    const { vertices, colors } = this.simulation.world.debugRender();
    const rgb = new Float32Array((colors.length / 4) * 3);
    for (let source = 0, target = 0; source < colors.length; source += 4) {
      rgb[target++] = colors[source];
      rgb[target++] = colors[source + 1];
      rgb[target++] = colors[source + 2];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    this.physicsLines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.scene.add(this.physicsLines);
  }

  setSideView() {
    const x = this.simulation.bodies[0]?.body.translation().x ?? 0;
    this.camera.position.set(x, 8.5, 25);
    this.controls.target.set(x, 0, 0);
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
    if (this.followTrain && this.simulation.bodies[0]) {
      const x = this.simulation.bodies[0].body.translation().x;
      if (this.lastFollowX === null) this.lastFollowX = x;
      const delta = (x - this.lastFollowX) * 0.075;
      this.camera.position.x += delta;
      this.controls.target.x += delta;
      this.lastFollowX += delta;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
