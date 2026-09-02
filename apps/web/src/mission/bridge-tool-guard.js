'use strict';
import { MissionError } from './errors.js';
const MUTATIONS = new Set(['update_bridge_design','reset_bridge_design']);

export function guardBridgeToolsForMission(tools,missionService) {
  if (!Array.isArray(tools)) throw new TypeError('Bridge tools must be an array.');
  const names=tools.map((tool)=>tool?.name);
  const duplicate=names.find((name,index)=>names.indexOf(name)!==index);
  if (duplicate !== undefined) throw new MissionError('INVALID_PARAMETER',`Duplicate bridge tool name: ${String(duplicate)}.`);
  return tools.map((tool)=>{
    if (!tool || typeof tool.name !== 'string' || typeof tool.execute !== 'function') throw new MissionError('INVALID_PARAMETER','Every bridge tool needs a name and execute function.');
    if (!MUTATIONS.has(tool.name)) return tool;
    return Object.freeze({...tool,async execute(input={},options={}) {
      const gate=missionService.checkDesignMutationAllowed();
      if (!gate.ok) return gate;
      const result=await tool.execute(input,options);
      if (result?.ok !== false) missionService.recordDesignActivity(tool.name,result);
      return result;
    }});
  });
}
export const BRIDGE_MUTATION_TOOLS=Object.freeze([...MUTATIONS]);
