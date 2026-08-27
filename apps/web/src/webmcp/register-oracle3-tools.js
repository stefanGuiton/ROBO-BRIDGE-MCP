import { createRuntimeBridge } from './runtime-bridge.js';
import { createLogoRoboToolHandlers } from './tool-handlers.js';
let activeController = null;
const PALETTE = ['white','black','red','blue','yellow','green'];
const LIMIT = { type: 'integer', minimum: 1, maximum: 50, default: 20 };
function compact(value) { const text = JSON.stringify(value); return text.length <= 3600 ? text : JSON.stringify({ ok:false, reason:'invalid_input', message:'Tool output exceeded compact result limit.' }); }

export function getLogoRoboToolDefinitions(handlers) {
  return [
    {
      name:'get_build_state', description:'Read the current LOGO ROBO target, progress, claims, held brick, and speed cap. Recheck after another actor changes the board.',
      inputSchema:{type:'object',properties:{status:{type:'string',enum:['unfilled','filled','correct','incorrect']},colour:{type:'string',enum:PALETTE},claimOwner:{type:'string',enum:['human','agent','none']},limit:LIMIT},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.getBuildState(input)
    },
    {
      name:'observe_camera', description:'Observe visible simulated objects through tray_camera or canvas_camera. Use before moving to a brick and observe again after world changes because coordinates can become stale.',
      inputSchema:{type:'object',properties:{cameraId:{type:'string',enum:['tray_camera','canvas_camera'],default:'tray_camera'},colour:{type:'string',enum:PALETTE},type:{type:'string',enum:['brick','target']},limit:LIMIT},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.observeCamera(input)
    },
    {
      name:'move_tool', description:'Move the robot TCP to one Cartesian XYZ point with fixed tool orientation. This does not latch or release. Move above a brick or target before descending.',
      inputSchema:{type:'object',properties:{xMm:{type:'number',minimum:-1200,maximum:1200},yMm:{type:'number',minimum:-1200,maximum:1200},zMm:{type:'number',minimum:-200,maximum:1600},speedMmS:{type:'number',exclusiveMinimum:0,maximum:3000}},required:['xMm','yMm','zMm','speedMmS'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input)=>handlers.moveTool(input)
    },
    {
      name:'latch', description:'Latch one brick only when the TCP is within the runtime capture tolerance. After success, verify the held state before transfer.',
      inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:()=>handlers.latch()
    },
    {
      name:'unlatch', description:'Release the held brick. A close board target can snap the brick into place. Verify build or camera state after release.',
      inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:()=>handlers.unlatch()
    },
    {
      name:'claim_target', description:'Claim one build target for the agent in Co-Build. This coordinates work only; it does not move the robot or place a brick.',
      inputSchema:{type:'object',properties:{targetId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'}},required:['targetId'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input)=>handlers.claimTarget(input)
    }
  ];
}

export async function registerWebMcpTools(runtimeOrLegacyApi = null, onLifecycle = () => {}) {
  const modelContext = globalThis.document?.modelContext;
  if (!modelContext?.registerTool) return { ok:false, reason:'document.modelContext is unavailable. Use a WebMCP-enabled secure browser context.' };
  const candidate = runtimeOrLegacyApi?.getWorldRevision ? runtimeOrLegacyApi : globalThis.__LOGO_ROBO_RUNTIME__ ?? null;
  const bridge = createRuntimeBridge(candidate);
  const handlers = createLogoRoboToolHandlers({ bridge });
  const tools = getLogoRoboToolDefinitions(handlers);
  activeController?.abort(); activeController = new AbortController();
  for (const tool of tools) {
    const execute = tool.execute;
    await modelContext.registerTool({ ...tool, async execute(input = {}, options = {}) {
      onLifecycle({status:'executing',toolName:tool.name});
      try {
        if (options.signal?.aborted) return compact({ok:false,reason:'cancelled',message:'Tool call was cancelled.'});
        const result = await execute(input, options);
        onLifecycle({status:result?.ok===false?'rejected':'succeeded',toolName:tool.name,reason:result?.reason??null});
        return compact(result);
      } catch (error) {
        onLifecycle({status:'rejected',toolName:tool.name,reason:String(error)}); throw error;
      }
    }}, { signal: activeController.signal });
    onLifecycle({status:'discovered',toolName:tool.name});
  }
  return { ok:true, toolCount:tools.length, toolNames:tools.map((tool)=>tool.name), controller:activeController, runtimeAvailable:bridge.availability.ok, runtimeMissing:bridge.availability.missing };
}

export const registerOracle3WebMcpTools = registerWebMcpTools;
