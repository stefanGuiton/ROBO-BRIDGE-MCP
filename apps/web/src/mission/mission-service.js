'use strict';

import { MissionError,assertNotAborted,cloneValue,errorPolicy,toMissionError } from './errors.js';
import { createMissionEventAdapter } from './mission-events.js';
import { readRobotState,readWorldRevision,requireMissionServices } from './service-contracts.js';
import { sameIdSet,sameStructuredValue } from './adapters/shared.js';

export const MISSION_PHASES=Object.freeze(['DESIGN','BUILD','TEST','COMPLETE']);
export const BUILD_BOARD_SOURCE='BUILD_BOARD';
export const TRAIN_CROSSED='CROSSED';
const SAFE_ID=/^[A-Za-z0-9_.:-]{1,160}$/;
const SAFE_CHALLENGE_ID=/^[A-Za-z0-9_.:/-]{1,160}$/;
const SAFE_EVIDENCE=/^[^\u0000-\u001F\u007F]{1,256}$/;

const integer=(value,minimum=0)=>Number.isSafeInteger(value)&&value>=minimum;
const get=(value,paths,fallback=null)=>{
  for (const path of paths) {
    let current=value;
    for (const key of path.split('.')) current=current?.[key];
    if (current !== undefined && current !== null) return current;
  }
  return fallback;
};
const deepFreeze=(value)=>{
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};
const compact=(value,max=80,fallback=null)=>{
  if (value === undefined || value === null) return fallback;
  const result=String(value).replace(/[\u0000-\u001F\u007F]+/g,' ').replace(/\s+/g,' ').trim();
  if (!result) return fallback;
  return result.length<=max ? result : `${result.slice(0,max-1)}…`;
};

