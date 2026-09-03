import './simple-human-slot-guide.js';

export const SIMPLE_DEMO_COLOURS = Object.freeze([...Array(24).fill('red'), ...Array(4).fill('blue')]);
// A within-workspace transfer height for the flat-table scene, avoiding the
// wrist singularity crossed by the legacy 400mm transfer from the new tray.
export const SIMPLE_DEMO_CLEARANCE_MM = 250;

// Scene presentation and reset coordination only; no new robot/board/executor.
export function createDemoModeControl({ controller, board, runtime, streamControl, coordinator, workcellProfile, challenge, bridge, train, mission, renderer, setMode, originalBlueprint }) {
  let mode = 'bridge';
  let busy = false;
  const getState = () => ({ mode, switching: busy, ...streamControl.getState() });
  function show() {
    const visible = mode === 'bridge';
    if (challenge?.terrainGroup) challenge.terrainGroup.visible = visible;
    bridge?.setVisible(visible);
    const trainRoot = train?.getSubsystem()?.renderer?.root;
    if (trainRoot) trainRoot.visible = visible;
    renderer.setTerrainOccluders(visible ? challenge?.getTerrainOccluders() ?? [] : []);
    renderer.setEnvironmentCollisionProxies(visible ? (challenge?.getCollisionProxy().proxies ?? []).map(box => ({ kind: box.id,
      minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z })) : []);
    document.documentElement.dataset.demoMode = mode;
    document.querySelector('[data-demo-mode]').value = mode;
    const cycle = document.querySelector('[data-cycle-time-input]');
    if (cycle) { cycle.min = visible ? '250' : '1000'; cycle.step = visible ? '250' : '1'; cycle.value = String(streamControl.getState().cycleTimeMs); }
    renderer.webgl.shadowMap.needsUpdate = true;
    renderer.render();
  }
  async function change(next, { reset = false } = {}) {
    if (!['simple', 'bridge'].includes(next)) return { ok: false, reason: 'invalid_mode' };
    if (busy) return { ok: false, reason: 'operation_in_progress' };
    if (mode === next && !reset) { show(); return getState(); }
    busy = true;
    const previous = mode;
    try {
      await streamControl.stop();
      if (mission?.frozen || (mission && mission.phase !== 'DESIGN')) {
        const state = await mission.getMissionState();
        const result = await mission.resetMission({ expectedMissionId: state.missionId,
          expectedMissionRevision: state.revisions.missionRevision, expectedWorldRevision: controller.worldRevision, confirm: true });
        if (!result.ok) return result;
      }
      if (train?.getState().configured) train.reset({ instant: true, reason: 'demo_mode_change' });
      mode = next; setMode(next);
      coordinator.workcellProfile = next === 'simple' ? { ...workcellProfile, safeClearanceZMm: SIMPLE_DEMO_CLEARANCE_MM } : workcellProfile;
      const result = await runtime.robot.reset({ expectedWorldRevision: controller.worldRevision });
      if (!result.ok) throw new Error(result.reason);
      board.loadBlueprint(next === 'simple' ? { blueprintId: 'simple-bricks', targets: [] } : originalBlueprint,
        { expectedWorldRevision: controller.worldRevision });
      show();
      return getState();
    } catch (error) {
      mode = previous; setMode(previous); show();
      coordinator.workcellProfile = previous === 'simple' ? { ...workcellProfile, safeClearanceZMm: SIMPLE_DEMO_CLEARANCE_MM } : workcellProfile;
      return { ok: false, reason: error.message };
    } finally { busy = false; document.querySelector('[data-demo-mode]').value = mode; }
  }
  return Object.freeze({ getState, change });
}
