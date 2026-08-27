import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compileImageData } from '../apps/web/src/logo/compiler.js';
import { makePattern } from '../apps/web/src/logo/patterns.js';
import { createInventory } from '../apps/web/src/bricks/inventory.js';
import { CoBuildGame } from '../apps/web/src/game/co-build.js';

const image=makePattern('ring',320);
const options={brickBudget:48,fitMode:'contain',seed:173};
const first=compileImageData(image,options).blueprint;
const inventoryA=createInventory(first,{seed:173});
const game=new CoBuildGame(first); game.start(0);
const placed=[];
for(let i=0;i<Math.min(6,first.targets.length);i+=1){
  const target=first.targets[i]; const item=inventoryA.items.find(x=>x.colour===target.colour && !placed.some(p=>p.brickId===x.brickId));
  assert(item);
  const result=game.place({brickId:item.brickId,colour:item.colour,position:{xMm:target.worldXmm,yMm:target.worldYmm,zMm:target.worldZmm},yawDeg:0,actor:i%2?'human':'agent',nowMs:100+i});
  assert.equal(result.accepted,true); assert.equal(result.correctness,true); placed.push({brickId:item.brickId,targetId:target.targetId,actor:i%2?'human':'agent'});
}
const progress=game.getBuildState().progress;
assert.equal(progress.correctTargets,placed.length);
const second=compileImageData(image,options).blueprint;
const inventoryB=createInventory(second,{seed:173});
assert.deepEqual(second,first); assert.deepEqual(inventoryB,inventoryA);
const result={pass:true,flow:['load original pattern','compile under budget','inspect blueprint','start board','place six targets via fixture','confirm progress','reset same seed','confirm same blueprint/inventory'],blueprintId:first.blueprintId,brickCount:first.brickCount,grid:first.grid,placed,progress,deterministicBlueprint:true,deterministicInventory:true};
const out=process.argv[2]; if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));
