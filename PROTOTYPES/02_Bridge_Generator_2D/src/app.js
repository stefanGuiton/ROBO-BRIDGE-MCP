import { CHALLENGE_FIXTURES, RAVINE, specForChallenge } from "./engine/fixtures.js";
import { generateBridgeGraph2D } from "./engine/generator.js";
import { stableStringify } from "./engine/stable-json.js";
import { validateChallengeState } from "./engine/validation.js";

const FAMILY_LABELS = {
  beam: "Beam", trestle: "Trestle / pier", warren: "Warren truss", pratt: "Pratt truss", howe: "Howe truss",
  arch: "Arch", aqueduct: "Aqueduct", box: "Box bridge", suspension: "Suspension",
};

const appState = {
  challenge: RAVINE,
  fixtureKey: "ravine",
  spec: specForChallenge(RAVINE),
  debug: false,
  generationCount: 0,
  importError: "",
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const round = (value) => Math.round(value * 100) / 100;

function generation() {
  appState.generationCount += 1;
  return generateBridgeGraph2D(appState.challenge, appState.spec);
}

function numberField(key, label, min, max, step = 1, suffix = "") {
  return `<label class="field"><span>${label}</span><div><input name="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${appState.spec[key]}" /><small>${suffix}</small></div></label>`;
}

function selectField(key, label, options) {
  return `<label class="field"><span>${label}</span><select name="${key}">${options.map(([value, text]) => `<option value="${value}" ${appState.spec[key] === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
}

function familyFields() {
  const family = appState.spec.family;
  const fields = [];
  if (["warren", "pratt", "howe", "box"].includes(family)) {
    fields.push(numberField("panelCount", "Panels", 2, 24));
    fields.push(numberField("trussHeight", "Truss height", 4, 40, 1, "m"));
  }
  if (["beam", "trestle"].includes(family)) {
    fields.push(numberField("panelCount", "Deck panels", 2, 24));
    fields.push(numberField("pierCount", "Piers", 0, 12));
    fields.push(numberField("pierSpacing", "Pier spacing", 4, 40, 1, "m"));
  }
  if (["arch", "aqueduct"].includes(family)) {
    if (family === "arch") fields.push(numberField("panelCount", "Arch segments", 4, 24));
    if (family === "aqueduct") fields.push(numberField("archCount", "Arch count", 1, 12));
    fields.push(selectField("archShape", "Arch shape", [["parabolic", "Parabolic"], ["circular", "Circular"]]));
    fields.push(numberField("archRise", "Arch rise", 4, 42, 1, "m"));
  }
  if (family === "suspension") {
    fields.push(numberField("panelCount", "Deck panels", 4, 24));
    fields.push(numberField("towerHeight", "Tower height", 8, 50, 1, "m"));
    fields.push(numberField("cableSag", "Cable sag", 2, 30, 1, "m"));
    fields.push(numberField("hangerSpacing", "Hanger spacing", 2, 24, 1, "m"));
  }
  return fields.join("");
}

function fitGraph(graph) {
  const width = 940;
  const height = 540;
  const points = [...appState.challenge.terrain.profile, ...(graph?.nodes ?? []), ...(graph?.cables ?? []).flatMap((cable) => cable.samples)];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  const minY = Math.min(...ys) - 5;
  const maxY = Math.max(...ys) + 7;
  const pad = 42;
  const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
  const usedWidth = (maxX - minX) * scale;
  const usedHeight = (maxY - minY) * scale;
  const left = (width - usedWidth) / 2;
  const top = (height - usedHeight) / 2;
  return { width, height, x: (value) => round(left + (value - minX) * scale), y: (value) => round(top + (maxY - value) * scale) };
}

function renderTerrain(transform) {
  const points = appState.challenge.terrain.profile;
  const path = points.map((point, index) => `${index ? "L" : "M"}${transform.x(point.x)},${transform.y(point.y)}`).join(" ");
  return `<path class="terrain-fill" d="${path} L${transform.x(points.at(-1).x)},${transform.height} L${transform.x(points[0].x)},${transform.height} Z" /><path class="terrain-line" d="${path}" />`;
}

function renderGraphSvg(graph) {
  const transform = fitGraph(graph);
  const nodesById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const deckY = appState.spec.deckHeight;
  const startX = appState.challenge.entry.position.x;
  const endX = appState.challenge.exit.position.x;
  const members = (graph?.members ?? []).map((member) => {
    const a = nodesById.get(member.nodeA);
    const b = nodesById.get(member.nodeB);
    const sideClass = member.side === "far" ? " far" : "";
    return `<line class="member role-${member.role}${sideClass}" x1="${transform.x(a.x)}" y1="${transform.y(a.y)}" x2="${transform.x(b.x)}" y2="${transform.y(b.y)}"><title>${member.id} · ${member.memberClass}</title></line>`;
  }).join("");
  const cables = (graph?.cables ?? []).map((cable) => `<polyline class="cable cable-${cable.structuralRole}" points="${cable.samples.map((point) => `${transform.x(point.x)},${transform.y(point.y)}`).join(" ")}"><title>Cable ${cable.id} · ${cable.structuralRole}</title></polyline>`).join("");
  const nodes = (graph?.nodes ?? []).map((node) => {
    const support = node.supportType !== "none" ? `<path class="support" d="M${transform.x(node.x) - 7},${transform.y(node.y) + 12} L${transform.x(node.x) + 7},${transform.y(node.y) + 12} L${transform.x(node.x)},${transform.y(node.y) + 2} Z" />` : "";
    return `${support}<circle class="node role-${node.role}" cx="${transform.x(node.x)}" cy="${transform.y(node.y)}" r="3.7"><title>Node ${node.id} · ${node.role}</title></circle>${appState.debug ? `<text class="debug-id" x="${transform.x(node.x) + 6}" y="${transform.y(node.y) - 6}">N${node.id}</text>` : ""}`;
  }).join("");
  const memberIds = appState.debug ? (graph?.members ?? []).map((member) => {
    const a = nodesById.get(member.nodeA);
    const b = nodesById.get(member.nodeB);
    return `<text class="debug-id member-id" x="${transform.x((a.x + b.x) / 2)}" y="${transform.y((a.y + b.y) / 2) - 5}">M${member.id}</text>`;
  }).join("") : "";
  const clearanceTop = transform.y(deckY + appState.spec.vehicleClearance);
  const clearanceBottom = transform.y(deckY);
  return `<svg class="bridge-view" viewBox="0 0 ${transform.width} ${transform.height}" role="img" aria-label="${FAMILY_LABELS[appState.spec.family]} bridge elevation">
    <defs><pattern id="small-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" /></pattern></defs>
    <rect class="plot-bg" width="${transform.width}" height="${transform.height}" /><rect class="plot-grid" width="${transform.width}" height="${transform.height}" />
    ${renderTerrain(transform)}
    <rect class="clearance" x="${transform.x(startX)}" y="${clearanceTop}" width="${transform.x(endX) - transform.x(startX)}" height="${clearanceBottom - clearanceTop}" />
    <line class="deck-datum" x1="${transform.x(startX)}" y1="${transform.y(deckY)}" x2="${transform.x(endX)}" y2="${transform.y(deckY)}" />
    <text class="clearance-label" x="${transform.x((startX + endX) / 2)}" y="${clearanceTop + 14}" text-anchor="middle">VEHICLE CLEARANCE</text>
    ${members}${cables}${nodes}${memberIds}
    <g class="route-label"><circle cx="${transform.x(startX)}" cy="${transform.y(deckY)}" r="6"/><text x="${transform.x(startX) + 10}" y="${transform.y(deckY) - 12}">ENTRY</text></g>
    <g class="route-label"><circle cx="${transform.x(endX)}" cy="${transform.y(deckY)}" r="6"/><text x="${transform.x(endX) - 10}" y="${transform.y(deckY) - 12}" text-anchor="end">EXIT</text></g>
  </svg>`;
}

function renderValidation(result) {
  const errors = [...(result.validation?.errors ?? [])];
  if (appState.importError) errors.unshift({ code: "INVALID_PARAMETER_RANGE", message: appState.importError });
  if (!errors.length) return `<div class="validation valid"><strong>Valid graph</strong><span>No validation errors</span></div>`;
  return `<div class="validation invalid"><strong>${errors.length} validation ${errors.length === 1 ? "error" : "errors"}</strong>${errors.map((entry) => `<p><code>${escapeHtml(entry.code)}</code>${escapeHtml(entry.message)}</p>`).join("")}</div>`;
}

function render() {
  const result = generation();
  const graph = result.graph;
  const familyOptions = Object.entries(FAMILY_LABELS).map(([value, text]) => `<option value="${value}" ${appState.spec.family === value ? "selected" : ""}>${text}</option>`).join("");
  document.querySelector("#app").innerHTML = `
    <header class="topbar"><div><p>ROBO BRIDGE MCP V3</p><h1>2D bridge generator</h1></div><div class="header-actions">
      <button type="button" data-action="import">Import challenge</button><button type="button" data-export="spec">Export spec</button>
      <button type="button" data-export="graph" ${graph ? "" : "disabled"}>Export graph</button><button type="button" data-export="report">Validation report</button>
    </div></header>
    <input id="challenge-file" type="file" accept="application/json,.json" hidden />
    <main class="workbench"><aside class="controls">
      <div class="control-group">
        <label class="field"><span>Challenge</span><select id="fixture-select"><option value="ravine" ${appState.fixtureKey === "ravine" ? "selected" : ""}>Ravine</option><option value="flatGap" ${appState.fixtureKey === "flatGap" ? "selected" : ""}>Flat gap</option><option value="imported" ${appState.fixtureKey === "imported" ? "selected" : ""} ${appState.fixtureKey === "imported" ? "" : "hidden"}>Imported</option></select></label>
        <label class="field"><span>Bridge family</span><select name="family">${familyOptions}</select></label>
      </div>
      <div class="control-group"><h2>Dimensions</h2>${numberField("span", "Span", 10, 180, 1, "m")}${numberField("deckHeight", "Deck height", -10, 80, 1, "m")}${numberField("bridgeWidth", "Bridge width", 4, 30, 1, "m")}${numberField("vehicleClearance", "Vehicle clearance", 2, 20, 1, "m")}</div>
      <div class="control-group"><h2>${FAMILY_LABELS[appState.spec.family]} geometry</h2>${familyFields()}</div>
      <div class="control-group"><h2>Structure</h2>${numberField("structuralDensity", "Density", 0.2, 1, 0.05)}${numberField("targetLoadClass", "Capacity class", 1, 5)}
        <label class="check"><input name="symmetry" type="checkbox" ${appState.spec.symmetry ? "checked" : ""}/><span>Symmetry</span></label>
        <label class="check"><input name="crossBracing" type="checkbox" ${appState.spec.crossBracing ? "checked" : ""}/><span>Cross-bracing</span></label>
        <label class="check"><input id="debug-toggle" type="checkbox" ${appState.debug ? "checked" : ""}/><span>Show IDs</span></label>
      </div>
      <div class="boundary-note"><strong>Parameter boundary</strong><p>Codex edits this specification. Deterministic code owns every node and member coordinate.</p></div>
    </aside><section class="canvas-panel">
      <div class="canvas-heading"><div><span>${escapeHtml(appState.challenge.name || "Imported challenge")}</span><h2>${FAMILY_LABELS[appState.spec.family]}</h2></div><span class="revision">REV ${graph ? String(graph.metadata.designRevision).slice(-6) : "—"}</span></div>
      ${renderGraphSvg(graph)}
      <div class="graph-bar"><span><b>${graph?.nodes.length ?? 0}</b> nodes</span><span><b>${graph?.members.length ?? 0}</b> members</span><span><b>${graph?.cables.length ?? 0}</b> cables</span><span class="perf"><b>${result.generationTimeMs.toFixed(2)} ms</b> generation · state change ${appState.generationCount}</span></div>
      ${renderValidation(result)}
      <details><summary>Graph details</summary><pre>${escapeHtml(graph ? stableStringify(graph, 2) : stableStringify(result.validation, 2))}</pre></details>
    </section></main>`;
  bindEvents(result);
}

function bindEvents(result) {
  document.querySelectorAll("[name]").forEach((control) => control.addEventListener("change", () => {
    const key = control.name;
    appState.spec = { ...appState.spec, [key]: control.type === "checkbox" ? control.checked : control.type === "number" ? Number(control.value) : control.value };
    appState.importError = "";
    render();
  }));
  document.querySelector("#debug-toggle").addEventListener("change", (event) => { appState.debug = event.target.checked; render(); });
  document.querySelector("#fixture-select").addEventListener("change", (event) => {
    const challenge = CHALLENGE_FIXTURES[event.target.value];
    if (!challenge) return;
    appState.fixtureKey = event.target.value;
    appState.challenge = challenge;
    appState.spec = specForChallenge(challenge, appState.spec.family);
    appState.importError = "";
    render();
  });
  document.querySelector("[data-action=import]").addEventListener("click", () => document.querySelector("#challenge-file").click());
  document.querySelector("#challenge-file").addEventListener("change", importChallenge);
  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportArtifact(button.dataset.export, result)));
}

async function importChallenge(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const candidate = JSON.parse(await file.text());
    const validation = validateChallengeState(candidate);
    if (!validation.valid) throw new Error(validation.errors.map((entry) => `${entry.code}: ${entry.message}`).join(" "));
    appState.challenge = candidate;
    appState.fixtureKey = "imported";
    appState.spec = specForChallenge(candidate, appState.spec.family);
    appState.importError = "";
  } catch (error) {
    appState.importError = `Challenge import failed: ${error.message}`;
  }
  event.target.value = "";
  render();
}

function exportArtifact(kind, result) {
  const artifacts = {
    spec: { filename: "BridgeSpec.json", value: appState.spec },
    graph: { filename: "BridgeGraph2D.json", value: result.graph },
    report: { filename: "validation-report.json", value: { version: 1, valid: result.validation.valid, errors: result.validation.errors, warnings: result.validation.warnings, family: appState.spec.family, designRevision: result.graph?.metadata.designRevision ?? null, deterministicChecksum: result.graph?.metadata.deterministicChecksum ?? null, generationTimeMs: result.generationTimeMs } },
  };
  const artifact = artifacts[kind];
  if (!artifact?.value) return;
  const url = URL.createObjectURL(new Blob([stableStringify(artifact.value, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

render();
