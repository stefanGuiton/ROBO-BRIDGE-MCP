import { familyProfile } from "./catalogue.js";
import { checksum, fnv1a, stableStringify } from "./stable-json.js";
import {
  plannedBasculeLayout,
  plannedBoxWallXs,
  plannedHangerXs,
  plannedPierXs,
  plannedSuspensionLayout,
  plannedViaductBoundaries,
  resolveFoundation,
  snapToGrid,
  validateBridgeSpec,
  validateGraph,
} from "./validation.js";

const round = (value) => Math.round(value * 1e6) / 1e6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const uniqueSorted = (values) => [...new Set(values.map(round))].sort((a, b) => a - b);

function snap(value, step = 1) {
  const snapped = snapToGrid(value, step);
  if (!Number.isFinite(snapped)) throw new TypeError(`Cannot snap non-finite geometry value: ${value}.`);
  return snapped;
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function dedupePoints(points) {
  const output = points.filter((point, index) => index === 0 || pointKey(point) !== pointKey(points[index - 1]));
  if (output.length > 1 && pointKey(output[0]) === pointKey(output.at(-1))) output.pop();
  return output;
}

function buildIntent(profile, role, memberClass, sectionStuds) {
  const masonry = profile.compatibility === "brick-native";
  if (role === "deck" || memberClass.includes("lintel")) return { buildClass: "brick-course", rasterMode: "horizontal-course", sectionStuds };
  if (role === "pier" || role === "tower") return { buildClass: memberClass.includes("trestle") ? "technic-frame" : "brick-stack", rasterMode: "vertical-stack", sectionStuds };
  if (role === "arch") return masonry
    ? { buildClass: "masonry-arch", rasterMode: memberClass.includes("corbel") ? "orthogonal-step" : "stepped-arch-ring", sectionStuds }
    : { buildClass: "technic-frame", rasterMode: "technic-member", sectionStuds };
  if (["diagonal", "vertical", "chord"].includes(role) && !masonry) return { buildClass: "technic-frame", rasterMode: "technic-member", sectionStuds };
  return { buildClass: "brick-beam", rasterMode: "line-raster", sectionStuds };
}

function connectionIntent(buildClass, rasterMode) {
  if (rasterMode === "hinged-deck") return "hinge-pin";
  if (buildClass === "technic-frame") return "technic-pin";
  if (buildClass === "masonry-arch") return "staggered-masonry-bond";
  if (buildClass === "brick-stack") return "overlapping-stud-stack";
  return "overlapping-stud-bond";
}

function createBuilder(challenge, spec) {
  const nodes = [];
  const members = [];
  const cables = [];
  const brickZones = [];
  const profile = familyProfile(spec.family);
  const startX = challenge.entry.position.x;
  const resolvedGeometry = {
    deckStations: [],
    supportStations: [startX, startX + spec.span],
    pierStations: [],
    towerStations: [],
    anchorStations: [],
    hangerStations: [],
    hingeStations: [],
    leafTipStations: [],
  };
  const capacity = clamp(Math.round(spec.targetLoadClass + spec.structuralDensity - 0.5), 1, 5);
  const sectionStuds = clamp(Math.round(1 + spec.structuralDensity * 3), 2, 4);
  const stud = spec.brick.studSize;
  const layer = spec.brick.layerHeight;
  return {
    challenge, spec, profile, startX, endX: startX + spec.span, capacity, sectionStuds,
    nodes, members, cables, brickZones, resolvedGeometry,
    x(value) { return snap(value, stud); },
    y(value) { return snap(value, layer); },
    node(x, y, role = "joint", supportType = "none", extra = {}) {
      const node = { id: nodes.length + 1, x: snap(x, stud), y: snap(y, layer), role, supportType, ...extra };
      nodes.push(node);
      return node.id;
    },
    member(nodeA, nodeB, role, memberClass, capacityClass = capacity, extra = {}) {
      const intent = buildIntent(profile, role, memberClass, extra.sectionStuds ?? sectionStuds);
      const mergedIntent = { ...intent, ...extra };
      const member = {
        id: members.length + 1,
        nodeA,
        nodeB,
        role,
        memberClass,
        capacityClass,
        ...mergedIntent,
        connectionIntent: extra.connectionIntent ?? connectionIntent(mergedIntent.buildClass, mergedIntent.rasterMode),
      };
      members.push(member);
      return member.id;
    },
    cable(anchorNodeA, anchorNodeB, structuralRole, samples, hangerTargets = [], extra = {}) {
      const cable = {
        id: cables.length + 1,
        anchorNodeA,
        anchorNodeB,
        structuralRole,
        breakable: false,
        connectionIntent: structuralRole === "hanger" ? "cable-clamp" : "anchored-cable-eyelet",
        samples: dedupePoints(samples.map((point) => ({ x: snap(point.x, stud), y: snap(point.y, layer) }))),
        hangerTargets: hangerTargets.map((point) => ({ x: snap(point.x, stud), y: snap(point.y, layer) })),
        ...extra,
      };
      cables.push(cable);
      return cable.id;
    },
    zone(role, outer, holes = [], extra = {}) {
      const normalise = (polygon) => dedupePoints(polygon.map((point) => ({ x: snap(point.x, stud), y: snap(point.y, layer) })));
      const zone = {
        id: `Z${String(brickZones.length + 1).padStart(3, "0")}`,
        role,
        outer: normalise(outer),
        holes: holes.map(normalise),
        bondPattern: spec.brick.bondPattern,
        rasterMode: "course-fill",
        ...extra,
      };
      brickZones.push(zone);
      return zone.id;
    },
  };
}

function stationXs(builder, includePiers = false, extras = []) {
  const panelCount = builder.spec.panelCount ?? 8;
  const xs = Array.from({ length: panelCount + 1 }, (_, index) => builder.x(builder.startX + (builder.spec.span * index) / panelCount));
  if (includePiers) xs.push(...pierXs(builder));
  xs.push(...extras.map((value) => builder.x(value)));
  return uniqueSorted(xs);
}

function pierXs(builder) {
  const xs = plannedPierXs(builder.challenge, builder.spec);
  builder.resolvedGeometry.pierStations = [...xs];
  return xs;
}

function addDeckZone(builder, startX = builder.startX, endX = builder.endX, role = "deck") {
  const bottom = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  builder.zone(role, [
    { x: startX, y: bottom }, { x: startX, y: builder.spec.deckHeight },
    { x: endX, y: builder.spec.deckHeight }, { x: endX, y: bottom },
  ], [], { memberClass: "bonded-deck", minThicknessStuds: builder.spec.brick.sideThicknessStuds });
}

function deck(builder, xs = stationXs(builder), extra = {}) {
  builder.resolvedGeometry.deckStations = [...xs];
  const ids = xs.map((x, index) => builder.node(
    x,
    builder.spec.deckHeight,
    index === 0 || index === xs.length - 1 ? "support" : "deck",
    index === 0 || index === xs.length - 1 ? "fixed" : "none",
    extra,
  ));
  for (let index = 0; index < ids.length - 1; index += 1) builder.member(ids[index], ids[index + 1], "deck", "bonded-deck", builder.capacity + 1, extra);
  addDeckZone(builder);
  return { xs, ids };
}

function deckNodeAt(deckData, x) {
  const index = deckData.xs.findIndex((station) => Math.abs(station - x) < 1e-6);
  return index >= 0 ? deckData.ids[index] : null;
}

function foundationFor(builder, x, kinds) {
  const foundation = resolveFoundation(builder.challenge, x, kinds);
  if (!foundation) throw new Error(`Foundation preflight invariant failed at x=${x} for ${kinds.join("/")}.`);
  return foundation.y;
}

function addPierZone(builder, x, foundationY, topY, role = "pier") {
  const width = Math.max(2, builder.sectionStuds * 2);
  const left = builder.x(x - width / 2);
  const right = builder.x(x + width / 2);
  builder.zone(role, [
    { x: left, y: foundationY }, { x: left, y: topY },
    { x: right, y: topY }, { x: right, y: foundationY },
  ], [], { memberClass: role === "tower" ? "masonry-tower" : "bonded-pier", minThicknessStuds: width });
}

function addPiers(builder, deckData, withBracing = false, technic = false, positions = pierXs(builder)) {
  const piers = [];
  for (const x of positions) {
    const foundationY = foundationFor(builder, x, ["pier", "fixed"]);
    const topId = deckNodeAt(deckData, x) ?? builder.node(x, builder.spec.deckHeight, "deck", "none");
    const baseId = builder.node(x, foundationY, "pier", "terrain");
    builder.member(baseId, topId, "pier", technic ? "trestle-column" : "bonded-pier", builder.capacity + 1);
    if (!technic) addPierZone(builder, x, foundationY, builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
    piers.push({ x, topId, baseId });
  }
  if (withBracing) {
    for (let index = 0; index < piers.length - 1; index += 1) {
      builder.member(piers[index].baseId, piers[index + 1].topId, "diagonal", "trestle-x-brace", builder.capacity);
      builder.member(piers[index].topId, piers[index + 1].baseId, "diagonal", "trestle-x-brace", builder.capacity);
    }
  }
  return piers;
}

function beam(builder) {
  deck(builder);
}

function pier(builder) {
  const positions = pierXs(builder);
  const deckData = deck(builder, stationXs(builder, false, positions));
  addPiers(builder, deckData, false, false, positions);
}

function trestle(builder) {
  const positions = pierXs(builder);
  const deckData = deck(builder, stationXs(builder, false, positions));
  addPiers(builder, deckData, builder.spec.crossBracing, true, positions);
}

function warren(builder) {
  const deckData = deck(builder);
  const topIds = [];
  for (let index = 0; index < builder.spec.panelCount; index += 1) {
    const x = builder.x((deckData.xs[index] + deckData.xs[index + 1]) / 2);
    topIds.push(builder.node(x, builder.spec.deckHeight + builder.spec.trussHeight, "joint", "none"));
    builder.member(deckData.ids[index], topIds[index], "diagonal", "warren-diagonal");
    builder.member(topIds[index], deckData.ids[index + 1], "diagonal", "warren-diagonal");
    if (index > 0) builder.member(topIds[index - 1], topIds[index], "chord", "upper-chord", builder.capacity + 1);
  }
  if (builder.spec.crossBracing) {
    for (let index = 1; index < topIds.length; index += 2) {
      builder.member(topIds[index], deckData.ids[index - 1], "diagonal", "warren-secondary-cross-brace", Math.max(1, builder.capacity - 1));
      builder.member(topIds[index - 1], deckData.ids[index + 1], "diagonal", "warren-secondary-cross-brace", Math.max(1, builder.capacity - 1));
    }
  }
}

function prattHowe(builder, mode) {
  const deckData = deck(builder);
  const topIds = deckData.xs.map((x) => builder.node(x, builder.spec.deckHeight + builder.spec.trussHeight, "joint", "none"));
  for (let index = 0; index < topIds.length - 1; index += 1) builder.member(topIds[index], topIds[index + 1], "chord", "upper-chord", builder.capacity + 1);
  for (let index = 0; index < topIds.length; index += 1) builder.member(deckData.ids[index], topIds[index], "vertical", "truss-vertical");
  const midpoint = builder.spec.panelCount / 2;
  for (let index = 0; index < builder.spec.panelCount; index += 1) {
    // Pratt diagonals descend towards the centre; Howe is the exact reverse.
    const forward = mode === "pratt" ? index >= midpoint : index < midpoint;
    builder.member(
      forward ? deckData.ids[index] : topIds[index],
      forward ? topIds[index + 1] : deckData.ids[index + 1],
      "diagonal",
      `${mode}-diagonal`,
    );
    if (builder.spec.crossBracing && Math.abs(index + 0.5 - midpoint) < 1.1) builder.member(
      forward ? topIds[index] : deckData.ids[index],
      forward ? deckData.ids[index + 1] : topIds[index + 1],
      "diagonal",
      `${mode}-counter-brace`,
      Math.max(1, builder.capacity - 1),
    );
  }
}

function archCurveY(shape, x, startX, span, springY, crownY) {
  const rise = crownY - springY;
  const t = clamp((x - startX) / span, 0, 1);
  if (shape === "elliptical") {
    const u = 2 * t - 1;
    return springY + rise * Math.sqrt(Math.max(0, 1 - u * u));
  }
  const half = span / 2;
  const radius = (half * half + rise * rise) / (2 * rise);
  const centreY = crownY - radius;
  const localX = x - (startX + half);
  return centreY + Math.sqrt(Math.max(0, radius * radius - localX * localX));
}

function archCurvePoints(builder, startX, span, springY, crownY, count, shape = builder.spec.archShape) {
  return dedupePoints(Array.from({ length: count + 1 }, (_, index) => {
    const x = builder.x(startX + (span * index) / count);
    return { x, y: builder.y(archCurveY(shape, x, startX, span, springY, crownY)) };
  }));
}

function addArchMembers(builder, points, memberClass, endpointIds = []) {
  const ids = points.map((point, index) => endpointIds[index] ?? builder.node(point.x, point.y, index === 0 || index === points.length - 1 ? "joint" : "joint", "none"));
  for (let index = 1; index < ids.length; index += 1) builder.member(ids[index - 1], ids[index], "arch", memberClass, builder.capacity + 1);
  return ids;
}

function addAbutment(builder, x, foundationY, springY, fixed = false) {
  const supportType = fixed ? "fixed" : "terrain";
  if (Math.abs(foundationY - springY) < 1e-6) return builder.node(x, springY, "support", supportType);
  const baseId = builder.node(x, foundationY, "support", supportType);
  const springId = builder.node(x, springY, "joint", "none");
  builder.member(baseId, springId, "pier", "masonry-abutment", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
  return springId;
}

function masonryBodyZone(builder, startX, endX, deckY, leftFoundation, rightFoundation, openingCurve, role = "masonry-body") {
  builder.zone(role, [
    { x: startX, y: leftFoundation }, { x: startX, y: deckY },
    { x: endX, y: deckY }, { x: endX, y: rightFoundation },
  ], [[...openingCurve, { x: endX, y: rightFoundation }, { x: startX, y: leftFoundation }]], {
    memberClass: "closed-spandrel-masonry",
    minThicknessStuds: builder.sectionStuds,
  });
}

function arch(builder) {
  const deckData = deck(builder);
  const deckUnderside = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  const springY = builder.y(builder.spec.deckHeight - builder.spec.archRise);
  const leftFoundation = foundationFor(builder, builder.startX, ["fixed", "arch"]);
  const rightFoundation = foundationFor(builder, builder.endX, ["fixed", "arch"]);
  const leftSpring = addAbutment(builder, builder.startX, leftFoundation, springY, true);
  const rightSpring = addAbutment(builder, builder.endX, rightFoundation, springY, true);
  const curve = archCurvePoints(builder, builder.startX, builder.spec.span, springY, deckUnderside, Math.max(8, builder.spec.panelCount));
  const archIds = addArchMembers(builder, curve, `${builder.spec.archShape}-masonry-arch`, { 0: leftSpring, [curve.length - 1]: rightSpring });
  for (let index = 1; index < deckData.xs.length - 1; index += 1) {
    const x = deckData.xs[index];
    const nearest = curve.reduce((best, point, curveIndex) => Math.abs(point.x - x) < Math.abs(curve[best].x - x) ? curveIndex : best, 0);
    if (curve[nearest].y < builder.spec.deckHeight) builder.member(archIds[nearest], deckData.ids[index], "vertical", "masonry-spandrel-tie", builder.capacity);
  }
  masonryBodyZone(builder, builder.startX, builder.endX, builder.spec.deckHeight, leftFoundation, rightFoundation, curve);
}

function viaduct(builder) {
  const count = builder.spec.archCount;
  const boundaries = plannedViaductBoundaries(builder.challenge, builder.spec);
  const deckData = deck(builder, uniqueSorted([...stationXs(builder), ...boundaries]));
  const deckUnderside = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  const pierData = boundaries.map((x, index) => {
    const foundationY = foundationFor(builder, x, index === 0 || index === count ? ["fixed", "arch"] : ["pier", "arch"]);
    const topId = deckNodeAt(deckData, x) ?? builder.node(x, builder.spec.deckHeight, "deck", "none");
    const baseId = builder.node(x, foundationY, "pier", index === 0 || index === count ? "fixed" : "terrain");
    builder.member(baseId, topId, "pier", "viaduct-pier", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    addPierZone(builder, x, foundationY, deckUnderside, "viaduct-pier");
    return { x, foundationY, topId };
  });
  const springIds = new Map();
  for (let module = 0; module < count; module += 1) {
    const startX = boundaries[module];
    const endX = boundaries[module + 1];
    const span = endX - startX;
    const springY = builder.y(deckUnderside - builder.spec.archRise);
    const curve = archCurvePoints(builder, startX, span, springY, deckUnderside, 8);
    if (!springIds.has(startX)) springIds.set(startX, builder.node(startX, springY, "joint", "none"));
    if (!springIds.has(endX)) springIds.set(endX, builder.node(endX, springY, "joint", "none"));
    const ids = addArchMembers(builder, curve, "viaduct-masonry-arch", { 0: springIds.get(startX), [curve.length - 1]: springIds.get(endX) });
    if (module === 0) builder.member(ids[0], pierData[module].topId, "vertical", "masonry-spandrel-tie", builder.capacity);
    builder.member(ids.at(-1), pierData[module + 1].topId, "vertical", "masonry-spandrel-tie", builder.capacity);
    masonryBodyZone(builder, startX, endX, builder.spec.deckHeight, springY, springY, curve, "viaduct-bay");
  }
}

function orthogonalise(points) {
  const output = [points[0]];
  for (const point of points.slice(1)) {
    const previous = output.at(-1);
    if (previous.x !== point.x && previous.y !== point.y) output.push({ x: point.x, y: previous.y });
    if (pointKey(output.at(-1)) !== pointKey(point)) output.push(point);
  }
  return dedupePoints(output);
}

function corbelled(builder) {
  deck(builder);
  const deckUnderside = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  const springY = builder.y(builder.spec.deckHeight - builder.spec.archRise);
  const centerX = builder.x(builder.startX + builder.spec.span / 2);
  const layers = Math.max(2, Math.round((deckUnderside - springY) / builder.spec.brick.layerHeight));
  const leftRaw = Array.from({ length: layers + 1 }, (_, index) => {
    const progress = index / layers;
    return { x: builder.x(builder.startX + (centerX - builder.startX) * Math.pow(progress, 0.82)), y: builder.y(springY + (deckUnderside - springY) * progress) };
  });
  const left = orthogonalise(leftRaw);
  const right = left
    .filter((point) => point.x < centerX)
    .reverse()
    .map((point) => ({ x: builder.x(builder.endX - (point.x - builder.startX)), y: point.y }));
  const curve = orthogonalise(dedupePoints([...left, ...right]));
  const leftFoundation = foundationFor(builder, builder.startX, ["fixed", "arch"]);
  const rightFoundation = foundationFor(builder, builder.endX, ["fixed", "arch"]);
  const leftSpring = addAbutment(builder, builder.startX, leftFoundation, springY, true);
  const rightSpring = addAbutment(builder, builder.endX, rightFoundation, springY, true);
  addArchMembers(builder, curve, "corbelled-masonry", { 0: leftSpring, [curve.length - 1]: rightSpring });
  masonryBodyZone(builder, builder.startX, builder.endX, builder.spec.deckHeight, leftFoundation, rightFoundation, curve, "corbelled-body");
}

function boxCulvert(builder) {
  const [left, right] = plannedBoxWallXs(builder.challenge, builder.spec);
  const deckData = deck(builder, stationXs(builder, false, [left, right]));
  const topY = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  const leftFoundation = foundationFor(builder, left, ["pier", "arch", "fixed"]);
  const rightFoundation = foundationFor(builder, right, ["pier", "arch", "fixed"]);
  const leftBase = builder.node(left, leftFoundation, "support", "terrain");
  const rightBase = builder.node(right, rightFoundation, "support", "terrain");
  const leftTop = builder.node(left, topY, "joint", "none");
  const rightTop = builder.node(right, topY, "joint", "none");
  builder.member(leftBase, leftTop, "pier", "culvert-sidewall", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
  builder.member(rightBase, rightTop, "pier", "culvert-sidewall", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
  builder.member(leftTop, rightTop, "beam", "culvert-lintel", builder.capacity + 1, { sectionStuds: builder.spec.brick.deckThicknessLayers });
  builder.member(leftTop, deckNodeAt(deckData, left), "vertical", "culvert-lintel-bearing", builder.capacity);
  builder.member(rightTop, deckNodeAt(deckData, right), "vertical", "culvert-lintel-bearing", builder.capacity);
  builder.zone("box-culvert", [
    { x: builder.startX, y: leftFoundation }, { x: builder.startX, y: builder.spec.deckHeight },
    { x: builder.endX, y: builder.spec.deckHeight }, { x: builder.endX, y: rightFoundation },
  ], [[{ x: left, y: leftFoundation }, { x: left, y: topY }, { x: right, y: topY }, { x: right, y: rightFoundation }]], {
    memberClass: "bonded-box-culvert",
    minThicknessStuds: builder.sectionStuds * 2,
  });
}

function tiedArch(builder) {
  const hangerXs = plannedHangerXs(
    builder.startX,
    builder.endX,
    builder.spec.hangerSpacing,
    builder.spec.brick.studSize,
  );
  builder.resolvedGeometry.hangerStations = [...hangerXs];
  const deckData = deck(builder, stationXs(builder, false, hangerXs));
  const archIds = [deckData.ids[0]];
  for (let index = 1; index < deckData.xs.length - 1; index += 1) {
    const t = index / (deckData.xs.length - 1);
    const point = {
      x: deckData.xs[index],
      y: Math.max(
        builder.y(builder.spec.deckHeight + builder.spec.brick.layerHeight),
        builder.y(builder.spec.deckHeight + 4 * builder.spec.trussHeight * t * (1 - t)),
      ),
    };
    archIds.push(builder.node(point.x, point.y, "joint", "none"));
  }
  archIds.push(deckData.ids.at(-1));
  for (let index = 1; index < archIds.length; index += 1) builder.member(archIds[index - 1], archIds[index], "arch", "tied-arch-rib", builder.capacity + 1);
  for (const x of hangerXs) {
    const index = deckData.xs.indexOf(x);
    builder.member(deckData.ids[index], archIds[index], "vertical", "tied-arch-hanger", builder.capacity, { connectionIntent: "technic-pin" });
  }
  if (builder.spec.crossBracing) {
    for (let index = 1; index < archIds.length - 2; index += 2) {
      builder.member(deckData.ids[index], archIds[index + 1], "diagonal", "tied-arch-cross-brace", Math.max(1, builder.capacity - 1));
      builder.member(archIds[index], deckData.ids[index + 1], "diagonal", "tied-arch-cross-brace", Math.max(1, builder.capacity - 1));
    }
  }
}

function cablePointOnCentralSpan(x, leftX, rightX, topY, sag) {
  const t = clamp((x - leftX) / (rightX - leftX), 0, 1);
  return topY - 4 * sag * t * (1 - t);
}

function suspension(builder) {
  const layout = plannedSuspensionLayout(builder.challenge, builder.spec);
  const [leftTowerX, rightTowerX] = layout.towers;
  const [leftAnchorX, rightAnchorX] = layout.anchors;
  const hangerXs = plannedHangerXs(leftTowerX, rightTowerX, builder.spec.hangerSpacing, builder.spec.brick.studSize);
  builder.resolvedGeometry.towerStations = [...layout.towers];
  builder.resolvedGeometry.anchorStations = [...layout.anchors];
  builder.resolvedGeometry.hangerStations = [...hangerXs];
  const deckData = deck(builder, stationXs(builder, false, [...layout.towers, ...hangerXs]));
  const towerTopY = builder.y(builder.spec.deckHeight + builder.spec.towerHeight);
  const towerTops = [];
  for (const x of [leftTowerX, rightTowerX]) {
    const foundationY = foundationFor(builder, x, ["tower", "pier"]);
    const base = builder.node(x, foundationY, "tower", "terrain");
    const deckId = deckNodeAt(deckData, x);
    const top = builder.node(x, towerTopY, "tower", "none");
    builder.member(base, deckId, "tower", "masonry-suspension-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    builder.member(deckId, top, "tower", "masonry-suspension-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    addPierZone(builder, x, foundationY, towerTopY, "tower");
    towerTops.push(top);
  }
  const leftAnchorY = foundationFor(builder, leftAnchorX, ["anchor"]);
  const rightAnchorY = foundationFor(builder, rightAnchorX, ["anchor"]);
  const leftAnchor = builder.node(leftAnchorX, leftAnchorY, "anchor", "terrain");
  const rightAnchor = builder.node(rightAnchorX, rightAnchorY, "anchor", "terrain");
  const samples = [];
  for (let index = 0; index <= 48; index += 1) {
    const x = leftAnchorX + ((rightAnchorX - leftAnchorX) * index) / 48;
    let y;
    if (x <= leftTowerX) y = leftAnchorY + ((towerTopY - leftAnchorY) * (x - leftAnchorX)) / (leftTowerX - leftAnchorX);
    else if (x >= rightTowerX) y = towerTopY + ((rightAnchorY - towerTopY) * (x - rightTowerX)) / (rightAnchorX - rightTowerX);
    else y = cablePointOnCentralSpan(x, leftTowerX, rightTowerX, towerTopY, builder.spec.cableSag);
    samples.push({ x, y });
  }
  const hangerTargets = hangerXs.map((x) => ({ x, y: builder.spec.deckHeight }));
  builder.cable(leftAnchor, rightAnchor, "main", samples, hangerTargets, { sag: builder.spec.cableSag, towerNodeIds: towerTops });
  for (const target of hangerTargets) {
    const cableY = builder.y(cablePointOnCentralSpan(target.x, leftTowerX, rightTowerX, towerTopY, builder.spec.cableSag));
    const cableNode = builder.node(target.x, cableY, "anchor", "none", { cableAttachment: true });
    const deckNode = deckNodeAt(deckData, target.x);
    builder.nodes[deckNode - 1].cableAttachment = true;
    builder.cable(cableNode, deckNode, "hanger", [{ x: target.x, y: cableY }, target], [], { parentCableId: 1 });
  }
}

function bascule(builder) {
  const layout = plannedBasculeLayout(builder.challenge, builder.spec);
  const [leftTowerX, rightTowerX] = layout.hinges;
  const centerX = layout.center;
  const panels = stationXs(builder);
  builder.resolvedGeometry.hingeStations = [...layout.hinges];
  builder.resolvedGeometry.towerStations = [...layout.hinges];
  builder.resolvedGeometry.leafTipStations = [centerX, centerX];

  const makeSequence = (xs, memberClass, moving = false, leafSide = null, sharedIds = new Map()) => {
    const ids = xs.map((x, index) => {
      if (sharedIds.has(x)) return sharedIds.get(x);
      const endpoint = x === builder.startX || x === builder.endX;
      const hinge = x === leftTowerX || x === rightTowerX;
      const tip = x === centerX;
      return builder.node(
        x,
        builder.spec.deckHeight,
        endpoint ? "support" : "deck",
        endpoint ? "fixed" : "none",
        {
          ...(hinge ? { hinge: true, articulation: "hinge", leafSide } : {}),
          ...(tip ? { articulation: "leaf-tip", leafSide, coincidentGroup: "bascule-centre-tips" } : {}),
        },
      );
    });
    for (let index = 0; index < ids.length - 1; index += 1) builder.member(
      ids[index],
      ids[index + 1],
      "deck",
      memberClass,
      builder.capacity + 1,
      moving
        ? { buildClass: "technic-frame", rasterMode: "hinged-deck", connectionIntent: "hinge-pin", articulation: "movable-leaf", leafSide }
        : { buildClass: "brick-course", rasterMode: "horizontal-course", connectionIntent: "overlapping-stud-bond" },
    );
    return { xs, ids };
  };

  const leftApproachXs = uniqueSorted([builder.startX, ...panels.filter((x) => x > builder.startX && x < leftTowerX), leftTowerX]);
  const leftLeafXs = uniqueSorted([leftTowerX, ...panels.filter((x) => x > leftTowerX && x < centerX), centerX]);
  const rightLeafXs = uniqueSorted([centerX, ...panels.filter((x) => x > centerX && x < rightTowerX), rightTowerX]);
  const rightApproachXs = uniqueSorted([rightTowerX, ...panels.filter((x) => x > rightTowerX && x < builder.endX), builder.endX]);
  const leftApproach = makeSequence(leftApproachXs, "bascule-approach-left", false, "left");
  const leftLeaf = makeSequence(leftLeafXs, "bascule-leaf-left", true, "left", new Map([[leftTowerX, leftApproach.ids.at(-1)]]));
  const rightLeaf = makeSequence(rightLeafXs, "bascule-leaf-right", true, "right");
  const rightApproach = makeSequence(rightApproachXs, "bascule-approach-right", false, "right", new Map([[rightTowerX, rightLeaf.ids.at(-1)]]));
  builder.resolvedGeometry.deckStations = uniqueSorted([...leftApproachXs, ...leftLeafXs, ...rightLeafXs, ...rightApproachXs]);
  addDeckZone(builder, builder.startX, leftTowerX, "bascule-approach-left");
  addDeckZone(builder, rightTowerX, builder.endX, "bascule-approach-right");

  const tops = [];
  for (const [index, x] of [leftTowerX, rightTowerX].entries()) {
    const foundationY = foundationFor(builder, x, ["tower", "pier"]);
    const base = builder.node(x, foundationY, "tower", "terrain");
    const deckId = index === 0 ? leftLeaf.ids[0] : rightLeaf.ids.at(-1);
    const top = builder.node(x, builder.spec.deckHeight + builder.spec.towerHeight, "tower", "none");
    builder.member(base, deckId, "tower", "masonry-bascule-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    builder.member(deckId, top, "tower", "masonry-bascule-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    addPierZone(builder, x, foundationY, builder.spec.deckHeight + builder.spec.towerHeight, "tower");
    tops.push(top);
  }
  builder.member(tops[0], tops[1], "chord", "upper-walkway", builder.capacity, { buildClass: "technic-frame", rasterMode: "technic-member" });
}

const GENERATORS = Object.freeze({
  beam,
  pier,
  trestle,
  warren,
  pratt: (builder) => prattHowe(builder, "pratt"),
  howe: (builder) => prattHowe(builder, "howe"),
  arch,
  viaduct,
  corbelled,
  boxCulvert,
  tiedArch,
  suspension,
  bascule,
});

export function generateBridgeGraph2D(challenge, spec, clock = () => globalThis.performance?.now?.() ?? Date.now()) {
  const started = clock();
  const inputValidation = validateBridgeSpec(challenge, spec);
  if (!inputValidation.valid) return { graph: null, validation: inputValidation, generationTimeMs: round(clock() - started) };
  const builder = createBuilder(challenge, spec);
  GENERATORS[spec.family](builder);
  const designRevision = fnv1a({ challenge, spec, generatorVersion: 3 });
  const graph = {
    nodes: builder.nodes,
    members: builder.members,
    cables: builder.cables,
    metadata: {
      version: 3,
      generatorVersion: 3,
      family: spec.family,
      familyLabel: builder.profile.label,
      span: spec.span,
      bridgeWidth: spec.bridgeWidth,
      vehicleClearance: spec.vehicleClearance,
      sideStructures: ["warren", "pratt", "howe", "tiedArch", "suspension", "bascule"].includes(spec.family) ? 2 : 1,
      sharedDeck: true,
      construction: {
        system: builder.profile.constructionSystem,
        compatibility: builder.profile.compatibility,
        paletteId: builder.profile.compatibility === "brick-native" ? "system-masonry-v1" : `${builder.profile.constructionSystem}-v1`,
        grid: { stud: spec.brick.studSize, layer: spec.brick.layerHeight },
        allowedParts: [...spec.brick.allowed],
        maxBeamStuds: spec.brick.maxBeamStuds,
        sideThicknessStuds: spec.brick.sideThicknessStuds,
        deckThicknessLayers: spec.brick.deckThicknessLayers,
        bondPattern: spec.brick.bondPattern,
        compilerReady: true,
      },
      resolvedGeometry: builder.resolvedGeometry,
      brickZones: builder.brickZones,
      designRevision,
      deterministicChecksum: "",
    },
  };
  graph.metadata.deterministicChecksum = checksum({ ...graph, metadata: { ...graph.metadata, deterministicChecksum: "" } });
  const graphValidation = validateGraph(graph);
  return { graph, validation: graphValidation, generationTimeMs: round(clock() - started), canonicalJson: stableStringify(graph) };
}
