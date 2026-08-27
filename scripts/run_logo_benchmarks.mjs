import fs from 'node:fs';
import path from 'node:path';
import { compileImageData } from '../apps/web/src/logo/compiler.js';
import { makePattern } from '../apps/web/src/logo/patterns.js';

function resizeRect(width,height) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y+=1) for(let x=0;x<width;x+=1){
    const i=(y*width+x)*4; const nx=(x-width/2)/(width/2); const ny=(y-height/2)/(height/2);
    const ring=Math.hypot(nx,ny)<.78 && Math.hypot(nx,ny)>.35;
    const bar=Math.abs(nx)<.10 || Math.abs(ny)<.10;
    const c=bar?[212,49,55]:ring?[244,246,248]:[0,0,0];
    data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=(ring||bar)?255:0;
  }
  return {width,height,data};
}
function median(values){const v=[...values].sort((a,b)=>a-b);return v[Math.floor(v.length/2)];}
const cases=[
  {name:'small-256-budget40', image:makePattern('ring',256), budget:40},
  {name:'1024-budget40', image:resizeRect(1024,1024), budget:40},
  {name:'1024-budget80', image:resizeRect(1024,1024), budget:80},
  {name:'1024-budget128', image:resizeRect(1024,1024), budget:128}
];
const results=[];
for(const entry of cases){
  compileImageData(entry.image,{brickBudget:entry.budget,seed:173});
  const times=[]; let last=null;
  for(let i=0;i<5;i+=1){const t0=performance.now(); last=compileImageData(entry.image,{brickBudget:entry.budget,seed:173}); times.push(performance.now()-t0);}
  results.push({name:entry.name,width:entry.image.width,height:entry.image.height,budget:entry.budget,brickCount:last.blueprint.brickCount,grid:`${last.blueprint.grid.cols}x${last.blueprint.grid.rows}`,runsMs:times,medianMs:median(times),minMs:Math.min(...times),maxMs:Math.max(...times)});
}
const output={node:process.version, measuredAt:new Date().toISOString(), compilerOnly:true, decodeExcluded:true, results};
const outputPath=process.argv[2]; if(outputPath){fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(output,null,2));}
console.log(JSON.stringify(output,null,2));
