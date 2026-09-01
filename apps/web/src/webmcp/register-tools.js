import { createRuntimeBridge } from './runtime-bridge.js';
import { createLogoRoboToolHandlers } from './tool-handlers.js';

let activeController = null;
const PALETTE = ['white','black','red','blue','yellow','green','orange','purple','teal'];
const LIMIT = { type: 'integer', minimum: 1, maximum: 20, default: 12 };
const REVISION = { type: 'integer', minimum: 0, description: 'Exact worldRevision from the most recent successful read or tool result.' };

function boundedJson(value, maxChars = 12000) {
  const candidate = structuredClone(value);
  let truncated = false;
  let totalAvailable = null;
  let returnedCount = null;
  for (const key of ['targets', 'detections', 'objects', 'entries']) {
    if (!Array.isArray(candidate?.[key])) continue;
    const originalCount = candidate[key].length;
    totalAvailable = Math.max(totalAvailable ?? 0, originalCount);
    if (candidate[key].length > 20) {
      candidate[key] = candidate[key].slice(0, 20);
      truncated = true;
    }
    while (candidate[key].length > 1 && JSON.stringify(candidate).length > maxChars) {
      candidate[key].pop();
      truncated = true;
    }
    returnedCount = candidate[key].length;
  }
  if (truncated) {
    candidate.truncated = true;
    candidate.returnedCount = returnedCount;
    candidate.totalAvailable = totalAvailable;
  }
  const text = JSON.stringify(candidate);
  if (text.length <= maxChars) return text;
  return JSON.stringify({
    ok: candidate?.ok !== false,
    reason: candidate?.ok === false ? (candidate.reason ?? 'internal_error') : undefined,
    worldRevision: candidate?.worldRevision ?? candidate?.snapshotRevision ?? null,
    truncated: true,
    message: 'Tool result was reduced to the bounded response size.'
  });
}

