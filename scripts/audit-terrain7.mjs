// Read-only geometry/state diagnostic. No renderer, screenshot or pixel claims.
import { readFile } from 'node:fs/promises';
import * as THREE from '../apps/web/vendor/three.module.min.js';
import { decodeTerrainArrayBuffer, applyTerrainTransform } from '../apps/web/src/challenge/terrain-loader.js';
import { inspectTerrain7, buildTerrain7Preset, TERRAIN7_OCCLUDERS } from '../apps/web/src/challenge/terrain7-preset.js';
import { machineToDisplay } from '../apps/web/src/challenge/challenge-transforms.js';
import { terrainOccludesPoint } from '../apps/web/src/player/terrain-occlusion.js';
import { createBridgeHost } from '../apps/web/src/bridge-core/index.js';
import { TERRAIN7_BRIDGE_INITIAL_SETTINGS } from '../apps/web/src/bridge/main-demo-bridge.js';
import { prepareBridgeBuild } from '../apps/web/src/bridge-construction/bridge-build-session.js';
import { V8_WORKSPACE } from '../apps/web/src/workcell/v8-workcell-profile.js';
import { partBounds } from '../apps/web/src/bricks/part-spec.js';
import { auditPreparedGeometry } from './audit-construction-geometry.mjs';

const bytes = await readFile(new URL('../apps/web/assets/terrain/Terrain_7_Main.glb', import.meta.url));
const { root } = await decodeTerrainArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), THREE,
  { decodeImage: async () => ({ width: 1, height: 1 }) }); // geometry/material references only
const preset = buildTerrain7Preset('EASY', { authored: inspectTerrain7(root) });
applyTerrainTransform(root, preset.terrainTransform);
const host = await createBridgeHost({ initialSettings: TERRAIN7_BRIDGE_INITIAL_SETTINGS, challenge: preset.bridgeChallengeInput,
  challengePolicy: 'locked', compilerOptions: { preferWorker: false } });
const prepared = prepareBridgeBuild({ host, workspace: V8_WORKSPACE }), placements = prepared.normalisedBuild.placements;
const occluders = [];
for (const name of TERRAIN7_OCCLUDERS) root.getObjectByName(name).traverse(o => { if (o.isMesh) occluders.push(o); });
const triangles = [];
for (const mesh of occluders) {
  const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  const count = indices ? indices.count : positions.count;
  for (let i = 0; i < count; i += 3) {
    const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld));
    triangles.push({ triangle: new THREE.Triangle(...vertices), bounds: new THREE.Box3().setFromPoints(vertices), name: mesh.parent.name });
  }
}
const displayPoint = p => { const q = machineToDisplay({ x: p.xMm, y: p.yMm, z: p.zMm }, preset.machineMount); return new THREE.Vector3(q.x, q.y, q.z); };
const overlaps = [], visibilityRisks = [], noDeclaredSupport = [], invalidDependencies = [];
const ids = new Set(placements.map(p => p.placementId));
for (const p of placements) {
  const bounds = partBounds(p), box = new THREE.Box3();
  for (const xMm of [bounds.min.xMm, bounds.max.xMm]) for (const yMm of [bounds.min.yMm, bounds.max.yMm]) for (const zMm of [bounds.min.zMm, bounds.max.zMm]) box.expandByPoint(displayPoint({ xMm, yMm, zMm }));
  const names = new Set();
  for (const triangle of triangles) if (!names.has(triangle.name) && triangle.bounds.intersectsBox(box) && box.intersectsTriangle(triangle.triangle)) names.add(triangle.name);
  if (names.size) overlaps.push({ placementId: p.placementId, meshes: [...names] });
  const centre = displayPoint(p.position);
  const blockedViews = [[0, 0, 600], [0, -600, 200], [0, 600, 200], [-600, 0, 200], [600, 0, 200]]
    .filter(offset => terrainOccludesPoint({ origin: centre.clone().add(new THREE.Vector3(...offset)), point: centre, occluders }).blocked).length;
  if (blockedViews) visibilityRisks.push({ placementId: p.placementId, blockedViews, sampledViews: 5 });
  if (!p.requiresStructureComplete && !p.dependencyIds.length && bounds.min.zMm > preset.waterDatum.machineZMm + .1) noDeclaredSupport.push(p.placementId);
  for (const id of p.dependencyIds) if (!ids.has(id)) invalidDependencies.push({ placementId: p.placementId, dependencyId: id });
}
const report = { planId: host.buildPlan.planId, checksum: host.buildPlan.designChecksum, partCount: placements.length,
  A: auditPreparedGeometry(prepared),
  B: { method: 'solid terrain triangles against conservative physical part AABBs; diagnostic, not exact mesh-volume overlap', count: overlaps.length, overlaps },
  C: { method: 'part-centre rays from five synthetic clear-distance viewpoints; diagnostic, not user camera/visual acceptance', count: visibilityRisks.length, visibilityRisks },
  D: { method: 'declared dependency integrity and above-datum targets with no declared support; not a structural solver', invalidDependencies, noDeclaredSupport, count: invalidDependencies.length + noDeclaredSupport.length },
  waterDatum: preset.waterDatum, entry: preset.entry.position, exit: preset.exit.position,
  visual: 'USER-VERIFY PENDING' };
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--write-evidence')) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('artifacts/terrain7', { recursive: true });
  await writeFile('artifacts/terrain7/geometry-audit.json', JSON.stringify(report, null, 2));
}