function safeId(value,field,{required=true,code='INVALID_PARAMETER'}={}) {
  if ((value===undefined||value===null||value==='')&&!required) return null;
  if (typeof value!=='string'||!SAFE_ID.test(value)) throw new MissionError(code,`${field} must be a safe non-empty ID.`);
  return value;
}
function challengeId(value,field='challengeId') {
  if (typeof value!=='string'||!SAFE_CHALLENGE_ID.test(value)) throw new MissionError('INVALID_PARAMETER',`${field} must be a safe ChallengeService ID.`);
  return value;
}
function evidence(value,field,{required=true,code='INVALID_PARAMETER'}={}) {
  if ((value===undefined||value===null||value==='')&&!required) return null;
  if (typeof value!=='string'||!SAFE_EVIDENCE.test(value)) throw new MissionError(code,`${field} must be a bounded evidence value.`);
  return value;
}
function revisionEvidence(value,field,{required=false,code='INVALID_PARAMETER'}={}) {
  if ((value===undefined||value===null||value==='')&&!required) return null;
  if (integer(value)) return value;
  return evidence(value,field,{required,code});
}
function count(value,paths,fallback=0,code='CONSTRUCTION_ERROR',field=paths[0]) {
  const raw=get(value,paths,undefined);
  if (raw===undefined||raw===null) return fallback;
  if (!integer(raw)) throw new MissionError(code,`${field} must be a non-negative safe integer.`);
  return raw;
}
function serviceResult(value,code,message) {
  if (value?.ok===false) throw new MissionError(value.error?.code??value.code??value.reason??code,value.error?.message??value.message??message,value.error?.details??value.details);
  return value;
}
function mergeSignals(external,internal) {
  if (!external) return internal;
  if (!internal) return external;
  if (typeof AbortSignal!=='undefined'&&typeof AbortSignal.any==='function') return AbortSignal.any([external,internal]);
  const controller=new AbortController();
  const forward=(signal)=>{ if (!controller.signal.aborted) controller.abort(signal.reason); };
  for (const signal of [external,internal]) {
    if (signal.aborted) forward(signal);
    else signal.addEventListener('abort',()=>forward(signal),{once:true});
  }
  return controller.signal;
}
function uniqueIds(value) {
  if (!Array.isArray(value)||value.length<1) throw new MissionError('START_BUILD_FAILED','requiredPlacementIds must contain at least one ID.');
  const ids=value.map((item,index)=>safeId(item,`requiredPlacementIds[${index}]`,{code:'START_BUILD_FAILED'}));
  if (new Set(ids).size!==ids.length) throw new MissionError('START_BUILD_FAILED','requiredPlacementIds contains duplicate IDs.');
  return ids;
}
function challengeRecord(value) {
  const raw=serviceResult(value,'SERVICE_UNAVAILABLE','ChallengeService could not read the challenge.');
  const source=raw?.challenge??raw?.activeChallenge??raw?.active??raw;
  if (!source||typeof source!=='object'||Array.isArray(source)) throw new MissionError('SERVICE_UNAVAILABLE','ChallengeService returned no active challenge.');
  const id=challengeId(source.id??source.challengeId);
  return { id,label:compact(source.label??source.name,80,id),description:compact(source.description,120),
    checksum:evidence(source.checksum??source.challengeChecksum,'challengeChecksum',{required:false,code:'SERVICE_UNAVAILABLE'}),
    enabled:source.enabled!==false,raw:cloneValue(source) };
}
function designRecord(value) {
  const source=serviceResult(value,'SERVICE_UNAVAILABLE','BridgeDesignService could not read the design.');
  const designRevision=Number(get(source,['designRevision','buildPlanSummary.designRevision','summary.designRevision']));
  const planId=safeId(get(source,['planId','buildPlanSummary.planId','summary.planId']),'planId',{code:'SERVICE_UNAVAILABLE'});
  const designChecksum=evidence(get(source,['designChecksum','buildPlanSummary.designChecksum','summary.designChecksum']),'designChecksum',{code:'SERVICE_UNAVAILABLE'});
  const bridgeSpec=source.bridgeSpec;
  if (!integer(designRevision)||!bridgeSpec||typeof bridgeSpec!=='object'||Array.isArray(bridgeSpec)) throw new MissionError('SERVICE_UNAVAILABLE','BridgeDesignService returned an invalid design identity or BridgeSpec.');
  return { family:compact(source.family??bridgeSpec.family??source.buildPlanSummary?.family,80),bridgeSpec:cloneValue(bridgeSpec),
    designRevision,planId,designChecksum };
}
function robotRecord(value) {
  if (!value||typeof value!=='object') throw new MissionError('RUNTIME_UNAVAILABLE','RobotController returned no state.');
  const status=compact(value.operationState??value.state??(value.moving?'moving':'idle'),64,'idle').toLowerCase();
  const heldPartId=evidence(value.heldPartId??value.heldBrickId??value.heldObjectId??value.gripper?.heldPartId,'heldPartId',{required:false,code:'RUNTIME_UNAVAILABLE'});
  const idle=!Boolean(value.moving)&&['idle','ready','stopped'].includes(status);
  return { status:idle?'idle':status,idle,heldPartId,gripperEmpty:!heldPartId };
}
function trainRecord(value) {
  if (value?.ok===false) return {state:'unavailable',result:null};
  return { state:compact(value?.state??value?.status,64,'ready'),result:compact(value?.result??value?.outcome,64),
    ...(typeof value?.enabled==='boolean'?{enabled:value.enabled}:{}) };
}
function assertTrainReady(value) {
  if (value?.enabled===false) throw new MissionError('LEVEL3_ONLY','Train tests are available only in Level 3.');
  const source=serviceResult(value,'TRAIN_NOT_READY','TrainService state is unavailable.');
  const record=trainRecord(source); const state=String(record.state).toUpperCase();
  if (source?.ready===false||source?.canTest===false||['TESTING','RUNNING','BUSY','RESETTING','UNAVAILABLE'].includes(state)) throw new MissionError('TRAIN_NOT_READY','TrainService is not ready to start a test.');
  return record;
}
function collaborationRecord(value,{required,accepted}) {
  if (value===undefined||value===null) return null;
  const actors=['human','agent'];
  if (!value||typeof value!=='object'||Array.isArray(value)
    ||value.schemaVersion!=='robo-bridge.collaboration.v1'||value.mode!=='lateral_advisory'
    ||value.advisoryOnly!==true||value.axis!=='bridge_local_z'
    ||!Number.isFinite(value.centreLocalZ)||!Number.isFinite(value.centrelineToleranceLocal)||value.centrelineToleranceLocal<0
    ||!actors.includes(value.negativeSideActor)||!actors.includes(value.positiveSideActor)||!actors.includes(value.centrelineActor)) {
    throw new MissionError('CONSTRUCTION_ERROR','Construction returned invalid advisory collaboration metadata.');
  }
  const byAdvisorySide={};
  for (const actor of actors) {
    const side=value.byAdvisorySide?.[actor];
    if (!side||typeof side!=='object'||Array.isArray(side)) throw new MissionError('CONSTRUCTION_ERROR','Construction returned no advisory-side progress.');
    const total=count(side,['total']),completed=count(side,['completed']),remaining=count(side,['remaining']);
    const contributions=Object.fromEntries(['human','agent','unknown'].map((key)=>[key,count(side,[`contributions.${key}`])]));
    const byExecutionMode=Object.fromEntries(['simulated_fast_forward','robot','human','unknown'].map((key)=>[key,count(side,[`byExecutionMode.${key}`])]));
    if (total>required||completed>accepted||completed+remaining!==total
      ||Object.values(contributions).reduce((sum,item)=>sum+item,0)!==completed
      ||Object.values(byExecutionMode).reduce((sum,item)=>sum+item,0)!==completed) {
      throw new MissionError('CONSTRUCTION_ERROR','Construction returned inconsistent advisory-side progress.');
    }
    byAdvisorySide[actor]={total,completed,remaining,contributions,byExecutionMode};
  }
  if (byAdvisorySide.human.total+byAdvisorySide.agent.total!==required
    ||byAdvisorySide.human.completed+byAdvisorySide.agent.completed!==accepted) {
    throw new MissionError('CONSTRUCTION_ERROR','Advisory-side progress does not match authoritative build progress.');
  }
  // Fixed fields only: no target lists, raw plans, or future unbounded metadata.
  return {schemaVersion:value.schemaVersion,mode:value.mode,advisoryOnly:true,axis:value.axis,
    centreLocalZ:value.centreLocalZ,centrelineToleranceLocal:value.centrelineToleranceLocal,
    negativeSideActor:value.negativeSideActor,positiveSideActor:value.positiveSideActor,centrelineActor:value.centrelineActor,byAdvisorySide};
}
function progressRecord(value,frozen) {
  const source=serviceResult(value,'CONSTRUCTION_ERROR','ConstructionService could not read build progress.');
  const identity=source.identity??source.plan??source;
  const missionId=identity.missionId??source.missionId;
  const planId=identity.planId??source.planId;
  const checksum=identity.designChecksum??identity.planChecksum??source.designChecksum??source.planChecksum;
  if (!missionId||!planId||!checksum) throw new MissionError('CONSTRUCTION_ERROR','ConstructionService did not return the full frozen identity.');
  if (missionId!==frozen.missionId) throw new MissionError('STALE_MISSION','Construction progress belongs to another mission.');
  if (planId!==frozen.planId||checksum!==frozen.designChecksum) throw new MissionError('STALE_PLAN','Construction progress does not match the frozen plan.');
  const required=count(source,['required','requiredCount','totalRequired','progress.required'],frozen.requiredPlacementIds.length);
  const accepted=count(source,['accepted','acceptedCount','progress.accepted']);
  const remaining=count(source,['remaining','remainingCount','progress.remaining'],Math.max(0,required-accepted));
  const correct=count(source,['correct','correctCount','progress.correct'],accepted);
  const incorrect=count(source,['incorrect','incorrectCount','progress.incorrect']);
  if (required!==frozen.requiredPlacementIds.length||accepted>required||remaining>required||accepted+remaining!==required||correct>accepted||incorrect>accepted||correct+incorrect!==accepted) {
    throw new MissionError('CONSTRUCTION_ERROR','ConstructionService returned inconsistent progress counts.');
  }
  return { required,accepted,remaining,correct,incorrect,
    human:count(source,['human','humanCount','user','userCount','actors.human','actors.user','contributions.human','contributions.user']),
    codex:count(source,['codex','codexCount','agent','agentCount','actors.codex','actors.agent','contributions.codex','contributions.agent']),
    blocked:count(source,['blocked','blockedCount','progress.blocked']),waitingSource:count(source,['waitingSource','waitingSourceCount','progress.waitingSource']),
    robotStatus:compact(source.robotStatus??source.robot?.status,64),worldRevision:integer(source.worldRevision)?source.worldRevision:null,
    collaboration:collaborationRecord(source.sourceProgress?.collaboration??source.collaboration,{required,accepted}),
    supportSource:get(source,['supportSource','acceptedSnapshot.supportSource','supportSnapshot.supportSource']),
    acceptedSnapshot:cloneValue(source.acceptedSnapshot??source.supportSnapshot??source.testSnapshot??null) };
}
function supportSnapshotRecord(value,frozen,progress,currentWorldRevision) {
  if (!value||typeof value!=='object'||Array.isArray(value)) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','ConstructionService returned no valid BUILD_BOARD snapshot.');
  if (value.supportSource!==BUILD_BOARD_SOURCE) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','The support snapshot source must be BUILD_BOARD.');
  const identity=value.identity??value;
  const missionId=identity.missionId??value.missionId;
  const planId=identity.planId??value.planId;
  const designChecksum=identity.designChecksum??identity.planChecksum??value.designChecksum??value.planChecksum;
  if (!missionId||!planId||!designChecksum) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','The BUILD_BOARD snapshot must include the full frozen identity.');
  if (missionId!==frozen.missionId||planId!==frozen.planId||designChecksum!==frozen.designChecksum) throw new MissionError('STALE_PLAN','The BUILD_BOARD snapshot belongs to another mission plan.');
  if (!integer(value.worldRevision)) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','The BUILD_BOARD snapshot must include a valid world revision.');
  if (value.worldRevision!==currentWorldRevision) throw new MissionError('STALE_WORLD_REVISION','The BUILD_BOARD snapshot world revision is stale.');
  if (!Array.isArray(value.acceptedPlacementIds)) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','The BUILD_BOARD snapshot must include acceptedPlacementIds.');
  const acceptedPlacementIds=value.acceptedPlacementIds.map((item,index)=>safeId(item,`acceptedPlacementIds[${index}]`,{code:'INVALID_SUPPORT_SNAPSHOT'}));
  if (new Set(acceptedPlacementIds).size!==acceptedPlacementIds.length) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','The BUILD_BOARD snapshot contains duplicate accepted placement IDs.');
  if (acceptedPlacementIds.length!==progress.accepted) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','The BUILD_BOARD snapshot count does not match authoritative accepted progress.');
  const foreign=acceptedPlacementIds.find((id)=>!frozen.requiredPlacementIds.includes(id));
  if (foreign) throw new MissionError('STALE_PLAN','The BUILD_BOARD snapshot contains a placement outside the frozen plan.');
  const snapshotId=evidence(value.snapshotId??value.id,'supportSnapshotId',{required:false,code:'INVALID_SUPPORT_SNAPSHOT'});
  const snapshotChecksum=evidence(value.checksum,'supportSnapshotChecksum',{required:false,code:'INVALID_SUPPORT_SNAPSHOT'});
  if (!snapshotId&&!snapshotChecksum) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','The BUILD_BOARD snapshot needs an ID or checksum.');
  return { raw:cloneValue(value),snapshotId,snapshotChecksum,acceptedPlacementIds };
}
function serviceIdentity(value) {
  const source=value?.identity??value?.testIdentity??value??{};
  return {
    missionId:source.missionId??value?.missionId,
    challengeId:source.challengeId??value?.challengeId,
    planId:source.planId??value?.planId,
    designChecksum:source.designChecksum??source.planChecksum??value?.designChecksum??value?.planChecksum,
    designRevision:source.designRevision??value?.designRevision,
    worldTransform:source.worldTransform??value?.worldTransform,
    requiredPlacementIds:source.requiredPlacementIds??value?.requiredPlacementIds,
    partRegistryRevision:source.partRegistryRevision??value?.partRegistryRevision,
    partRegistryHash:source.partRegistryHash??value?.partRegistryHash,
    partRegistryIdentity:source.partRegistryIdentity??value?.partRegistryIdentity,
    testId:source.testId??value?.testId
  };
}
function assertIdentity(value,frozen,{testId=null,test=false,required=true}={}) {
  const identity=serviceIdentity(value); const code=test?'STALE_TRAIN_RESULT':'STALE_PLAN';
  if (required&&(!identity.missionId||!identity.planId||!identity.designChecksum)) throw new MissionError(test?'INVALID_TRAIN_RESULT':'STALE_PLAN','The service did not return the full frozen identity.');
  if (identity.missionId!==frozen.missionId||identity.planId!==frozen.planId||identity.designChecksum!==frozen.designChecksum) throw new MissionError(code,'The service result does not match the frozen mission plan.');
  for (const key of ['challengeId','designRevision','partRegistryRevision','partRegistryHash']) {
    if (identity[key]!==undefined&&identity[key]!==null&&frozen[key]!==undefined&&frozen[key]!==null&&identity[key]!==frozen[key]) throw new MissionError(code,`The service result does not match ${key}.`);
  }
  if (identity.worldTransform&&frozen.worldTransform&&!sameStructuredValue(identity.worldTransform,frozen.worldTransform)) throw new MissionError(code,'The service result does not match worldTransform.');
  if (Array.isArray(identity.requiredPlacementIds)&&Array.isArray(frozen.requiredPlacementIds)&&frozen.requiredPlacementIds.length&&!sameIdSet(identity.requiredPlacementIds,frozen.requiredPlacementIds)) throw new MissionError(code,'The service result does not match requiredPlacementIds.');
  if (identity.partRegistryIdentity&&frozen.partRegistryIdentity&&!sameStructuredValue(identity.partRegistryIdentity,frozen.partRegistryIdentity)) throw new MissionError(code,'The service result does not match PartRegistry identity.');
  if (test&&(!identity.testId||identity.testId!==testId)) throw new MissionError(identity.testId?'STALE_TRAIN_RESULT':'INVALID_TRAIN_RESULT','The train result does not match the active test.');
}
function verifyWorld(services,values,invalidCode,context) {
  const current=readWorldRevision(services);
  for (const value of values) {
    if (value===undefined||value===null) continue;
    if (!integer(value)) throw new MissionError(invalidCode,`${context} returned an invalid world revision.`);
    if (value!==current) throw new MissionError('STALE_WORLD_REVISION',`The world changed while ${context} completed.`);
  }
  return current;
}
function outcome(value) {
  if (typeof value!=='string'||!/^[A-Z][A-Z0-9_.:-]{0,63}$/.test(value)) throw new MissionError('INVALID_TRAIN_RESULT','TrainService returned an invalid outcome.');
  return value;
}
function nextActions(phase) {
  if (phase==='DESIGN') return ['get_bridge_design','update_bridge_design','start_bridge_build'];
  if (phase==='BUILD') return ['get_build_progress','build_next_parts','test_bridge'];
  if (phase==='TEST') return ['get_mission_state'];
  return ['reset_mission'];
}
function idFactory() { return `mission-${globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`; }

