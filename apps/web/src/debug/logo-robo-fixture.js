const clone = (v) => JSON.parse(JSON.stringify(v));
const distance = (a,b) => Math.hypot(a.xMm-b.xMm,a.yMm-b.yMm,a.zMm-b.zMm);
const BRICK_SIZE = Object.freeze({xMm:64,yMm:32,zMm:22});

export function createFixtureRuntime({ brickCount = 8 } = {}) {
  let worldRevision=1, robotRevision=1, mode='co-build';
  const trayColours=['white','white','red','white','blue','white','yellow','green'];
  const bricks=Array.from({length:brickCount},(_,i)=>({id:`brick_${String(i+1).padStart(3,'0')}`,type:'brick',colour:trayColours[i%trayColours.length],position:{xMm:300+(i%4)*82,yMm:-245+Math.floor(i/4)*78,zMm:22},bounds:BRICK_SIZE,yawDeg:(i%3-1)*8,state:'free',held:false,occluder:true}));
  const targets=[
    {id:'t_001',type:'target',colour:'white',position:{xMm:-190,yMm:205,zMm:12},bounds:BRICK_SIZE,status:'unfilled',claimOwner:null,placedBrickId:null,occluder:false},
    {id:'t_002',type:'target',colour:'white',position:{xMm:-112,yMm:205,zMm:12},bounds:BRICK_SIZE,status:'unfilled',claimOwner:null,placedBrickId:null,occluder:false},
    {id:'t_003',type:'target',colour:'red',position:{xMm:-34,yMm:205,zMm:12},bounds:BRICK_SIZE,status:'unfilled',claimOwner:null,placedBrickId:null,occluder:false}
  ];
  let robot={tcp:{xMm:180,yMm:-60,zMm:180},speedCapMmS:900,moving:false,heldBrickId:null};
  const bump=()=>{worldRevision+=1;};
  const objectById=(id)=>bricks.find(b=>b.id===id)||targets.find(t=>t.id===id)||null;
  function worldObjects(){return [...bricks,...targets].map(clone);}
  function nearestFreeBrick(tcp){return bricks.filter(b=>b.state==='free').map(b=>({b,d:distance(tcp,b.position)})).sort((a,b)=>a.d-b.d)[0]??null;}
  function nearestTarget(tcp){return targets.map(t=>({t,d:distance(tcp,t.position)})).sort((a,b)=>a.d-b.d)[0]??null;}
  function buildState(filters={}){
    let subset=targets;
    if(filters.status)subset=subset.filter(t=>t.status===filters.status);
    if(filters.colour)subset=subset.filter(t=>t.colour===filters.colour);
    if(filters.claimOwner)subset=subset.filter(t=>(t.claimOwner??'none')===filters.claimOwner);
    subset=subset.slice(0,filters.limit??20);
    const filled=targets.filter(t=>t.status==='filled').length;
    return {ok:true,mode,worldRevision,blueprintId:'fixture-blueprint-001',progress:{filled,total:targets.length,percent:filled/targets.length*100},targets:clone(subset),contributionSummary:{agent:filled,human:0},heldBrickId:robot.heldBrickId,robotSpeedCapMmS:robot.speedCapMmS};
  }
  const runtime={
    getWorldRevision:()=>worldRevision,
    robot:{
      getState:()=>({ok:true,worldRevision,robotRevision,...clone(robot)}),
      async moveTool(request){
        if(!Object.values(request).every(Number.isFinite))return{ok:false,reason:'invalid_input'};
        if(request.speedMmS>robot.speedCapMmS)return{ok:false,reason:'speed_limit',message:'Requested speed exceeds round cap.',speedCapMmS:robot.speedCapMmS};
        if(Math.abs(request.xMm)>850||Math.abs(request.yMm)>650||request.zMm<0||request.zMm>720)return{ok:false,reason:'outside_workspace'};
        if(request.xMm>55&&request.xMm<135&&request.yMm>80&&request.yMm<180&&request.zMm<120)return{ok:false,reason:'collision',message:'Fixture safety pillar blocks this move.',finalTcp:clone(robot.tcp)};
        const start=clone(robot.tcp); robot.tcp={xMm:request.xMm,yMm:request.yMm,zMm:request.zMm}; robotRevision+=1;
        if(robot.heldBrickId){const held=objectById(robot.heldBrickId);held.position={...robot.tcp};held.position.zMm-=28;}
        bump();
        const durationMs=Math.round(distance(start,robot.tcp)/Math.min(request.speedMmS,robot.speedCapMmS)*1000);
        return{ok:true,accepted:true,requested:clone(request),finalTcp:clone(robot.tcp),appliedSpeedMmS:Math.min(request.speedMmS,robot.speedCapMmS),durationMs,worldRevision,robotRevision};
      },
      async latch(){
        if(robot.heldBrickId)return{ok:false,reason:'already_holding',heldBrickId:robot.heldBrickId};
        const nearest=nearestFreeBrick(robot.tcp);
        if(!nearest||nearest.d>42)return{ok:false,reason:'no_brick_in_capture',captureToleranceMm:42,worldRevision};
        nearest.b.state='held';nearest.b.held=true;robot.heldBrickId=nearest.b.id;robotRevision+=1;bump();
        return{ok:true,brick:{id:nearest.b.id,colour:nearest.b.colour},heldBrickId:nearest.b.id,worldRevision,robotRevision};
      },
      async unlatch(){
        if(!robot.heldBrickId)return{ok:false,reason:'not_holding'};
        const brick=objectById(robot.heldBrickId), near=nearestTarget(robot.tcp); let targetSnap=null,correctness=false;
        if(near&&near.d<=54){
          if(near.t.status==='filled'){return{ok:false,reason:'target_occupied',targetId:near.t.id,heldBrickId:brick.id};}
          near.t.status='filled';near.t.placedBrickId=brick.id;brick.position=clone(near.t.position);brick.state='snapped';brick.held=false;targetSnap={targetId:near.t.id};correctness=brick.colour===near.t.colour;
        }else{brick.state='free';brick.held=false;brick.position={...robot.tcp,zMm:22};}
        const released=brick.id;robot.heldBrickId=null;robotRevision+=1;bump();
        return{ok:true,brick:{id:released,colour:brick.colour},finalPose:clone(brick.position),targetSnap,correctness,worldRevision,robotRevision};
      }
    },
    game:{
      getBuildState:async(filters={})=>buildState(filters),
      async claimTarget(id,owner){const target=targets.find(t=>t.id===id);if(!target)return{ok:false,reason:'unknown_target'};if(mode!=='co-build')return{ok:false,reason:'wrong_mode'};if(target.status==='filled')return{ok:false,reason:'target_occupied'};if(target.claimOwner&&target.claimOwner!==owner)return{ok:false,reason:'target_occupied',message:'Target is claimed by another actor.'};target.claimOwner=owner;bump();return{ok:true,targetId:id,claimOwner:owner,worldRevision};}
    },
    world:{getVisibleObjects:async()=>worldObjects(),getObjectById:async(id)=>clone(objectById(id))},
    fixture:{
      getState:()=>({worldRevision,robot:clone(robot),bricks:clone(bricks),targets:clone(targets)}),
      moveBrick(id,position){const b=bricks.find(x=>x.id===id);if(!b)return false;b.position={...b.position,...position};b.state='free';b.held=false;if(robot.heldBrickId===id)robot.heldBrickId=null;bump();return true;},
      takeBrick(id){const b=bricks.find(x=>x.id===id);if(!b)return false;b.visible=false;b.state='taken';bump();return true;},
      fillTarget(id,colour='white',owner='human'){const t=targets.find(x=>x.id===id);if(!t)return false;t.status='filled';t.claimOwner=owner;t.placedBrickId=`human_${id}`;t.colour=t.colour;bump();return true;},
      setMode(value){mode=value;bump();},
      reset(){return createFixtureRuntime({brickCount});}
    }
  };
  return runtime;
}
