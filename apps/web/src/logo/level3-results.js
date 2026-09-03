// Read-only Level 3 presentation. Mission, ConstructionService and BuildBoard
// remain authoritative; telemetry never accepts placements or completes a mission.
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const matchesPlan = (record, state) => Boolean(record?.planId && record.planId === state?.plan?.planId
  && record.designChecksum && record.designChecksum === state.plan.designChecksum);

/** Forward every existing Mission event here, starting before Mission creation.
 * Pass controller.worldRevision synchronously at the PASS event: later reads of
 * the live world revision are not the revision at which the mission completed.
 * This is a bounded telemetry accumulator, not a mission or completion ledger.
 */
export function createLevel3ResultsCollector() {
  let lastSequence = 0, session = null;
  return Object.freeze({
    recordMissionEvent(event, { worldRevision = null } = {}) {
      if (!event?.missionId || count(event.sequence) === null || event.sequence <= lastSequence) return false;
      const isNew = session?.missionId !== event.missionId;
      if (isNew) session = { missionId: event.missionId, complete: ['DESIGN', 'RESET', 'FREEZE'].includes(event.type),
        testCount: 0, failureCount: 0, testActive: false, buildStartedAt: null, buildOpenedAt: null,
        buildDurationMs: 0, timingValid: true, lastTimestamp: null, finalWorldRevision: null };
      else if (event.sequence !== lastSequence + 1) session.complete = false;
      lastSequence = event.sequence;
      const at = timestamp(event.timestamp);
      if (at === null || (session.lastTimestamp !== null && at < session.lastTimestamp)) session.timingValid = false;
      session.lastTimestamp = at;
      if (event.type === 'FREEZE') {
        session.buildStartedAt = at;
        session.buildOpenedAt = at;
      } else if (event.type === 'TEST' && event.phase === 'TEST') {
        if (session.buildOpenedAt !== null && at !== null) session.buildDurationMs += at - session.buildOpenedAt;
        session.buildOpenedAt = null;
        session.testCount += 1;
        session.testActive = true;
      } else if (event.type === 'RECOVER' && event.phase === 'BUILD' && session.testActive) {
        session.failureCount += 1;
        session.testActive = false;
        session.buildOpenedAt = at;
      } else if (event.type === 'PASS' && event.phase === 'COMPLETE') {
        if (session.buildOpenedAt !== null && at !== null) session.buildDurationMs += at - session.buildOpenedAt;
        session.buildOpenedAt = null;
        session.testActive = false;
        session.finalWorldRevision = count(worldRevision);
      }
      return true;
    },
    getSnapshot({ missionId = session?.missionId, nowMs = Date.now() } = {}) {
      const current = session?.missionId === missionId ? session : null;
      const complete = current?.complete === true;
      const elapsed = current?.buildOpenedAt === null ? 0 : nowMs - current?.buildOpenedAt;
      const timed = complete && current.timingValid && current.buildStartedAt !== null
        && Number.isFinite(elapsed) && elapsed >= 0;
      return Object.freeze({ missionId: current?.missionId ?? null,
        coverage: current ? complete ? 'complete' : 'partial' : 'none',
        testCount: complete ? current.testCount : null,
        failureCount: complete ? current.failureCount : null,
        retryCount: complete ? Math.max(0, current.testCount - 1) : null,
        buildDurationMs: timed ? current.buildDurationMs + elapsed : null,
        finalWorldRevision: current?.finalWorldRevision ?? null });
    }
  });
}

function archCount(spec) {
  if (spec?.family === 'viaduct') return count(spec.viaduct?.archCount);
  if (spec?.family !== 'aqueduct') return null;
  const tiers = ['topArchCount', 'middleArchCount', 'bottomArchCount'].map(key => count(spec.aqueduct?.[key]));
  return tiers.every(value => value !== null) ? tiers.reduce((total, value) => total + value, 0) : null;
}

/** Supply getMissionState({detail:'detail'}), current Construction progress and
 * MissionService.frozen. Missing, stale or unrecorded statistics stay null.
 * rejectedPlacementCount is optional and must be an actual mission-scoped count;
 * current BuildBoard exposes no rejection counter, so production omits it.
 */
