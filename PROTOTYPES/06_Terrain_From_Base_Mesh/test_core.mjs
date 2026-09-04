import { compileHeightGrid, countSideWalls, sideWallQuad, createCellBinary, parseCellBinary, EMPTY_LAYER } from './terrain-core.js';
const positions=new Float32Array([0,0,0, 1,0,0, 1,1,1, 0,1,1]);
const uvs=new Float32Array([0,0,1,0,1,1,0,1]);
const indices=new Uint32Array([0,1,2,0,2,3]);
const data=new Uint8ClampedArray(4*4*4); for(let i=0;i<16;i++){data[i*4]=i*10;data[i*4+1]=100;data[i*4+2]=200;data[i*4+3]=255;}
const bounds={minX:0,minY:0,minZ:0,maxX:1,maxY:1,maxZ:1};
const grid=await compileHeightGrid({positions,uvs,indices,bounds,baseImage:{data,width:4,height:4}},{blockWidth:0.25,blockHeight:0.25});
if(grid.rows!==4||grid.cols!==4||grid.occupied!==16) throw new Error('grid shape failed');
for(const h of grid.heights) if(h===EMPTY_LAYER) throw new Error('unexpected empty cell');
const walls=countSideWalls(grid); if(!(walls>0)) throw new Error('wall count failed');
const bin=createCellBinary(grid); const parsed=parseCellBinary({rows:grid.rows,cols:grid.cols,blockWidth:grid.blockWidth,blockHeight:grid.blockHeight,gridOrigin:[grid.originX,grid.originZ],baseHeight:grid.baseY},bin); const bin2=createCellBinary(parsed,parsed.colors);
if(Buffer.compare(Buffer.from(bin),Buffer.from(bin2))!==0) throw new Error('round trip failed');
const grid2=await compileHeightGrid({positions,uvs,indices,bounds,baseImage:{data,width:4,height:4}},{blockWidth:0.25,blockHeight:0.25});
if(Buffer.compare(Buffer.from(grid.heights.buffer),Buffer.from(grid2.heights.buffer))!==0) throw new Error('determinism failed');
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
for(const side of ['N','S','W','E']){
  const wall=sideWallQuad(side,0,1,0,1,0,2);
  const geometricNormal=cross(sub(wall.vertices[1],wall.vertices[0]),sub(wall.vertices[2],wall.vertices[0]));
  if(dot(geometricNormal,wall.normal)<=0) throw new Error(`${side} side wall faces inward`);
}
console.log(JSON.stringify({pass:true,rows:grid.rows,cols:grid.cols,occupied:grid.occupied,walls,binaryBytes:bin.byteLength}));
