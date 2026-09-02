'use strict';
import { MissionError } from './errors.js';

export const MISSION_SERVICE_CONTRACTS = Object.freeze({
  bridgeHost:['getCompileState','exportPlan'],
  bridgeDesignService:['getDesignState'],
  constructionService:['startBuild','getProgress','buildNextParts','cancel','reset'],
  trainService:['getState','test','reset'],
  challengeService:['getOptions','getActiveChallenge','selectChallenge']
});

export function validateMissionServices(services={}) {
  const missing=[];
  for (const [name,methods] of Object.entries(MISSION_SERVICE_CONTRACTS)) {
    for (const method of methods) if (typeof services[name]?.[method] !== 'function') missing.push(`${name}.${method}`);
  }
  const robot = services.robotController ?? services.runtime?.robot;
  if (typeof robot?.getState !== 'function') missing.push('robotController.getState');
  if (typeof services.runtime?.getWorldRevision !== 'function') missing.push('runtime.getWorldRevision');
  return { ok:missing.length===0,missing };
}

export function requireMissionServices(services={}) {
  const result=validateMissionServices(services);
  if (!result.ok) throw new MissionError('SERVICE_UNAVAILABLE','One or more mission services are unavailable.',{missing:result.missing});
}

export function readRobotState(services) {
  return (services.robotController ?? services.runtime?.robot).getState();
}
export function readWorldRevision(services) {
  const value=services.runtime.getWorldRevision();
  if (!Number.isSafeInteger(value) || value < 0) throw new MissionError('RUNTIME_UNAVAILABLE','The runtime returned an invalid world revision.');
  return value;
}
