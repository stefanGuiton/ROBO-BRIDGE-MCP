import { machinePointToTable } from './v8-workcell-profile.js';

const BUTTON_ID = 'MAIN_DEMO_V8_MORE_BRICKS_BUTTON';
const BUTTON_RADIUS_MM = 50;
const BUTTON_HEIGHT_MM = 24;
const BUTTON_CENTRE_ABOVE_TABLE_MM = 12.5;
const TOOL_BOTTOM_CLEARANCE_MM = 2;
const PRESS_DEPTH_MM = 5;
const RESERVE_RADIUS_MM = 70;
const SAFE_APPROACH_Z_MM = 250;
const MOTION_SPEED_MM_S = 500;
const POSITION_TOLERANCE_MM = 1;
const MIN_PRESS_DESCENT_MM = PRESS_DEPTH_MM - POSITION_TOLERANCE_MM;
const REFILL_COLOURS = Object.freeze(['red', 'blue', 'yellow', 'green', 'orange', 'white', 'black', 'purple', 'teal']);

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const finite = (value) => Number.isFinite(value);
const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;

function fail(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

function validColourDemand(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([colour, count]) => REFILL_COLOURS.includes(colour)
    && Number.isSafeInteger(count) && count >= 0 && count <= 5000);
}

function currentTcp(controller) {
  return clone(controller.getState?.().tcp ?? controller.tcp);
}

function inventorySnapshot(controller) {
  const bricks = controller.getBricks?.() ?? [];
  const availableByColour = {};
  for (const brick of bricks) {
    if (brick.heldBy || brick.snapped || brick.placedTargetId || brick.placementType) continue;
    const colour = String(brick.colour ?? 'unknown');
    availableByColour[colour] = (availableByColour[colour] ?? 0) + 1;
  }
  return {
    total: bricks.length,
    available: Object.values(availableByColour).reduce((sum, count) => sum + count, 0),
    availableByColour
  };
}

function resultCount(result, before, after) {
  if (Number.isFinite(result?.count)) return Math.max(0, Math.trunc(result.count));
  if (Array.isArray(result?.added)) return result.added.length;
  if (Array.isArray(result?.spawnedIds)) return result.spawnedIds.length;
  return Math.max(0, (after?.total ?? 0) - (before?.total ?? 0));
}

function anchorSignature(anchor) {
  return JSON.stringify(anchor);
}

function finiteTcp(tcp) {
  return Boolean(tcp) && [tcp.xMm, tcp.yMm, tcp.zMm].every(finite);
}

