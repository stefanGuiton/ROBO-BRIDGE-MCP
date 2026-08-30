import { FIXTURES, getFixture } from "./fixtures/index.js";
import { DEFAULT_TUNING, type AnalysisMode, type FixtureDefinition, type MemberDiagnostic, type SolveSnapshot, type SolverMode, type SolverTuning, type StructuralNode, type Vec2 } from "./model/types.js";
import { StructuralSolverSession } from "./solver/session.js";

const required = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element #${id}`);
  return found as T;
};

const canvas = required<HTMLCanvasElement>("structure-canvas");
const context = canvas.getContext("2d");
if (!context) throw new Error("2D canvas is unavailable");

const fixtureSelect = required<HTMLSelectElement>("fixture-select");
const buildModeButton = required<HTMLButtonElement>("build-mode");
const testModeButton = required<HTMLButtonElement>("test-mode");
const startTestButton = required<HTMLButtonElement>("start-test");
const resetButton = required<HTMLButtonElement>("reset");
const modeBadge = required<HTMLDivElement>("mode-badge");
const fixtureTitle = required<HTMLHeadingElement>("fixture-title");
const fixtureDescription = required<HTMLParagraphElement>("fixture-description");
const metrics = required<HTMLDListElement>("metrics");
const memberTable = required<HTMLDivElement>("member-table");
const outcomePanel = required<HTMLDivElement>("outcome-panel");
const failureSequence = required<HTMLDivElement>("failure-sequence");
const progressOutput = required<HTMLElement>("progress-output");
const progressBar = required<HTMLElement>("progress-bar");
const exportResult = required<HTMLButtonElement>("export-result");

const massInput = required<HTMLInputElement>("mass-input");
const massOutput = required<HTMLOutputElement>("mass-output");
const speedInput = required<HTMLInputElement>("speed-input");
const speedOutput = required<HTMLOutputElement>("speed-output");
const manualInput = required<HTMLInputElement>("manual-input");
const manualOutput = required<HTMLOutputElement>("manual-output");
const autoLoad = required<HTMLInputElement>("auto-load");
const thresholdInput = required<HTMLInputElement>("threshold-input");
const thresholdOutput = required<HTMLOutputElement>("threshold-output");
const difficultyInput = required<HTMLInputElement>("difficulty-input");
const difficultyOutput = required<HTMLOutputElement>("difficulty-output");
const analysisSelect = required<HTMLSelectElement>("analysis-select");
const showIds = required<HTMLInputElement>("show-ids");
const showUtilisation = required<HTMLInputElement>("show-utilisation");
const showPaths = required<HTMLInputElement>("show-paths");
const memberSelect = required<HTMLSelectElement>("member-select");
const supportSelect = required<HTMLSelectElement>("support-select");
const removeMember = required<HTMLButtonElement>("remove-member");
const removeSupport = required<HTMLButtonElement>("remove-support");

for (const definition of FIXTURES) fixtureSelect.add(new Option(definition.label, definition.id));
fixtureSelect.value = "t-structure";

let fixture: FixtureDefinition = getFixture(fixtureSelect.value);
let session = new StructuralSolverSession(fixture.graph, fixture.route);
let mode: SolverMode = "BUILD";
let progress = 0.5;
let running = false;
let lastFrame = performance.now();
let tuning: SolverTuning = { ...DEFAULT_TUNING };
let snapshot: SolveSnapshot = session.update(progress, Number(massInput.value), tuning, true).snapshot;

const number = (value: number, digits = 2): string => Number.isFinite(value) ? value.toFixed(digits) : "∞";

const currentMass = (): number => Number(massInput.value);

const refreshTuning = (): void => {
  tuning = {
    ...tuning,
    failureThreshold: Number(thresholdInput.value) / 100,
    difficultyMultiplier: Number(difficultyInput.value) / 100,
    analysisMode: analysisSelect.value as AnalysisMode,
  };
  massOutput.value = `${massInput.value} t`;
  speedOutput.value = `${speedInput.value}% / s`;
  thresholdOutput.value = number(tuning.failureThreshold, 2);
  difficultyOutput.value = `${number(tuning.difficultyMultiplier, 2)}×`;
  manualOutput.value = `${Math.round(progress * 100)}%`;
};

