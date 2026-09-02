'use strict';
import { createMissionPackage } from '../../apps/web/src/mission/create-mission-package.js';

const clone=(value)=>structuredClone(value);
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{
  if (!ms) return resolve();
  const timer=setTimeout(resolve,ms);
  const abort=()=>{clearTimeout(timer);const error=new Error('cancelled');error.name='AbortError';reject(error);};
  if (signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true});
});

export function createMissionHarness(options={}) {
  let ids=0,worldRevision=options.worldRevision??10,designRevision=1,planNumber=1;
  const idFactory=()=>`mission-test-${++ids}`;
  const robot={operationState:'idle',moving:false,heldBrickId:null,worldRevision};
  let activeChallenge={id:'EASY',label:'Easy ravine',checksum:'challenge-easy-a1',enabled:true,description:'Curated hero terrain.'};
  const challenges=[activeChallenge,{id:'MEDIUM_LOCKED',label:'Medium terrain',checksum:'challenge-medium-a1',enabled:false}];
  const requiredCount=options.requiredCount??6;
  const makePlan=()=>({schemaVersion:'4.6',planId:`plan-${planNumber}`,designChecksum:`checksum-${planNumber}`,designRevision,executionRevision:0,
    billOfMaterials:{totalPhysicalParts:requiredCount},geometry:{family:'aqueduct'},catalogue:{customDefinitions:[]}});
  let plan=makePlan();

  const bridgeHost={
    worldTransform:{id:'main-demo',translationMm:{xMm:500,yMm:0,zMm:0},yawDeg:0,scale:1},
    getCompileState:()=>({state:'ready',ready:true,mutationActive:false,designRevision:plan.designRevision,planId:plan.planId,designChecksum:plan.designChecksum}),
    exportPlan:()=>clone(plan)
  };
  const bridgeDesignService={
    getDesignState:()=>({ok:true,family:'aqueduct',bridgeSpec:{family:'aqueduct',spanCount:3},designRevision:plan.designRevision,planId:plan.planId,designChecksum:plan.designChecksum,compileState:bridgeHost.getCompileState()}),
    patchForTest(){designRevision+=1;planNumber+=1;plan=makePlan();return this.getDesignState();}
  };

  const construction={started:false,identity:null,required:[],accepted:[],human:0,codex:0,incorrect:0,blocked:0,waitingSource:0,
    calls:{startBuild:0,getProgress:0,buildNextParts:0,cancel:0,reset:0},buildDelayMs:options.buildDelayMs??0,startFailure:null,buildFailure:null};
  const identity=()=>construction.identity?{missionId:construction.identity.missionId,planId:construction.identity.planId,designChecksum:construction.identity.designChecksum}:null;
  const snapshot=()=>({schemaVersion:'test.buildboard.v1',identity:identity(),snapshotId:`board-${worldRevision}`,checksum:`board-${worldRevision}-${construction.accepted.length}`,supportSource:'BUILD_BOARD',acceptedPlacementIds:[...construction.accepted],worldRevision});
  const progress=()=>({ok:true,identity:identity(),required:construction.required.length,accepted:construction.accepted.length,remaining:construction.required.length-construction.accepted.length,
    correct:construction.accepted.length-construction.incorrect,incorrect:construction.incorrect,human:construction.human,codex:construction.codex,blocked:construction.blocked,waitingSource:construction.waitingSource,
    robotStatus:robot.operationState,worldRevision,supportSource:'BUILD_BOARD',acceptedSnapshot:snapshot()});
  const constructionService={
    state:construction,
    async startBuild({identity:requestIdentity,buildPlan,signal}){
      construction.calls.startBuild+=1;await sleep(options.startDelayMs??0,signal);if(construction.startFailure)return clone(construction.startFailure);
      construction.started=true;construction.identity=clone(requestIdentity);construction.required=Array.from({length:buildPlan.billOfMaterials.totalPhysicalParts},(_,i)=>`${buildPlan.planId}.p.${i+1}`);construction.accepted=[];construction.human=0;construction.codex=0;construction.incorrect=0;
      worldRevision+=1;robot.worldRevision=worldRevision;
      return {ok:true,identity:identity(),requiredPlacementIds:[...construction.required],partRegistryRevision:'parts-r1',partRegistryHash:'parts-h1',actorSplit:{human:2,codex:Math.max(0,construction.required.length-2)},worldRevision};
    },
    async getProgress(){construction.calls.getProgress+=1;if(!construction.started)return{ok:false,reason:'BUILD_NOT_STARTED',message:'Build not started.'};return progress();},
    async buildNextParts({identity:requestIdentity,count,signal}){
      construction.calls.buildNextParts+=1;if(construction.buildFailure)return clone(construction.buildFailure);await sleep(construction.buildDelayMs,signal);
      const remaining=construction.required.filter((id)=>!construction.accepted.includes(id));const completed=remaining.slice(0,count);
      for(const id of completed){if(signal?.aborted){const error=new Error('cancelled');error.name='AbortError';throw error;}construction.accepted.push(id);construction.codex+=1;worldRevision+=1;}
      robot.worldRevision=worldRevision;
      return {ok:true,identity:{missionId:requestIdentity.missionId,planId:requestIdentity.planId,designChecksum:requestIdentity.designChecksum},completed:completed.length,
        lastPlacement:completed.length?{placementId:completed.at(-1),actor:'codex',status:'ACCEPTED'}:null,progress:progress(),robot:clone(robot),worldRevision};
    },
    async cancel(){construction.calls.cancel+=1;return{ok:true};},
    async reset(){construction.calls.reset+=1;construction.started=false;construction.identity=null;construction.required=[];construction.accepted=[];construction.human=0;construction.codex=0;construction.incorrect=0;worldRevision+=1;robot.worldRevision=worldRevision;return{ok:true,worldRevision};},
    acceptHuman(amount=1){const remaining=construction.required.filter((id)=>!construction.accepted.includes(id));for(const id of remaining.slice(0,amount)){construction.accepted.push(id);construction.human+=1;worldRevision+=1;}robot.worldRevision=worldRevision;}
  };

  const train={state:'READY',result:null,nextOutcome:options.trainOutcome??'TRAIN_FELL',delayMs:options.trainDelayMs??0,staleIdentity:false,omitIdentity:false,wrongSource:false,wrongSnapshot:false,
    calls:{getState:0,test:0,cancel:0,reset:0}};
  const trainService={
    state:train,
    getState(){train.calls.getState+=1;return{ok:true,state:train.state,result:train.result};},
    async test({identity:requestIdentity,testBinding,acceptedSnapshot,signal}){
      train.calls.test+=1;train.state='TESTING';await sleep(train.delayMs,signal);const result=train.nextOutcome;train.result=result;train.state=result==='CROSSED'?'CROSSED':'FAILED';
      const bound=train.staleIdentity?{missionId:'mission-stale',planId:'plan-stale',designChecksum:'checksum-stale',testId:'test-stale'}:{missionId:requestIdentity.missionId,planId:requestIdentity.planId,designChecksum:requestIdentity.designChecksum,testId:testBinding.testId};
      return {ok:true,...(train.omitIdentity?{}:{identity:bound}),outcome:result,supportSource:train.wrongSource?'TRAIN_INTERNAL':acceptedSnapshot.supportSource,
        supportSnapshotId:train.wrongSnapshot?'board-stale':acceptedSnapshot.snapshotId,supportSnapshotChecksum:train.wrongSnapshot?'checksum-stale':acceptedSnapshot.checksum,
        firstUnsupportedSegment:result==='CROSSED'?null:'rail-segment-2',firstUnsupportedProgress:result==='CROSSED'?null:0.34,worldRevision};
    },
    async cancel(){train.calls.cancel+=1;train.state='READY';return{ok:true};},
    async reset(){train.calls.reset+=1;train.state='READY';train.result=null;return{ok:true};}
  };

  const challengeService={
    async getOptions({cursor=0,limit=5}={}){const options=challenges.slice(cursor,cursor+limit);return{ok:true,cursor,limit,returnedCount:options.length,totalAvailable:challenges.length,nextCursor:cursor+options.length<challenges.length?cursor+options.length:null,options:clone(options)};},
    async getActiveChallenge(){return{ok:true,challenge:clone(activeChallenge)};},
    async selectChallenge({challengeId,signal}){await sleep(options.challengeDelayMs??0,signal);const selected=challenges.find((item)=>item.id===challengeId&&item.enabled!==false);if(!selected)return{ok:false,reason:'CHALLENGE_NOT_FOUND',message:'Challenge not available.'};activeChallenge=clone(selected);worldRevision+=1;robot.worldRevision=worldRevision;return{ok:true,challenge:clone(activeChallenge),worldRevision};}
  };
  const runtime={getWorldRevision:()=>worldRevision,robot:{getState:()=>clone(robot)}};
  const robotController={getState:()=>clone(robot)};
  const services={bridgeHost,bridgeDesignService,constructionService,trainService,challengeService,runtime,robotController};
  const events=[];
  const mission=createMissionPackage({...services,eventSink:(event)=>events.push(event)},{idFactory,now:(()=>{let tick=0;return()=>new Date(Date.UTC(2026,8,2,8,0,tick++));})()});
  const sessionInput=(extra={})=>({expectedMissionId:mission.service.missionId,expectedMissionRevision:mission.service.missionRevision,expectedWorldRevision:worldRevision,...extra});
  const startBuild=()=>mission.service.startBridgeBuild(sessionInput({expectedDesignRevision:bridgeDesignService.getDesignState().designRevision}));
  return {...mission,services,bridgeHost,bridgeDesignService,constructionService,trainService,challengeService,runtime,robotController,robot,events,sessionInput,startBuild,
    get worldRevision(){return worldRevision;},setWorldRevision(value){worldRevision=value;robot.worldRevision=value;},setRobotBusy(value=true){robot.operationState=value?'moving':'idle';robot.moving=value;},setHeldPart(id='held-part-1'){robot.heldBrickId=id;},clearHeldPart(){robot.heldBrickId=null;},get plan(){return clone(plan);}};
}
