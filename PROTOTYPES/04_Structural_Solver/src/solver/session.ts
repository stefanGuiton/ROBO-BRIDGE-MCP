import { cloneGraph } from "../model/graph.js";
import type { DeckRoute, FailureEvent, SolveSnapshot, SolverMode, SolverTuning, StructuralGraph, TestDiagnostic, TestResult } from "../model/types.js";
import { loadRegionSignature } from "./loads.js";
import { solveStructure } from "./solver.js";

export type SessionUpdate = { recalculated: boolean; snapshot: SolveSnapshot };

export class StructuralSolverSession {
  readonly route: DeckRoute;
  private buildGraph: StructuralGraph;
  private workingGraph: StructuralGraph;
  private mode: SolverMode = "BUILD";
  private testId = 1;
  private lastKey = "";
  private lastRegion = "";
  private loadRegionUpdates = 0;
  private failureHistory: FailureEvent[] = [];
  private firstFailureProgress: number | null = null;
  private diagnosticHistory: TestDiagnostic[] = [];
  private maximumUtilisation = 0;
  private lastSnapshot: SolveSnapshot | null = null;

  constructor(graph: StructuralGraph, route: DeckRoute) {
    this.buildGraph = cloneGraph(graph);
    this.workingGraph = cloneGraph(graph);
    this.route = { ...route, nodeIds: [...route.nodeIds], pointLoads: route.pointLoads.map((load) => ({ ...load })) };
  }

  reset(graph?: StructuralGraph): void {
    if (graph) this.buildGraph = cloneGraph(graph);
    this.workingGraph = cloneGraph(this.buildGraph);
    this.mode = "BUILD";
    this.testId += 1;
    this.lastKey = "";
    this.lastRegion = "";
    this.loadRegionUpdates = 0;
    this.failureHistory = [];
    this.firstFailureProgress = null;
    this.diagnosticHistory = [];
    this.maximumUtilisation = 0;
    this.lastSnapshot = null;
  }

  setMode(mode: SolverMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.workingGraph = cloneGraph(this.buildGraph);
    this.failureHistory = [];
    this.firstFailureProgress = null;
    this.diagnosticHistory = [];
    this.maximumUtilisation = 0;
    this.lastKey = "";
    this.lastRegion = "";
    if (mode === "TEST") this.testId += 1;
  }

  removeMember(memberId: number): boolean {
    if (this.mode !== "BUILD") return false;
    const member = this.buildGraph.members.find((item) => item.id === memberId);
    if (!member) return false;
    member.connected = false;
    member.completionFactor = 0;
    this.workingGraph = cloneGraph(this.buildGraph);
    this.lastKey = "";
    return true;
  }

  removeSupport(nodeId: number): boolean {
    if (this.mode !== "BUILD") return false;
    const node = this.buildGraph.nodes.find((item) => item.id === nodeId);
    if (!node || node.supportType === "none") return false;
    node.supportType = "none";
    this.workingGraph = cloneGraph(this.buildGraph);
    this.lastKey = "";
    return true;
  }

  update(progress: number, mass: number, tuning: SolverTuning, force = false): SessionUpdate {
    const region = loadRegionSignature(this.route, progress, mass);
    if (region !== this.lastRegion) {
      this.lastRegion = region;
      this.loadRegionUpdates += 1;
    }
    const tuningKey = Object.values(tuning).join(":");
    const key = `${this.mode}|${region}|${mass}|${tuningKey}|${this.loadRegionUpdates}`;
    if (!force && key === this.lastKey && this.lastSnapshot) return { recalculated: false, snapshot: this.lastSnapshot };
    this.lastKey = key;
    const snapshot = solveStructure(this.workingGraph, this.route, {
      mode: this.mode,
      loadProgress: progress,
      loadMass: mass,
      tuning,
      testId: this.testId,
      loadRegionUpdates: this.loadRegionUpdates,
    });
    this.workingGraph = cloneGraph(snapshot.graph);
    if (this.failureHistory.length === 0 && snapshot.failureSequence.length > 0) this.firstFailureProgress = progress;
    this.failureHistory.push(...snapshot.failureSequence);
    for (const diagnostic of snapshot.testResult.diagnostics) {
      const key = `${diagnostic.code}|${diagnostic.memberId ?? ""}|${diagnostic.nodeId ?? ""}|${diagnostic.message}`;
      const seen = this.diagnosticHistory.some((item) => `${item.code}|${item.memberId ?? ""}|${item.nodeId ?? ""}|${item.message}` === key);
      if (!seen) this.diagnosticHistory.push(diagnostic);
    }
    this.maximumUtilisation = Math.max(this.maximumUtilisation, snapshot.maximumUtilisation);
    snapshot.failureSequence = [...this.failureHistory];
    snapshot.maximumUtilisation = this.maximumUtilisation;
    snapshot.testResult = this.accumulateResult(snapshot.testResult, progress);
    this.lastSnapshot = snapshot;
    return { recalculated: true, snapshot };
  }

  private accumulateResult(step: TestResult, progress: number): TestResult {
    const failedMemberIds = this.failureHistory.map((failure) => failure.memberId);
    const failedBrickIds = this.failureHistory.flatMap((failure) => this.workingGraph.members.find((member) => member.id === failure.memberId)?.brickIds ?? []);
    const first = this.failureHistory[0];
    const outcome = !step.success && step.outcome === "ROUTE_LOST" ? "ROUTE_LOST" : failedMemberIds.length > 0 ? "BRIDGE_FAILED" : progress >= 1 ? "CROSSED" : "STOPPED";
    const base = { ...step, success: outcome === "CROSSED", outcome, failedMemberIds, failedBrickIds, maximumUtilisation: this.maximumUtilisation, diagnostics: [...this.diagnosticHistory] };
    return first ? {
      ...base,
      firstFailure: { memberId: first.memberId, reason: "utilisation exceeded the deterministic failure threshold", loadPosition: this.firstFailureProgress ?? progress },
      loadPositionAtFirstFailure: this.firstFailureProgress ?? progress,
    } : base;
  }
}