const refreshBuildEditOptions = (): void => {
  memberSelect.replaceChildren(...snapshot.graph.members.map((member) => new Option(`M-${member.id} · ${member.type}${member.connected ? "" : " · removed"}`, String(member.id))));
  const supports = snapshot.graph.nodes.filter((node) => node.supportType !== "none");
  supportSelect.replaceChildren(...supports.map((node) => new Option(`N-${node.id} · ${node.supportType}`, String(node.id))));
  const disabled = mode !== "BUILD";
  memberSelect.disabled = disabled;
  supportSelect.disabled = disabled || supports.length === 0;
  removeMember.disabled = disabled;
  removeSupport.disabled = disabled || supports.length === 0;
};

const updateModeDisplay = (): void => {
  buildModeButton.classList.toggle("active", mode === "BUILD");
  testModeButton.classList.toggle("active", mode === "TEST");
  modeBadge.classList.toggle("test", mode === "TEST");
  modeBadge.innerHTML = mode === "BUILD" ? "<span></span> BUILD · IMMUNE" : "<span></span> TEST · FAILURE ACTIVE";
};

const updateDiagnostics = (): void => {
  metrics.innerHTML = [
    ["Nodes", snapshot.metrics.nodeCount],
    ["Members", snapshot.metrics.memberCount],
    ["Maximum utilisation", number(snapshot.maximumUtilisation, 3)],
    ["Solve time", `${number(snapshot.metrics.solveTimeMs, 3)} ms`],
    ["Load-region updates", snapshot.metrics.loadRegionUpdates],
    ["Cascade iterations", snapshot.metrics.cascadeIterations],
  ].map(([label, value], index) => `<div><dt>${label}</dt><dd${index === 2 ? ' class="accent"' : ""}>${value}</dd></div>`).join("");

  const sorted = [...snapshot.memberDiagnostics].sort((a, b) => b.utilisation - a.utilisation || a.memberId - b.memberId);
  memberTable.innerHTML = `<div class="table-head"><span>Member</span><span>Demand / capacity</span><span>Util.</span></div>${sorted.map((diagnostic) => {
    const className = diagnostic.state === "failed" ? "failed-text" : diagnostic.state === "critical" ? "critical-text" : diagnostic.state === "stressed" ? "stressed-text" : "";
    return `<div><span>M-${diagnostic.memberId} · ${diagnostic.type}</span><span>${number(diagnostic.demand, 1)} / ${number(diagnostic.effectiveCapacity, 1)}</span><strong class="${className}">${number(diagnostic.utilisation, 3)}</strong></div>`;
  }).join("")}`;

  const result = snapshot.testResult;
  outcomePanel.className = `outcome-panel outcome-${result.outcome.toLowerCase()}`;
  outcomePanel.innerHTML = `<span>Current outcome</span><strong>${mode === "BUILD" ? "WARNINGS ONLY" : result.outcome}</strong>`;
  failureSequence.innerHTML = `<span>Failure order</span><strong>${snapshot.failureSequence.length > 0 ? snapshot.failureSequence.map((event) => `M-${event.memberId}`).join(" → ") : "None"}</strong>`;
  exportResult.disabled = mode !== "TEST";
  progressOutput.textContent = `${Math.round(progress * 100)}%`;
  progressBar.style.width = `${progress * 100}%`;
  manualInput.value = String(Math.round(progress * 1000));
  manualOutput.value = `${Math.round(progress * 100)}%`;
};

const memberColour = (diagnostic: MemberDiagnostic): string => {
  if (diagnostic.state === "failed") return "#cf493e";
  if (diagnostic.state === "disconnected") return "#9ba8a2";
  if (diagnostic.state === "critical") return "#d85a3d";
  if (diagnostic.state === "stressed") return "#c47a10";
  return "#0c9b68";
};

const routePoint = (progressValue: number, nodes: ReadonlyMap<number, StructuralNode>): Vec2 => {
  const routeNodes = fixture.route.nodeIds.map((id) => nodes.get(id)).filter((node) => node !== undefined);
  if (routeNodes.length === 0) return { x: 0, y: 0 };
  const cumulative: number[] = [];
  let total = 0;
  for (let index = 1; index < routeNodes.length; index += 1) {
    const a = routeNodes[index - 1]; const b = routeNodes[index];
    if (!a || !b) continue;
    total += Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
    cumulative.push(total);
  }
  const target = progressValue * total;
  let segment = cumulative.findIndex((value) => target <= value);
  if (segment < 0) segment = Math.max(0, cumulative.length - 1);
  const previous = segment === 0 ? 0 : (cumulative[segment - 1] ?? 0);
  const length = Math.max(1e-9, (cumulative[segment] ?? total) - previous);
  const local = Math.min(1, Math.max(0, (target - previous) / length));
  const a = routeNodes[segment] ?? routeNodes[0]; const b = routeNodes[segment + 1] ?? a;
  return { x: (a?.position.x ?? 0) + ((b?.position.x ?? 0) - (a?.position.x ?? 0)) * local, y: (a?.position.y ?? 0) + ((b?.position.y ?? 0) - (a?.position.y ?? 0)) * local };
};

