const format = (value, digits = 1) => Number(value).toFixed(digits);

export function createUi({ robotController, sceneState, physicsClient, actions, rendererApi }) {
  const elements = {
    theta: document.querySelector('[data-readout="theta"]'),
    psi: document.querySelector('[data-readout="psi"]'),
    x: document.querySelector('[data-readout="x"]'),
    y: document.querySelector('[data-readout="y"]'),
    z: document.querySelector('[data-readout="z"]'),
    gripper: document.querySelector('[data-readout="gripper"]'),
    mode: document.querySelector('[data-readout="mode"]'),
    physics: document.querySelector('[data-readout="physics"]'),
    renderer: document.querySelector('[data-readout="renderer"]'),
    frame: document.querySelector('[data-readout="frame"]'),
    sceneList: document.querySelector('#sceneList'),
    log: document.querySelector('#operationLog'),
    webmcp: document.querySelector('#webmcpStatus'),
    planStatus: document.querySelector('#planStatus')
  };

  function addLog(message, kind = 'info') {
    const item = document.createElement('li');
    item.className = `log-${kind}`;
    item.textContent = `${new Date().toLocaleTimeString([], { hour12: false })}  ${message}`;
    elements.log.prepend(item);
    while (elements.log.children.length > 8) elements.log.lastElementChild.remove();
  }

  function renderRobot(state) {
    elements.theta.textContent = `${format(state.joints.thetaDeg)}°`;
    elements.psi.textContent = `${format(state.joints.psiDeg)}°`;
    elements.x.textContent = `${format(state.cartesian.xMm)} mm`;
    elements.y.textContent = `${format(state.cartesian.yMm)} mm`;
    elements.z.textContent = `${format(state.cartesian.zMm)} mm`;
    elements.gripper.textContent = `${Math.round(state.gripper.openFraction * 100)}% open`;
    elements.mode.textContent = state.mode.replaceAll('_', ' ');
  }

  function renderScene(state) {
    elements.sceneList.innerHTML = '';
    for (const object of state.objects) {
      const row = document.createElement('div');
      row.className = 'scene-row';
      row.innerHTML = `<span class="swatch" style="--swatch:${object.colour}"></span><span>${object.label}</span><code>${object.id}</code>`;
      elements.sceneList.append(row);
    }
  }

  robotController.subscribe((event, state) => {
    renderRobot(state);
    if (event.type === 'motion_rejected') addLog(`Move rejected: ${event.result.reason}`, 'error');
  });
  sceneState.subscribe((_event, state) => renderScene(state));
  renderScene(sceneState.getState());

  document.querySelector('#planRed').addEventListener('click', () => {
    const result = actions.planPickAndPlace('red-cube-1', 'red-bin');
    addLog(result.ok ? 'Planned red cube → red bin' : `Plan failed: ${result.reason}`, result.ok ? 'success' : 'error');
  });
  document.querySelector('#planBlue').addEventListener('click', () => {
    const result = actions.planPickAndPlace('blue-cube-1', 'blue-bin');
    addLog(result.ok ? 'Planned blue cube → blue bin' : `Plan failed: ${result.reason}`, result.ok ? 'success' : 'error');
  });
  document.querySelector('#simulate').addEventListener('click', async () => {
    addLog('Physics validation started');
    const result = await actions.simulateCurrentPlan();
    addLog(result.ok ? `Physics PASS (${result.backend})` : `Physics FAIL: ${result.reason || 'collision'}`, result.ok ? 'success' : 'error');
  });
  document.querySelector('#execute').addEventListener('click', async () => {
    addLog('Trajectory execution requested');
    const result = await actions.executeCurrentPlan();
    addLog(result.ok ? 'Pick-and-place complete' : `Execution blocked: ${result.reason}`, result.ok ? 'success' : 'error');
  });
  document.querySelector('#reset').addEventListener('click', () => {
    actions.resetWorkcell();
    addLog('Workcell reset');
  });
  document.querySelector('#gripperOpen').addEventListener('click', () => actions.setGripper(1));
  document.querySelector('#gripperClose').addEventListener('click', () => actions.setGripper(0));
  document.querySelector('#fitView').addEventListener('click', () => rendererApi.fitView());
  document.querySelector('#quality').addEventListener('change', (event) => rendererApi.setQuality(event.target.value));

  physicsClient.health().then((health) => {
    elements.physics.textContent = health.ok ? `${health.backend} ready` : 'browser fallback';
    addLog(health.ok ? `Physics service ready: ${health.backend}` : 'Physics service unavailable; browser fallback active');
  });

  function renderDiagnostics() {
    const diagnostics = rendererApi.getDiagnostics();
    elements.renderer.textContent = `${diagnostics.backend} · three r${diagnostics.threeRevision}`;
    elements.renderer.title = [diagnostics.vendor, diagnostics.renderer, diagnostics.version].filter(Boolean).join(' · ');
    elements.frame.textContent = diagnostics.medianIntervalMs
      ? `${format(diagnostics.medianIntervalMs)} ms median · ${format(diagnostics.p95IntervalMs)} ms p95`
      : 'measuring…';
    elements.frame.title = diagnostics.approximateFps
      ? `${format(diagnostics.approximateFps)} approximate RAF FPS; diagnostic only, not certification`
      : '';
  }
  renderDiagnostics();
  setInterval(renderDiagnostics, 1000);

  return {
    addLog,
    setWebMcpStatus(result) {
      elements.webmcp.textContent = result.ok ? `${result.toolCount} tools registered` : 'WebMCP unavailable';
      elements.webmcp.classList.toggle('status-good', result.ok);
      elements.webmcp.title = result.reason || result.toolNames?.join(', ') || '';
    },
    setPlanStatus(text, kind = 'neutral') {
      elements.planStatus.textContent = text;
      elements.planStatus.dataset.kind = kind;
    }
  };
}
