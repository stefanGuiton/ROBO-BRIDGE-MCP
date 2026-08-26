import * as THREE from 'three';

function roundedBoxGeometry(width, height, depth, radius = 6) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -depth / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 1.5,
    bevelThickness: 1.5,
    curveSegments: 12
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -height / 2, 0);
  return geometry;
}

function racetrackShape(length, radius) {
  const shape = new THREE.Shape();
  shape.moveTo(0, radius);
  shape.lineTo(length, radius);
  shape.absarc(length, 0, radius, Math.PI / 2, -Math.PI / 2, true);
  shape.lineTo(0, -radius);
  shape.absarc(0, 0, radius, -Math.PI / 2, Math.PI / 2, true);
  shape.closePath();
  return shape;
}

function tangentArmShape(length, radiusStart, radiusEnd) {
  const shape = new THREE.Shape();
  const angle = Math.asin((radiusStart - radiusEnd) / length);
  const x0 = radiusStart * Math.sin(angle);
  const y0 = radiusStart * Math.cos(angle);
  const x1 = length + radiusEnd * Math.sin(angle);
  const y1 = radiusEnd * Math.cos(angle);
  shape.moveTo(x0, y0);
  shape.lineTo(x1, y1);
  shape.absarc(length, 0, radiusEnd, Math.PI / 2 - angle, -Math.PI / 2 + angle, true);
  shape.lineTo(x0, -y0);
  shape.absarc(0, 0, radiusStart, -Math.PI / 2 + angle, Math.PI / 2 - angle, true);
  shape.closePath();
  return shape;
}