export class MissionService {
  constructor(services={},options={}) {
    requireMissionServices(services); this.services=services; this.makeId=options.idFactory??idFactory; this.now=options.now??(()=>new Date());
    this.events=options.events??createMissionEventAdapter({sink:options.eventSink,now:this.now});
    this.missionId=safeId(this.makeId(),'missionId'); this.phase='DESIGN'; this.missionRevision=0; this.frozen=null; this.lastTest=null; this.active=null; this.epoch=0;
    this._event('DESIGN','New mission session.');
  }
  _event(type,summary,actor='system',plan=this.frozen) { return this.events.emit({missionId:this.missionId,phase:this.phase,type,actor,planId:plan?.planId??null,designChecksum:plan?.designChecksum??null,summary}); }
  _revisions(designRevision=this.frozen?.designRevision??null,worldRevision=null) {
    if (!integer(worldRevision)) { try { worldRevision=readWorldRevision(this.services); } catch { worldRevision=null; } }
    return {missionRevision:this.missionRevision,worldRevision,designRevision};
  }
  _error(error,fallback='INTERNAL_ERROR',designRevision=null) {
    const safe=toMissionError(error,fallback); const policy=errorPolicy(safe.code);
    return {ok:false,error:{code:safe.code,message:safe.message,retryable:policy.retryable,recovery:policy.recovery,allowedNextActions:nextActions(this.phase).filter((action)=>safe.code!=='LEVEL3_ONLY'||action!=='test_bridge')},missionId:this.missionId,phase:this.phase,revisions:this._revisions(designRevision)};
  }
  _session(input,{world=false}={}) {
    if (!input||typeof input!=='object'||Array.isArray(input)) throw new MissionError('INVALID_PARAMETER','Tool input must be an object.');
    if (input.expectedMissionId!==this.missionId) throw new MissionError('STALE_MISSION','The mission ID is stale.');
    if (!integer(input.expectedMissionRevision)||input.expectedMissionRevision!==this.missionRevision) throw new MissionError('STALE_MISSION_REVISION','The mission revision is stale.');
    if (world) {
      if (!integer(input.expectedWorldRevision)) throw new MissionError('INVALID_PARAMETER','expectedWorldRevision must be a non-negative safe integer.');
      if (input.expectedWorldRevision!==readWorldRevision(this.services)) throw new MissionError('STALE_WORLD_REVISION','The world revision is stale.');
    }
  }
  _phase(...allowed) { if (!allowed.includes(this.phase)) throw new MissionError('INVALID_PHASE',`This action is not valid in ${this.phase}.`); }
  _frozen() { if (!this.frozen) throw new MissionError('PLAN_NOT_FROZEN','No bridge plan is frozen.'); return this.frozen; }
  _robotIdle() { const state=robotRecord(readRobotState(this.services)); if (!state.idle) throw new MissionError('ROBOT_BUSY','The robot must be idle.'); if (!state.gripperEmpty) throw new MissionError('GRIPPER_NOT_EMPTY','The gripper must be empty.'); return state; }
  _begin(type,externalSignal) {
    if (this.active) throw new MissionError(this.active.type==='test'?'TEST_IN_PROGRESS':this.active.type==='build'||this.active.type==='startBuild'?'BUILD_IN_PROGRESS':'OPERATION_IN_PROGRESS','Another mission operation is active.');
    const controller=new AbortController(); const operation={type,token:Symbol(type),epoch:this.epoch,missionId:this.missionId,controller,signal:mergeSignals(externalSignal,controller.signal)};
    this.active=operation; return operation;
  }
  _check(operation) { assertNotAborted(operation.signal); if (this.active?.token!==operation.token||operation.epoch!==this.epoch||operation.missionId!==this.missionId) throw new MissionError('CANCELLED','The operation was superseded.'); }
  _end(operation) { if (this.active?.token===operation.token) this.active=null; }
  async _challenge() { return challengeRecord(await this.services.challengeService.getActiveChallenge()); }
  async _design() { return designRecord(await this.services.bridgeDesignService.getDesignState({includeCapabilities:false})); }
  async _progress() { return progressRecord(await this.services.constructionService.getProgress({identity:cloneValue(this._frozen())}),this.frozen); }