function yawDistanceRad(first, second) {
  if (!finite(first) || !finite(second)) return Infinity;
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function tcpErrorMm(actual, expected) {
  if (!finiteTcp(actual) || !finiteTcp(expected)) return null;
  return Math.sqrt((actual.xMm - expected.xMm) ** 2
    + (actual.yMm - expected.yMm) ** 2
    + (actual.zMm - expected.zMm) ** 2);
}

/**
 * Deterministic button-contact proof. The callback supplied to
 * createMoreBricksButton is only an animation/telemetry observer; it is never
 * the source of physical contact truth. Contact requires both measured poses
 * to match the frozen anchor and a downward press along its normal.
 */
export function detectMoreBricksContact(anchor, precontactTCP, pressedTCP) {
  const toleranceMm = finite(anchor?.positionToleranceMm)
    ? Math.max(0, anchor.positionToleranceMm)
    : POSITION_TOLERANCE_MM;
  const requiredDescentMm = finite(anchor?.pressDepthMm)
    ? Math.max(0, anchor.pressDepthMm - toleranceMm)
    : MIN_PRESS_DESCENT_MM;
  const expectedPrecontact = anchor?.contactTcp ?? null;
  const expectedPressed = anchor?.pressedTcp ?? null;
  const precontactErrorMm = tcpErrorMm(precontactTCP, expectedPrecontact);
  const pressedErrorMm = tcpErrorMm(pressedTCP, expectedPressed);
  const lateralErrorMm = finiteTcp(precontactTCP) && finiteTcp(pressedTCP)
    ? Math.hypot(pressedTCP.xMm - precontactTCP.xMm, pressedTCP.yMm - precontactTCP.yMm)
    : null;
  const descentMm = finiteTcp(precontactTCP) && finiteTcp(pressedTCP)
    ? precontactTCP.zMm - pressedTCP.zMm
    : null;
  const precontactMatches = precontactErrorMm !== null && precontactErrorMm <= toleranceMm;
  const pressedMatches = pressedErrorMm !== null && pressedErrorMm <= toleranceMm;
  const normal = anchor?.pressNormal;
  const normalDescent = Boolean(normal && finite(normal.x) && finite(normal.y) && finite(normal.z)
    && normal.z > 0 && finite(descentMm) && descentMm >= requiredDescentMm);
  const contactDetected = Boolean(precontactMatches && pressedMatches
    && finite(lateralErrorMm) && lateralErrorMm <= toleranceMm
    && normalDescent);
  let reason = null;
  if (!expectedPrecontact || !expectedPressed || !normal) reason = 'invalid_anchor';
  else if (!precontactMatches) reason = 'precontact_pose_mismatch';
  else if (!pressedMatches) reason = 'pressed_pose_mismatch';
  else if (!finite(lateralErrorMm) || lateralErrorMm > toleranceMm) reason = 'lateral_descent_mismatch';
  else if (!normalDescent) reason = 'insufficient_normal_descent';
  return {
    ok: contactDetected,
    contactDetected,
    reason,
    toleranceMm,
    requiredDescentMm,
    pressNormal: clone(normal),
    expectedPrecontactTcp: clone(expectedPrecontact),
    expectedPressedTcp: clone(expectedPressed),
    measuredPrecontactTcp: clone(precontactTCP),
    measuredPressedTcp: clone(pressedTCP),
    precontactMatches,
    pressedMatches,
    precontactErrorMm,
    pressedErrorMm,
    lateralErrorMm,
    descentMm,
    normalDescent
  };
}

function makeAnchor(settings = {}, profile = {}) {
  const workspace = profile.workspace;
  if (!workspace || !finite(workspace.xMinMm) || !finite(workspace.xMaxMm)
    || !finite(workspace.yMinMm) || !finite(workspace.yMaxMm)) {
    throw new TypeError('profile.workspace with finite bounds is required');
  }
  if (!settings || !finite(settings.tableXmm) || !finite(settings.tableYmm)
    || !finite(settings.robotMountXmm) || !finite(settings.robotMountYmm)
    || !finite(settings.robotMountZmm)) {
    throw new TypeError('table and robot mount settings are required');
  }
  const tableSurfaceZMm = finite(profile.tableSurfaceZMm)
    ? profile.tableSurfaceZMm
    : Number(settings.tableTopHeightMm) - Number(settings.robotMountZmm);
  if (!finite(tableSurfaceZMm)) throw new TypeError('profile.tableSurfaceZMm is required');

  // Keep this anchor just inside the reachable machine envelope. The button
  // remains table-local for rendering, while all motion/contact checks use the
  // same derived machine pose.
  const centre = {
    xMm: workspace.xMinMm + 10,
    yMm: workspace.yMaxMm - 20,
    zMm: tableSurfaceZMm + BUTTON_CENTRE_ABOVE_TABLE_MM
  };
  const topZMm = centre.zMm + BUTTON_HEIGHT_MM / 2;
  const tableLocalPose = machinePointToTable(centre, settings);
  const safeApproachZMm = Math.min(
    workspace.zMaxMm,
    Math.max(workspace.zMinMm, SAFE_APPROACH_Z_MM)
  );
  const contactTcpZMm = topZMm + TOOL_BOTTOM_CLEARANCE_MM;
  const pressedTcpZMm = contactTcpZMm - PRESS_DEPTH_MM;
  if (![safeApproachZMm, contactTcpZMm, pressedTcpZMm].every(finite)
    || safeApproachZMm < workspace.zMinMm
    || contactTcpZMm < workspace.zMinMm
    || pressedTcpZMm < workspace.zMinMm) {
    throw new TypeError('MORE BRICKS button press poses are outside the configured workspace');
  }
  return Object.freeze({
    id: BUTTON_ID,
    frame: 'machine-mm-rad',
    pose: Object.freeze({ ...centre, yawRad: 0 }),
    tableLocalPose: Object.freeze({ ...tableLocalPose, yawRad: 0 }),
    radiusMm: BUTTON_RADIUS_MM,
    heightMm: BUTTON_HEIGHT_MM,
    topZMm,
    pressNormal: Object.freeze({ x: 0, y: 0, z: 1 }),
    pressDepthMm: PRESS_DEPTH_MM,
    reserveRadiusMm: RESERVE_RADIUS_MM,
    safeApproachZMm,
    contactTcp: Object.freeze({ xMm: centre.xMm, yMm: centre.yMm, zMm: contactTcpZMm }),
    pressedTcp: Object.freeze({ xMm: centre.xMm, yMm: centre.yMm, zMm: pressedTcpZMm }),
    motionSpeedMmS: MOTION_SPEED_MM_S,
    positionToleranceMm: POSITION_TOLERANCE_MM
  });
}

export function getMoreBricksButtonAnchor(settings, profile) {
  return makeAnchor(settings, profile);
}

function stateSnapshot(controller, status, pressesCompleted, lastResult, active) {
  return {
    ok: true,
    status,
    active,
    pressesCompleted,
    pressesRequested: 2,
    worldRevision: controller.worldRevision ?? controller.getState?.().worldRevision ?? null,
    lastResult: clone(lastResult)
  };
}

/**
 * Shared MORE BRICKS button authority.
 *
 * Human activation represents the Player clicking the visible button once.
 * The WebMCP tool performs two real TCP contact/press cycles. Both paths call
 * the same post-contact `activate` function, which is the only place allowed
 * to invoke the refill callback. `onPress` is an optional animation/telemetry
 * observer; deterministic TCP geometry below is the contact detector.
 */
export function createMoreBricksButton({
  controller,
  settings,
  profile,
  refill,
  onPress = () => {},
  canRequest = () => true
} = {}) {
  if (!controller || typeof controller.getState !== 'function' || typeof controller.moveTool !== 'function'
    || typeof controller.operationBlocked !== 'function'
    || typeof controller.beginExclusiveOperation !== 'function' || typeof controller.endExclusiveOperation !== 'function') {
    throw new TypeError('controller with moveTool and exclusive-operation support is required');
  }
  if (typeof refill !== 'function') throw new TypeError('refill callback is required');
  if (typeof onPress !== 'function' || typeof canRequest !== 'function') throw new TypeError('callbacks must be functions');
  let status = 'idle';
  let active = false;
  let pressesCompleted = 0;
  let lastResult = null;

  // Settings are mutable through PlayerSettingsStore. Resolve the anchor at
  // every public read/request so a renderer rebuild and the robot service can
  // never silently use different button poses. Each operation snapshots this
  // result before its first move.
  const getAnchor = () => makeAnchor(settings, profile);
  const getState = () => stateSnapshot(controller, status, pressesCompleted, lastResult, active);

  function retreatEvidence(anchor = null) {
    const tcp = currentTcp(controller);
    const nearButton = Boolean(finiteTcp(tcp) && anchor?.pose && finite(anchor.pose.xMm)
      && finite(anchor.pose.yMm) && Math.hypot(tcp.xMm - anchor.pose.xMm, tcp.yMm - anchor.pose.yMm)
        <= Math.max(anchor.reserveRadiusMm ?? 0, anchor.radiusMm ?? 0));
    const belowApproach = Boolean(finiteTcp(tcp) && finite(anchor?.safeApproachZMm)
      && tcp.zMm < anchor.safeApproachZMm - (anchor.positionToleranceMm ?? POSITION_TOLERANCE_MM));
    const retreatRequired = nearButton && belowApproach;
    return {
      retreatRequired,
      retreatInstruction: retreatRequired
        ? 'Next request will lift vertically at the current TCP before lateral travel.'
        : null,
      currentTcp: tcp
    };
  }

  function withRetreatEvidence(result, anchor = null) {
    let resolved = anchor;
    if (!resolved) {
      try { resolved = getAnchor(); } catch { resolved = null; }
    }
    return { ...result, ...retreatEvidence(resolved) };
  }

  function revision() {
    const value = controller.worldRevision ?? controller.getState().worldRevision;
    return validRevision(value) ? value : null;
  }

  function checkExpected(expectedWorldRevision, { required = false } = {}) {
    const current = revision();
    if (current === null) return fail('invalid_state', { worldRevision: current });
    if (required && !validRevision(expectedWorldRevision)) return fail('invalid_input', { worldRevision: current });
    if (expectedWorldRevision !== undefined && expectedWorldRevision !== current) {
      return fail('stale_state', { expectedWorldRevision, worldRevision: current });
    }
    return { ok: true, worldRevision: current };
  }

  function checkAnchorUnchanged(snapshot) {
    let current;
    try {
      current = getAnchor();
    } catch (error) {
      return fail('invalid_state', { message: error?.message, worldRevision: revision() });
    }
    if (anchorSignature(current) !== anchorSignature(snapshot)) {
      return fail('stale_state', {
        staleAnchor: true,
        expectedAnchor: clone(snapshot),
        actualAnchor: clone(current),
        worldRevision: revision()
      });
    }
    return { ok: true };
  }

  function callbackPermission(actor) {
    try {
      const permission = canRequest({ actor, anchor: getAnchor(), worldRevision: revision() });
      if (permission === false) return fail('operation_in_progress', { worldRevision: revision() });
      if (permission && permission.ok === false) return clone(permission);
      return { ok: true };
    } catch (error) {
      return fail(error?.code ?? 'operation_in_progress', { message: error?.message, worldRevision: revision() });
    }
  }

  function checkHumanInput(input = {}) {
    if (input?.signal?.aborted) return fail('cancelled', { worldRevision: revision() });
    const expected = checkExpected(input?.expectedWorldRevision);
    return expected.ok ? callbackPermission('human') : expected;
  }

  function checkRobotReady(expectedWorldRevision) {
    const expected = checkExpected(expectedWorldRevision, { required: true });
    if (!expected.ok) return expected;
    const state = controller.getState();
    if (state.operationState !== 'idle' || state.moving || state.pendingMoveCount > 0 || controller.operationBlocked()) {
      return fail('operation_in_progress', { worldRevision: expected.worldRevision });
    }
    if (state.heldBrickId || state.gripper?.brickInTcp || state.gripper?.jawState !== 'open') {
      return fail('gripper_not_empty', { worldRevision: expected.worldRevision, heldBrickId: state.heldBrickId ?? null, jawState: state.gripper?.jawState ?? null });
    }
    const permission = callbackPermission('agent');
    return permission.ok ? expected : permission;
  }

  async function invokePress({ anchor, actor, operationToken = null, signal = null, index, tcp, worldRevision, contactEvidence = null }) {
    if (signal?.aborted) return fail('cancelled', { worldRevision: revision() });
    let callbackResult;
    try {
      callbackResult = await onPress({ actor, index, anchor: clone(anchor), tcp: clone(tcp), operationToken, signal, worldRevision });
    } catch (error) {
      return fail(error?.code ?? 'button_contact_failed', { message: error?.message, contactEvidence: clone(contactEvidence), worldRevision: revision() });
    }
    if (callbackResult === false || callbackResult?.ok === false) {
      return fail('button_contact_failed', { contact: clone(callbackResult), contactEvidence: clone(contactEvidence), worldRevision: revision() });
    }
    if (actor === 'agent' && !contactEvidence?.contactDetected) {
      return fail('button_contact_failed', { contactEvidence: clone(contactEvidence), worldRevision: revision() });
    }
    return {
      ok: true,
      // Preserve `contact` for existing diagnostics while making it explicit
      // that this value is only an observer result, never physical proof.
      contact: callbackResult === undefined ? null : clone(callbackResult),
      observer: callbackResult === undefined ? null : clone(callbackResult),
      contactDetected: actor === 'agent' ? true : Boolean(contactEvidence?.contactDetected),
      contactEvidence: clone(contactEvidence),
      worldRevision: revision() ?? worldRevision
    };
  }

  async function activateRefill({ anchor, actor, operationToken = null, signal = null, index, contactTcp, colourDemand = null, expectedWorldRevision = revision() }) {
    if (signal?.aborted) return fail('cancelled', { worldRevision: revision() });
    const expected = checkExpected(expectedWorldRevision);
    if (!expected.ok) return expected;
    const before = inventorySnapshot(controller);
    if (expected.worldRevision === null) return fail('invalid_state', { inventoryBefore: before });
    let result;
    try {
      // This is the sole refill call site for both human and TCP activation.
      result = await refill({ actor, operationToken, expectedWorldRevision: expected.worldRevision, signal, buttonId: BUTTON_ID, anchor: clone(anchor), contactTcp: clone(contactTcp), colourDemand: clone(colourDemand) });
    } catch (error) {
      return fail(error?.code ?? 'refill_failed', { message: error?.message, inventoryBefore: before, inventoryAfter: inventorySnapshot(controller), worldRevision: revision() });
    }
    const after = inventorySnapshot(controller);
    const spawnedDelta = resultCount(result, before, after);
    if (!result || result.ok === false) {
      return fail(result?.reason ?? 'refill_failed', {
        refill: clone(result), inventoryBefore: clone(result?.inventoryBefore ?? before), inventoryAfter: clone(result?.inventoryAfter ?? after),
        spawnedDelta, worldRevision: revision()
      });
    }
    return {
      ok: true,
      refill: clone(result),
      inventoryBefore: clone(result.inventoryBefore ?? before),
      inventoryAfter: clone(result.inventoryAfter ?? after),
      spawnedDelta,
      spawnedIds: clone(result.spawnedIds ?? result.added ?? []),
      worldRevision: revision()
    };
  }

  async function activateHuman(input = {}) {
    const ready = checkHumanInput(input);
    if (!ready.ok) return ready;
    if (active) return fail('operation_in_progress', { worldRevision: revision() });
    const operationAnchor = getAnchor();
    active = true; status = 'pressing'; pressesCompleted = 0;
    const worldRevisionBefore = revision();
    const inventoryBefore = inventorySnapshot(controller);
    try {
      const contact = await invokePress({ anchor: operationAnchor, actor: 'human', signal: input.signal, index: 1, tcp: operationAnchor.contactTcp, worldRevision: worldRevisionBefore });
      if (!contact.ok) return { ...contact, pressesRequested: 1, pressesCompleted: 0, inventoryBefore, inventoryAfter: inventorySnapshot(controller), spawnedDelta: 0, worldRevisionBefore, worldRevisionAfter: revision(), worldRevision: revision() };
      pressesCompleted = 1;
      const afterContact = checkExpected(worldRevisionBefore);
      if (!afterContact.ok) return { ...afterContact, pressesRequested: 1, pressesCompleted: 1, partialPresses: 1, inventoryBefore, inventoryAfter: inventorySnapshot(controller), spawnedDelta: 0, worldRevisionBefore, worldRevisionAfter: revision(), worldRevision: revision() };
      const afterContactAnchor = checkAnchorUnchanged(operationAnchor);
      if (!afterContactAnchor.ok) return { ...afterContactAnchor, pressesRequested: 1, pressesCompleted: 1, partialPresses: 1, inventoryBefore, inventoryAfter: inventorySnapshot(controller), spawnedDelta: 0, worldRevisionBefore, worldRevisionAfter: revision(), worldRevision: revision() };
      if (input.signal?.aborted) return { ...fail('cancelled', { worldRevision: revision() }), pressesRequested: 1, pressesCompleted: 1, partialPresses: 1, inventoryBefore, inventoryAfter: inventorySnapshot(controller), spawnedDelta: 0, worldRevisionBefore, worldRevisionAfter: revision() };
      const refillResult = await activateRefill({ anchor: operationAnchor, actor: 'human', signal: input.signal, index: 1, contactTcp: operationAnchor.contactTcp, expectedWorldRevision: worldRevisionBefore });
      if (!refillResult.ok) return { ...refillResult, pressesRequested: 1, pressesCompleted: 1, partialPresses: 1, worldRevisionBefore, worldRevisionAfter: revision(), worldRevision: revision() };
      pressesCompleted = 1; status = 'complete';
      const result = {
        ok: true, action: 'more_bricks', actor: 'human', pressesRequested: 1, pressesCompleted,
        partialPresses: 0, inventoryBefore, inventoryAfter: refillResult.inventoryAfter,
        spawnedDelta: refillResult.spawnedDelta, spawnedIds: refillResult.spawnedIds,
        worldRevisionBefore, worldRevisionAfter: revision(), worldRevision: revision()
      };
      lastResult = clone(result);
      return result;
    } finally {
      active = false;
      if (status !== 'complete') status = 'failed';
    }
  }

  function tcpMatches(tcp, expected) {
    return Boolean(tcp && expected && [tcp.xMm, tcp.yMm, tcp.zMm].every(finite)
      && Math.hypot(tcp.xMm - expected.xMm, tcp.yMm - expected.yMm) <= POSITION_TOLERANCE_MM
      && Math.abs(tcp.zMm - expected.zMm) <= POSITION_TOLERANCE_MM);
  }

  async function moveTo(target, expectedWorldRevision, operationToken, signal, yawRad = 0) {
    if (signal?.aborted) return fail('cancelled', { worldRevision: revision() });
    const expected = checkExpected(expectedWorldRevision);
    if (!expected.ok) return expected;
    if (controller.operationBlocked(operationToken)) return fail('operation_in_progress', { worldRevision: expected.worldRevision });
    const beforeTcp = currentTcp(controller);
    const beforeState = controller.getState();
    const alreadyAtPose = tcpMatches(beforeTcp, target)
      && yawDistanceRad(beforeState.toolYawRad, yawRad) <= POSITION_TOLERANCE_MM / 100;
    if (alreadyAtPose) {
      return {
        ok: true,
        skipped: true,
        result: { ok: true, skipped: true, reason: 'already_at_pose' },
        tcp: beforeTcp,
        worldRevision: revision()
      };
    }
    let result;
    try {
      result = await controller.moveTool({
        ...target,
        yawRad,
        speedMmS: Math.min(MOTION_SPEED_MM_S, controller.speedLimitMmS ?? MOTION_SPEED_MM_S),
        expectedWorldRevision,
        operationToken,
        signal
      });
    } catch (error) {
      return fail(error?.code ?? 'motion_failed', { details: clone(error?.details ?? {}), worldRevision: revision() });
    }
    if (!result?.ok) return fail(result?.reason ?? 'motion_failed', { details: clone(result?.details ?? result), worldRevision: revision() });
    const tcp = currentTcp(controller);
    if (!tcpMatches(tcp, target)) return fail('tcp_pose_mismatch', { expectedTcp: clone(target), actualTcp: tcp, worldRevision: revision() });
    return { ok: true, result: clone(result), tcp, worldRevision: revision() };
  }

  async function execute(input = {}, { signal = null } = {}) {
    const expectedWorldRevision = input?.expectedWorldRevision;
    if (!validColourDemand(input?.colourDemand)) {
      const current = revision();
      return withRetreatEvidence(fail('invalid_input', { pressesRequested: 2, pressesCompleted: 0, partialPresses: 0, worldRevisionBefore: current, worldRevisionAfter: current, worldRevision: current }));
    }
    const ready = checkRobotReady(expectedWorldRevision);
    if (!ready.ok) {
      const current = revision();
      return withRetreatEvidence({ ...ready, pressesRequested: 2, pressesCompleted: 0, partialPresses: 0, worldRevisionBefore: current, worldRevisionAfter: current, worldRevision: current });
    }
    if (signal?.aborted) {
      const current = revision();
      return withRetreatEvidence(fail('cancelled', { pressesRequested: 2, pressesCompleted: 0, partialPresses: 0, worldRevisionBefore: current, worldRevisionAfter: current, worldRevision: current }));
    }
    if (active) {
      const current = revision();
      return withRetreatEvidence(fail('operation_in_progress', { pressesRequested: 2, pressesCompleted: 0, partialPresses: 0, worldRevisionBefore: current, worldRevisionAfter: current, worldRevision: current }));
    }
    const operationAnchor = getAnchor();
    const worldRevisionBefore = revision();
    const inventoryBefore = inventorySnapshot(controller);
    // The button only needs fixed-down Cartesian motion. Preserve the
    // measured yaw branch from the current robot state throughout this
    // operation so an unnecessary 90-degree wrist rotation cannot trigger a
    // continuity rejection at an otherwise safe zero-distance lift.
    const operationYawRad = Number.isFinite(controller.getState().toolYawRad)
      ? controller.getState().toolYawRad
      : 0;
    const exclusive = controller.beginExclusiveOperation('request_more_bricks');
    if (!exclusive?.ok) return withRetreatEvidence({ ...exclusive, pressesRequested: 2, pressesCompleted: 0, partialPresses: 0, worldRevisionBefore, worldRevisionAfter: revision(), worldRevision: revision() }, operationAnchor);
    active = true; status = 'moving'; pressesCompleted = 0;
    let operationToken = exclusive.token;
    let spawnedDelta = 0;
    const spawnedIds = [];
    const pressResults = [];
    let failure = null;
    try {
      let currentRevision = revision();
      const initialTcp = currentTcp(controller);
      const lift = await moveTo({ xMm: initialTcp.xMm, yMm: initialTcp.yMm, zMm: operationAnchor.safeApproachZMm }, currentRevision, operationToken, signal, operationYawRad);
      if (!lift.ok) failure = lift;
      if (!failure) {
        currentRevision = lift.worldRevision;
        const travel = await moveTo({ xMm: operationAnchor.pose.xMm, yMm: operationAnchor.pose.yMm, zMm: operationAnchor.safeApproachZMm }, currentRevision, operationToken, signal, operationYawRad);
        if (!travel.ok) failure = travel;
        else currentRevision = travel.worldRevision;
      }
      for (let index = 1; index <= 2 && !failure; index += 1) {
        status = 'pressing';
        const contact = await moveTo(operationAnchor.contactTcp, currentRevision, operationToken, signal, operationYawRad);
        if (!contact.ok) { failure = contact; break; }
        currentRevision = contact.worldRevision;
        const contactTcp = contact.tcp;
        const pressed = await moveTo(operationAnchor.pressedTcp, currentRevision, operationToken, signal, operationYawRad);
        if (!pressed.ok) { failure = pressed; break; }
        const contactDetection = detectMoreBricksContact(operationAnchor, contactTcp, pressed.tcp);
        if (!contactDetection.contactDetected) {
          failure = fail('button_contact_failed', { contactEvidence: contactDetection, worldRevision: pressed.worldRevision });
          break;
        }
        currentRevision = pressed.worldRevision;
        const contactEvent = await invokePress({ anchor: operationAnchor, actor: 'agent', operationToken, signal, index, tcp: pressed.tcp, worldRevision: currentRevision, contactEvidence: contactDetection });
        if (!contactEvent.ok) { failure = contactEvent; break; }
        // A successful contact callback follows a verified pressed TCP pose;
        // count the physical press even when a later stale/cancelled check
        // prevents the refill mutation.
        pressesCompleted += 1;
        const afterContactCallback = checkExpected(currentRevision);
        if (!afterContactCallback.ok) { failure = afterContactCallback; break; }
        const afterContactAnchor = checkAnchorUnchanged(operationAnchor);
        if (!afterContactAnchor.ok) { failure = afterContactAnchor; break; }
        const pressEvidence = { index, contactTcp, pressedTcp: pressed.tcp, toolYawRad: operationYawRad,
          contactDetected: true, contactEvidence: contactDetection, contact: contactEvent, refill: null };
        pressResults.push(pressEvidence);
        if (signal?.aborted) { failure = fail('cancelled', { worldRevision: revision() }); break; }
        // Refill is intentionally after the fully completed pressed pose and
        // contact verification; contact/pre-contact never mutates inventory.
        const refillResult = await activateRefill({ anchor: operationAnchor, actor: 'agent', operationToken, signal, index, contactTcp: pressed.tcp, colourDemand: input.colourDemand, expectedWorldRevision: currentRevision });
        pressEvidence.refill = refillResult;
        if (!refillResult.ok) { failure = refillResult; break; }
        spawnedDelta += refillResult.spawnedDelta;
        spawnedIds.push(...(refillResult.spawnedIds ?? []));
        currentRevision = refillResult.worldRevision ?? revision();
        const retract = await moveTo({ xMm: operationAnchor.pose.xMm, yMm: operationAnchor.pose.yMm, zMm: operationAnchor.safeApproachZMm }, currentRevision, operationToken, signal, operationYawRad);
        if (!retract.ok) { failure = retract; break; }
        currentRevision = retract.worldRevision;
        pressResults.at(-1).retractTcp = retract.tcp;
        status = index === 1 ? 'moving' : 'complete';
      }
    } finally {
      controller.endExclusiveOperation(operationToken);
      active = false;
    }
    const inventoryAfter = inventorySnapshot(controller);
    const remainingColourDemand = input.colourDemand
      ? Object.fromEntries(Object.entries(input.colourDemand)
        .map(([colour, target]) => [colour, Math.max(0, target - (inventoryAfter.availableByColour[colour] ?? 0))])
        .filter(([, deficit]) => deficit > 0))
      : {};
    const worldRevisionAfter = revision();
    const ok = !failure && pressesCompleted === 2;
    const result = {
      ok,
      action: 'request_more_bricks',
      actor: 'agent',
      status: ok ? 'complete' : (failure?.reason ?? 'failed'),
      reason: ok ? null : (failure?.reason ?? 'press_failed'),
      pressesRequested: 2,
      pressesCompleted,
      partialPresses: pressesCompleted > 0 && pressesCompleted < 2 ? pressesCompleted : 0,
      inventoryBefore,
      inventoryAfter,
      remainingColourDemand,
      spawnedDelta,
      spawnedIds,
      worldRevisionBefore,
      worldRevisionAfter,
      pressResults: pressResults.slice(0, 2),
      details: failure ? clone(failure) : null,
      worldRevision: worldRevisionAfter
    };
    status = ok ? 'complete' : 'failed';
    const completedResult = withRetreatEvidence(result, operationAnchor);
    lastResult = clone(completedResult);
    return completedResult;
  }

  const tool = Object.freeze({
    name: 'request_more_bricks',
    description: 'Physically move the empty robot TCP to the shared MORE BRICKS button and press it twice. Optionally request target available counts by colour for patterns such as checkerboards. The button remains the refill trigger; no direct spawn or recolour shortcut is exposed. Requires the latest exact worldRevision.',
    inputSchema: {
      type: 'object',
      properties: {
        colourDemand: {
          type: 'object',
          description: 'Optional target counts of loose available bricks after refilling, subject to feeder capacity. Existing bricks are never recoloured.',
          properties: Object.fromEntries(REFILL_COLOURS
            .map(colour => [colour, { type: 'integer', minimum: 0, maximum: 5000 }])),
          additionalProperties: false
        },
        expectedWorldRevision: { type: 'integer', minimum: 0, description: 'Exact current worldRevision from the latest successful read or tool result.' }
      },
      required: ['expectedWorldRevision'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, untrustedContentHint: false },
    execute
  });

  return Object.freeze({ getAnchor, activateHuman, tool, getState });
}
