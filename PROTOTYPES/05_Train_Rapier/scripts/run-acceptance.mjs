import { performance } from "node:perf_hooks";
import { TrainSimulation } from "../src/core/train-simulation.js";

const results = [];
for (const mode of ["hybrid", "dynamic"]) {
  for (const fixtureId of ["A", "B", "C", "D", "E"]) {
    const simulation = await new TrainSimulation({ fixtureId, config: { mode } }).initialize();
    const stepTimes = [];
    let firstDerailBody = null;
    simulation.onDerail(({ bodyIndex }) => { firstDerailBody ??= bodyIndex; });
    simulation.startTest();
    while (simulation.running && simulation.elapsed < 30) {
      const started = performance.now();
      simulation.step();
      stepTimes.push(performance.now() - started);
    }
    stepTimes.sort((a, b) => a - b);
    const average = stepTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, stepTimes.length);
    const p95 = stepTimes[Math.floor(stepTimes.length * 0.95)] ?? 0;
    results.push({
      mode,
      fixtureId,
      outcome: simulation.outcome,
      elapsedSeconds: Number(simulation.elapsed.toFixed(3)),
      steps: simulation.stepCount,
      averageStepMs: Number(average.toFixed(4)),
      p95StepMs: Number(p95.toFixed(4)),
      firstDerailBody,
      performance: simulation.getPerformanceStats(),
      counts: simulation.getCounts(),
    });
  }
}

const scaleProbes = [];
for (const carriageCount of [2, 6]) {
  const simulation = await new TrainSimulation({ fixtureId: "A", config: { mode: "hybrid", carriageCount } }).initialize();
  const stepTimes = [];
  simulation.startTest();
  while (simulation.running && simulation.elapsed < 30) {
    const started = performance.now();
    simulation.step();
    stepTimes.push(performance.now() - started);
  }
  stepTimes.sort((a, b) => a - b);
  scaleProbes.push({
    carriageCount,
    trainBodies: carriageCount + 1,
    outcome: simulation.outcome,
    averageStepMs: Number((stepTimes.reduce((sum, value) => sum + value, 0) / stepTimes.length).toFixed(4)),
    p95StepMs: Number((stepTimes[Math.floor(stepTimes.length * 0.95)] ?? 0).toFixed(4)),
    performance: simulation.getPerformanceStats(),
  });
}

const resetProbe = await new TrainSimulation({ fixtureId: "A" }).initialize();
const originalTransforms = JSON.stringify(resetProbe.initialTransforms);
const originalCounts = resetProbe.getCounts();
let resetStable = true;
for (let cycle = 0; cycle < 20; cycle += 1) {
  resetProbe.startTest();
  resetProbe.runForSeconds(0.5);
  resetProbe.resetTrain();
  resetStable &&= JSON.stringify(resetProbe.getBodyTransforms()) === originalTransforms;
  resetStable &&= JSON.stringify(resetProbe.getCounts()) === JSON.stringify(originalCounts);
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  fixedStepSeconds: 1 / 60,
  fixtures: results,
  scaleProbes,
  repeatedReset: { cycles: 20, stable: resetStable, counts: originalCounts },
}, null, 2));