function extrudeHorizontal(shape, thickness, bevel = 2) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 6,
    curveSegments: 64
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function cylinder(radius, height, material, segments = 72) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function mesh(geometry, material) {
  const result = new THREE.Mesh(geometry, material);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function makeMicroTexture(size = 96) {
  const data = new Uint8Array(size * size);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const value = 0.5
        + 0.18 * Math.sin(tau * (u * 7 + v * 3))
        + 0.1 * Math.sin(tau * (u * 17 - v * 11))
        + 0.05 * Math.cos(tau * (u * 31 + v * 23));
      data[y * size + x] = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createScaraRobot(config) {
  const materials = {
    aluminium: new THREE.MeshPhysicalMaterial({
      color: 0xe8eaed,
      metalness: 0.84,
      roughness: 0.2,
      clearcoat: 0.14,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.8,
      anisotropy: 0.25
    }),
    aluminiumSide: new THREE.MeshPhysicalMaterial({
      color: 0xcfd4d9,
      metalness: 0.76,
      roughness: 0.28,
      clearcoat: 0.08,
      envMapIntensity: 1.7
    }),
    machined: new THREE.MeshPhysicalMaterial({
      color: 0xbac1c8,
      metalness: 0.9,
      roughness: 0.17,
      envMapIntensity: 2.05,
      anisotropy: 0.32
    }),
    dark: new THREE.MeshPhysicalMaterial({ color: 0x20262e, metalness: 0.52, roughness: 0.34, envMapIntensity: 1.2 }),
    dark2: new THREE.MeshPhysicalMaterial({ color: 0x10151c, metalness: 0.35, roughness: 0.44, envMapIntensity: 1.0 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.02, roughness: 0.86 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.18, roughness: 0.28 })
  };
  const micro = makeMicroTexture();
  for (const material of [materials.aluminium, materials.aluminiumSide, materials.machined]) {
    material.bumpMap = micro;
    material.bumpScale = 0.08;
  }

  const root = new THREE.Group();
  root.name = 'scara-robot';
  const base = new THREE.Group();
  root.add(base);

  const pedestal = mesh(roundedBoxGeometry(120, 74, 120, 11), materials.dark);
  pedestal.position.y = 37;
  base.add(pedestal);
  for (const [x, z] of [[-52, -52], [-52, 52], [52, -52], [52, 52]]) {
    const foot = mesh(roundedBoxGeometry(32, 12, 32, 5), materials.dark2);
    foot.position.set(x, 6, z);
    base.add(foot);
  }
  const motor = mesh(roundedBoxGeometry(62, 58, 70, 8), materials.dark);
  motor.position.set(-58, 55, 0);
  base.add(motor);
  const motorAccent = mesh(new THREE.BoxGeometry(4, 22, 30), materials.accent);
  motorAccent.position.set(-91, 55, 0);
  base.add(motorAccent);

  const columnHeight = 690;
  const column = cylinder(27, columnHeight, materials.machined, 96);
  column.position.y = columnHeight / 2;
  base.add(column);
  const columnCore = cylinder(21, columnHeight - 24, materials.dark2, 96);
  columnCore.position.y = columnHeight / 2 + 2;
  base.add(columnCore);
  const columnSkin = cylinder(24.2, columnHeight - 32, materials.machined, 96);
  columnSkin.position.y = columnHeight / 2 + 4;
  base.add(columnSkin);
  const footCollar = cylinder(38, 28, materials.dark2, 96);
  footCollar.position.y = 95;
  base.add(footCollar);

  const carriage = new THREE.Group();
  carriage.name = 'carriage';
  root.add(carriage);
  const carriageSleeve = cylinder(42, 38, materials.dark2, 96);
  carriageSleeve.position.y = -16;
  carriage.add(carriageSleeve);
  const carriageCap = cylinder(36, 8, materials.machined, 96);
  carriageCap.position.y = 5;
  carriage.add(carriageCap);

  const proximalGeometry = extrudeHorizontal(tangentArmShape(config.link1Mm, 66, 46), 42, 2.4);
  const proximal = mesh(proximalGeometry, [materials.aluminium, materials.aluminiumSide]);
  carriage.add(proximal);

  const elbow = new THREE.Group();
  elbow.name = 'elbow';
  elbow.position.set(config.link1Mm, 58, 0);
  carriage.add(elbow);
  const elbowBase = cylinder(51, 15, materials.dark2, 96);
  elbowBase.position.y = -8;
  elbow.add(elbowBase);
  const elbowRing = cylinder(44, 12, materials.dark, 96);
  elbowRing.position.y = 3;
  elbow.add(elbowRing);

  const distalGeometry = extrudeHorizontal(racetrackShape(config.link2Mm, 45), 33, 2.1);
  const distal = mesh(distalGeometry, [materials.aluminium, materials.aluminiumSide]);
  distal.position.y = 8;
  elbow.add(distal);

  const wrist = new THREE.Group();
  wrist.name = 'wrist';
  wrist.position.set(config.link2Mm, 8, 0);
  elbow.add(wrist);
  const flange = cylinder(31, 12, materials.dark2, 72);
  flange.position.y = 22;
  wrist.add(flange);
  const body = mesh(roundedBoxGeometry(62, 72, 58, 8), materials.dark);
  body.position.y = -20;
  wrist.add(body);
  const wristAccent = mesh(new THREE.BoxGeometry(64, 5, 60), materials.accent);
  wristAccent.position.y = 9;
  wrist.add(wristAccent);

  const gripper = new THREE.Group();
  gripper.name = 'parallel-gripper';
  gripper.position.y = -64;
  wrist.add(gripper);
  const palm = mesh(roundedBoxGeometry(72, 24, 58, 6), materials.dark2);
  gripper.add(palm);
  const leftFinger = mesh(roundedBoxGeometry(13, 70, 18, 4), materials.machined);
  const rightFinger = leftFinger.clone();
  leftFinger.name = 'left-finger';
  rightFinger.name = 'right-finger';
  leftFinger.position.set(-24, -44, 0);
  rightFinger.position.set(24, -44, 0);
  gripper.add(leftFinger, rightFinger);
  const leftPad = mesh(roundedBoxGeometry(6, 38, 22, 3), materials.rubber);
  const rightPad = leftPad.clone();
  leftPad.position.set(7, -10, 0);
  rightPad.position.set(-7, -10, 0);
  leftFinger.add(leftPad);
  rightFinger.add(rightPad);

  const pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const endEffectorPick = new THREE.Mesh(new THREE.SphereGeometry(46, 24, 16), pickMaterial);
  endEffectorPick.name = 'end-effector-pick-volume';
  endEffectorPick.position.y = -93;
  wrist.add(endEffectorPick);

  function applyState(state) {
    carriage.rotation.y = THREE.MathUtils.degToRad(state.joints.thetaDeg);
    elbow.rotation.y = THREE.MathUtils.degToRad(state.joints.psiDeg);
    carriage.position.y = 92 + state.joints.zMm;
    const opening = 7 + state.gripper.openFraction * 20;
    leftFinger.position.x = -opening;
    rightFinger.position.x = opening;
  }

  return {
    root,
    base,
    carriage,
    elbow,
    wrist,
    gripper,
    leftFinger,
    rightFinger,
    endEffectorPick,
    materials,
    applyState,
    getEndEffectorWorldPosition(target = new THREE.Vector3()) {
      return endEffectorPick.getWorldPosition(target);
    }
  };
}
