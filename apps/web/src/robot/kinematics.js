import {
  angleDistance,
  clamp,
  dhMatrix,
  distance3,
  isFiniteNumber,
  mat4Identity,
  mat4Multiply,
  rotation3,
  rotationVectorError,
  solveLinearSystem,
  transformPoint,
  translationMatrix,
  vectorNorm,
  wrapPi
} from './math.js';
import { UR10_DEFINITION } from './ur10-definition.js';

const ORIENTATION_WEIGHT_MM = 180;
const POSITION_TOLERANCE_MM = 0.08;
const ORIENTATION_TOLERANCE_RAD = 0.0015;

function cloneJoints(joints) {
  return Array.from(joints, Number);
}

export function validateJointState(joints, definition = UR10_DEFINITION) {
  if (!Array.isArray(joints) || joints.length !== 6 || !joints.every(isFiniteNumber)) {
    return { ok: false, reason: 'invalid_input' };
  }
  for (let i = 0; i < 6; i += 1) {
    const [min, max] = definition.jointLimitsRad[i];
    if (joints[i] < min - 1e-9 || joints[i] > max + 1e-9) {
      return { ok: false, reason: 'joint_limit', jointIndex: i, valueRad: joints[i], minRad: min, maxRad: max };
    }
  }
  return { ok: true };
}

export function forwardKinematics(joints, definition = UR10_DEFINITION) {
  const validation = validateJointState(joints, definition);
  if (!validation.ok) return { ok: false, ...validation };

  let transform = mat4Identity();
  const frames = [transform];
  const jointPositions = [transformPoint(transform)];
  for (let i = 0; i < 6; i += 1) {
    transform = mat4Multiply(transform, dhMatrix(
      definition.aMm[i], definition.dMm[i], definition.alphaRad[i], joints[i]
    ));
    frames.push(transform);
    jointPositions.push(transformPoint(transform));
  }
  const flangeTransform = transform;
  const tcpTransform = mat4Multiply(flangeTransform, translationMatrix(0, 0, definition.toolLengthMm));
  return {
    ok: true,
    jointsRad: cloneJoints(joints),
    frames,
    jointPositions,
    flange: transformPoint(flangeTransform),
    tcp: transformPoint(tcpTransform),
    rotation: rotation3(tcpTransform),
    tcpTransform
  };
}

function poseError(joints, target, definition) {
  const fk = forwardKinematics(joints, definition);
  if (!fk.ok) return null;
  const orientationError = rotationVectorError(fk.rotation, definition.fixedToolOrientation);
  return {
    vector: [
      fk.tcp.xMm - target.xMm,
      fk.tcp.yMm - target.yMm,
      fk.tcp.zMm - target.zMm,
      orientationError[0] * ORIENTATION_WEIGHT_MM,
      orientationError[1] * ORIENTATION_WEIGHT_MM,
      orientationError[2] * ORIENTATION_WEIGHT_MM
    ],
    positionErrorMm: distance3(fk.tcp, target),
    orientationErrorRad: vectorNorm(orientationError),
    fk
  };
}

function normaliseNear(value, reference) {
  let candidate = value;
  while (candidate - reference > Math.PI) candidate -= 2 * Math.PI;
  while (candidate - reference < -Math.PI) candidate += 2 * Math.PI;
  return candidate;
}

function projectToLimits(joints, reference, definition) {
  return joints.map((value, i) => {
    const [min, max] = definition.jointLimitsRad[i];
    let candidate = normaliseNear(value, reference[i]);
    if (candidate < min) {
      const plus = candidate + 2 * Math.PI;
      if (plus <= max) candidate = plus;
    }
    if (candidate > max) {
      const minus = candidate - 2 * Math.PI;
      if (minus >= min) candidate = minus;
    }
    return clamp(candidate, min, max);
  });
}

function solveFromSeed(target, seed, definition, options = {}) {
  let joints = projectToLimits(cloneJoints(seed), seed, definition);
  let damping = options.damping ?? 4.0;
  const maxIterations = options.maxIterations ?? 70;
  const finiteStep = options.finiteStep ?? 1e-4;
  let best = null;
  let stagnant = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const current = poseError(joints, target, definition);
    if (!current) return { ok: false, reason: 'ik_failed' };
    const score = vectorNorm(current.vector);
    if (!best || score < best.score) best = { score, joints: cloneJoints(joints), current, iteration };

    if (current.positionErrorMm <= POSITION_TOLERANCE_MM && current.orientationErrorRad <= ORIENTATION_TOLERANCE_RAD) {
      return {
        ok: true,
        jointsRad: cloneJoints(joints),
        tcp: current.fk.tcp,
        positionErrorMm: current.positionErrorMm,
        orientationErrorRad: current.orientationErrorRad,
        iterations: iteration + 1
      };
    }

    const jacobian = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let jointIndex = 0; jointIndex < 6; jointIndex += 1) {
      const perturbed = cloneJoints(joints);
      perturbed[jointIndex] += finiteStep;
      const sample = poseError(perturbed, target, definition);
      if (!sample) continue;
      for (let row = 0; row < 6; row += 1) {
        jacobian[row][jointIndex] = (sample.vector[row] - current.vector[row]) / finiteStep;
      }
    }

    const normal = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const rhs = new Array(6).fill(0);
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        let sum = 0;
        for (let k = 0; k < 6; k += 1) sum += jacobian[k][r] * jacobian[k][c];
        normal[r][c] = sum + (r === c ? damping * damping : 0);
      }
      let sum = 0;
      for (let k = 0; k < 6; k += 1) sum += jacobian[k][r] * current.vector[k];
      rhs[r] = -sum;
    }

    const delta = solveLinearSystem(normal, rhs);
    if (!delta || !delta.every(isFiniteNumber)) break;
    const maxDelta = Math.max(...delta.map(Math.abs));
    const scale = maxDelta > 0.30 ? 0.30 / maxDelta : 1;
    const candidate = projectToLimits(joints.map((value, i) => value + delta[i] * scale), joints, definition);
    const candidateError = poseError(candidate, target, definition);
    if (!candidateError) break;
    const candidateScore = vectorNorm(candidateError.vector);
    if (candidateScore < score) {
      joints = candidate;
      damping = Math.max(0.15, damping * 0.72);
      stagnant = 0;
    } else {
      damping = Math.min(80, damping * 2.2);
      stagnant += 1;
      if (stagnant >= 7) break;
    }
  }

  if (best && best.current.positionErrorMm <= 0.25 && best.current.orientationErrorRad <= 0.003) {
    return {
      ok: true,
      jointsRad: best.joints,
      tcp: best.current.fk.tcp,
      positionErrorMm: best.current.positionErrorMm,
      orientationErrorRad: best.current.orientationErrorRad,
      iterations: best.iteration + 1,
      relaxed: true
    };
  }
  return {
    ok: false,
    reason: 'ik_failed',
    diagnostics: best ? {
      bestPositionErrorMm: best.current.positionErrorMm,
      bestOrientationErrorRad: best.current.orientationErrorRad,
      iterations: best.iteration + 1
    } : {}
  };
}

