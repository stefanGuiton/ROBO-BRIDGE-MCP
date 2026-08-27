import { clamp, mat4Vec4, yawPoint } from './math.js';
const EPS=1e-8;
function poseOf(object){
  const p=object.position??object.transform?.position??{};
  return{x:Number(p.xMm??p.x??0),y:Number(p.yMm??p.y??0),z:Number(p.zMm??p.z??0),yaw:Number(object.yawDeg??object.transform?.yawDeg??0)};
}
function sizeOf(object){
  const b=object.bounds??object.size??{};
  return{x:Number(b.xMm??b.x??32),y:Number(b.yMm??b.y??64),z:Number(b.zMm??b.z??20)};
}
export function objectWorldCorners(object){
  const p=poseOf(object),s=sizeOf(object),corners=[];
  for(const sx of[-0.5,0.5])for(const sy of[-0.5,0.5])for(const sz of[-0.5,0.5]){
    const r=yawPoint([s.x*sx,s.y*sy,s.z*sz],p.yaw);corners.push([p.x+r[0],p.y+r[1],p.z+r[2]]);
  }
  return corners;
}
export function topFaceWorldCorners(object){
  const p=poseOf(object),s=sizeOf(object),out=[];
  for(const [sx,sy] of[[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]]){
    const r=yawPoint([s.x*sx,s.y*sy,s.z*0.5],p.yaw);out.push([p.x+r[0],p.y+r[1],p.z+r[2]]);
  }
  return out;
}
export function projectWorldPoint(point,camera){
  const clip=mat4Vec4(camera.viewProjectionMatrix,[point[0],point[1],point[2],1]);
  if(!Number.isFinite(clip[3])||clip[3]<=EPS)return null;
  const ndc=[clip[0]/clip[3],clip[1]/clip[3],clip[2]/clip[3]];
  return{ndc,xPx:(ndc[0]*0.5+0.5)*camera.widthPx,yPx:(1-(ndc[1]*0.5+0.5))*camera.heightPx,inDepth:ndc[2]>=-1&&ndc[2]<=1};
}
export function projectObjectBounds(object,camera){
  const projected=objectWorldCorners(object).map((p)=>projectWorldPoint(p,camera)).filter(Boolean);
  if(!projected.length)return null;
  const ndcX=projected.map((p)=>p.ndc[0]),ndcY=projected.map((p)=>p.ndc[1]),ndcZ=projected.map((p)=>p.ndc[2]);
  if(Math.max(...ndcX)<-1||Math.min(...ndcX)>1||Math.max(...ndcY)<-1||Math.min(...ndcY)>1||Math.max(...ndcZ)<-1||Math.min(...ndcZ)>1)return null;
  const xs=projected.map((p)=>p.xPx),ys=projected.map((p)=>p.yPx);
  const x0=clamp(Math.min(...xs),0,camera.widthPx),x1=clamp(Math.max(...xs),0,camera.widthPx);
  const y0=clamp(Math.min(...ys),0,camera.heightPx),y1=clamp(Math.max(...ys),0,camera.heightPx);
  if(x1-x0<0.5||y1-y0<0.5)return null;
  return{bboxPx:[x0,y0,x1,y1],centrePx:[(x0+x1)/2,(y0+y1)/2],clipped:x0===0||y0===0||x1===camera.widthPx||y1===camera.heightPx};
}
export function objectPoseRecord(object){const p=poseOf(object);return{worldXmm:p.x,worldYmm:p.y,worldZmm:p.z,yawDeg:p.yaw};}
