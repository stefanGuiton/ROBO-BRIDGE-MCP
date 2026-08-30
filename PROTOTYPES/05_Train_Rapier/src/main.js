import { DEFAULT_CONFIG, FIXED_DT, TrainSimulation } from "./core/train-simulation.js";
import { FIXTURES } from "./core/fixtures.js";
import { TrainScene } from "./renderer.js";

const byId = (id) => document.getElementById(id);
const ui = {
  canvas: byId("scene"),
  fixture: byId("fixture-select"),
  mode: byId("mode-select"),
  test: byId("test-button"),
  reset: byId("reset-button"),
  status: byId("status-badge"),
  event: byId("event-label"),
  progress: byId("progress-label"),
  fixtureDescription: byId("fixture-description"),
  settings: byId("settings-panel"),
  settingsButton: byId("settings-button"),
  settingsClose: byId("settings-close"),
  support: byId("support-select"),
};

const simulation = await new TrainSimulation({ fixtureId: "A", config: DEFAULT_CONFIG }).initialize();
const scene = new TrainScene(ui.canvas, simulation);
let accumulator = 0;
let lastTime = performance.now();
let fpsSmoothing = 60;
let progressiveTimers = [];
let lastMetricsAt = 0;
const frameHistogram = new Uint32Array(400);
let frameWindowStartedAt = performance.now();
let frameWindowCount = 0;
let frameP95 = 0;

function setStatus(label, kind = "idle") {
  ui.status.textContent = label;
  ui.status.className = `status ${kind}`;
}

function resetPresentation() {
  progressiveTimers.forEach(clearTimeout);
  progressiveTimers = [];
  simulation.resetTrain();
  scene.rebuildTrain();
  scene.syncSupports();
  ui.test.textContent = "TEST";
  ui.event.textContent = "Waiting for TEST";
  setStatus("READY", "idle");
  refreshSupportSelect();
  updateMetrics();
}

function refreshSupportSelect() {
  const previous = Number(ui.support.value);
  ui.support.replaceChildren(...simulation.supportMap.segments.map((segment) => {
    const option = document.createElement("option");
    option.value = String(segment.id);
    option.textContent = `Segment ${segment.id} · ${segment.startS} to ${segment.endS} m · ${segment.supported ? "supported" : "removed"}`;
    return option;
  }));
  if (simulation.supportMap.segments.some((segment) => segment.id === previous)) ui.support.value = String(previous);
}

function setSupport(id, supported) {
  const changed = simulation.setRailSupport(id, supported);
  if (changed) {
    scene.syncSupports();
    refreshSupportSelect();
  }
  return changed;
}

Object.values(FIXTURES).forEach((fixture) => {
  const option = document.createElement("option");
  option.value = fixture.id;
  option.textContent = fixture.name;
  ui.fixture.append(option);
});
ui.fixture.value = simulation.fixtureId;
ui.mode.value = simulation.config.mode;
refreshSupportSelect();

const trainSettings = [
  ["locomotiveMass", "Locomotive mass", 2, 24, 1, "t"],
  ["carriageMass", "Carriage mass", 1, 16, 1, "t"],
  ["carriageCount", "Carriages", 0, 6, 1, ""],
  ["trainSpeed", "Train speed", 1, 10, 0.1, "m/s"],
  ["acceleration", "Acceleration", 1, 8, 0.1, "m/s²"],
  ["gravity", "Gravity", 0, 16, 0.1, "m/s²"],
];
const guideSettings = [
  ["guideStiffness", "Guide stiffness", 120, 1600, 10, "N/m"],
  ["guideDamping", "Guide damping", 20, 220, 2, "N·s/m"],
  ["couplerStiffness", "Coupler stiffness", 10, 140, 2, "N/m"],
  ["couplerDamping", "Coupler damping", 1, 30, 1, "N·s/m"],
  ["guideReleaseSeconds", "Release fade", 0.05, 0.6, 0.01, "s"],
];