function seedDistance(candidate, reference) {
  return candidate.reduce((sum, value, i) => sum + angleDistance(value, reference[i]) ** 2, 0);
}

export function inverseKinematics(target, previousJoints = UR10_DEFINITION.homeJointsRad, definition = UR10_DEFINITION, options = {}) {
  if (!target || ![target.xMm, target.yMm, target.zMm].every(isFiniteNumber)) {
    return { ok: false, reason: 'invalid_input' };
  }
  const radial = Math.hypot(target.xMm, target.yMm);
  if (radial > 1280 || radial < 220 || target.zMm < 40 || target.zMm > 900) {
    return { ok: false, reason: 'outside_workspace', diagnostics: { radialMm: radial } };
  }
  const reference = validateJointState(previousJoints, definition).ok
    ? cloneJoints(previousJoints)
    : cloneJoints(definition.homeJointsRad);

  const seeds = [
    reference,
    cloneJoints(definition.homeJointsRad),
    reference.map((value, i) => i === 0 ? value + Math.PI : value),
    reference.map((value, i) => i === 2 ? value - 0.75 : value),
    [Math.atan2(target.yMm, target.xMm), -3.4, 1.7, 0.2, -Math.PI / 2, Math.atan2(target.yMm, target.xMm) + Math.PI / 2]
  ];

  const solutions = [];
  for (const rawSeed of seeds) {
    const seed = projectToLimits(rawSeed, reference, definition);
    const result = solveFromSeed(target, seed, definition, options);
    if (!result.ok) continue;
    const validation = validateJointState(result.jointsRad, definition);
    if (!validation.ok) continue;
    const candidate = { ...result, continuityScore: seedDistance(result.jointsRad, reference) };
    solutions.push(candidate);
    if (candidate.continuityScore < 0.35 && candidate.positionErrorMm < 0.05) break;
  }

  if (solutions.length === 0) return { ok: false, reason: 'ik_failed' };
  solutions.sort((a, b) => a.continuityScore - b.continuityScore || a.positionErrorMm - b.positionErrorMm);
  const selected = solutions[0];
  const maxJointDelta = Math.max(...selected.jointsRad.map((value, i) => angleDistance(value, reference[i])));
  if (maxJointDelta > (options.maxBranchJumpRad ?? 1.65)) {
    return { ok: false, reason: 'joint_limit', diagnostics: { maxJointDeltaRad: maxJointDelta, cause: 'branch_jump' } };
  }
  const singularityMargin = Math.min(
    Math.abs(Math.sin(selected.jointsRad[2])),
    Math.abs(Math.sin(selected.jointsRad[4])),
    Math.abs(Math.sin(selected.jointsRad[1] + selected.jointsRad[2]))
  );
  if (singularityMargin < (options.minSingularityMargin ?? 0.003)) {
    return { ok: false, reason: 'ik_failed', diagnostics: { cause: 'near_singularity', singularityMargin } };
  }
  return {
    ok: true,
    jointsRad: selected.jointsRad,
    tcp: selected.tcp,
    positionErrorMm: selected.positionErrorMm,
    orientationErrorRad: selected.orientationErrorRad,
    iterations: selected.iterations,
    candidateCount: solutions.length,
    maxJointDeltaRad: maxJointDelta,
    singularityMargin,
    nearSingularity: singularityMargin < 0.03
  };
}

export function orientationErrorForJoints(joints, definition = UR10_DEFINITION) {
  const fk = forwardKinematics(joints, definition);
  if (!fk.ok) return Infinity;
  return vectorNorm(rotationVectorError(fk.rotation, definition.fixedToolOrientation));
}

export function poseErrorForJoints(joints, target, definition = UR10_DEFINITION) {
  const result = poseError(joints, target, definition);
  if (!result) return { positionErrorMm: Infinity, orientationErrorRad: Infinity };
  return { positionErrorMm: result.positionErrorMm, orientationErrorRad: result.orientationErrorRad };
}

export function unwrapJointNear(value, reference) {
  return normaliseNear(value, reference);
}