  checkDesignMutationAllowed() {
    try { this._phase('DESIGN'); if (this.frozen) throw new MissionError('INVALID_PHASE','Reset before changing a frozen design.'); if (this.active) throw new MissionError('OPERATION_IN_PROGRESS','A mission operation is active.'); return {ok:true,missionId:this.missionId,phase:this.phase,revisions:this._revisions()}; }
    catch (error) { return this._error(error); }
  }
  recordDesignActivity(toolName,result={}) {
    if (this.phase!=='DESIGN'||result?.ok===false) return null;
    const planId=result.planId??result.buildPlanSummary?.planId??result.summary?.planId;
    const designChecksum=result.designChecksum??result.buildPlanSummary?.designChecksum??result.summary?.designChecksum;
    return this._event(result.changed===false?'DESIGN':'COMPILE',result.changed===false?`Bridge design unchanged by ${toolName}.`:`Bridge design compiled by ${toolName}.`,'agent',planId&&designChecksum?{planId,designChecksum}:null);
  }

  async getMissionState({detail='summary',eventCursor=0,eventLimit=10}={}) {
    try {
      if (!['summary','detail'].includes(detail)||!integer(eventCursor)||!integer(eventLimit,1)||eventLimit>20) throw new MissionError('INVALID_PARAMETER','Invalid detail or event paging input.');
      const [challenge,design,robotRaw,train]=await Promise.all([
        this._challenge(),this._design(),Promise.resolve(readRobotState(this.services)),
        Promise.resolve().then(()=>this.services.trainService.getState()).then(trainRecord).catch(()=>({state:'unavailable',result:null}))
      ]);
      const robot=robotRecord(robotRaw); let build=null;
      if (this.frozen) { const p=await this._progress(); build={required:p.required,accepted:p.accepted,remaining:p.remaining,correct:p.correct,incorrect:p.incorrect,human:p.human,codex:p.codex,blocked:p.blocked,waitingSource:p.waitingSource}; }
      const actions=nextActions(this.phase).filter((action)=>train.enabled!==false||action!=='test_bridge');
      const result={ok:true,missionId:this.missionId,phase:this.phase,summary:`${this.phase}: ${actions[0]}.`,
        challenge:{id:challenge.id,label:challenge.label,checksum:challenge.checksum},
        bridge:{family:this.frozen?.bridgeSpec?.family??design.family,designRevision:this.frozen?.designRevision??design.designRevision},
        plan:{planId:this.frozen?.planId??design.planId,designChecksum:this.frozen?.designChecksum??design.designChecksum,frozen:Boolean(this.frozen)},
        build,robot,train,revisions:this._revisions(this.frozen?.designRevision??design.designRevision),nextActions:actions};
      if (detail==='detail') {
        result.freeze=this.frozen?{challengeId:this.frozen.challengeId,requiredPartCount:this.frozen.requiredPlacementIds.length,partRegistryRevision:this.frozen.partRegistryRevision,partRegistryHash:this.frozen.partRegistryHash,partRegistryIdentity:cloneValue(this.frozen.partRegistryIdentity),timestamp:this.frozen.freezeTimestamp,sequence:this.frozen.freezeSequence,worldRevisionAtFreeze:this.frozen.worldRevisionAtFreeze}:null;
        result.draftDesign=this.frozen?{designRevision:design.designRevision,planId:design.planId,designChecksum:design.designChecksum,differsFromFrozen:design.designRevision!==this.frozen.designRevision||design.planId!==this.frozen.planId||design.designChecksum!==this.frozen.designChecksum}:null;
        result.lastTest=cloneValue(this.lastTest); result.activity=this.events.page({cursor:eventCursor,limit:eventLimit});
      }
      return result;
    } catch (error) { return this._error(error); }
  }

