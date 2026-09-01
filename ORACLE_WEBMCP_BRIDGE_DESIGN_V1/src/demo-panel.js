'use strict';

const DEMO_EXAMPLES = Object.freeze({
  read: { tool: 'get_bridge_design', input: { includeCapabilities: false } },
  aqueduct1063: {
    tool: 'update_bridge_design',
    input: {
      expectedDesignRevision: '$current',
      patch: { family: 'aqueduct', aqueduct: { topArchCount: 10, middleArchCount: 6, bottomArchCount: 3 } }
    }
  },
  aqueduct864: {
    tool: 'update_bridge_design',
    input: {
      expectedDesignRevision: '$current',
      patch: { aqueduct: { topArchCount: 8, bottomArchCount: 4 } }
    }
  },
  viaduct: {
    tool: 'update_bridge_design',
    input: { expectedDesignRevision: '$current', patch: { family: 'viaduct' } }
  },
  viaduct5wide: {
    tool: 'update_bridge_design',
    input: {
      expectedDesignRevision: '$current',
      patch: { viaduct: { archCount: 5, openingWidthRatio: 0.9 } }
    }
  },
  plan: { tool: 'get_bridge_build_plan', input: { detail: 'summary' } }
});

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function currentRevision(runtime) {
  const state = runtime.service.getDesignState({ includeCapabilities: false });
  return state.ok ? state.designRevision : 0;
}

function resolveCurrent(value, revision) {
  if (Array.isArray(value)) return value.map((item) => resolveCurrent(item, revision));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveCurrent(item, revision)]));
  }
  return value === '$current' ? revision : value;
}

export function mountBridgeDemoPanel(runtime, registrationResult) {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar || document.getElementById('oracleWebMcpPanel')) return;
  const toggle = document.createElement('button');
  toggle.id = 'oracleWebMcpToggle';
  toggle.type = 'button';
  toggle.className = 'tool';
  toggle.textContent = 'Agent';
  toolbar.appendChild(toggle);

  const panel = document.createElement('aside');
  panel.id = 'oracleWebMcpPanel';
  panel.innerHTML = `
    <div class="ow-title"><strong>Bridge Design WebMCP</strong><button id="owClose" type="button" aria-label="Close">×</button></div>
    <div id="owNative" class="ow-status"></div>
    <div id="owState" class="ow-state">Waiting for the first V4.6 BuildPlan…</div>
    <label class="ow-label" for="owExample">Structured example</label>
    <select id="owExample" class="ow-select">
      <option value="read">Read current design</option>
      <option value="aqueduct1063">Aqueduct 10 / 6 / 3</option>
      <option value="aqueduct864">Change only top and bottom</option>
      <option value="viaduct">Switch to viaduct preset</option>
      <option value="viaduct5wide">Viaduct 5, wider openings</option>
      <option value="plan">BuildPlan summary</option>
    </select>
    <label class="ow-label" for="owTool">Tool</label>
    <select id="owTool" class="ow-select"></select>
    <label class="ow-label" for="owInput">JSON input</label>
    <textarea id="owInput" spellcheck="false"></textarea>
    <div class="ow-actions"><button id="owRun" type="button">Run tool</button><button id="owRefresh" type="button">Refresh</button></div>
    <div class="ow-note">The AI interprets natural language. This panel sends the same structured tools directly.</div>
    <pre id="owOutput">No tool call yet.</pre>
  `;
  document.getElementById('app').appendChild(panel);

  const native = panel.querySelector('#owNative');
  native.textContent = registrationResult?.ok
    ? `Native WebMCP: registered ${registrationResult.toolCount} tools.`
    : 'Native WebMCP: unavailable in this browser. Direct handler test mode is active.';
  native.dataset.ok = registrationResult?.ok ? '1' : '0';

  const toolSelect = panel.querySelector('#owTool');
  for (const tool of runtime.tools) {
    const option = document.createElement('option');
    option.value = tool.name;
    option.textContent = tool.name;
    toolSelect.appendChild(option);
  }
  const input = panel.querySelector('#owInput');
  const output = panel.querySelector('#owOutput');
  const state = panel.querySelector('#owState');
  const run = panel.querySelector('#owRun');
  const example = panel.querySelector('#owExample');

  function refreshState() {
    const value = runtime.service.getDesignState({ includeCapabilities: false });
    state.textContent = value.ok
      ? `${value.family} · revision ${value.designRevision} · ${value.planId} · ${value.buildPlanSummary.physicalPartCount} parts`
      : `${value.error.code}: ${value.error.message}`;
    return value;
  }

  function loadExample() {
    const selected = clone(DEMO_EXAMPLES[example.value] || DEMO_EXAMPLES.read);
    const revision = currentRevision(runtime);
    selected.input = resolveCurrent(selected.input, revision);
    toolSelect.value = selected.tool;
    input.value = JSON.stringify(selected.input, null, 2);
  }

  async function runTool() {
    run.disabled = true;
    output.textContent = 'Executing…';
    try {
      const parsed = input.value.trim() ? JSON.parse(input.value) : {};
      const result = await runtime.invoke(toolSelect.value, parsed);
      output.textContent = JSON.stringify(result, null, 2);
      refreshState();
      loadExample();
    } catch (error) {
      output.textContent = JSON.stringify({ ok: false, error: { code: 'INVALID_PARAMETER', message: error.message } }, null, 2);
    } finally {
      run.disabled = false;
    }
  }

  toggle.onclick = () => panel.classList.toggle('open');
  panel.querySelector('#owClose').onclick = () => panel.classList.remove('open');
  panel.querySelector('#owRefresh').onclick = () => { refreshState(); loadExample(); };
  example.onchange = loadExample;
  run.onclick = runTool;
  panel.classList.add('open');
  loadExample();
  const timer = setInterval(() => {
    if (globalThis.ROBO_BRIDGE_DEBUG?.ready) {
      refreshState();
      clearInterval(timer);
    }
  }, 50);
}
