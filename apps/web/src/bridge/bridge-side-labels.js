import * as THREE from '../../vendor/three.module.min.js';
import { transformPointToMainDemo } from '../bridge-core/world-transform.js';

export function bridgeSideLabelPositions(buildPlan, worldTransform) {
  const { anchors, geometry } = buildPlan;
  const halfWidth = (geometry.sliceArray.count - 1) * geometry.sliceArray.pitch / 2 + geometry.grid.dx * 2;
  const common = { x: (anchors.bridgeStartX + anchors.bridgeEndX) / 2, y: anchors.roadY + geometry.grid.dy * 2 };
  return Object.fromEntries([['human', -1], ['agent', 1]].map(([actor, sign]) => [actor,
    transformPointToMainDemo({ ...common, z: anchors.bridgeCentreZ + sign * halfWidth }, worldTransform)]));
}

// Two labels only, derived from the same BridgeHost transform as the exact
// hologram. No target ledger, picking permission, geometry or animation loop.
export function createBridgeSideLabels({ renderer, bridgeHost }) {
  const group = new THREE.Group();
  group.name = 'BRIDGE_ADVISORY_SIDE_LABELS';
  // Three sorts transparent render items by their enclosing group first.
  // Keep both side labels above the hologram, including the near-side label.
  group.renderOrder = 100;
  const labels = new Map();
  for (const [actor, text, colour] of [['human', 'HUMAN SIDE', '#7bcaff'], ['agent', 'CODEX SIDE', '#ffd27c']]) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const context = canvas.getContext('2d');
    context.fillStyle = '#132333'; context.fillRect(0, 0, 512, 96);
    context.fillStyle = colour; context.font = 'bold 44px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, 256, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Presentation labels must remain legible at the user's scene exposure.
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }));
    label.scale.set(105, 20, 1); label.renderOrder = 10;
    group.add(label); labels.set(actor, label);
  }
  function refresh() {
    const positions = bridgeSideLabelPositions(bridgeHost.buildPlan, bridgeHost.worldTransform);
    for (const [actor, label] of labels) {
      const position = positions[actor]; label.position.set(position.xMm, position.yMm, position.zMm);
    }
  }
  refresh(); renderer.machineRoot.add(group);
  const unsubscribe = bridgeHost.subscribe(event => { if (event.type === 'compile_committed') refresh(); });
  return Object.freeze({
    setVisible(value) { group.visible = Boolean(value); },
    dispose() { unsubscribe(); for (const label of labels.values()) { label.material.map.dispose(); label.material.dispose(); } group.removeFromParent(); }
  });
}