export function getLogoRoboToolDefinitions(handlers, workspace = { xMinMm:470, xMaxMm:710, yMinMm:-275, yMaxMm:275, zMinMm:40, zMaxMm:470, speedLimitMmS:650 }) {
  return [
    {
      name:'get_scene_state', description:'Read the bounded authoritative brick and target inventory, placement state, build state, and exact world revision shared by the human and robot.',
      inputSchema:{type:'object',properties:{colour:{type:'string',enum:PALETTE},type:{type:'string',enum:['brick','target']},limit:LIMIT},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.getSceneState(input)
    },
    {
      name:'get_build_state', description:'Read authoritative board occupancy, claims, progress, held brick, contribution counts, and world revision.',
      inputSchema:{type:'object',properties:{status:{type:'string',enum:['unfilled','filled','correct','incorrect']},colour:{type:'string',enum:PALETTE},claimOwner:{type:'string',enum:['human','agent','none']},limit:LIMIT},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.getBuildState(input)
    },
    {
      name:'get_robot_state', description:'Read authoritative TCP, joints, motion state, held brick, limits, and world revision.',
      inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:()=>handlers.getRobotState()
    },
    {
      name:'get_workspace', description:'Read exact Cartesian, speed, acceleration, joint-rate, coordinate-frame, and grasp-offset limits.',
      inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:()=>handlers.getWorkspace()
    },
    {
      name:'observe_camera', description:'Observe simulated bricks or targets through supply, build, hidden top/left/right, or the human current-view camera. Each detection includes centre coordinates and recommendedTcp. Use snapshotRevision as expectedWorldRevision for the next mutation.',
      inputSchema:{type:'object',properties:{cameraId:{type:'string',enum:['tray_camera','canvas_camera','top_camera','left_camera','right_camera','user_camera'],default:'tray_camera'},colour:{type:'string',enum:PALETTE},type:{type:'string',enum:['brick','target']},limit:LIMIT},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.observeCamera(input)
    },
    {
      name:'preview_placement', description:'Read-only validation of one desired brick placement. Returns the exact required TCP and approach pose without moving the robot or mutating the world.',
      inputSchema:{type:'object',properties:{brickId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},xMm:{type:'number',minimum:workspace.xMinMm,maximum:workspace.xMaxMm},yMm:{type:'number',minimum:workspace.yMinMm,maximum:workspace.yMaxMm},zMm:{type:'number',minimum:0,maximum:workspace.zMaxMm},yawDeg:{type:'number',minimum:-360,maximum:360,default:0},supportBrickId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},supportSide:{type:'string',enum:['L','M','R'],default:'M'},carriedSide:{type:'string',enum:['L','M','R']},expectedWorldRevision:REVISION},required:['brickId','expectedWorldRevision'],additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.previewPlacement(input)
    },
    {
      name:'get_placement_stream_status', description:'Read one bounded page of logical placement-stream status plus the active five-slot execution window. This never changes worldRevision.',
      inputSchema:{type:'object',properties:{
        streamId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},
        cursor:{type:'integer',minimum:0,default:0},
        limit:{type:'integer',minimum:1,maximum:50,default:20},
        status:{type:'string',enum:['PENDING','PLANNED','EXECUTING','COMPLETED','ADOPTED','BLOCKED','WAITING_SOURCE','WAITING_DEPENDENCY','CANCELLED']}
      },required:['streamId'],additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.getPlacementStreamStatus(input)
    },
    {
      name:'plan_placement_queue', description:'Read-only logical placement planning. Stream mode accepts bounded replace/append chunks with stable placementId values while materializing at most five ghost proposals. Omit stream fields for the legacy one-to-five replacement form.',
      inputSchema:{
        type:'object',
        properties:{
          placements:{
            type:'array',minItems:1,maxItems:50,
            items:{type:'object',properties:{
              placementId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},
              brickId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},
              colour:{type:'string',enum:PALETTE},
              xMm:{type:'number',minimum:workspace.xMinMm,maximum:workspace.xMaxMm},
              yMm:{type:'number',minimum:workspace.yMinMm,maximum:workspace.yMaxMm},
              zMm:{type:'number',minimum:0,maximum:workspace.zMaxMm},
              yawDeg:{type:'number',minimum:-360,maximum:360,default:0},
              supportBrickId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},
              supportPlacementId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},
              supportSide:{type:'string',enum:['L','M','R'],default:'M'},
              carriedSide:{type:'string',enum:['L','M','R']}
            },additionalProperties:false}
          },
          streamId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},
          mode:{type:'string',enum:['replace','append']},
          finalChunk:{type:'boolean'},
          expectedWorldRevision:REVISION
        },required:['placements','expectedWorldRevision'],additionalProperties:false
      },
      annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:(input)=>handlers.planPlacementQueue({
        expectedWorldRevision:input.expectedWorldRevision,
        ...(input.streamId===undefined?{}:{streamId:input.streamId}),
        ...(input.mode===undefined?{}:{mode:input.mode}),
        ...(input.finalChunk===undefined?{}:{finalChunk:input.finalChunk}),
        placements:input.placements.map((placement)=>({
          placementId:placement.placementId??null,
          brickId:placement.brickId??null,
          colour:placement.colour??null,
          position:[placement.xMm,placement.yMm,placement.zMm].every(Number.isFinite)
            ? {xMm:placement.xMm,yMm:placement.yMm,zMm:placement.zMm}
            : null,
          yawRad:Number(placement.yawDeg??0)*Math.PI/180,
          supportBrickId:placement.supportBrickId??null,
          supportPlacementId:placement.supportPlacementId??null,
          supportSide:placement.supportSide??'M',
          carriedSide:placement.carriedSide??null
        }))
      })
    },
    {
      name:'execute_next_placement', description:'Execute only the next accepted cached placement through the shared RobotController. This is one bounded pick/place, not a multi-brick build shortcut; exact revision and cancellation are required. maxExecutionWallMs optionally enforces a local abort deadline.',
      inputSchema:{type:'object',properties:{
        proposalId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},
        physicalSpeedMmS:{type:'number',exclusiveMinimum:0,maximum:workspace.speedLimitMmS??650,default:650},
        playbackMultiplier:{type:'number',minimum:1,maximum:40,default:20},
        maxExecutionWallMs:{type:'integer',minimum:50,maximum:120000,description:'Optional in-page execution deadline that aborts this placement through the shared cancellation signal.'},
        expectedWorldRevision:REVISION
      },required:['proposalId','physicalSpeedMmS','playbackMultiplier','expectedWorldRevision'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input,options)=>handlers.executeNextPlacement(input,options)
    },
    {
      name:'move_tool', description:'Move the shared fixed-down TCP. The request must include the latest exact world revision. Motion is cancelled if the call aborts and fails closed if the world changes.',
      inputSchema:{type:'object',properties:{xMm:{type:'number',minimum:workspace.xMinMm,maximum:workspace.xMaxMm},yMm:{type:'number',minimum:workspace.yMinMm,maximum:workspace.yMaxMm},zMm:{type:'number',minimum:workspace.zMinMm,maximum:workspace.zMaxMm},yawDeg:{type:'number',minimum:-360,maximum:360,description:'Optional fixed-down tool yaw returned by placement preview.'},speedMmS:{type:'number',exclusiveMinimum:0,maximum:workspace.speedLimitMmS ?? 650},expectedWorldRevision:REVISION},required:['xMm','yMm','zMm','speedMmS','expectedWorldRevision'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input,options)=>handlers.moveTool(input,options)
    },
    {
      name:'latch', description:'Latch one brick within the capture tolerance. Requires the latest exact world revision.',
      inputSchema:{type:'object',properties:{expectedWorldRevision:REVISION},required:['expectedWorldRevision'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input)=>handlers.latch(input)
    },
    {
      name:'unlatch', description:'Release the held brick through the shared placement authority. Valid target, mat, or stud placements commit; invalid placements fail while the brick remains held.',
      inputSchema:{type:'object',properties:{expectedWorldRevision:REVISION},required:['expectedWorldRevision'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input)=>handlers.unlatch(input)
    },
    {
      name:'claim_target', description:'Claim one unfilled target for the agent. Claims live in the same authoritative board state as occupancy.',
      inputSchema:{type:'object',properties:{targetId:{type:'string',minLength:1,maxLength:64,pattern:'^[A-Za-z0-9_.:-]+$'},expectedWorldRevision:REVISION},required:['targetId','expectedWorldRevision'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input)=>handlers.claimTarget(input)
    },
    {
      name:'reset_workcell', description:'Cancel active motion and reset robot, bricks, board occupancy, claims, and revisions to a new deterministic scene state.',
      inputSchema:{type:'object',properties:{expectedWorldRevision:REVISION},required:['expectedWorldRevision'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:(input)=>handlers.resetWorkcell(input)
    }
  ];
}

export async function registerWebMcpTools(runtime = null, onLifecycle = () => {}) {
  const modelContext = globalThis.document?.modelContext;
  if (!modelContext?.registerTool) return { ok:false, reason:'document.modelContext is unavailable. Use a WebMCP-enabled secure browser context.' };
  const bridge = createRuntimeBridge(runtime ?? globalThis.__LOGO_ROBO_RUNTIME__ ?? null);
  if (!bridge.availability.ok) return { ok:false, reason:'runtime_unavailable', missing:bridge.availability.missing };
  const handlers = createLogoRoboToolHandlers({ bridge });
  const tools = getLogoRoboToolDefinitions(handlers, bridge.robot.getWorkspace());
  activeController?.abort();
  activeController = new AbortController();
  const registeredNames = [];
  try {
    for (const tool of tools) {
      const execute = tool.execute;
      await modelContext.registerTool({ ...tool, async execute(input = {}, options = {}) {
        onLifecycle({status:'executing',toolName:tool.name});
        if (options.signal?.aborted) {
          const cancelled = { ok:false, reason:'cancelled', message:'Tool call was cancelled.' };
          onLifecycle({status:'rejected',toolName:tool.name,reason:'cancelled'});
          return boundedJson(cancelled);
        }
        try {
          const result = await execute(input, options);
          onLifecycle({status:result?.ok===false?'rejected':'succeeded',toolName:tool.name,reason:result?.reason??null});
          return boundedJson(result);
        } catch {
          const result = { ok:false, reason:'internal_error', message:'The tool failed internally.' };
          onLifecycle({status:'rejected',toolName:tool.name,reason:'internal_error'});
          return boundedJson(result);
        }
      }}, { signal: activeController.signal });
      registeredNames.push(tool.name);
      onLifecycle({status:'discovered',toolName:tool.name});
    }
  } catch {
    activeController.abort();
    return { ok:false, reason:'tool_registration_failed', registeredNames };
  }
  return { ok:true, toolCount:tools.length, toolNames:tools.map((tool)=>tool.name), controller:activeController, runtimeAvailable:true };
}