  async getTerrainOptions({cursor=0,limit=5}={}) {
    try {
      if (!integer(cursor)||!integer(limit,1)||limit>20) throw new MissionError('INVALID_PARAMETER','cursor must be non-negative and limit must be from 1 to 20.');
      const raw=serviceResult(await this.services.challengeService.getOptions({cursor,limit}),'SERVICE_UNAVAILABLE','ChallengeService could not read terrain options.');
      const active=await this._challenge(); const source=Array.isArray(raw)?raw:raw.options??raw.challenges??raw.items??[];
      if (!Array.isArray(source)) throw new MissionError('SERVICE_UNAVAILABLE','ChallengeService returned invalid terrain options.');
      const total=integer(raw.totalAvailable)?raw.totalAvailable:source.length;
      const servicePage=(Array.isArray(raw)?source.slice(cursor,cursor+limit):source.slice(0,limit)).map(challengeRecord);
      const serviceReturnedCount=servicePage.length;
      const serviceNextCursor=raw.nextCursor??(cursor+serviceReturnedCount<total?cursor+serviceReturnedCount:null);
      if (total<cursor+serviceReturnedCount||(serviceNextCursor!==null&&(!integer(serviceNextCursor)||serviceNextCursor<=cursor))) throw new MissionError('SERVICE_UNAVAILABLE','ChallengeService returned invalid pagination metadata.');
      const options=[]; const base={ok:true,missionId:this.missionId,phase:this.phase,activeChallengeId:active.id,cursor,limit,totalAvailable:total,revisions:this._revisions(),nextActions:this.phase==='DESIGN'?['select_terrain','get_bridge_design']:nextActions(this.phase)};
      for (const {id,label,description,enabled,checksum} of servicePage) {
        const candidate=[...options,{id,label,description,enabled,checksum}];
        const candidateNext=cursor+candidate.length<total?cursor+candidate.length:null;
        const preview={...base,summary:`${candidate.length} of ${total} terrain options returned.`,returnedCount:candidate.length,nextCursor:candidateNext,options:candidate};
        if (options.length&&JSON.stringify(preview).length>1450) break;
        options.push(candidate.at(-1));
      }
      const returnedCount=options.length;
      const nextCursor=returnedCount<serviceReturnedCount?cursor+returnedCount:serviceNextCursor;
      return {...base,summary:`${returnedCount} of ${total} terrain options returned.`,returnedCount,nextCursor,options};
    } catch (error) { return this._error(error); }
  }

  async selectTerrain(input={},options={}) {
    let operation=null;
    try {
      this._phase('DESIGN'); this._session(input,{world:true}); const id=challengeId(input.challengeId); operation=this._begin('terrain',options.signal); this._check(operation);
      const raw=serviceResult(await this.services.challengeService.selectChallenge({challengeId:id,expectedWorldRevision:input.expectedWorldRevision,signal:operation.signal}),'CHALLENGE_NOT_FOUND','ChallengeService rejected the selected terrain.');
      this._check(operation); const selected=challengeRecord(raw); if (selected.id!==id||!selected.enabled) throw new MissionError('CHALLENGE_NOT_FOUND','The requested challenge is not enabled.');
      const worldRevision=verifyWorld(this.services,[raw.worldRevision],'SERVICE_UNAVAILABLE','ChallengeService terrain selection');
      this.missionRevision+=1; this._event('SCOUT',`Selected terrain ${selected.id}.`,'agent',null);
      return {ok:true,missionId:this.missionId,phase:this.phase,summary:`Terrain ${selected.label} selected.`,challenge:{id:selected.id,label:selected.label,checksum:selected.checksum},revisions:this._revisions(null,worldRevision),nextActions:['get_bridge_design','update_bridge_design','start_bridge_build']};
    } catch (error) { return this._error(error); } finally { if (operation) this._end(operation); }
  }