export function deriveLevel3Results({ mode, missionState, constructionProgress = null, frozenMission = null,
  telemetry = null, rejectedPlacementCount = null } = {}) {
  const state = missionState?.ok === true ? missionState : null;
  const phase = state?.phase ?? null;
  const frozen = frozenMission?.missionId === state?.missionId && matchesPlan(frozenMission, state) ? frozenMission : null;
  const progress = state?.build && matchesPlan(constructionProgress, state)
    && constructionProgress.worldRevision === state.revisions?.worldRevision
    && constructionProgress.total === state.build.required && constructionProgress.completed === state.build.accepted
    ? constructionProgress : null;
  const modes = progress?.byExecutionMode;
  const modeValues = ['human', 'robot', 'simulated_fast_forward', 'unknown'].map(key => count(modes?.[key]));
  const modesValid = Boolean(progress) && modeValues.every(value => value !== null)
    && modeValues.reduce((total, value) => total + value, 0) === progress.completed;
  const lastTest = state?.lastTest?.missionId === state?.missionId && matchesPlan(state?.lastTest, state)
    && state.lastTest.supportSource === 'BUILD_BOARD' ? state.lastTest : null;
  const trainResult = lastTest?.outcome ?? null;
  const success = phase === 'COMPLETE' && trainResult === 'CROSSED';
  const metrics = state && telemetry?.missionId === state.missionId ? telemetry : null;
  const fullMetrics = metrics?.coverage === 'complete' ? metrics : null;
  const result = !state ? 'UNAVAILABLE' : success ? 'SUCCESS' : phase === 'COMPLETE' ? 'UNVERIFIED'
    : phase === 'TEST' ? 'TESTING' : phase === 'BUILD' && trainResult && trainResult !== 'CROSSED' ? 'REPAIR_REQUIRED'
      : phase === 'BUILD' ? 'BUILDING' : 'DESIGN';
  return Object.freeze({ visible: mode === 'train', result, success,
    missionId: state?.missionId ?? null, phase,
    family: frozen?.bridgeSpec?.family ?? state?.bridge?.family ?? null,
    archCount: archCount(frozen?.bridgeSpec),
    partCount: count(state?.build?.required),
    acceptedPlacements: count(state?.build?.accepted),
    humanAccepted: count(state?.build?.human),
    agentAccepted: count(state?.build?.codex),
    robotAccepted: modesValid ? modes.robot : null,
    acceleratedAccepted: modesValid ? modes.simulated_fast_forward : null,
    unknownAccepted: modesValid ? modes.unknown : null,
    incorrectPlacements: count(state?.build?.incorrect),
    rejectedPlacements: state ? count(rejectedPlacementCount) : null,
    buildDurationMs: fullMetrics?.buildDurationMs ?? null,
    testCount: count(fullMetrics?.testCount), failureCount: count(fullMetrics?.failureCount), retryCount: count(fullMetrics?.retryCount),
    trainResult,
    finalWorldRevision: success ? count(metrics?.finalWorldRevision) : null,
    worldRevision: count(state?.revisions?.worldRevision),
    telemetryCoverage: metrics?.coverage ?? 'none' });
}

const display = value => value === null || value === undefined ? '—' : String(value);
const duration = value => Number.isFinite(value) && value >= 0 ? `${(value / 1000).toFixed(1)} s` : '—';

