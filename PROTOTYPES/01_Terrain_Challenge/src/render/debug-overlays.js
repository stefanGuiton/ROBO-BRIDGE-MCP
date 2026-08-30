import * as THREE from "three";

function labelMarker(label, position, color) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.5, 0.34, 10, 40),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22;
  group.add(ring);
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 74;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(255,255,255,.96)"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${new THREE.Color(color).getHexString()}`; context.lineWidth = 5; context.strokeRect(3, 3, 250, 68);
  context.fillStyle = "#18251f"; context.font = "800 31px system-ui"; context.textAlign = "center"; context.fillText(label, 128, 49);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(13, 3.75, 1); sprite.position.y = 5;
  group.add(sprite);
  group.position.set(position.x, position.y + 0.18, position.z);
  return group;
}

function createPlatformGroup(result) {
  const group = new THREE.Group(); group.name = "debug-platforms";
  for (const platform of [result.platforms.left, result.platforms.right]) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(platform.length, platform.width),
      new THREE.MeshBasicMaterial({ color: 0x2d9f69, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(platform.centre.x, platform.planeY + 0.09, platform.centre.z);
    group.add(plane);
    const outlinePoints = [...platform.polygon, platform.polygon[0]].map((point) => new THREE.Vector3(point.x, platform.planeY + 0.14, point.z));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePoints), new THREE.LineBasicMaterial({ color: 0x126c46 })));
  }
  const datumPoints = [
    new THREE.Vector3(result.platforms.left.bounds.minX, result.platforms.sharedPlaneY + 0.18, -result.settings.platformWidth * 0.7),
    new THREE.Vector3(result.platforms.right.bounds.maxX, result.platforms.sharedPlaneY + 0.18, -result.settings.platformWidth * 0.7)
  ];
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(datumPoints), new THREE.LineDashedMaterial({ color: 0x197a55, dashSize: 2, gapSize: 1 })));
  group.children.at(-1).computeLineDistances();
  return group;
}

function createSupportGroup(result) {
  const group = new THREE.Group(); group.name = "debug-support";
  const positions = [];
  const stride = result.settings.gridU * result.settings.gridV > 18000 ? 2 : 1;
  for (let iz = 0; iz < result.settings.gridV; iz += stride) {
    for (let ix = 0; ix < result.settings.gridU; ix += stride) {
      const index = iz * result.settings.gridU + ix;
      if (!result.supportMask[index]) continue;
      const sample = result.api.getGridSample(ix, iz);
      positions.push(sample.x, sample.y + 0.2, sample.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x30a56d, size: 0.48, transparent: true, opacity: 0.58, depthWrite: false }));
  group.add(points);
  return group;
}

function createObstacleGroup(result) {
  const group = new THREE.Group(); group.name = "debug-obstacle";
  const makeLine = (offset, color) => {
    const points = result.obstacle.centreline.map((point) => new THREE.Vector3(point.x + offset, result.api.getHeightAt(point.x + offset, point.z) + 0.2, point.z));
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  };
  const floor = result.settings.floorWidth / 2;
  const shoulder = result.settings.shoulderWidth;
  group.add(makeLine(-floor, 0x356d8c), makeLine(floor, 0x356d8c));
  group.add(makeLine(-(floor + shoulder), 0xb47e4d), makeLine(floor + shoulder, 0xb47e4d));
  return group;
}

function createCorridorGroup(result) {
  const group = new THREE.Group(); group.name = "debug-corridor";
  const length = result.exit.position.x - result.entry.position.x;
  const clearance = new THREE.Mesh(
    new THREE.BoxGeometry(length, result.corridor.vehicleClearHeight, result.corridor.vehicleClearWidth),
    new THREE.MeshBasicMaterial({ color: 0x4a90e2, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })
  );
  clearance.position.set((result.entry.position.x + result.exit.position.x) / 2, result.platforms.sharedPlaneY + result.corridor.vehicleClearHeight / 2, 0);
  group.add(clearance);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.22, result.corridor.deckWidth),
    new THREE.MeshBasicMaterial({ color: 0x2875c7, transparent: true, opacity: 0.42, depthWrite: false })
  );
  deck.position.set(clearance.position.x, result.platforms.sharedPlaneY + 0.24, 0);
  group.add(deck);
  return group;
}

export function createDebugOverlays(result, visibility) {
  const root = new THREE.Group(); root.name = "debug-overlays";
  const anchors = new THREE.Group(); anchors.name = "debug-anchors";
  anchors.add(labelMarker("ENTRY", result.entry.position, 0x1c9ed1), labelMarker("EXIT", result.exit.position, 0xe69a23));
  anchors.visible = visibility.anchors; root.add(anchors);
  const platforms = createPlatformGroup(result); platforms.visible = visibility.platforms; root.add(platforms);
  const support = createSupportGroup(result); support.visible = visibility.support; root.add(support);
  const obstacle = createObstacleGroup(result); obstacle.visible = visibility.obstacle; root.add(obstacle);
  const corridor = createCorridorGroup(result); corridor.visible = visibility.corridor; root.add(corridor);
  return root;
}
