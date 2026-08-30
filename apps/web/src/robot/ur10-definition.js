import { UR10_GRIPPER } from './gripper-definition.js';

// Official Universal Robots UR10 DH dimensions, converted from metres to mm.
// The browser visual uses the separately attributed high-detail V2 mesh set.
export const UR10_DEFINITION = Object.freeze({
  id: 'ur10-class-official-dh',
  source: 'Universal Robots DH Parameters for calculations of kinematics and dynamics',
  units: 'mm-rad',
  aMm: Object.freeze([0, -612, -572.3, 0, 0, 0]),
  dMm: Object.freeze([127.3, 0, 0, 163.941, 115.7, 92.2]),
  alphaRad: Object.freeze([Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2, 0]),
  jointLimitsRad: Object.freeze([
    Object.freeze([-2 * Math.PI, 2 * Math.PI]),
    Object.freeze([-2 * Math.PI, 2 * Math.PI]),
    Object.freeze([-2 * Math.PI, 2 * Math.PI]),
    Object.freeze([-2 * Math.PI, 2 * Math.PI]),
    Object.freeze([-2 * Math.PI, 2 * Math.PI]),
    Object.freeze([-2 * Math.PI, 2 * Math.PI])
  ]),
  toolLengthMm: UR10_GRIPPER.flangeToTcpOffsetMm.zMm,
  toolOffsetMm: UR10_GRIPPER.flangeToTcpOffsetMm,
  fixedToolOrientation: Object.freeze([
    1, 0, 0,
    0, -1, 0,
    0, 0, -1
  ]),
  homeTcp: Object.freeze({ xMm: 670, yMm: 0, zMm: 145 }),
  // Mirror-equivalent of the supplied LOGO ROBO reference reset posture in
  // this production workcell's machine frame. This preserves the tuned low
  // elbow-up presentation without changing controller/world ownership.
  homeJointsRad: Object.freeze([
    2.8944679549887633, -1.4570244561418748, 2.0804053937875784,
    -2.194177615663675, -1.5707959609255262, -1.8179216547730466
  ])
});

export const CHALLENGE_WORKSPACE = Object.freeze({
  xMinMm: 470,
  xMaxMm: 710,
  yMinMm: -275,
  yMaxMm: 275,
  zMinMm: 40,
  zMaxMm: 470,
  safeClearanceZMm: 240
});

export const CHALLENGE_LAYOUT = Object.freeze({
  tableZMm: 0,
  tray: Object.freeze({
    minX: 470, maxX: 570, minY: -285, maxY: -175,
    floorZ: 30, wallHeight: 38
  }),
  board: Object.freeze({
    minX: 600, maxX: 710, minY: 165, maxY: 275,
    surfaceZ: 30
  }),
  pickupTcp: Object.freeze({ xMm: 520, yMm: -230, zMm: 42.5 }),
  pickupAboveTcp: Object.freeze({ xMm: 520, yMm: -230, zMm: 255 }),
  targetTcp: Object.freeze({ xMm: 655, yMm: 220, zMm: 42.5 }),
  targetAboveTcp: Object.freeze({ xMm: 655, yMm: 220, zMm: 255 })
});