/** Mount once; render from the existing UI update loop. No timers or RAF hooks. */
export function createLevel3ResultsPanel({ document = globalThis.document, parent = document?.body } = {}) {
  if (!document?.createElement || !parent?.append) throw new TypeError('A document and results-panel parent are required.');
  const element = document.createElement('section');
  element.dataset.level3Results = '';
  element.setAttribute('aria-label', 'Level 3 mission results');
  element.hidden = true;
  const style = document.createElement('style');
  style.textContent = `
    [data-level3-results][hidden],html:not([data-demo-mode="train"]) [data-level3-results]{display:none!important}
    [data-level3-results]{padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#172b46;max-width:380px;box-sizing:border-box}
    [data-level3-results] h2{margin:0 0 4px;font:800 20px/1.2 system-ui,sans-serif;letter-spacing:.04em}
    [data-level3-results] p{margin:0 0 8px;font:500 11px/1.4 system-ui,sans-serif}
    [data-level3-results] dl{margin:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(65px,1fr);gap:4px 10px;font:500 11px/1.3 system-ui,sans-serif}
    [data-level3-results] dt,[data-level3-results] dd{margin:0;overflow-wrap:anywhere}
    [data-level3-results] dd{text-align:right;font-weight:750}
    [data-level3-results] small{display:block;margin-top:8px;font:500 10px/1.4 system-ui,sans-serif;color:#50647f}
    [data-level3-results][data-result="SUCCESS"]{border-color:#16a34a;background:#f0fdf4}
    [data-level3-results][data-result="SUCCESS"] h2{color:#166534}
    [data-level3-results][data-result="REPAIR_REQUIRED"]{border-color:#d97706;background:#fffbeb}
  `;
  const heading = document.createElement('h2');
  heading.setAttribute('aria-live', 'polite');
  heading.setAttribute('aria-atomic', 'true');
  const summary = document.createElement('p'), list = document.createElement('dl'), note = document.createElement('small');
  const rows = [
    ['missionId', 'Mission ID'], ['family', 'Bridge family'], ['archCount', 'Logical arches'], ['partCount', 'BuildPlan parts'],
    ['acceptedPlacements', 'Accepted placements'], ['humanAccepted', 'Human accepted'], ['agentAccepted', 'Agent total (all modes)'],
    ['robotAccepted', 'Robot-motion accepted'], ['acceleratedAccepted', 'Accelerated simulation'], ['unknownAccepted', 'Unknown execution mode'],
    ['incorrectPlacements', 'Incorrect placements'], ['rejectedPlacements', 'Rejected placements'], ['buildDurationMs', 'BUILD time (incl. repairs)'],
    ['tests', 'Tests / failures / retries'], ['trainResult', 'Last Train result'], ['revision', 'World revision']
  ];
  const fields = new Map();
  for (const [key, label] of rows) {
    const term = document.createElement('dt'), value = document.createElement('dd');
    term.textContent = label;
    value.dataset.level3Stat = key;
    value.textContent = '—';
    list.append(term, value);
    fields.set(key, { term, value });
  }
  element.append(style, heading, summary, list, note);
  parent.append(element);
  return Object.freeze({ element,
    render(result) {
      element.hidden = result?.visible !== true;
      if (element.hidden) return;
      element.dataset.result = result.result;
      heading.textContent = result.result === 'REPAIR_REQUIRED' ? 'REPAIR / RETEST' : result.result;
      summary.textContent = result.success ? 'Mission COMPLETE · Train CROSSED'
        : result.result === 'REPAIR_REQUIRED' ? 'Repair the same frozen bridge, then test again.'
          : result.result === 'TESTING' ? 'Train test in progress. Crossing is not yet confirmed.'
            : 'Level 3 · authoritative Mission and construction results';
      for (const [key, field] of fields) {
        field.value.textContent = key === 'buildDurationMs' ? duration(result.buildDurationMs)
          : key === 'tests' ? `${display(result.testCount)} / ${display(result.failureCount)} / ${display(result.retryCount)}`
            : key === 'revision' ? display(result.success ? result.finalWorldRevision : result.worldRevision) : display(result[key]);
      }
      fields.get('revision').term.textContent = result.success ? 'Final worldRevision' : 'Current worldRevision';
      note.textContent = '— = not recorded. BUILD time excludes train tests. Failures include stopped tests.'
        + (result.acceleratedAccepted > 0 ? ' Accelerated placements used explicit simulation, not robot motion.' : '')
        + (result.telemetryCoverage !== 'complete' ? ' Full mission timing/counter history is unavailable.' : '');
    },
    dispose() { element.remove(); }
  });
}
