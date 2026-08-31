import assert from 'node:assert/strict';
import { getTerrainTuningToolDefinitions, registerTerrainTuningTools } from './terrain-webmcp.js';

const calls=[];
const api={
  getState:()=>({ok:true,tuningRevision:4}),
  setTuning:(input)=>{calls.push(input);return {ok:true,tuningRevision:5};},
  resetView:(input)=>({ok:true,tuningRevision:input.expectedTuningRevision+1}),
};
const definitions=getTerrainTuningToolDefinitions(api);
assert.deepEqual(definitions.map((tool)=>tool.name),['terrain_get_tuning','terrain_set_tuning','terrain_reset_view']);
for(const tool of definitions)assert.equal(tool.inputSchema.additionalProperties,false);

const registered=[];
globalThis.document={modelContext:{async registerTool(tool,options){registered.push({tool,options});}}};
const result=await registerTerrainTuningTools(api);
assert.equal(result.ok,true);
assert.equal(registered.length,3);
assert.ok(registered.every(({options})=>options.signal instanceof AbortSignal));
const state=JSON.parse(await registered[0].tool.execute({}));
assert.equal(state.tuningRevision,4);
const applied=JSON.parse(await registered[1].tool.execute({expectedTuningRevision:4,exposure:1.2}));
assert.equal(applied.tuningRevision,5);
assert.equal(calls[0].exposure,1.2);
console.log(JSON.stringify({pass:true,tools:result.toolNames}));
