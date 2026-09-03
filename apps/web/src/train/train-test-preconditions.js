'use strict';

import { TRAIN_STATES } from './constants.js';
import { cloneValue } from './math.js';

export const TRAIN_PRECONDITION_CODES = Object.freeze({
  NO_FROZEN_PLAN: 'NO_FROZEN_PLAN',
  STALE_PLAN: 'STALE_PLAN',
  ROBOT_EXECUTING: 'ROBOT_EXECUTING',
  ROBOT_NOT_IDLE: 'ROBOT_NOT_IDLE',
  GRIPPER_HOLDING_PART: 'GRIPPER_HOLDING_PART',
  TRAIN_NOT_READY: 'TRAIN_NOT_READY'
});

function booleanValue(value, fallback) {
  return value === undefined ? fallback : Boolean(typeof value === 'function' ? value() : value);
}

export function evaluateTrainTestPreconditions({
  frozenBuildPlan,
  acceptedBuildBoardSnapshot,
  trainState,
  dependencies = {}
} = {}) {
  const failures = [];
  const add = (code, message, details = {}) => failures.push({ code, message, details: cloneValue(details) });
  if (!frozenBuildPlan || frozenBuildPlan.schemaVersion !== '4.6') {
    add(TRAIN_PRECONDITION_CODES.NO_FROZEN_PLAN, 'A frozen V4.6 BuildPlan is required.');
  } else {
    const expectedPlanId = dependencies.expectedPlanId?.() ?? dependencies.expectedPlanId;
    const expectedChecksum = dependencies.expectedDesignChecksum?.() ?? dependencies.expectedDesignChecksum;
    if ((expectedPlanId && frozenBuildPlan.planId !== expectedPlanId)
      || (expectedChecksum && frozenBuildPlan.designChecksum !== expectedChecksum)
      || (acceptedBuildBoardSnapshot?.blueprintId && acceptedBuildBoardSnapshot.blueprintId !== frozenBuildPlan.planId)
      || (acceptedBuildBoardSnapshot?.designChecksum && acceptedBuildBoardSnapshot.designChecksum !== frozenBuildPlan.designChecksum)) {
      add(TRAIN_PRECONDITION_CODES.STALE_PLAN, 'The BuildPlan or BuildBoard snapshot is stale.', {
        planId: frozenBuildPlan.planId,
        boardPlanId: acceptedBuildBoardSnapshot?.blueprintId ?? null,
        designChecksum: frozenBuildPlan.designChecksum,
        boardDesignChecksum: acceptedBuildBoardSnapshot?.designChecksum ?? null
      });
    }
  }
  if (trainState !== TRAIN_STATES.READY) {
    add(TRAIN_PRECONDITION_CODES.TRAIN_NOT_READY, `TrainService must be READY, not ${trainState}.`);
  }
  if (booleanValue(dependencies.isRobotExecuting, false)) {
    add(TRAIN_PRECONDITION_CODES.ROBOT_EXECUTING, 'The robot is still executing.');
  }
  if (!booleanValue(dependencies.isRobotIdle, true)) {
    add(TRAIN_PRECONDITION_CODES.ROBOT_NOT_IDLE, 'The robot is not idle.');
  }
  if (booleanValue(dependencies.isGripperHoldingPart, false)) {
    add(TRAIN_PRECONDITION_CODES.GRIPPER_HOLDING_PART, 'The gripper still holds a part.');
  }
  return {
    ok: failures.length === 0,
    failures,
    primaryCode: failures[0]?.code ?? null
  };
}

export function createTrainTestPreconditionAdapter(dependencies = {}) {
  return Object.freeze({
    evaluate(context) { return evaluateTrainTestPreconditions({ ...context, dependencies }); }
  });
}
