export const FIXED_DT = 1 / 60;

export const DEFAULT_CONFIG = Object.freeze({
  locomotiveMass: 8,
  carriageMass: 5,
  carriageCount: 2,
  trainSpeed: 5.2,
  acceleration: 3.8,
  guideStiffness: 780,
  guideDamping: 92,
  couplerStiffness: 52,
  couplerDamping: 9,
  gravity: 9.81,
  guideReleaseMode: "fade",
  guideReleaseSeconds: 0.16,
  mode: "dynamic",
  lateralDerailThreshold: 2.2,
  verticalDerailThreshold: 1.45,
  tiltDerailDegrees: 58,
  failPlaneY: -5.5,
  stoppedSeconds: 3.5,
  maxTestSeconds: 28,
});

export function normalizeConfig(input = {}) {
  const config = { ...DEFAULT_CONFIG, ...input };
  config.carriageCount = Math.max(0, Math.min(6, Math.round(config.carriageCount)));
  config.locomotiveMass = Math.max(1, Number(config.locomotiveMass));
  config.carriageMass = Math.max(1, Number(config.carriageMass));
  config.gravity = Math.max(0, Number(config.gravity));
  config.mode = config.mode === "kinematic" ? "kinematic" : "dynamic";
  config.guideReleaseMode = config.guideReleaseMode === "instant" ? "instant" : "fade";
  return config;
}
