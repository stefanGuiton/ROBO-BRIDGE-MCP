'use strict';

import { MissionError } from './errors.js';
import { createMainDemoMissionWebMcpBundle } from './main-demo-mission-runtime.js';
import {
  createChallengeServiceAdapter,
  createConstructionServiceAdapter,
  createTrainServiceAdapter
} from './adapters/index.js';
import { createMissionTrainAdapter } from '../train-integration/index.js';

/**
 * Build the production mission compatibility package without creating a second
 * registrar, BuildBoard, RobotController, progress ledger, or train authority.
 */
export async function createProductionMissionRuntime({
  bridgeHost,
  bridgeDesignPackage = null,
  bridgeDesignService = bridgeDesignPackage?.service,
  bridgeTools = bridgeDesignPackage?.tools,

  challengeService: productionChallengeService,
  challengePresets = null,
  challengeMetadata = {},
  selectChallenge = null,
  resetChallenge = null,

  constructionSession = null,
  createConstructionSession = null,
  getAcceptedBuildBoardSnapshot,
  normalizeAcceptedBuildBoardSnapshot = null,
  resetWorkcell = null,
  disposeConstructionSessionOnReset = false,

  trainService: productionTrainService = null,
  trainIntegration = null,
  trainSubsystem = null,
  awaitPusherReady = null,
  trainMaxSeconds = 20,
  trainFixedDtSeconds = 1 / 120,

  robotController = null,
  runtime,
  eventSink = () => {},
  events = null,
  idFactory,
  now,
  maximumTerrainOptions = 100
} = {}) {
  const trainCore = productionTrainService ?? trainSubsystem?.service;
  if (!bridgeHost) throw new MissionError('SERVICE_UNAVAILABLE', 'BridgeHost is required.');
  if (!bridgeDesignService || !Array.isArray(bridgeTools)) {
    throw new MissionError('SERVICE_UNAVAILABLE', 'The existing bridge-design service and five tools are required.');
  }
  if (!productionChallengeService) throw new MissionError('SERVICE_UNAVAILABLE', 'ChallengeService is required.');
  if (!runtime || typeof runtime.getWorldRevision !== 'function') {
    throw new MissionError('RUNTIME_UNAVAILABLE', 'The production runtime with getWorldRevision() is required.');
  }
  const robot = robotController ?? runtime.robot;
  if (!robot || typeof robot.getState !== 'function') {
    throw new MissionError('RUNTIME_UNAVAILABLE', 'The production RobotController is required.');
  }

  const challengeService = createChallengeServiceAdapter({
    service: productionChallengeService,
    presets: challengePresets,
    metadata: challengeMetadata,
    runtime,
    selectChallenge,
    resetChallenge
  });
  const constructionService = createConstructionServiceAdapter({
    session: constructionSession,
    createSession: createConstructionSession,
    getAcceptedBuildBoardSnapshot,
    normalizeAcceptedBuildBoardSnapshot,
    runtime,
    robotController: robot,
    resetWorkcell,
    disposeSessionOnReset: disposeConstructionSessionOnReset
  });
  const trainService = trainIntegration
    ? createMissionTrainAdapter(trainIntegration)
    : createTrainServiceAdapter({
      service: trainCore,
      runtime,
      getAcceptedBuildBoardSnapshot,
      normalizeAcceptedBuildBoardSnapshot,
      awaitPusherReady,
      maxSeconds: trainMaxSeconds,
      fixedDtSeconds: trainFixedDtSeconds
    });

  const bundle = await createMainDemoMissionWebMcpBundle({
    bridgeHost,
    bridgeDesignService,
    bridgeTools,
    constructionService,
    trainService,
    challengeService,
    robotController: robot,
    runtime,
    eventSink,
    events,
    idFactory,
    now,
    maximumTerrainOptions
  });

  return Object.freeze({
    ...bundle,
    adapters: Object.freeze({ challengeService, constructionService, trainService }),
    production: Object.freeze({
      challengeService: productionChallengeService,
      trainService: trainCore,
      get constructionSession() { return constructionService.getProductionSession(); }
    })
  });
}