  async startBridgeBuild(input={},options={}) {
    let operation=null,candidate=null,initialised=false;
    try {
      this._phase('DESIGN'); this._session(input,{world:true}); if (!integer(input.expectedDesignRevision)) throw new MissionError('INVALID_PARAMETER','expectedDesignRevision must be a non-negative safe integer.'); this._robotIdle();
      operation=this._begin('startBuild',options.signal); const [design,challenge]=await Promise.all([this._design(),this._challenge()]); this._check(operation);
      if (!challenge.enabled) throw new MissionError('CHALLENGE_NOT_FOUND','The active challenge is not enabled.');
      if (design.designRevision!==input.expectedDesignRevision) throw new MissionError('STALE_DESIGN_REVISION','The bridge design revision is stale.');
      const compile=this.services.bridgeHost.getCompileState();
      if (!compile?.ready||compile.mutationActive) throw new MissionError('START_BUILD_FAILED','The bridge design is not compiled and ready.');
      if (compile.designRevision!==design.designRevision||compile.planId!==design.planId||compile.designChecksum!==design.designChecksum) throw new MissionError('STALE_DESIGN_REVISION','BridgeHost and BridgeDesignService do not share one current design.');
      const hostChallenge=compile.challenge??this.services.bridgeHost.challenge??null;
      if (hostChallenge&&typeof hostChallenge==='object') {
        const hostChallengeId=get(hostChallenge,['id','challengeId'],null);
        const expectedHostChallengeId=get(challenge.raw,['bridgeChallengeId','bridgeHostChallengeId'],challenge.id);
        if (hostChallengeId&&challengeId(hostChallengeId,'BridgeHost challengeId')!==expectedHostChallengeId) throw new MissionError('STALE_PLAN','BridgeHost was compiled for another challenge.');
        const hostChallengeChecksum=get(hostChallenge,['checksum','challengeChecksum'],null);
        if (hostChallengeChecksum&&challenge.checksum&&evidence(hostChallengeChecksum,'BridgeHost challengeChecksum',{code:'START_BUILD_FAILED'})!==challenge.checksum) throw new MissionError('STALE_PLAN','BridgeHost challenge checksum does not match ChallengeService.');
      }
      const buildPlan=this.services.bridgeHost.exportPlan();
      if (!buildPlan||typeof buildPlan!=='object'||Array.isArray(buildPlan)||buildPlan.schemaVersion!=='4.6'||buildPlan.planId!==design.planId||buildPlan.designChecksum!==design.designChecksum||buildPlan.designRevision!==design.designRevision) throw new MissionError('START_BUILD_FAILED','BridgeHost did not export the current valid V4.6 BuildPlan.');
      const worldTransform=cloneValue(this.services.bridgeHost.worldTransform??buildPlan.worldTransform??null);
      if (!worldTransform||typeof worldTransform!=='object'||Array.isArray(worldTransform)) throw new MissionError('START_BUILD_FAILED','The bridge has no valid worldTransform.');
      this._event('COMPILE',`Validated compiled plan ${design.planId}.`,'system',{planId:design.planId,designChecksum:design.designChecksum});
      candidate={schemaVersion:'robo-bridge.mission-freeze.v1',missionId:this.missionId,challengeId:challenge.id,challengeChecksum:challenge.checksum,bridgeSpec:cloneValue(design.bridgeSpec),designRevision:design.designRevision,planId:design.planId,designChecksum:design.designChecksum,worldTransform,requiredPlacementIds:[],partRegistryRevision:null,partRegistryHash:null,partRegistryIdentity:null,freezeTimestamp:null,freezeSequence:null,worldRevisionAtFreeze:null};
      if (readWorldRevision(this.services)!==input.expectedWorldRevision) throw new MissionError('STALE_WORLD_REVISION','The world changed before construction initialisation.');
      const started=serviceResult(await this.services.constructionService.startBuild({identity:cloneValue(candidate),buildPlan:cloneValue(buildPlan),worldTransform,expectedWorldRevision:input.expectedWorldRevision,signal:operation.signal}),'START_BUILD_FAILED','ConstructionService could not initialise the build.');
      initialised=true; this._check(operation); assertIdentity(started,candidate);
      const requiredPlacementIds=uniqueIds(started.requiredPlacementIds??started.identity?.requiredPlacementIds);
      const planCount=get(buildPlan,['billOfMaterials.totalPhysicalParts'],undefined);
      if (!integer(planCount,1)||planCount!==requiredPlacementIds.length) throw new MissionError('START_BUILD_FAILED','Required placements do not match the BuildPlan part count.');
      candidate.requiredPlacementIds=requiredPlacementIds;
      candidate.partRegistryRevision=revisionEvidence(started.partRegistryRevision??started.identity?.partRegistryRevision,'partRegistryRevision',{code:'START_BUILD_FAILED'});
      candidate.partRegistryHash=evidence(started.partRegistryHash??started.identity?.partRegistryHash,'partRegistryHash',{required:false,code:'START_BUILD_FAILED'});
      candidate.partRegistryIdentity=cloneValue(started.partRegistryIdentity??started.identity?.partRegistryIdentity??null);
      const date=this.now(); candidate.freezeTimestamp=(date instanceof Date?date:new Date(date)).toISOString(); candidate.freezeSequence=this.events.nextSequence;
      const actorSplit=started.actorSplit?{human:count(started.actorSplit,['human','user'],0,'START_BUILD_FAILED','actorSplit.human'),codex:count(started.actorSplit,['codex','agent'],0,'START_BUILD_FAILED','actorSplit.codex')}:null;
      candidate.worldRevisionAtFreeze=verifyWorld(this.services,[started.worldRevision],'START_BUILD_FAILED','ConstructionService build initialisation');
      this.frozen=deepFreeze(cloneValue(candidate)); this.phase='BUILD'; this.missionRevision+=1; this._event('FREEZE',`Froze ${candidate.planId} with ${requiredPlacementIds.length} required parts.`,'agent');
      return {ok:true,missionId:this.missionId,phase:this.phase,summary:`Build started with ${requiredPlacementIds.length} required parts.`,plan:{planId:candidate.planId,designChecksum:candidate.designChecksum,frozen:true},requiredPartCount:requiredPlacementIds.length,actorSplit,revisions:this._revisions(candidate.designRevision,candidate.worldRevisionAtFreeze),nextActions:nextActions(this.phase)};
    } catch (error) {
      const same=operation&&operation.epoch===this.epoch&&operation.missionId===this.missionId;
      if (same&&this.phase==='DESIGN') {
        try { await this.services.constructionService.cancel({reason:'start_build_failed',identity:cloneValue(candidate)}); } catch {}
        if (initialised) try { await this.services.constructionService.reset({reason:'start_build_failed',identity:cloneValue(candidate),expectedWorldRevision:readWorldRevision(this.services)}); } catch {}
        this._event('RECOVER',`Build start stopped: ${toMissionError(error,'START_BUILD_FAILED').code}.`,'system',candidate);
      }
      return this._error(error,'START_BUILD_FAILED',input.expectedDesignRevision);
    } finally { if (operation) this._end(operation); }
  }

  async getBuildProgress() {
    try {
      if (this.phase==='DESIGN'||!this.frozen) throw new MissionError('BUILD_NOT_STARTED','The bridge build has not started.');
      const p=await this._progress(); const robot=robotRecord(readRobotState(this.services));
      return {ok:true,missionId:this.missionId,phase:this.phase,summary:`${p.accepted}/${p.required} parts accepted.`,plan:{planId:this.frozen.planId,designChecksum:this.frozen.designChecksum},build:{required:p.required,accepted:p.accepted,remaining:p.remaining,correct:p.correct,incorrect:p.incorrect,human:p.human,codex:p.codex,blocked:p.blocked,waitingSource:p.waitingSource},...(p.collaboration?{collaboration:p.collaboration}:{}),robot,revisions:this._revisions(this.frozen.designRevision,p.worldRevision),nextActions:nextActions(this.phase)};
    } catch (error) { return this._error(error); }
  }