function addRangeSettings(container, definitions) {
  for (const [key, label, min, max, step, unit] of definitions) {
    const wrapper = document.createElement("label");
    wrapper.className = "range-field";
    const heading = document.createElement("span");
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = `${simulation.config[key]} ${unit}`.trim();
    heading.append(name, value);
    const input = document.createElement("input");
    input.type = "range";
    Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(simulation.config[key]) });
    input.addEventListener("input", () => { value.textContent = `${input.value} ${unit}`.trim(); });
    input.addEventListener("change", () => {
      simulation.configure({ [key]: Number(input.value) });
      resetPresentation();
    });
    wrapper.append(heading, input);
    container.append(wrapper);
  }
}

addRangeSettings(byId("train-settings"), trainSettings);
addRangeSettings(byId("guide-settings"), guideSettings);
const releaseLabel = document.createElement("label");
releaseLabel.className = "full-field";
releaseLabel.textContent = "Guide release";
const releaseSelect = document.createElement("select");
releaseSelect.append(new Option("Short fade", "fade"), new Option("Instant", "instant"));
releaseSelect.value = simulation.config.guideReleaseMode;
releaseSelect.addEventListener("change", () => {
  simulation.configure({ guideReleaseMode: releaseSelect.value });
  resetPresentation();
});
releaseLabel.append(releaseSelect);
byId("guide-settings").append(releaseLabel);

ui.settingsButton.addEventListener("click", () => {
  ui.settings.hidden = false;
  ui.settingsButton.setAttribute("aria-expanded", "true");
});
ui.settingsClose.addEventListener("click", () => {
  ui.settings.hidden = true;
  ui.settingsButton.setAttribute("aria-expanded", "false");
});

ui.fixture.addEventListener("change", () => {
  simulation.setFixture(ui.fixture.value);
  scene.rebuildTrain();
  scene.syncSupports();
  refreshSupportSelect();
  ui.fixtureDescription.textContent = FIXTURES[ui.fixture.value].description;
  ui.event.textContent = "Waiting for TEST";
  setStatus("READY", "idle");
});
ui.mode.addEventListener("change", () => {
  simulation.configure({ mode: ui.mode.value });
  resetPresentation();
});

ui.test.addEventListener("click", () => {
  if (simulation.running) {
    simulation.stopTest();
    ui.test.textContent = "TEST";
    ui.event.textContent = "Test stopped";
    setStatus("STOPPED", "warning");
    return;
  }
  if (simulation.outcome) resetPresentation();
  simulation.startTest();
  ui.test.textContent = "STOP";
  ui.event.textContent = "Train moving";
  setStatus("RUNNING", "running");
});
ui.reset.addEventListener("click", resetPresentation);

byId("remove-one-button").addEventListener("click", () => setSupport(Number(ui.support.value), false));
byId("restore-button").addEventListener("click", () => {
  simulation.restoreAllSupport();
  scene.syncSupports();
  refreshSupportSelect();
});
byId("remove-centre-button").addEventListener("click", () => [6, 7].forEach((id) => setSupport(id, false)));
byId("progressive-button").addEventListener("click", () => {
  progressiveTimers.forEach(clearTimeout);
  progressiveTimers = [5, 6, 7].map((id, index) => setTimeout(() => setSupport(id, false), index * 650));
});
byId("random-button").addEventListener("click", () => {
  const bridgeSegments = simulation.supportMap.segments.filter((segment) => segment.id >= 4 && segment.id <= 9);
  const seed = (simulation.stepCount * 1103515245 + 12345) >>> 0;
  const segment = bridgeSegments[seed % bridgeSegments.length];
  setSupport(segment.id, false);
});

byId("side-view-button").addEventListener("click", () => scene.setSideView());
byId("follow-toggle").addEventListener("change", (event) => { scene.followTrain = event.target.checked; });
byId("support-debug-toggle").addEventListener("change", (event) => {
  scene.showSupportDebug = event.target.checked;
  scene.syncSupports();
});
byId("guide-debug-toggle").addEventListener("change", (event) => { scene.showGuideDebug = event.target.checked; });
byId("physics-debug-toggle").addEventListener("change", (event) => { scene.showPhysicsDebug = event.target.checked; });

