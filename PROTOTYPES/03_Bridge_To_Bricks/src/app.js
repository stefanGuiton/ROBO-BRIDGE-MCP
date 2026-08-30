import { compileBridgeGraph } from "./compiler.js";
import { DEFAULT_SETTINGS } from "./catalogue.js";
import { cloneFixture } from "./fixtures.js";
import { BridgeRenderer } from "./renderer.js";

const elements = Object.fromEntries([
  "fixture", "graph-file", "side-offset", "deck-width", "clear-width", "beam-lengths", "include-1x1",
  "compile", "reset-settings", "compile-state", "checksum", "metric-time", "metric-placements", "metric-cells",
  "metric-draws", "metric-fps", "metric-edges", "validation-list", "revision", "catalogue-size", "member-count",
  "view-tabs", "view-kicker", "view-title", "view-badge", "family-badge", "error-banner",
].map((id) => [id, document.getElementById(id)]));

let sourceGraph = cloneFixture("warren");
let result;
let activeView = "bricks";
const renderer = new BridgeRenderer(document.getElementById("bridge-canvas"), ({ fps, drawCalls }) => {
  elements["metric-fps"].textContent = fps;
  elements["metric-draws"].textContent = drawCalls;
});

function settingsFromForm() {
  const lengths = elements["beam-lengths"].value.split(",").map((value) => Number(value.trim())).filter(Number.isInteger);
  return {
    sideOffsetStuds: Number(elements["side-offset"].value),
    deckWidthStuds: Number(elements["deck-width"].value),
    clearanceWidthStuds: Number(elements["clear-width"].value),
    include1x1: elements["include-1x1"].checked,
    allowedBeamLengths: lengths,
  };
}

function setOutput(id, value) {
  document.getElementById(`${id}-output`).textContent = value;
}

function validationRow(label, pass) {
  return `<li class="${pass ? "" : "fail"}">${label}</li>`;
}

function updateResults() {
  const diagnostics = result.diagnostics;
  elements.checksum.textContent = diagnostics.checksum;
  elements["compile-state"].classList.toggle("invalid", !diagnostics.valid);
  elements["compile-state"].querySelector("span").textContent = diagnostics.valid ? "Plan valid" : "Plan invalid";
  elements["metric-time"].textContent = diagnostics.compilationTimeMs.toFixed(1);
  elements["metric-placements"].textContent = diagnostics.placementCount.toLocaleString();
  elements["metric-cells"].textContent = diagnostics.occupancyCellCount.toLocaleString();
  elements["metric-edges"].textContent = diagnostics.dependencyEdgeCount.toLocaleString();
  elements.revision.textContent = String(result.graph.metadata.designRevision).padStart(3, "0");
  elements["catalogue-size"].textContent = result.catalogue.length;
  elements["member-count"].textContent = diagnostics.memberCount;
  elements["family-badge"].textContent = String(result.graph.metadata.family).toUpperCase();
  const legalParts = new Set(result.catalogue.map((part) => part.partType));
  elements["validation-list"].innerHTML = [
    validationRow("Deterministic checksum emitted", Boolean(diagnostics.checksum)),
    validationRow("Zero clearance violations", !diagnostics.codes.includes("CLEARANCE_VIOLATION")),
    validationRow("Catalogue-only placements", result.buildPlan.placements.every((placement) => legalParts.has(placement.partType))),
    validationRow("Dependency graph is acyclic", !result.dependencyGraph.hasCycle),
    validationRow("All placements map to members", result.buildPlan.placements.every((placement) => placement.structuralMemberId !== undefined)),
  ].join("");
  renderView();
}

function compile() {
  try {
    elements["error-banner"].hidden = true;
    result = compileBridgeGraph(sourceGraph, settingsFromForm());
    updateResults();
  } catch (error) {
    elements["error-banner"].hidden = false;
    elements["error-banner"].textContent = `Compiler stopped safely: ${error.message}`;
    elements["compile-state"].classList.add("invalid");
    elements["compile-state"].querySelector("span").textContent = "Compile error";
  }
}

function renderView() {
  if (!result) return;
  const [kicker, title] = renderer.render(result, activeView);
  elements["view-kicker"].textContent = kicker;
  elements["view-title"].textContent = title;
  elements["view-badge"].textContent = activeView.toUpperCase().replace("DEPENDENCIES", "BUILD ORDER");
  for (const button of elements["view-tabs"].querySelectorAll("button")) button.classList.toggle("active", button.dataset.view === activeView);
}

function download(name, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

elements.fixture.addEventListener("change", () => {
  sourceGraph = cloneFixture(elements.fixture.value);
  compile();
});
elements["graph-file"].addEventListener("change", async () => {
  const [file] = elements["graph-file"].files;
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error("BridgeGraph2D import exceeds 2 MB");
    sourceGraph = JSON.parse(await file.text());
    elements.fixture.value = "";
    compile();
  } catch (error) {
    elements["error-banner"].hidden = false;
    elements["error-banner"].textContent = `Import rejected: ${error.message}`;
  } finally {
    elements["graph-file"].value = "";
  }
});
for (const id of ["side-offset", "deck-width", "clear-width"]) {
  elements[id].addEventListener("input", () => setOutput(id, elements[id].value));
}
elements.compile.addEventListener("click", compile);
elements["reset-settings"].addEventListener("click", () => {
  elements["side-offset"].value = DEFAULT_SETTINGS.sideOffsetStuds;
  elements["deck-width"].value = DEFAULT_SETTINGS.deckWidthStuds;
  elements["clear-width"].value = DEFAULT_SETTINGS.clearanceWidthStuds;
  elements["beam-lengths"].value = DEFAULT_SETTINGS.allowedBeamLengths.join(", ");
  elements["include-1x1"].checked = DEFAULT_SETTINGS.include1x1;
  for (const id of ["side-offset", "deck-width", "clear-width"]) setOutput(id, elements[id].value);
  compile();
});
elements["view-tabs"].addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  activeView = button.dataset.view;
  renderView();
});
for (const button of document.querySelectorAll("[data-export]")) {
  button.addEventListener("click", () => {
    const key = button.dataset.export;
    const names = { buildPlan: "candidate-BuildPlan.json", memberToPlacements: "member-to-placement-map.json", dependencyGraph: "dependency-graph.json", diagnostics: "compiler-diagnostics.json" };
    download(names[key], result[key]);
  });
}

compile();