  async buildNextParts(input={},options={}) {
    let operation=null;
    try {
      this._phase('BUILD'); this._session(input,{world:true}); const frozen=this._frozen(); if (!integer(input.count,1)||input.count>5) throw new MissionError('INVALID_PARAMETER','count must be an integer from 1 to 5.'); this._robotIdle();
      const executionMode=input.executionMode??'robot';
      if (!['robot','simulated_fast_forward'].includes(executionMode)) throw new MissionError('INVALID_PARAMETER','Unknown executionMode.');
      if (input.cycleTimeMs!==undefined&&(!integer(input.cycleTimeMs,250)||input.cycleTimeMs>60000)) throw new MissionError('INVALID_PARAMETER','cycleTimeMs must be an integer from 250 to 60000.');
      if (input.actorHint!==undefined&&!['human','agent'].includes(input.actorHint)) throw new MissionError('INVALID_PARAMETER','actorHint must be human or agent.');
      operation=this._begin('build',options.signal);
      const before=await this._progress(); this._check(operation);
      if (before.worldRevision!==null&&before.worldRevision!==input.expectedWorldRevision) throw new MissionError('STALE_WORLD_REVISION','The world changed before construction execution.');
      const result=serviceResult(await this.services.constructionService.buildNextParts({identity:cloneValue(frozen),count:input.count,executionMode,
        ...(input.cycleTimeMs===undefined?{}:{cycleTimeMs:input.cycleTimeMs}),...(input.actorHint===undefined?{}:{actorHint:input.actorHint}),
        expectedWorldRevision:input.expectedWorldRevision,signal:operation.signal}),'CONSTRUCTION_ERROR','ConstructionService could not build the requested parts.');
      this._check(operation); assertIdentity(result,frozen); const completed=count(result,['completed','completedCount'],0,'CONSTRUCTION_ERROR','completed'); if (completed>input.count) throw new MissionError('CONSTRUCTION_ERROR','ConstructionService completed more parts than requested.');
      const p=progressRecord(result.progress??await this.services.constructionService.getProgress({identity:cloneValue(frozen)}),frozen);
      if (p.accepted-before.accepted!==completed) throw new MissionError('CONSTRUCTION_ERROR','ConstructionService completed count does not match authoritative accepted progress.');
      const worldRevision=verifyWorld(this.services,[result.worldRevision,p.worldRevision],'CONSTRUCTION_ERROR','ConstructionService build execution');
      let lastPlacement=null;
      if (completed>0&&!result.lastPlacement) throw new MissionError('CONSTRUCTION_ERROR','ConstructionService must return the last completed placement.');
      if (result.lastPlacement) {
        const placementId=safeId(result.lastPlacement.placementId,'lastPlacement.placementId',{required:false,code:'CONSTRUCTION_ERROR'});
        if (placementId&&!frozen.requiredPlacementIds.includes(placementId)) throw new MissionError('STALE_PLAN','ConstructionService returned a placement outside the frozen plan.');
        lastPlacement={placementId,actor:compact(result.lastPlacement.actor,32,'codex'),status:compact(result.lastPlacement.status,64),sourceReassigned:Boolean(result.lastPlacement.sourceReassigned)};
      }
      this.missionRevision+=1; this._event('BUILD',`Codex completed ${completed} of ${input.count} requested parts (${executionMode}).`,'codex');
      const robot=robotRecord(readRobotState(this.services));
      return {ok:true,missionId:this.missionId,phase:this.phase,executionMode,summary:`${completed} parts completed (${executionMode}); ${p.remaining} remain.`,plan:{planId:frozen.planId,designChecksum:frozen.designChecksum},requested:input.count,completed,remaining:p.remaining,blocked:p.blocked,waitingSource:p.waitingSource,lastPlacement,robot,revisions:this._revisions(frozen.designRevision,worldRevision),nextActions:nextActions(this.phase)};
    } catch (error) {
      const same=operation&&operation.epoch===this.epoch&&operation.missionId===this.missionId;
      if (same&&toMissionError(error).code==='CANCELLED') try { await this.services.constructionService.cancel({reason:'cancelled',identity:cloneValue(this.frozen)}); } catch {}
      return this._error(error,'CONSTRUCTION_ERROR');
    } finally { if (operation) this._end(operation); }
  }

