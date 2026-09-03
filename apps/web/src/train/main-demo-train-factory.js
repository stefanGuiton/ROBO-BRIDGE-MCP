'use strict';

import { createBuildBoardSupportMapAdapter } from './buildboard-support-map.js';
import { createCollisionSnapshotManager } from './bridge-collision-snapshot.js';
import { createPusherAdapter } from './pusher-adapter.js';
import { createTrainTestPreconditionAdapter } from './train-test-preconditions.js';
import { createTrainTestService } from './train-test-service.js';
import { createTrainThreeRenderer } from './train-three-renderer.js';
import { createTrainRuntime } from './train-runtime.js';

export function createMainDemoTrainSubsystem(options = {}) {
  const {
    THREE,
    machineRoot,
    getFrozenBuildPlan,
    getAcceptedBuildBoardSnapshot,
    getWorldTransform,
    requestRender = () => {},
    onStateChange = null,
    pusher = { mode: 'placeholder' },
    preconditions = {},
    surfaceProvider,
    settings = {}
  } = options;
  if (typeof getFrozenBuildPlan !== 'function') throw new TypeError('getFrozenBuildPlan() is required.');
  if (typeof getAcceptedBuildBoardSnapshot !== 'function') throw new TypeError('getAcceptedBuildBoardSnapshot() is required.');
  if (typeof getWorldTransform !== 'function') throw new TypeError('getWorldTransform() is required.');

  const supportMapAdapter = createBuildBoardSupportMapAdapter({
    getFrozenBuildPlan,
    getAcceptedBuildBoardSnapshot,
    getWorldTransform,
    ...settings.support
  });
  const collisionSnapshotManager = createCollisionSnapshotManager({
    getFrozenBuildPlan,
    getAcceptedBuildBoardSnapshot,
    getWorldTransform
  });
  const pusherAdapter = pusher.adapter || createPusherAdapter(pusher);
  const preconditionAdapter = preconditions.adapter || createTrainTestPreconditionAdapter(preconditions);
  const renderer = THREE && machineRoot ? createTrainThreeRenderer({
    THREE,
    machineRoot,
    requestRender,
    vehicleMeshFactory: options.vehicleMeshFactory,
    materialFactory: options.materialFactory
  }) : null;
  const service = createTrainTestService({
    getFrozenBuildPlan,
    getAcceptedBuildBoardSnapshot,
    getWorldTransform,
    supportMapAdapter,
    collisionSnapshotManager,
    pusherAdapter,
    preconditions: preconditionAdapter,
    surfaceProvider,
    onChange: onStateChange,
    ...settings.motion,
    physicsSettings: settings.physics
  });
  const runtime = createTrainRuntime({
    service,
    renderer,
    ...settings.runtime
  });

  return Object.freeze({
    service,
    runtime,
    renderer,
    supportMapAdapter,
    collisionSnapshotManager,
    pusherAdapter,
    updateFrame: runtime.updateFrame,
    prepareTest: service.prepareTest,
    startTest: service.startTest,
    resetTrain: service.resetTrain,
    refreshSupport() {
      collisionSnapshotManager.invalidate();
      return service.refreshSupport();
    },
    dispose: runtime.dispose
  });
}
