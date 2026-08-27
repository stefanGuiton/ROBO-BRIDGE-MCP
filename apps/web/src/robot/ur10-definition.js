import { degToRad } from './math.js';

// Official Universal Robots UR10 DH dimensions, converted from metres to mm.
// The public visual remains a project-owned generic industrial arm.
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
  toolLengthMm: 120,
  fixedToolOrientation: Object.freeze([
    1, 0, 0,
    0, -1, 0,
    0, 0, -1
  ]),
  homeTcp: Object.freeze({ xMm: 600, yMm: 0, zMm: 450 }),
  homeJointsRad: Object.freeze([
    degToRad(15.857), degToRad(-182.954), degToRad(84.749),
    degToRad(8.206), degToRad(-90), degToRad(105.857)
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
  pickupTcp: Object.freeze({ xMm: 520, yMm: -230, zMm: 41.4 }),
  pickupAboveTcp: Object.freeze({ xMm: 520, yMm: -230, zMm: 255 }),
  targetTcp: Object.freeze({ xMm: 655, yMm: 220, zMm: 41.4 }),
  targetAboveTcp: Object.freeze({ xMm: 655, yMm: 220, zMm: 255 })
});