  async testBridge(input={},options={}) {
    let operation=null,entered=false;
    try {
      if (this.phase==='TEST'||this.active?.type==='test') throw new MissionError('TEST_IN_PROGRESS','A train test is already active.');
      this._phase('BUILD'); this._session(input,{world:true}); const frozen=this._frozen(); this._robotIdle(); assertNotAborted(options.signal);
      const trainState=await this.services.trainService.getState(); assertNotAborted(options.signal); assertTrainReady(trainState);
      // The readiness read can yield. Recheck the live session before reserving
      // TEST so a disabled Level 2 train never starts mutation bookkeeping.
      if (this.phase==='TEST'||this.active?.type==='test') throw new MissionError('TEST_IN_PROGRESS','A train test is already active.');
      this._phase('BUILD'); this._session(input,{world:true}); this._robotIdle(); operation=this._begin('test',options.signal);
      this._check(operation); const p=await this._progress(); this._check(operation);
      const currentWorld=readWorldRevision(this.services); if (currentWorld!==input.expectedWorldRevision||(p.worldRevision!==null&&p.worldRevision!==currentWorld)) throw new MissionError('STALE_WORLD_REVISION','The world changed while the test snapshot was prepared.');
      const snapshot=p.acceptedSnapshot; const source=p.supportSource??snapshot?.supportSource;
      if (!snapshot||source!==BUILD_BOARD_SOURCE) throw new MissionError('INVALID_SUPPORT_SNAPSHOT','Train TEST requires an authoritative BUILD_BOARD accepted snapshot.');
      const support=supportSnapshotRecord(snapshot,frozen,p,currentWorld);
      const { snapshotId,snapshotChecksum }=support;
      this._robotIdle(); const testId=safeId(this.makeId().replace(/^mission-/,'test-'),'testId');
      const binding=Object.freeze({schemaVersion:'robo-bridge.train-binding.v1',testId,missionId:frozen.missionId,challengeId:frozen.challengeId,planId:frozen.planId,designChecksum:frozen.designChecksum,designRevision:frozen.designRevision,worldTransform:cloneValue(frozen.worldTransform),requiredPlacementIds:[...frozen.requiredPlacementIds],partRegistryRevision:frozen.partRegistryRevision,partRegistryHash:frozen.partRegistryHash,partRegistryIdentity:cloneValue(frozen.partRegistryIdentity),sampledWorldRevision:currentWorld,supportSource:BUILD_BOARD_SOURCE,supportSnapshotId:snapshotId,supportSnapshotChecksum:snapshotChecksum});
      this.phase='TEST'; this.missionRevision+=1; entered=true; this._event('TEST',`Started train test ${testId}.`,'agent');
      const raw=serviceResult(await this.services.trainService.test({identity:cloneValue(frozen),testBinding:cloneValue(binding),acceptedSnapshot:support.raw,signal:operation.signal}),'TRAIN_ERROR','TrainService could not run the bridge test.');
      this._check(operation); assertIdentity(raw,frozen,{testId,test:true});
      if ((raw.supportSource??raw.testedSupportSource??raw.identity?.supportSource)!==BUILD_BOARD_SOURCE) throw new MissionError('INVALID_TRAIN_RESULT','TrainService did not confirm BUILD_BOARD support.');
      const resultSnapshotId=evidence(raw.supportSnapshotId??raw.identity?.supportSnapshotId,'resultSupportSnapshotId',{required:false,code:'INVALID_TRAIN_RESULT'});
      const resultSnapshotChecksum=evidence(raw.supportSnapshotChecksum??raw.identity?.supportSnapshotChecksum,'resultSupportSnapshotChecksum',{required:false,code:'INVALID_TRAIN_RESULT'});
      if ((snapshotId&&resultSnapshotId!==snapshotId)||(snapshotChecksum&&resultSnapshotChecksum!==snapshotChecksum)) throw new MissionError('STALE_TRAIN_RESULT','The train result used another BUILD_BOARD snapshot.');
      const liveFinalWorld=readWorldRevision(this.services);
      const ownedRobotMotion=liveFinalWorld!==currentWorld&&this.services.trainService.validateTestMotion?.({testId,sampledWorldRevision:currentWorld,finalWorldRevision:liveFinalWorld})===true;
      if (ownedRobotMotion&&raw.worldRevision!==liveFinalWorld) throw new MissionError('INVALID_TRAIN_RESULT','Owned Train motion must report the exact final world revision.');
      const resultOutcome=outcome(raw.outcome??raw.result); const resultWorldRevision=verifyWorld(this.services,ownedRobotMotion?[raw.worldRevision]:[raw.worldRevision,currentWorld],'INVALID_TRAIN_RESULT','TrainService test'); this._robotIdle();
      const record=Object.freeze({testId,missionId:frozen.missionId,planId:frozen.planId,designChecksum:frozen.designChecksum,supportSource:BUILD_BOARD_SOURCE,supportSnapshotId:snapshotId,supportSnapshotChecksum:snapshotChecksum,outcome:resultOutcome,firstUnsupportedSegment:compact(raw.firstUnsupportedSegment,160),firstUnsupportedProgress:typeof raw.firstUnsupportedProgress==='number'&&Number.isFinite(raw.firstUnsupportedProgress)&&raw.firstUnsupportedProgress>=0?raw.firstUnsupportedProgress:null});
      if (resultOutcome===TRAIN_CROSSED) {
        if (p.accepted!==p.required||p.correct!==p.required||p.incorrect!==0) throw new MissionError('INVALID_TRAIN_RESULT','CROSSED cannot complete an incomplete or incorrect build.');
        this.lastTest=record; this.phase='COMPLETE'; this.missionRevision+=1; this._event('PASS','Train crossed the frozen bridge. MISSION COMPLETE.','train');
        return {ok:true,missionId:this.missionId,phase:this.phase,summary:'MISSION COMPLETE: train outcome CROSSED.',outcome:resultOutcome,testId,missionComplete:true,testedPlan:{planId:frozen.planId,designChecksum:frozen.designChecksum,supportSource:BUILD_BOARD_SOURCE,supportSnapshotId:snapshotId,supportSnapshotChecksum:snapshotChecksum},revisions:this._revisions(frozen.designRevision,resultWorldRevision),nextActions:nextActions(this.phase)};
      }
      this.lastTest=record; this.phase='BUILD'; this.missionRevision+=1; this._event('RECOVER',`Train outcome ${resultOutcome}; continue the same frozen build.`,'train');
      return {ok:true,missionId:this.missionId,phase:this.phase,summary:`Train outcome ${resultOutcome}; repair and test again.`,outcome:resultOutcome,testId,missionComplete:false,firstUnsupportedSegment:record.firstUnsupportedSegment,firstUnsupportedProgress:record.firstUnsupportedProgress,testedPlan:{planId:frozen.planId,designChecksum:frozen.designChecksum,supportSource:BUILD_BOARD_SOURCE,supportSnapshotId:snapshotId,supportSnapshotChecksum:snapshotChecksum},revisions:this._revisions(frozen.designRevision,resultWorldRevision),nextActions:nextActions(this.phase)};
    } catch (error) {
      const same=operation&&operation.epoch===this.epoch&&operation.missionId===this.missionId;
      if (entered&&same) { this.phase='BUILD'; this.missionRevision+=1; this._event('RECOVER',`Train test stopped: ${toMissionError(error).code}.`); try { await this.services.trainService.cancel?.({reason:'test_stopped',identity:cloneValue(this.frozen)}); } catch {} try { await this.services.trainService.reset({identity:cloneValue(this.frozen)}); } catch {} }
      return this._error(error,'TRAIN_ERROR');
    } finally { if (operation) this._end(operation); }
  }

  async resetMission(input={},options={}) {
    const oldMissionId=this.missionId,oldFrozen=this.frozen;
    try {
      this._session(input,{world:true}); if (input.confirm!==true) throw new MissionError('INVALID_PARAMETER','confirm must be true to reset the mission.'); assertNotAborted(options.signal);
      this.epoch+=1; this.active?.controller.abort('mission_reset');
      await Promise.allSettled([Promise.resolve(this.services.constructionService.cancel({reason:'mission_reset',identity:cloneValue(oldFrozen)})),Promise.resolve(this.services.trainService.cancel?.({reason:'mission_reset',identity:cloneValue(oldFrozen)}))]);
      const [trainReset,constructionReset]=await Promise.all([this.services.trainService.reset({identity:cloneValue(oldFrozen),signal:options.signal}),this.services.constructionService.reset({identity:cloneValue(oldFrozen),expectedWorldRevision:input.expectedWorldRevision,signal:options.signal})]);
      serviceResult(trainReset,'RESET_FAILED','TrainService reset failed.'); serviceResult(constructionReset,'RESET_FAILED','ConstructionService reset failed.'); assertNotAborted(options.signal);
      this.active=null; this.missionId=safeId(this.makeId(),'missionId'); this.phase='DESIGN'; this.missionRevision=0; this.frozen=null; this.lastTest=null; this.events.clear(); this._event('RESET','New DESIGN mission session.','agent',null);
      return {ok:true,missionId:this.missionId,phase:this.phase,summary:'Mission reset. A new DESIGN session is active.',previousMissionId:oldMissionId,plan:{planId:null,designChecksum:null,frozen:false},revisions:this._revisions(),nextActions:['get_terrain_options','get_bridge_design','update_bridge_design','start_bridge_build']};
    } catch (error) { if (this.active?.controller.signal.aborted) this.active=null; return this._error(error,'RESET_FAILED'); }
  }
}
