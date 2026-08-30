export type EntityId = number;
export type SolverMode = "BUILD" | "TEST";
export type AnalysisMode = "game" | "truss-stiffness";
export type SupportType = "fixed" | "terrain" | "none";
export type MemberType = "truss" | "beam" | "pier" | "arch" | "deck" | "cable";
export type MemberState = "safe" | "stressed" | "critical" | "failed" | "disconnected";
export type TestOutcome = "CROSSED" | "BRIDGE_FAILED" | "ROUTE_LOST" | "STOPPED";

export type Vec2 = { x: number; y: number };

export type StructuralNode = {
  id: EntityId;
  position: Vec2;
  supportType: SupportType;
  appliedLoad: number;
};

export type StructuralMember = {
  id: EntityId;
  nodeA: EntityId;
  nodeB: EntityId;
  type: MemberType;
  baseCapacity: number;
  capacity: number;
  completionFactor: number;
  connected: boolean;
  demand: number;
  utilisation: number;
  failed: boolean;
  brickIds: EntityId[];
  failureDemand?: number;
  failureUtilisation?: number;
};

export type StructuralGraph = {
  nodes: StructuralNode[];
  members: StructuralMember[];
};

export type TrainPointLoad = {
  offset: number;
  massFraction: number;
};

export type DeckRoute = {
  nodeIds: EntityId[];
  regionCount: number;
  pointLoads: TrainPointLoad[];
};

export type FixtureDefinition = {
  id: string;
  label: string;
  description: string;
  graph: StructuralGraph;
  route: DeckRoute;
};

export type SolverTuning = {
  unsupportedLengthK: number;
  referenceLength: number;
  unsupportedExponent: number;
  failureThreshold: number;
  difficultyMultiplier: number;
  maximumCascadeIterations: number;
  disconnectedDemandMultiplier: number;
  analysisMode: AnalysisMode;
};

export type FailureEvent = {
  memberId: EntityId;
  utilisation: number;
  demand: number;
  effectiveCapacity: number;
  cascadeIteration: number;
};

export type SupportPath = {
  nodeId: EntityId;
  supportNodeId: EntityId | null;
  memberIds: EntityId[];
  distance: number;
};

export type MemberDiagnostic = {
  memberId: EntityId;
  type: MemberType;
  length: number;
  supportDistance: number;
  baseCapacity: number;
  effectiveCapacity: number;
  demand: number;
  utilisation: number;
  completionFactor: number;
  state: MemberState;
  carriedBySupportId: EntityId | null;
};

export type TestDiagnostic = {
  code: string;
  message: string;
  memberId?: EntityId;
  nodeId?: EntityId;
  value?: number;
};

export type TestResult = {
  testId: number;
  success: boolean;
  outcome: TestOutcome;
  failedMemberIds: EntityId[];
  failedBrickIds: EntityId[];
  maximumUtilisation: number;
  firstFailure?: {
    memberId: EntityId;
    reason: string;
    loadPosition: number;
  };
  loadPositionAtFirstFailure: number | null;
  diagnostics: TestDiagnostic[];
};

export type SolveMetrics = {
  nodeCount: number;
  memberCount: number;
  solveTimeMs: number;
  loadRegionUpdates: number;
  cascadeIterations: number;
  loadRegionSignature: string;
};

export type SolveSnapshot = {
  mode: SolverMode;
  graph: StructuralGraph;
  loadProgress: number;
  nodalLoads: Record<number, number>;
  supportPaths: SupportPath[];
  memberDiagnostics: MemberDiagnostic[];
  failureSequence: FailureEvent[];
  routeConnected: boolean;
  maximumUtilisation: number;
  metrics: SolveMetrics;
  testResult: TestResult;
};

export type SolveRequest = {
  mode: SolverMode;
  loadProgress: number;
  loadMass: number;
  tuning: SolverTuning;
  testId: number;
  loadRegionUpdates?: number;
};

export const DEFAULT_TUNING: SolverTuning = {
  unsupportedLengthK: 0.8,
  referenceLength: 3,
  unsupportedExponent: 1.8,
  failureThreshold: 1,
  difficultyMultiplier: 1,
  maximumCascadeIterations: 64,
  disconnectedDemandMultiplier: 3,
  analysisMode: "game",
};
