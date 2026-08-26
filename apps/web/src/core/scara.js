export const DEFAULT_SCARA_CONFIG = Object.freeze({
  id: 'scara-340-250',
  link1Mm: 340.313,
  link2Mm: 249.96,
  zMinMm: 0,
  zMaxMm: 525,
  thetaMinDeg: -172.5,
  thetaMaxDeg: 172.5,
  psiMinDeg: -172.5,
  psiMaxDeg: 172.5,
  initial: Object.freeze({ thetaDeg: -24.15, psiDeg: 37.62, zMm: 220 })
});

const EPSILON = 1e-7;

export function degToRad(value) {
  return (value * Math.PI) / 180;
}

export function radToDeg(value) {
  return (value * 180) / Math.PI;
}

export function normalizeDeg(value) {
  let result = ((value + 180) % 360 + 360) % 360 - 180;
  if (Object.is(result, -0)) result = 0;
  return result;
}

export function angularDistanceDeg(a, b) {
  return Math.abs(normalizeDeg(a - b));
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function within(value, min, max, tolerance = 1e-6) {
  return value >= min - tolerance && value <= max + tolerance;
}

export function forwardKinematics(joints, config = DEFAULT_SCARA_CONFIG) {
  const theta = degToRad(joints.thetaDeg);
  const psi = degToRad(joints.psiDeg);
  const x = config.link1Mm * Math.cos(theta) + config.link2Mm * Math.cos(theta + psi);
  const y = config.link1Mm * Math.sin(theta) + config.link2Mm * Math.sin(theta + psi);
  return Object.freeze({ xMm: x, yMm: y, zMm: joints.zMm });
}

export function workspace(config = DEFAULT_SCARA_CONFIG) {
  return Object.freeze({
    minRadiusMm: Math.abs(config.link1Mm - config.link2Mm),
    maxRadiusMm: config.link1Mm + config.link2Mm,
    zMinMm: config.zMinMm,
    zMaxMm: config.zMaxMm
  });
}

export function validateJointState(joints, config = DEFAULT_SCARA_CONFIG) {
  if (![joints.thetaDeg, joints.psiDeg, joints.zMm].every(finiteNumber)) {
    return { ok: false, reason: 'non_finite_joint_request' };
  }
  if (!within(joints.thetaDeg, config.thetaMinDeg, config.thetaMaxDeg)) {
    return { ok: false, reason: 'theta_limit', diagnostics: { value: joints.thetaDeg } };
  }
  if (!within(joints.psiDeg, config.psiMinDeg, config.psiMaxDeg)) {
    return { ok: false, reason: 'psi_limit', diagnostics: { value: joints.psiDeg } };
  }
  if (!within(joints.zMm, config.zMinMm, config.zMaxMm)) {
    return { ok: false, reason: 'z_limit', diagnostics: { value: joints.zMm } };
  }
  return { ok: true };
}

export function inverseKinematics(target, previousJoints, config = DEFAULT_SCARA_CONFIG) {
  const x = target.xMm;
  const y = target.yMm;
  const z = target.zMm;
  if (![x, y, z].every(finiteNumber)) {
    return { ok: false, reason: 'non_finite_cartesian_request', requested: { ...target } };
  }
  if (!within(z, config.zMinMm, config.zMaxMm)) {
    return { ok: false, reason: 'z_limit', requested: { ...target }, diagnostics: { zMm: z } };
  }

  const radiusSquared = x * x + y * y;
  const radius = Math.sqrt(radiusSquared);
  const ws = workspace(config);
  if (radius > ws.maxRadiusMm + EPSILON || radius < ws.minRadiusMm - EPSILON) {
    return {
      ok: false,
      reason: 'outside_workspace',
      requested: { ...target },
      diagnostics: { radiusMm: radius, ...ws }
    };
  }

  const denominator = 2 * config.link1Mm * config.link2Mm;
  const rawCosPsi = (radiusSquared - config.link1Mm ** 2 - config.link2Mm ** 2) / denominator;
  if (rawCosPsi < -1 - EPSILON || rawCosPsi > 1 + EPSILON) {
    return {
      ok: false,
      reason: 'no_real_ik_solution',
      requested: { ...target },
      diagnostics: { rawCosPsi }
    };
  }

  const cosPsi = Math.max(-1, Math.min(1, rawCosPsi));
  const basePsi = Math.acos(cosPsi);
  const candidates = [basePsi, -basePsi]
    .map((psiRad) => {
      const thetaRad = Math.atan2(y, x) - Math.atan2(
        config.link2Mm * Math.sin(psiRad),
        config.link1Mm + config.link2Mm * Math.cos(psiRad)
      );
      return {
        thetaDeg: normalizeDeg(radToDeg(thetaRad)),
        psiDeg: normalizeDeg(radToDeg(psiRad)),
        zMm: z
      };
    })
    .filter((candidate) => validateJointState(candidate, config).ok);

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'joint_limits_exclude_ik',
      requested: { ...target },
      diagnostics: { rawCosPsi }
    };
  }

  const reference = previousJoints ?? config.initial;
  candidates.sort((a, b) => {
    const scoreA = angularDistanceDeg(a.thetaDeg, reference.thetaDeg)
      + angularDistanceDeg(a.psiDeg, reference.psiDeg);
    const scoreB = angularDistanceDeg(b.thetaDeg, reference.thetaDeg)
      + angularDistanceDeg(b.psiDeg, reference.psiDeg);
    return scoreA - scoreB;
  });

  const joints = Object.freeze({ ...candidates[0] });
  return {
    ok: true,
    joints,
    cartesian: forwardKinematics(joints, config),
    diagnostics: {
      branch: joints.psiDeg >= 0 ? 'positive' : 'negative',
      candidateCount: candidates.length,
      radiusMm: radius
    }
  };
}

export function createInitialState(config = DEFAULT_SCARA_CONFIG) {
  const joints = Object.freeze({ ...config.initial });
  return Object.freeze({
    revision: 0,
    joints,
    cartesian: forwardKinematics(joints, config),
    gripper: Object.freeze({ openFraction: 1, widthMm: 46, holdingObjectId: null }),
    mode: 'idle'
  });
}
