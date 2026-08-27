import { createCameraRig, CAMERA_IDS } from './camera-rig.js';
import { objectPoseRecord, projectObjectBounds } from './projection.js';
import { visibilityForObject } from './visibility.js';
const MAX_LIMIT=50;
const clone=(v)=>JSON.parse(JSON.stringify(v));
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const x of Object.values(value))freeze(x);}return value;}
export function createObservationService({bridge,cameraRig=createCameraRig()}={}){
  const snapshots=new Map();let sequence=0;let activeDetection=null;
  async function observe(input={}){
    const cameraId=input.cameraId??'tray_camera';
    if(!CAMERA_IDS.includes(cameraId))return{ok:false,reason:'invalid_input',message:'Unknown cameraId.'};
    const limit=Math.min(MAX_LIMIT,Math.max(1,Number.isInteger(input.limit)?input.limit:20));
    if(input.limit!==undefined&&(!Number.isInteger(input.limit)||input.limit<1||input.limit>MAX_LIMIT))return{ok:false,reason:'invalid_input',message:'limit must be 1..50.'};
    const revision=bridge.getWorldRevision();
    const camera=bridge.getCamera?.(cameraId,cameraRig.getSize())??cameraRig.getCamera(cameraId,revision);
    if(!camera)return{ok:false,reason:'invalid_input',message:'Camera unavailable.'};
    const objects=await bridge.world.getVisibleObjects();
    const detections=[];
    for(const object of objects){
      if(input.colour&&String(object.colour).toLowerCase()!==String(input.colour).toLowerCase())continue;
      if(input.type&&object.type!==input.type)continue;
      const projection=projectObjectBounds(object,camera);if(!projection)continue;
      const visibility=visibilityForObject(object,objects,camera);if(!visibility.visible)continue;
      const pose=objectPoseRecord(object);
      detections.push({objectId:object.id,type:object.type??'brick',colour:object.colour??'unknown',bboxPx:projection.bboxPx.map(v=>Math.round(v*10)/10),centrePx:projection.centrePx.map(v=>Math.round(v*10)/10),...pose,visible:true,visibleFraction:visibility.visibleFraction,clipped:projection.clipped,state:object.state??(object.held?'held':'free')});
    }
    detections.sort((a,b)=>b.visibleFraction-a.visibleFraction||a.objectId.localeCompare(b.objectId));
    const snapshot=freeze({ok:true,cameraId,sequence:++sequence,snapshotRevision:revision,widthPx:camera.widthPx,heightPx:camera.heightPx,detections:detections.slice(0,limit)});
    snapshots.set(cameraId,snapshot);return clone(snapshot);
  }
  function getSnapshot(cameraId){const s=snapshots.get(cameraId);return s?clone(s):null;}
  function associateMove({xMm,yMm,zMm,toleranceMm=46}){
    const snapshot=snapshots.get('tray_camera');if(!snapshot)return null;let best=null,bestDistance=Infinity;
    for(const d of snapshot.detections.filter(d=>d.type==='brick')){const dz=Math.min(Math.abs(zMm-d.worldZmm),Math.abs(zMm-(d.worldZmm+35)),Math.abs(zMm-(d.worldZmm+110)));const distance=Math.hypot(xMm-d.worldXmm,yMm-d.worldYmm,dz*0.35);if(distance<bestDistance&&distance<=toleranceMm){best=d;bestDistance=distance;}}
    if(best){activeDetection={...clone(best),snapshotRevision:snapshot.snapshotRevision};return clone(activeDetection);}return null;
  }
  function setActiveObject(objectId){for(const s of snapshots.values()){const d=s.detections.find(x=>x.objectId===objectId);if(d){activeDetection={...clone(d),snapshotRevision:s.snapshotRevision};return clone(activeDetection);}}activeDetection={objectId};return clone(activeDetection);}
  return Object.freeze({observe,getSnapshot,associateMove,setActiveObject,getActiveDetection:()=>activeDetection?clone(activeDetection):null,cameraRig});
}
