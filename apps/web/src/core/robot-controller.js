import {
  DEFAULT_SCARA_CONFIG,
  createInitialState,
  forwardKinematics,
  inverseKinematics,
  validateJointState,
  workspace
} from './scara.js';
import { lerpWaypoint, validateCartesianWaypoints } from './trajectory.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export class RobotController {
  #config;
  #state;
  #listeners = new Set();
  #operation = Promise.resolve();

  constructor(config = DEFAULT_SCARA_CONFIG) {
    this.#config = config;
    this.#state = clone(createInitialState(config));
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener({ type: 'initial' }, this.getState());
    return () => this.#listeners.delete(listener);
  }

  #notify(event) {
    const snapshot = this.getState();
    for (const listener of this.#listeners) listener(event, snapshot);
  }

  getConfig() {
    return clone(this.#config);
  }

  getWorkspace() {
    return workspace(this.#config);
  }

  getState() {
    return clone(this.#state);
  }

  #reject(op, requested, reason, diagnostics = {}) {
    const result = {
      ok: false,
      op,
      reason,
      requested: clone(requested),
      accepted: this.getState(),
      stateUnchanged: true,
      diagnostics: clone(diagnostics)
    };
    this.#notify({ type: 'motion_rejected', result });
    return result;
  }

  #commit(op, requested, nextJoints, diagnostics = {}) {
    this.#state = {
      ...this.#state,
      revision: this.#state.revision + 1,
      joints: clone(nextJoints),
      cartesian: clone(forwardKinematics(nextJoints, this.#config)),
      mode: op
    };
    const result = {
      ok: true,
      op,
      requested: clone(requested),
      accepted: this.getState(),
      diagnostics: clone(diagnostics)
    };
    this.#notify({ type: 'motion_committed', result });
    return result;
  }

  moveEndEffector(target) {
    const result = inverseKinematics(target, this.#state.joints, this.#config);
    if (!result.ok) return this.#reject('move_end_effector', target, result.reason, result.diagnostics);
    return this.#commit('move_end_effector', target, result.joints, result.diagnostics);
  }

  setJointTargets(joints) {
    const request = {
      thetaDeg: Number(joints.thetaDeg),
      psiDeg: Number(joints.psiDeg),
      zMm: Number(joints.zMm)
    };
    const validation = validateJointState(request, this.#config);
    if (!validation.ok) return this.#reject('set_joint_targets', request, validation.reason, validation.diagnostics);
    return this.#commit('set_joint_targets', request, request, { branch: request.psiDeg >= 0 ? 'positive' : 'negative' });
  }

  setGripper(openFraction) {
    const value = Number(openFraction);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return this.#reject('set_gripper', { openFraction }, 'invalid_gripper_fraction');
    }
    this.#state = {
      ...this.#state,
      revision: this.#state.revision + 1,
      gripper: {
        ...this.#state.gripper,
        openFraction: value,
        widthMm: 8 + value * 38
      },
      mode: 'set_gripper'
    };
    const result = { ok: true, op: 'set_gripper', accepted: this.getState() };
    this.#notify({ type: 'gripper_changed', result });
    return result;
  }

  setHeldObject(objectId) {
    this.#state.gripper.holdingObjectId = objectId ?? null;
    this.#state.revision += 1;
    this.#notify({ type: 'held_object_changed', objectId: objectId ?? null });
  }

  previewTrajectory(waypoints) {
    const validation = validateCartesianWaypoints(waypoints, this.#state.joints, this.#config);
    return {
      ...validation,
      op: 'preview_trajectory',
      stateUnchanged: true,
      accepted: this.getState()
    };
  }

  executeTrajectory(waypoints, options = {}) {
    const run = async () => {
      const validation = this.previewTrajectory(waypoints);
      if (!validation.ok) return validation;
      const durationPerSegmentMs = Math.max(120, Number(options.durationPerSegmentMs ?? 450));
      const startRevision = this.#state.revision;
      this.#notify({ type: 'trajectory_started', waypoints: clone(waypoints) });

      for (let index = 0; index < waypoints.length - 1; index += 1) {
        const start = waypoints[index];
        const end = waypoints[index + 1];
        const startTime = performance.now();
        while (true) {
          if (options.signal?.aborted) {
            const result = this.#reject('execute_trajectory', { waypoints }, 'aborted', { completedSegments: index });
            this.#notify({ type: 'trajectory_aborted', result });
            return result;
          }
          const elapsed = performance.now() - startTime;
          const t = Math.min(1, elapsed / durationPerSegmentMs);
          const waypoint = lerpWaypoint(start, end, t);
          const move = this.moveEndEffector(waypoint);
          if (!move.ok) {
            this.#notify({ type: 'trajectory_failed', result: move, segmentIndex: index });
            return move;
          }
          if (waypoint.gripperOpenFraction !== undefined) this.setGripper(waypoint.gripperOpenFraction);
          if (t >= 1) break;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }

      const result = {
        ok: true,
        op: 'execute_trajectory',
        completedSegments: waypoints.length - 1,
        startRevision,
        accepted: this.getState()
      };
      this.#notify({ type: 'trajectory_completed', result });
      return result;
    };

    this.#operation = this.#operation.then(run, run);
    return this.#operation;
  }

  reset() {
    this.#state = clone(createInitialState(this.#config));
    this.#notify({ type: 'robot_reset' });
    return this.getState();
  }
}
