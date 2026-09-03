// Deterministic authority integration diagnostic, NOT native/browser or timing
// acceptance. Real controller trajectories/limits/placement commits stay active.
import { constructionHarness } from '../tests/helpers/construction-harness.js';

const h = await constructionHarness({ terrain7: true });
h.runner.wait = async () => {}; // no cadence sleeping in this non-timing test
h.service.startBuild({ expectedWorldRevision: h.controller.worldRevision });
const prepared = h.service.preparedBuild;
const planned = h.service.planNext({ count: 2, expectedWorldRevision: h.controller.worldRevision });
const target = h.board.getTarget(planned.placementIds[0]), source = planned.sourceIds[0];
const picked = h.controller.beginHumanCarry(source);
const replacement = h.coordinator.getState().queue.find(p => p.placementId === target.id)?.brickId;
const human = picked.ok ? h.controller.commitHumanPlacement({ brickId: source, position: target.position, yawRad: target.yawRad }) : picked;
const adopted = h.coordinator.getStreamStatus({ streamId: planned.streamId, cursor: 0, limit: 20 }).entries.find(p => p.placementId === target.id)?.status;
let run = await h.runner.run({ maximumPlacements: 2, cycleTimeMs: 250 });
for (let batch = 0; run.ok && h.service.getBuildProgress().remaining > 0 && batch < prepared.inventory.count; batch++) {
  run = await h.service.buildNextParts(5, { expectedWorldRevision: h.controller.worldRevision, cycleTimeMs: 250 });
  console.log(JSON.stringify({ batch, completed: h.service.getBuildProgress().completed, ok: run.ok, reason: run.reason }));
}
const report = { mode: 'deterministic service/controller integration; not browser, native MCP, or real-time performance',
  travelPolicy: h.coordinator.travelPolicy,
  planId: prepared.frozenPlan.planId, checksum: prepared.frozenPlan.designChecksum, partCount: prepared.inventory.count,
  partRegistryHash: prepared.registry.hash, heroBom: prepared.heroBom,
  supportedClasses: [...new Set(prepared.normalisedBuild.placements.map(p => p.partClass === 'STANDARD_BRICK' ? p.partType : p.partClass))],
  sharedActors: prepared.registry.list().every(r => r.allowedActors.includes('human') && r.allowedActors.includes('agent')),
  humanAccepted: human.ok, sourceReassigned: Boolean(replacement && replacement !== source), humanAdopted: adopted === 'ADOPTED',
  progress: h.service.getBuildProgress(), physical: h.service.getPhysicalReport(),
  complete: h.service.getBuildProgress().remaining === 0 && run.ok,
  lastExecution: run, robotState: h.controller.getState(),
  acceptedPartIdentity: h.controller.getBricks().filter(b => b.placedTargetId).map(b => ({ brickId: b.id, targetId: b.placedTargetId, partClass: b.bridgePart.partClass })) };
if (process.argv.includes('--write-evidence')) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('artifacts/terrain7', { recursive: true });
  await writeFile('artifacts/terrain7/construction-progression.json', JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ planId: report.planId, complete: report.complete, humanAccepted: report.humanAccepted,
  sourceReassigned: report.sourceReassigned, humanAdopted: report.humanAdopted, progress: report.progress, lastReason: run.reason }));
process.exitCode = report.complete && report.humanAccepted && report.sourceReassigned && report.humanAdopted ? 0 : 1;
