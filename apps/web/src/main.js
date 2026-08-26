import { RobotController } from './core/robot-controller.js';
import { SceneState } from './core/scene-state.js';
import { inverseKinematics } from './core/scara.js';
import { makePickAndPlaceWaypoints, sampleWaypoints } from './core/trajectory.js';
import { PhysicsClient, browserFallbackValidate } from './physics/client.js';
import { createRobotLabRenderer } from './render/scene.js';
import { createUi } from './ui/panel.js';
import { registerWebMcpTools } from './webmcp/register-tools.js';

const TOOL_WORLD_OFFSET_MM = 65;
const TABLE_TOP_WORLD_Y_MM = 45;

const robotController = new RobotController();
const sceneState = new SceneState();
const physicsClient = new PhysicsClient();
let currentPlan = null;
let lastSimulation = null;
let ui = null;

const rendererApi = createRobotLabRenderer({
  viewport: document.querySelector('#viewport'),
  robotController,
  sceneState,
  onInteraction(event) {
    if (event.type === 'manual_move' && event.result?.ok) {
      currentPlan = null;
      lastSimulation = null;
      ui?.setPlanStatus('Manual control changed robot state', 'warning');
    }
  }
});

function machineZForWorldY(worldY) {
  return Math.max(0, Math.min(robotController.getConfig().zMaxMm, worldY - TOOL_WORLD_OFFSET_MM));
}

function getSceneState() {
  return sceneState.getState();
}

function getRobotState() {
  return { ...robotController.getState(), workspace: robotController.getWorkspace() };
}

function analyseReachability(target) {
  const result = inverseKinematics(target, robotController.getState().joints, robotController.getConfig());
  return result.ok
    ? { ok: true, target, joints: result.joints, diagnostics: result.diagnostics, stateUnchanged: true }
    : { ok: false, target, reason: result.reason, diagnostics: result.diagnostics, stateUnchanged: true };
}

function moveEndEffector(target) {
  currentPlan = null;
  lastSimulation = null;
  rendererApi.clearTrajectory();
  return robotController.moveEndEffector(target);
}

function setGripper(openFraction) {
  return robotController.setGripper(openFraction);
}

function planPickAndPlace(objectId, destinationId) {
  const object = sceneState.getObject(objectId);
  const destination = sceneState.getObject(destinationId);
  if (!object) return { ok: false, reason: 'object_not_found', objectId };
  if (!destination) return { ok: false, reason: 'destination_not_found', destinationId };
  if (!object.graspable) return { ok: false, reason: 'object_not_graspable', objectId };
  if (destination.semanticRole !== 'destination') return { ok: false, reason: 'not_a_destination', destinationId };

  const start = robotController.getState().cartesian;
  const objectForPlanner = {
    ...object,
    position: {
      ...object.position,
      zMm: machineZForWorldY(TABLE_TOP_WORLD_Y_MM + object.position.zMm)
    }
  };
  const destinationForPlanner = {
    ...destination,
    position: {
      ...destination.position,
      zMm: machineZForWorldY(TABLE_TOP_WORLD_Y_MM + destination.size.zMm + 12)
    }
  };
  const waypoints = makePickAndPlaceWaypoints({
    start,
    object: objectForPlanner,
    destination: destinationForPlanner,
    clearanceMm: 170,
    graspZOffsetMm: 0,
    placeZOffsetMm: 0
  });
  const preview = robotController.previewTrajectory(waypoints);
  if (!preview.ok) {
    currentPlan = null;
    lastSimulation = null;
    rendererApi.displayTrajectory(waypoints.slice(0, Math.max(2, preview.rejectedIndex + 1)), 'invalid');
    ui?.setPlanStatus(`Plan rejected at waypoint ${preview.rejectedIndex}: ${preview.reason}`, 'error');
    return { ok: false, reason: preview.reason, rejectedIndex: preview.rejectedIndex, results: preview.results };
  }

  currentPlan = {
    id: `plan-${Date.now()}`,
    objectId,
    destinationId,
    waypoints,
    createdFromRobotRevision: robotController.getState().revision
  };
  lastSimulation = null;
  rendererApi.displayTrajectory(waypoints, 'proposed');
  ui?.setPlanStatus(`Proposed: ${object.label} → ${destination.label}`, 'proposed');
  return { ok: true, planId: currentPlan.id, objectId, destinationId, waypointCount: waypoints.length, waypoints };
}