const draw = (): void => {
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const nodes = new Map(snapshot.graph.nodes.map((node) => [node.id, node] as const));
  const xs = snapshot.graph.nodes.map((node) => node.position.x); const ys = snapshot.graph.nodes.map((node) => node.position.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const padding = 58; const availableWidth = Math.max(1, bounds.width - padding * 2); const availableHeight = Math.max(1, bounds.height - padding * 2);
  const scale = Math.min(availableWidth / Math.max(1, maxX - minX), availableHeight / Math.max(1, maxY - minY));
  const drawingWidth = (maxX - minX) * scale; const drawingHeight = (maxY - minY) * scale;
  const offsetX = (bounds.width - drawingWidth) / 2; const offsetY = (bounds.height - drawingHeight) / 2;
  const project = (position: Vec2): Vec2 => ({ x: offsetX + (position.x - minX) * scale, y: bounds.height - offsetY - (position.y - minY) * scale });
  const diagnosticMap = new Map(snapshot.memberDiagnostics.map((item) => [item.memberId, item] as const));

  if (showPaths.checked) {
    const loadNodeId = Number(Object.entries(snapshot.nodalLoads).sort((a, b) => b[1] - a[1])[0]?.[0]);
    const supportPath = snapshot.supportPaths.find((path) => path.nodeId === loadNodeId);
    context.save(); context.globalAlpha = 0.22; context.strokeStyle = "#347fba"; context.lineWidth = 18; context.setLineDash([7, 6]);
    for (const memberId of supportPath?.memberIds ?? []) {
      const member = snapshot.graph.members.find((item) => item.id === memberId); const a = member ? nodes.get(member.nodeA) : undefined; const b = member ? nodes.get(member.nodeB) : undefined;
      if (!a || !b) continue; const pa = project(a.position); const pb = project(b.position); context.beginPath(); context.moveTo(pa.x, pa.y); context.lineTo(pb.x, pb.y); context.stroke();
    }
    context.restore();
  }

  for (const member of snapshot.graph.members) {
    const a = nodes.get(member.nodeA); const b = nodes.get(member.nodeB); const diagnostic = diagnosticMap.get(member.id);
    if (!a || !b || !diagnostic) continue;
    const pa = project(a.position); const pb = project(b.position);
    context.save(); context.lineCap = "round"; context.lineWidth = member.type === "pier" ? 12 : member.type === "deck" || member.type === "beam" ? 9 : 5;
    context.strokeStyle = memberColour(diagnostic); context.setLineDash(diagnostic.state === "failed" ? [10, 8] : diagnostic.state === "disconnected" ? [3, 8] : []);
    context.beginPath(); context.moveTo(pa.x, pa.y); context.lineTo(pb.x, pb.y); context.stroke();
    if (diagnostic.state === "failed") { const mx = (pa.x + pb.x) / 2; const my = (pa.y + pb.y) / 2; context.lineWidth = 3; context.setLineDash([]); context.beginPath(); context.moveTo(mx - 9, my - 9); context.lineTo(mx + 9, my + 9); context.moveTo(mx + 9, my - 9); context.lineTo(mx - 9, my + 9); context.stroke(); }
    if (showUtilisation.checked) { context.font = "700 11px ui-monospace, monospace"; context.textAlign = "center"; context.fillStyle = "#24352f"; context.fillText(`u ${number(diagnostic.utilisation, 2)}`, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - 10); }
    if (showIds.checked) { context.font = "700 10px ui-monospace, monospace"; context.textAlign = "center"; context.fillStyle = "#61736b"; context.fillText(`M-${member.id}`, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + 18); }
    context.restore();
  }

  for (const node of snapshot.graph.nodes) {
    const point = project(node.position); context.save(); context.fillStyle = "#ffffff"; context.strokeStyle = node.supportType === "none" ? "#30493f" : "#087b55"; context.lineWidth = 3;
    context.beginPath(); context.arc(point.x, point.y, 6, 0, Math.PI * 2); context.fill(); context.stroke();
    if (node.supportType !== "none") { context.fillStyle = "#087b55"; context.beginPath(); context.moveTo(point.x, point.y + 7); context.lineTo(point.x - 13, point.y + 24); context.lineTo(point.x + 13, point.y + 24); context.closePath(); context.fill(); context.fillRect(point.x - 18, point.y + 26, 36, 3); }
    if (showIds.checked) { context.fillStyle = "#253b32"; context.font = "700 10px ui-monospace, monospace"; context.textAlign = "left"; context.fillText(`N-${node.id}`, point.x + 9, point.y - 8); }
    context.restore();
  }

  const train = project(routePoint(progress, nodes));
  context.save(); context.translate(train.x, train.y - 24); context.fillStyle = "#14211d"; context.fillRect(-25, -14, 50, 22); context.fillStyle = "#e4b442"; context.fillRect(-15, -9, 11, 8); context.fillRect(2, -9, 11, 8); context.fillStyle = "#cf493e"; context.fillRect(18, -20, 5, 9); context.fillStyle = "#14211d"; context.beginPath(); context.arc(-14, 11, 6, 0, Math.PI * 2); context.arc(14, 11, 6, 0, Math.PI * 2); context.fill(); context.restore();
};

const updateSolver = (force = false): boolean => {
  refreshTuning();
  const update = session.update(progress, currentMass(), tuning, force);
  snapshot = update.snapshot;
  if (update.recalculated) { updateDiagnostics(); refreshBuildEditOptions(); }
  draw();
  return update.recalculated;
};

const selectMode = (next: SolverMode): void => {
  running = false; mode = next; session.setMode(next); updateModeDisplay(); updateSolver(true);
};

fixtureSelect.addEventListener("change", () => {
  fixture = getFixture(fixtureSelect.value); session = new StructuralSolverSession(fixture.graph, fixture.route); mode = "BUILD"; progress = 0.5; running = false;
  fixtureTitle.textContent = fixture.label; fixtureDescription.textContent = fixture.description; updateModeDisplay(); updateSolver(true);
});
buildModeButton.addEventListener("click", () => selectMode("BUILD"));
testModeButton.addEventListener("click", () => selectMode("TEST"));
startTestButton.addEventListener("click", () => {
  if (mode === "TEST") session.setMode("BUILD");
  mode = "TEST"; session.setMode("TEST"); progress = 0; running = autoLoad.checked; lastFrame = performance.now(); updateModeDisplay(); updateSolver(true);
});
resetButton.addEventListener("click", () => { session = new StructuralSolverSession(fixture.graph, fixture.route); mode = "BUILD"; progress = 0.5; running = false; updateModeDisplay(); updateSolver(true); });

for (const control of [massInput, thresholdInput, difficultyInput, analysisSelect]) control.addEventListener("input", () => updateSolver(true));
speedInput.addEventListener("input", refreshTuning);
manualInput.addEventListener("input", () => { running = false; progress = Number(manualInput.value) / 1000; updateSolver(false); updateDiagnostics(); });
for (const control of [showIds, showUtilisation, showPaths]) control.addEventListener("change", draw);
removeMember.addEventListener("click", () => { if (session.removeMember(Number(memberSelect.value))) updateSolver(true); });
removeSupport.addEventListener("click", () => { if (session.removeSupport(Number(supportSelect.value))) updateSolver(true); });
exportResult.addEventListener("click", () => {
  const blob = new Blob([`${JSON.stringify(snapshot.testResult, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "TestResult.json"; link.click(); URL.revokeObjectURL(url);
});
window.addEventListener("resize", draw);

const animate = (time: number): void => {
  const deltaSeconds = Math.min(0.1, (time - lastFrame) / 1000); lastFrame = time;
  if (running && autoLoad.checked) {
    progress = Math.min(1, progress + Number(speedInput.value) / 100 * deltaSeconds);
    const recalculated = updateSolver(false);
    updateDiagnostics();
    if (mode === "TEST" && recalculated && (snapshot.failureSequence.length > 0 || !snapshot.routeConnected)) running = false;
    if (progress >= 1) { updateSolver(true); updateDiagnostics(); running = false; }
  }
  requestAnimationFrame(animate);
};

fixtureTitle.textContent = fixture.label;
fixtureDescription.textContent = fixture.description;
refreshTuning(); updateModeDisplay(); updateDiagnostics(); refreshBuildEditOptions(); draw();
requestAnimationFrame(animate);
