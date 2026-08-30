import { familyProfile } from "./catalogue.js";
import { checksum, fnv1a, stableStringify } from "./stable-json.js";
import { foundationAt, report, validateBridgeSpec, validateGraph } from "./validation.js";

const round = (value) => Math.round(value * 1e6) / 1e6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const uniqueSorted = (values) => [...new Set(values.map(round))].sort((a, b) => a - b);

function snap(value, step = 1) {
  return round(Math.round(value / step) * step);
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function dedupePoints(points) {
  return points.filter((point, index) => index === 0 || pointKey(point) !== pointKey(points[index - 1]));
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

function createBuilder(challenge, spec) {
  const nodes = [];
  const members = [];
  const cables = [];
  const brickZones = [];
  const profile = familyProfile(spec.family);
  const startX = challenge.entry.position.x;
  const capacity = clamp(Math.round(spec.targetLoadClass + spec.structuralDensity - 0.5), 1, 5);
  const sectionStuds = clamp(Math.round(1 + spec.structuralDensity * 3), 2, 4);
  const stud = spec.brick.studSize;
  const layer = spec.brick.layerHeight;
  return {
    challenge, spec, profile, startX, endX: startX + spec.span, capacity, sectionStuds,
    nodes, members, cables, brickZones,
    x(value) { return snap(value, stud); },
    y(value) { return snap(value, layer); },
    node(x, y, role = "joint", supportType = "none", extra = {}) {
      const node = { id: nodes.length + 1, x: snap(x, stud), y: snap(y, layer), role, supportType, ...extra };
      nodes.push(node);
      return node.id;
    },
    member(nodeA, nodeB, role, memberClass, capacityClass = capacity, extra = {}) {
      const intent = buildIntent(profile, role, memberClass, extra.sectionStuds ?? sectionStuds);
      const member = { id: members.length + 1, nodeA, nodeB, role, memberClass, capacityClass, ...intent, ...extra };
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
  const count = builder.spec.pierCount ?? 0;
  if (!count) return [];
  const center = builder.startX + builder.spec.span / 2;
  const desired = Array.from({ length: count }, (_, index) => builder.x(center + (index - (count - 1) / 2) * builder.spec.pierSpacing))
    .filter((x) => x > builder.startX && x < builder.endX);
  if (new Set(desired).size === count) return desired;
  return Array.from({ length: count }, (_, index) => builder.x(builder.startX + (builder.spec.span * (index + 1)) / (count + 1)));
}

function addDeckZone(builder) {
  const bottom = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  builder.zone("deck", [
    { x: builder.startX, y: bottom }, { x: builder.startX, y: builder.spec.deckHeight },
    { x: builder.endX, y: builder.spec.deckHeight }, { x: builder.endX, y: bottom },
  ], [], { memberClass: "bonded-deck", minThicknessStuds: builder.spec.brick.sideThicknessStuds });
}

function deck(builder, xs = stationXs(builder), extra = {}) {
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

function foundationFor(builder, x, preferred = "pier") {
  return foundationAt(builder.challenge, x, preferred)
    ?? foundationAt(builder.challenge, x, "fixed")
    ?? foundationAt(builder.challenge, x, "pier");
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

function addPiers(builder, deckData, withBracing = false, technic = false) {
  const piers = [];
  for (const x of pierXs(builder)) {
    const foundationY = foundationFor(builder, x, "pier");
    if (foundationY == null) continue;
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
  const deckData = deck(builder, stationXs(builder, true));
  addPiers(builder, deckData, false, false);
}

function pier(builder) {
  const deckData = deck(builder, stationXs(builder, true));
  addPiers(builder, deckData, false, false);
}

function trestle(builder) {
  const deckData = deck(builder, stationXs(builder, true));
  addPiers(builder, deckData, builder.spec.crossBracing, true);
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
  if (builder.spec.crossBracing && builder.spec.structuralDensity > 0.72) {
    for (let index = 1; index < topIds.length; index += 2) builder.member(topIds[index], deckData.ids[index], "vertical", "warren-secondary", Math.max(1, builder.capacity - 1));
  }
}

function prattHowe(builder, mode) {
  const deckData = deck(builder);
  const topIds = deckData.xs.map((x) => builder.node(x, builder.spec.deckHeight + builder.spec.trussHeight, "joint", "none"));
  for (let index = 0; index < topIds.length - 1; index += 1) builder.member(topIds[index], topIds[index + 1], "chord", "upper-chord", builder.capacity + 1);
  for (let index = 0; index < topIds.length; index += 1) builder.member(deckData.ids[index], topIds[index], "vertical", "truss-vertical");
  const midpoint = builder.spec.panelCount / 2;
  for (let index = 0; index < builder.spec.panelCount; index += 1) {
    const forward = mode === "pratt" ? index < midpoint : index >= midpoint;
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
  const bottom = Math.min(leftFoundation, rightFoundation);
  builder.zone(role, [
    { x: startX, y: leftFoundation }, { x: startX, y: deckY },
    { x: endX, y: deckY }, { x: endX, y: rightFoundation },
  ], [[...openingCurve, { x: endX, y: bottom }, { x: startX, y: bottom }]], {
    memberClass: "closed-spandrel-masonry",
    minThicknessStuds: builder.sectionStuds,
  });
}

function arch(builder) {
  const deckData = deck(builder);
  const deckUnderside = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  const springY = builder.y(builder.spec.deckHeight - builder.spec.archRise);
  const leftFoundation = foundationFor(builder, builder.startX, "fixed");
  const rightFoundation = foundationFor(builder, builder.endX, "fixed");
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
  const moduleSpan = builder.spec.span / count;
  const boundaries = Array.from({ length: count + 1 }, (_, index) => builder.x(builder.startX + moduleSpan * index));
  const deckData = deck(builder, uniqueSorted([...stationXs(builder), ...boundaries]));
  const deckUnderside = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  const pierData = boundaries.map((x, index) => {
    const foundationY = foundationFor(builder, x, index === 0 || index === count ? "fixed" : "pier");
    const topId = deckNodeAt(deckData, x) ?? builder.node(x, builder.spec.deckHeight, "deck", "none");
    const baseId = builder.node(x, foundationY, "pier", index === 0 || index === count ? "fixed" : "terrain");
    builder.member(baseId, topId, "pier", "viaduct-pier", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    addPierZone(builder, x, foundationY, deckUnderside, "viaduct-pier");
    return { x, foundationY, topId };
  });
  for (let module = 0; module < count; module += 1) {
    const startX = boundaries[module];
    const endX = boundaries[module + 1];
    const span = endX - startX;
    const springY = builder.y(deckUnderside - Math.min(builder.spec.archRise, span * 0.45));
    const curve = archCurvePoints(builder, startX, span, springY, deckUnderside, 8);
    const ids = addArchMembers(builder, curve, "viaduct-masonry-arch");
    builder.member(ids[0], pierData[module].topId, "vertical", "masonry-spandrel-tie", builder.capacity);
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
  const right = left.slice(0, -1).reverse().map((point) => ({ x: builder.x(builder.endX - (point.x - builder.startX)), y: point.y }));
  const curve = dedupePoints([...left, ...right]);
  const leftFoundation = foundationFor(builder, builder.startX, "fixed");
  const rightFoundation = foundationFor(builder, builder.endX, "fixed");
  const leftSpring = addAbutment(builder, builder.startX, leftFoundation, springY, true);
  const rightSpring = addAbutment(builder, builder.endX, rightFoundation, springY, true);
  addArchMembers(builder, curve, "corbelled-masonry", { 0: leftSpring, [curve.length - 1]: rightSpring });
  masonryBodyZone(builder, builder.startX, builder.endX, builder.spec.deckHeight, leftFoundation, rightFoundation, curve, "corbelled-body");
}

function boxCulvert(builder) {
  const wall = Math.max(4, builder.x(builder.spec.span * 0.12));
  const left = builder.x(builder.startX + wall);
  const right = builder.x(builder.endX - wall);
  const deckData = deck(builder, stationXs(builder, false, [left, right]));
  const topY = builder.y(builder.spec.deckHeight - builder.spec.brick.deckThicknessLayers + 1);
  const leftFoundation = foundationFor(builder, left, "pier");
  const rightFoundation = foundationFor(builder, right, "pier");
  const leftBase = builder.node(left, leftFoundation, "support", "terrain");
  const rightBase = builder.node(right, rightFoundation, "support", "terrain");
  const leftTop = builder.node(left, topY, "joint", "none");
  const rightTop = builder.node(right, topY, "joint", "none");
  builder.member(leftBase, leftTop, "pier", "culvert-sidewall", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
  builder.member(rightBase, rightTop, "pier", "culvert-sidewall", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
  builder.member(leftTop, rightTop, "beam", "culvert-lintel", builder.capacity + 1, { sectionStuds: builder.spec.brick.deckThicknessLayers });
  builder.member(leftTop, deckNodeAt(deckData, left), "vertical", "culvert-lintel-bearing", builder.capacity);
  builder.member(rightTop, deckNodeAt(deckData, right), "vertical", "culvert-lintel-bearing", builder.capacity);
  const bottom = Math.min(leftFoundation, rightFoundation);
  builder.zone("box-culvert", [
    { x: builder.startX, y: bottom }, { x: builder.startX, y: builder.spec.deckHeight },
    { x: builder.endX, y: builder.spec.deckHeight }, { x: builder.endX, y: bottom },
  ], [[{ x: left, y: bottom }, { x: left, y: topY }, { x: right, y: topY }, { x: right, y: bottom }]], {
    memberClass: "bonded-box-culvert",
    minThicknessStuds: builder.sectionStuds * 2,
  });
}

function tiedArch(builder) {
  const deckData = deck(builder);
  const archIds = [deckData.ids[0]];
  const archPoints = [{ x: deckData.xs[0], y: builder.spec.deckHeight }];
  for (let index = 1; index < deckData.xs.length - 1; index += 1) {
    const t = index / (deckData.xs.length - 1);
    const point = { x: deckData.xs[index], y: builder.y(builder.spec.deckHeight + 4 * builder.spec.trussHeight * t * (1 - t)) };
    archPoints.push(point);
    archIds.push(builder.node(point.x, point.y, "joint", "none"));
  }
  archPoints.push({ x: deckData.xs.at(-1), y: builder.spec.deckHeight });
  archIds.push(deckData.ids.at(-1));
  for (let index = 1; index < archIds.length; index += 1) builder.member(archIds[index - 1], archIds[index], "arch", "tied-arch-rib", builder.capacity + 1);
  for (let index = 1; index < archIds.length - 1; index += 1) builder.member(deckData.ids[index], archIds[index], "vertical", "tied-arch-hanger", builder.capacity);
}

function cablePointOnCentralSpan(x, leftX, rightX, topY, sag) {
  const t = clamp((x - leftX) / (rightX - leftX), 0, 1);
  return topY - 4 * sag * t * (1 - t);
}

function towerFoundation(builder, x) {
  return foundationAt(builder.challenge, x, "tower") ?? foundationAt(builder.challenge, x, "pier");
}

function suspension(builder) {
  const leftTowerX = builder.x(builder.startX + builder.spec.span * 0.2);
  const rightTowerX = builder.x(builder.startX + builder.spec.span * 0.8);
  const deckData = deck(builder, stationXs(builder, false, [leftTowerX, rightTowerX]));
  const towerTopY = builder.y(builder.spec.deckHeight + builder.spec.towerHeight);
  const towerTops = [];
  for (const x of [leftTowerX, rightTowerX]) {
    const foundationY = towerFoundation(builder, x);
    const base = builder.node(x, foundationY, "tower", "terrain");
    const deckId = deckNodeAt(deckData, x);
    const top = builder.node(x, towerTopY, "tower", "none");
    builder.member(base, deckId, "tower", "masonry-suspension-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    builder.member(deckId, top, "tower", "masonry-suspension-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    addPierZone(builder, x, foundationY, towerTopY, "tower");
    towerTops.push(top);
  }
  const leftAnchorX = builder.x(builder.startX - builder.spec.span * 0.08);
  const rightAnchorX = builder.x(builder.endX + builder.spec.span * 0.08);
  const leftAnchorY = foundationAt(builder.challenge, leftAnchorX, "anchor");
  const rightAnchorY = foundationAt(builder.challenge, rightAnchorX, "anchor");
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
  const hangerTargets = [];
  for (let x = leftTowerX + builder.spec.hangerSpacing; x < rightTowerX; x += builder.spec.hangerSpacing) hangerTargets.push({ x: builder.x(x), y: builder.spec.deckHeight });
  builder.cable(leftAnchor, rightAnchor, "main", samples, hangerTargets, { sag: builder.spec.cableSag, towerNodeIds: towerTops });
  for (const target of hangerTargets) {
    const cableY = builder.y(cablePointOnCentralSpan(target.x, leftTowerX, rightTowerX, towerTopY, builder.spec.cableSag));
    const cableNode = builder.node(target.x, cableY, "anchor", "none", { cableAttachment: true });
    const deckNode = builder.node(target.x, target.y, "deck", "none", { cableAttachment: true });
    builder.cable(cableNode, deckNode, "hanger", [{ x: target.x, y: cableY }, target], [], { parentCableId: 1 });
  }
}

function bascule(builder) {
  const leftTowerX = builder.x(builder.startX + builder.spec.span * 0.28);
  const rightTowerX = builder.x(builder.startX + builder.spec.span * 0.72);
  const centerX = builder.x(builder.startX + builder.spec.span / 2);
  const xs = uniqueSorted([builder.startX, leftTowerX, centerX, rightTowerX, builder.endX]);
  const ids = xs.map((x, index) => builder.node(x, builder.spec.deckHeight, index === 0 || index === xs.length - 1 ? "support" : "deck", index === 0 || index === xs.length - 1 ? "fixed" : "none", { hinge: x === leftTowerX || x === rightTowerX }));
  const classes = ["bascule-approach", "bascule-leaf-left", "bascule-leaf-right", "bascule-approach"];
  for (let index = 0; index < ids.length - 1; index += 1) builder.member(ids[index], ids[index + 1], "deck", classes[index], builder.capacity + 1, { buildClass: index === 1 || index === 2 ? "technic-frame" : "brick-course", rasterMode: index === 1 || index === 2 ? "hinged-deck" : "horizontal-course" });
  addDeckZone(builder);
  const tops = [];
  for (const x of [leftTowerX, rightTowerX]) {
    const foundationY = towerFoundation(builder, x);
    const base = builder.node(x, foundationY, "tower", "terrain");
    const deckId = ids[xs.indexOf(x)];
    const top = builder.node(x, builder.spec.deckHeight + builder.spec.towerHeight, "tower", "none");
    builder.member(base, deckId, "tower", "masonry-bascule-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    builder.member(deckId, top, "tower", "masonry-bascule-tower", builder.capacity + 1, { sectionStuds: builder.sectionStuds * 2 });
    addPierZone(builder, x, foundationY, builder.spec.deckHeight + builder.spec.towerHeight, "tower");
    tops.push(top);
  }
  builder.member(tops[0], tops[1], "chord", "upper-walkway", builder.capacity, { buildClass: "technic-frame", rasterMode: "technic-member" });
}

const GENERATORS = {
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
};

function missingFoundationIssues(builder) {
  if (!["beam", "pier", "trestle"].includes(builder.spec.family)) return [];
  return pierXs(builder)
    .filter((x) => foundationFor(builder, x, "pier") == null)
    .map((x) => ({ code: "PIER_NO_FOUNDATION", path: "pierCount", message: `No pier foundation is available at x=${x}.`, severity: "error" }));
}

export function generateBridgeGraph2D(challenge, spec, clock = () => globalThis.performance?.now?.() ?? Date.now()) {
  const started = clock();
  const inputValidation = validateBridgeSpec(challenge, spec);
  if (!inputValidation.valid) return { graph: null, validation: inputValidation, generationTimeMs: round(clock() - started) };
  const builder = createBuilder(challenge, spec);
  const supportIssues = missingFoundationIssues(builder);
  if (supportIssues.length) return { graph: null, validation: report(supportIssues), generationTimeMs: round(clock() - started) };
  GENERATORS[spec.family](builder);
  const designRevision = fnv1a({ challenge, spec, generatorVersion: 2 });
  const graph = {
    nodes: builder.nodes,
    members: builder.members,
    cables: builder.cables,
    metadata: {
      version: 3,
      generatorVersion: 2,
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
      brickZones: builder.brickZones,
      designRevision,
      deterministicChecksum: "",
    },
  };
  graph.metadata.deterministicChecksum = checksum({ ...graph, metadata: { ...graph.metadata, deterministicChecksum: "" } });
  const graphValidation = validateGraph(graph);
  return { graph, validation: graphValidation, generationTimeMs: round(clock() - started), canonicalJson: stableStringify(graph) };
}
