export const FINAL_TOWER_REQUEST = 'Build a tower six layers tall using two red bricks per layer.';

const READY_STATUS = 'PLANNED';
const roundPose = value => Number(Number(value).toFixed(1));

function normaliseBrickYaw(yawDeg = 0) {
  const halfTurn = ((Number(yawDeg) % 180) + 180) % 180;
  return Math.abs(halfTurn - 180) < 1e-6 ? 0 : roundPose(halfTurn);
}

function layerAndSlot(placementId = '') {
  const match = String(placementId).match(/-l(\d+)-b(\d+)$/);
  return match ? { layer: Number(match[1]) + 1, slot: Number(match[2]) + 1 } : { layer: null, slot: null };
}

// Selects one already validated, dependency-ready slot. The first active queue
// item remains the robot's next placement; the second item is the Human guide.
// This function only reads the existing stream state.
export function selectHumanContributionGuide(status = {}) {
  if (!status?.ok || !Array.isArray(status.entries) || !Array.isArray(status.activeQueue)) return null;
  const robotNextId = status.activeQueue[0]?.placementId ?? null;
  const candidateIds = status.activeQueue.slice(1).map(entry => entry.placementId);
  for (const placementId of candidateIds) {
    const entry = status.entries.find(item => item.placementId === placementId);
    if (!entry || entry.status !== READY_STATUS || !entry.targetPosition || entry.placementId === robotNextId) continue;
    const ordinal = layerAndSlot(entry.placementId);
    return Object.freeze({
      placementId: entry.placementId,
      status: entry.status,
      targetPosition: Object.freeze({
        xMm: roundPose(entry.targetPosition.xMm),
        yMm: roundPose(entry.targetPosition.yMm),
        zMm: roundPose(entry.targetPosition.zMm)
      }),
      targetYawDeg: normaliseBrickYaw(entry.targetYawDeg),
      layer: ordinal.layer,
      slot: ordinal.slot,
      supportPlacementId: entry.supportPlacementId ?? null,
      dependsOnPlacementIds: Object.freeze([...(entry.dependsOnPlacementIds ?? [])]),
      preferredColour: entry.preferredColour ?? null,
      robotNextPlacementId: robotNextId
    });
  }
  return null;
}

function installStyle() {
  if (document.querySelector('[data-simple-human-guide-style]')) return;
  const style = document.createElement('style');
  style.dataset.simpleHumanGuideStyle = '';
  style.textContent = `
    [data-simple-human-guide]{display:grid;gap:3px;padding:8px;border:1px solid #93c5fd;border-radius:8px;background:#eff6ff;color:#1e3a5f;max-width:300px}
    [data-simple-human-guide] b{font-size:9px;letter-spacing:.08em}
    [data-simple-human-guide] span{font:750 9px ui-monospace,monospace;overflow-wrap:anywhere}
    [data-simple-human-guide] small{font-size:8px;line-height:1.35;color:#49647f;letter-spacing:0}
    [data-simple-human-guide][data-state=adopted]{border-color:#86efac;background:#f0fdf4;color:#166534}
    [data-simple-human-guide][data-state=adopted] small{color:#3f6b4d}
  `;
  document.head.append(style);
}

function mountPanel() {
  const host = document.querySelector('.simple-only');
  if (!host) return null;
  let panel = host.querySelector('[data-simple-human-guide]');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.dataset.simpleHumanGuide = '';
  panel.dataset.state = 'waiting';
  panel.setAttribute('aria-label', 'Guided Human tower contribution');
  panel.innerHTML = '<b>HUMAN BLUE CONTRIBUTION</b><span data-simple-human-slot>PLAN THE TOWER FIRST</span><small data-simple-human-pose></small><small data-simple-human-rule></small>';
  host.append(panel);
  return panel;
}

function refreshPanel() {
  const panel = mountPanel();
  if (!panel) return;
  const slot = panel.querySelector('[data-simple-human-slot]');
  const pose = panel.querySelector('[data-simple-human-pose]');
  const rule = panel.querySelector('[data-simple-human-rule]');
  const runtime = globalThis.__ROBO_BRIDGE__;
  const streamId = runtime?.fastPlacement?.summary?.().streamId ?? null;
  if (!streamId) {
    panel.dataset.state = 'waiting';
    slot.textContent = 'PLAN THE 6-LAYER / 12-TARGET TOWER';
    pose.textContent = FINAL_TOWER_REQUEST;
    rule.textContent = 'Use the generic planner and placement stream.';
    return;
  }
  const status = runtime.fastPlacement.getStreamStatus({ streamId, limit: 50 });
  const adopted = status.entries?.find(entry => entry.status === 'ADOPTED' && entry.actor === 'human');
  if (adopted) {
    panel.dataset.state = 'adopted';
    slot.textContent = `${adopted.placementId} · BLUE ADOPTED`;
    pose.textContent = `actor=human · actualBrickId=${adopted.actualBrickId}`;
    rule.textContent = 'Start or continue the robot stream. This target will not be placed twice.';
    return;
  }
  const guide = selectHumanContributionGuide(status);
  if (!guide) {
    panel.dataset.state = 'waiting';
    slot.textContent = status.remainingPlacements === 0 ? 'TOWER COMPLETE' : 'WAIT FOR A READY SECOND SLOT';
    pose.textContent = status.remainingPlacements === 0 ? `${status.satisfiedPlacements}/${status.totalPlacements} targets satisfied` : FINAL_TOWER_REQUEST;
    rule.textContent = status.remainingPlacements === 0 ? 'No pending Human slot.' : 'Do not use an off-plan position.';
    return;
  }
  panel.dataset.state = 'ready';
  const label = guide.layer && guide.slot ? `LAYER ${guide.layer} · SLOT ${guide.slot}` : guide.placementId;
  slot.textContent = `${label} · ${guide.placementId}`;
  pose.textContent = `X ${guide.targetPosition.xMm} · Y ${guide.targetPosition.yMm} · Z ${guide.targetPosition.zMm} mm · YAW ${guide.targetYawDeg}°`;
  rule.textContent = 'Before stream start: place one blue brick here. Release only on the normal VALID placement preview.';
}

export function installSimpleHumanSlotGuide() {
  if (typeof document === 'undefined' || globalThis.__ROBO_SIMPLE_GUIDE_INSTALLED__) return false;
  globalThis.__ROBO_SIMPLE_GUIDE_INSTALLED__ = true;
  installStyle();
  refreshPanel();
  const timer = setInterval(refreshPanel, 250);
  globalThis.addEventListener?.('pagehide', () => clearInterval(timer), { once: true });
  return true;
}

if (typeof document !== 'undefined') installSimpleHumanSlotGuide();
