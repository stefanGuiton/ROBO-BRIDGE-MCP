import { length3, normalize3, sub3 } from './math.js';
import { objectWorldCorners } from './projection.js';
function aabb(object){const c=objectWorldCorners(object);return{min:[Math.min(...c.map(p=>p[0])),Math.min(...c.map(p=>p[1])),Math.min(...c.map(p=>p[2]))],max:[Math.max(...c.map(p=>p[0])),Math.max(...c.map(p=>p[1])),Math.max(...c.map(p=>p[2]))]};}
function rayBoxDistance(origin,dir,box){let tmin=0,tmax=Infinity;for(let i=0;i<3;i+=1){if(Math.abs(dir[i])<1e-9){if(origin[i]<box.min[i]||origin[i]>box.max[i])return Infinity;continue;}let t1=(box.min[i]-origin[i])/dir[i],t2=(box.max[i]-origin[i])/dir[i];if(t1>t2)[t1,t2]=[t2,t1];tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);if(tmax<tmin)return Infinity;}return tmin>=0?tmin:Infinity;}
function samplePoints(object){const p=object.position??{},b=object.bounds??object.size??{},x=Number(p.xMm??0),y=Number(p.yMm??0),z=Number(p.zMm??0),hx=Number(b.xMm??32)*0.36,hy=Number(b.yMm??64)*0.36,hz=Number(b.zMm??20)*0.45;return[[x,y,z],[x-hx,y-hy,z+hz],[x+hx,y-hy,z+hz],[x+hx,y+hy,z+hz],[x-hx,y+hy,z+hz]];}
export function visibilityForObject(object,objects,camera){
  if(object.visible===false)return{visible:false,visibleFraction:0,reason:'hidden_flag'};
  if(object.held===true||object.state==='held')return{visible:true,visibleFraction:1,reason:'held_visible'};
  const origin=camera.position;let open=0;
  for(const point of samplePoints(object)){
    const vector=sub3(point,origin),distance=length3(vector),dir=normalize3(vector);let occluded=false;
    for(const other of objects){if(other===object||other.id===object.id||other.visible===false||other.occluder===false||other.type==='target')continue;const hit=rayBoxDistance(origin,dir,aabb(other));if(hit<distance-2){occluded=true;break;}}
    if(!occluded)open+=1;
  }
  const fraction=open/5;return{visible:fraction>=0.2,visibleFraction:fraction,reason:fraction>=0.2?'sample_visible':'occluded'};
}