async function simulateCurrentPlan({ signal } = {}) {
  if (!currentPlan) return { ok: false, reason: 'no_current_plan' };
  const denseTrajectory = sampleWaypoints(currentPlan.waypoints, 18);
  const payload = {
    requestId: currentPlan.id,
    robot: getRobotState(),
    scene: getSceneState(),
    trajectory: denseTrajectory,
    task: { type: 'pick_and_place', objectId: currentPlan.objectId, destinationId: currentPlan.destinationId },
    endEffectorRadiusMm: 34
  };
  let result = await physicsClient.simulateTrajectory(payload, { signal });
  if (!result.ok && result.fallbackRecommended) result = browserFallbackValidate(payload);
  lastSimulation = result;
  rendererApi.displayTrajectory(currentPlan.waypoints, result.ok ? 'validated' : 'invalid');
  ui?.setPlanStatus(
    result.ok ? `Validated by ${result.backend}` : `Physics rejected: ${result.reason || `${result.collisions?.length || 0} collision(s)`}`,
    result.ok ? 'validated' : 'error'
  );
  return result;
}

async function executeCurrentPlan({ signal } = {}) {
  if (!currentPlan) return { ok: false, reason: 'no_current_plan' };
  if (!lastSimulation?.ok) return { ok: false, reason: 'plan_not_physics_validated' };
  if (currentPlan.createdFromRobotRevision !== robotController.getState().revision) {
    return { ok: false, reason: 'robot_state_changed_since_plan' };
  }

  const objectId = currentPlan.objectId;
  const validatedObject = lastSimulation.finalObjectStates?.find((object) => object.id === objectId);
  if (!validatedObject) return { ok: false, reason: 'physics_final_object_state_missing' };
  for (let index = 0; index < currentPlan.waypoints.length - 1; index += 1) {
    const start = currentPlan.waypoints[index];
    const end = currentPlan.waypoints[index + 1];
    const result = await robotController.executeTrajectory([start, end], { signal, durationPerSegmentMs: 520 });
    if (!result.ok) return result;
    if (end.phase === 'close_gripper') {
      robotController.setHeldObject(objectId);
      sceneState.updateObject(objectId, { heldBy: 'scara-gripper' }, 'object_grasped');
    }
    if (end.phase === 'release') {
      robotController.setHeldObject(null);
      sceneState.updateObject(objectId, {
        heldBy: null,
        position: validatedObject.position
      }, 'object_placed');
      rendererApi.workcell.clearHeldObjectPose(objectId);
    }
  }
  const completed = { ok: true, planId: currentPlan.id, objectId, destinationId: currentPlan.destinationId, finalRobot: getRobotState() };
  currentPlan = null;
  lastSimulation = null;
  rendererApi.clearTrajectory();
  ui?.setPlanStatus('Task complete', 'validated');
  return completed;
}

async function resetWorkcell({ signal } = {}) {
  currentPlan = null;
  lastSimulation = null;
  robotController.reset();
  sceneState.reset();
  rendererApi.clearTrajectory();
  ui?.setPlanStatus('Ready', 'neutral');
  const physics = await physicsClient.resetScene({ signal });
  return {
    ok: true,
    robot: getRobotState(),
    sceneRevision: getSceneState().revision,
    physicsReset: physics.ok === true,
    physicsWarning: physics.ok ? null : physics.reason
  };
}

const actions = {
  getSceneState,
  getRobotState,
  analyseReachability,
  moveEndEffector,
  setGripper,
  planPickAndPlace,
  simulateCurrentPlan,
  executeCurrentPlan,
  resetWorkcell
};

ui = createUi({ robotController, sceneState, physicsClient, actions, rendererApi });
registerWebMcpTools(actions, (event) => {
  const reason = event.reason ? `: ${event.reason}` : '';
  const kind = event.status === 'rejected' ? 'error' : event.status === 'succeeded' ? 'success' : 'info';
  ui.addLog(`WebMCP ${event.status}: ${event.toolName}${reason}`, kind);
}).then((result) => ui.setWebMcpStatus(result));

window.__ROBO_SIM__ = Object.freeze({
  version: '0.1.0-foundation',
  actions,
  robotController,
  sceneState,
  physicsClient,
  rendererApi,
  get currentPlan() { return currentPlan ? JSON.parse(JSON.stringify(currentPlan)) : null; },
  get lastSimulation() { return lastSimulation ? JSON.parse(JSON.stringify(lastSimulation)) : null; }
});
