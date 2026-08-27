import fs from 'node:fs';
import path from 'node:path';
import { compileImageData } from '../apps/web/src/logo/compiler.js';
import { validateBlueprint } from '../apps/web/src/logo/blueprint.js';
import { createInventory, inventoryHasNoOverlap } from '../apps/web/src/bricks/inventory.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const random = rng(0x4c4f474f);
const palette = [[18,20,24],[245,246,248],[215,48,54],[42,91,194],[244,196,50],[47,150,84]];
function makeSynthetic(index) {
  const width = 12 + Math.floor(random() * 69);
  const height = 12 + Math.floor(random() * 69);
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = random() * width, cy = random() * height;
  const rx = Math.max(3, width * (0.20 + random() * 0.34));
  const ry = Math.max(3, height * (0.20 + random() * 0.34));
  const base = palette[index % palette.length];
  const accent = palette[(index * 5 + 2) % palette.length];
  for (let y=0;y<height;y+=1) for (let x=0;x<width;x+=1) {
    const i=(y*width+x)*4;
    const ellipse=((x-cx)/rx)**2 + ((y-cy)/ry)**2;
    const stripe=((x + y + index) % Math.max(3, Math.floor(width/5))) < Math.max(1, Math.floor(width/10));
    const opaque = ellipse < 1 || (index % 4 === 0 && stripe && x > width*.12 && x < width*.88);
    const c = stripe ? accent : base;
    data[i]=c[0]; data[i+1]=c[1]; data[i+2]=c[2];
    data[i+3]=opaque ? (index % 7 === 0 ? 150 + Math.floor(random()*106) : 255) : 0;
  }
  // Guarantee at least one substantial opaque block.
  for (let y=Math.floor(height*.42); y<Math.ceil(height*.58); y+=1) for (let x=Math.floor(width*.42); x<Math.ceil(width*.58); x+=1) {
    const i=(y*width+x)*4; data[i]=base[0]; data[i+1]=base[1]; data[i+2]=base[2]; data[i+3]=255;
  }
  return {width,height,data};
}

const total = 1000;
const failures=[];
const counts=[];
const start=performance.now();
for (let i=0;i<total;i+=1) {
  const image=makeSynthetic(i);
  const brickBudget=8 + Math.floor(random()*121);
  const fitMode=i%3===0?'cover':'contain';
  try {
    const {blueprint}=compileImageData(image,{brickBudget,fitMode,seed:1000+i});
    const validation=validateBlueprint(blueprint);
    const inventory=createInventory(blueprint,{seed:1000+i});
    const checks={
      valid:validation.ok,
      evenWidth:blueprint.grid.cols%2===0,
      budget:blueprint.brickCount<=brickBudget,
      nonEmpty:blueprint.brickCount>0,
      countMatches:blueprint.targets.length===blueprint.brickCount,
      twoCells:blueprint.targets.every(t=>t.cells.length===2 && t.cells[0][0]===t.cells[1][0] && t.cells[1][1]===t.cells[0][1]+1),
      yaw:blueprint.targets.every(t=>t.yawDeg===0),
      finite:blueprint.targets.every(t=>[t.worldXmm,t.worldYmm,t.worldZmm].every(Number.isFinite)),
      inventoryCount:inventory.items.length===blueprint.brickCount,
      inventoryClear:inventoryHasNoOverlap(inventory.items)
    };
    if (Object.values(checks).some(v=>!v)) failures.push({i,image:{width:image.width,height:image.height},brickBudget,fitMode,checks,errors:validation.errors});
    counts.push(blueprint.brickCount);
  } catch (error) {
    failures.push({i,image:{width:image.width,height:image.height},brickBudget,fitMode,error:String(error?.message||error)});
  }
}
const elapsedMs=performance.now()-start;
const result={
  seed:'0x4c4f474f', total, passed:total-failures.length, failed:failures.length, elapsedMs,
  avgCompileAndInvariantMs:elapsedMs/total,
  brickCount:{min:Math.min(...counts),max:Math.max(...counts),mean:counts.reduce((a,b)=>a+b,0)/Math.max(1,counts.length)},
  failures:failures.slice(0,25)
};
const output=process.argv[2];
if (output) { fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(result,null,2)); }
console.log(JSON.stringify(result,null,2));
if (failures.length) process.exitCode=1;