simulation.onSupportChange(() => {
  scene.syncSupports();
  refreshSupportSelect();
});
simulation.onDerail(({ bodyIndex }) => {
  ui.event.textContent = `DERAILED · ${bodyIndex === 0 ? "locomotive" : `carriage ${bodyIndex}`}`;
  setStatus("DERAILED", "danger");
});
simulation.onFall(() => {
  ui.test.textContent = "TEST";
  ui.event.textContent = "TRAIN_FELL · gravity took over";
  setStatus("TRAIN FELL", "danger");
});
simulation.onComplete(() => {
  ui.test.textContent = "TEST";
  ui.event.textContent = "CROSSED · all cars cleared the bridge";
  setStatus("CROSSED", "success");
});

function updateMetrics() {
  const counts = simulation.getCounts();
  const performanceStats = simulation.getPerformanceStats();
  const renderStats = scene.getRenderStats();
  byId("metric-fps").textContent = fpsSmoothing.toFixed(0);
  byId("metric-frame-p95").textContent = `${frameP95.toFixed(2)} ms`;
  byId("metric-step").textContent = `${simulation.lastStepMs.toFixed(2)} ms`;
  byId("metric-draw-calls").textContent = String(renderStats.drawCalls);
  byId("metric-bodies").textContent = String(counts.activeRigidBodies);
  byId("metric-sleeping").textContent = String(counts.sleepingBodies);
  byId("metric-joints").textContent = String(counts.joints);
  byId("metric-train").textContent = String(counts.trainBodies);
  byId("metric-path").textContent = performanceStats.lastStepKind === "rapier" ? "RAPIER" : "ANALYTIC";
  byId("metric-rapier-ratio").textContent = `${(performanceStats.rapierStepRatio * 100).toFixed(0)}%`;
  ui.progress.textContent = `Progress ${(simulation.getTrainProgress().normalized * 100).toFixed(0)}% · ${simulation.elapsed.toFixed(1)} s`;
}

function frame(now) {
  const frameMilliseconds = Math.min(100, now - lastTime);
  const frameSeconds = frameMilliseconds / 1000;
  lastTime = now;
  frameHistogram[Math.min(frameHistogram.length - 1, Math.floor(frameMilliseconds * 4))] += 1;
  frameWindowCount += 1;
  if (now - frameWindowStartedAt >= 5000) {
    const target = Math.ceil(frameWindowCount * 0.95);
    let cumulative = 0;
    for (let bucket = 0; bucket < frameHistogram.length; bucket += 1) {
      cumulative += frameHistogram[bucket];
      if (cumulative >= target) {
        frameP95 = (bucket + 1) / 4;
        break;
      }
    }
    frameHistogram.fill(0);
    frameWindowCount = 0;
    frameWindowStartedAt = now;
  }
  fpsSmoothing = fpsSmoothing * 0.92 + (1 / Math.max(frameSeconds, 0.001)) * 0.08;
  if (simulation.running) {
    accumulator += frameSeconds;
    while (accumulator >= FIXED_DT) {
      simulation.step(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  } else accumulator = 0;
  const interpolationAlpha = simulation.running ? accumulator / FIXED_DT : 1;
  scene.sync(interpolationAlpha);
  scene.render();
  if (now - lastMetricsAt >= 100) {
    updateMetrics();
    lastMetricsAt = now;
  }
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => scene.resize());
window.roboBridgeTrain = Object.freeze({
  startTest: () => { simulation.startTest(); return simulation.getSnapshot(); },
  stopTest: () => simulation.stopTest(),
  resetTrain: () => { resetPresentation(); return simulation.getSnapshot(); },
  setRailSupport: setSupport,
  getTrainProgress: () => simulation.getTrainProgress(),
  getTrainLoads: () => simulation.getTrainLoads(),
  getLoadPositions: () => simulation.getLoadPositions(),
  onDerail: (listener) => simulation.onDerail(listener),
  onFall: (listener) => simulation.onFall(listener),
  onComplete: (listener) => simulation.onComplete(listener),
  getSnapshot: () => simulation.getSnapshot(),
});

ui.fixtureDescription.textContent = FIXTURES.A.description;
requestAnimationFrame(frame);
