let activeController = null;

function boundedJson(value, maxChars = 8000) {
  const text = JSON.stringify(value);
  return text.length <= maxChars ? text : JSON.stringify({ ok:false, reason:'response_too_large' });
}

export function getTerrainTuningToolDefinitions(api) {
  const revision = { type:'integer', minimum:0, description:'Exact tuningRevision from the latest terrain_get_tuning result.' };
  return [
    {
      name:'terrain_get_tuning',
      description:'Read terrain compiler settings, geometry statistics, rendering statistics, and the exact tuning revision.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:false},
      execute:()=>api.getState(),
    },
    {
      name:'terrain_set_tuning',
      description:'Apply bounded terrain preview settings. Optionally recompile geometry. Requires the latest exact tuning revision.',
      inputSchema:{type:'object',properties:{
        expectedTuningRevision:revision,
        blockWidth:{type:'number',minimum:0.005,maximum:0.08},
        blockHeight:{type:'number',minimum:0.0025,maximum:0.05},
        previewAO:{type:'number',minimum:0,maximum:1},
        exposure:{type:'number',minimum:0.5,maximum:2},
        ambientIntensity:{type:'number',minimum:0,maximum:3},
        skyIntensity:{type:'number',minimum:0,maximum:3},
        sideBrightness:{type:'number',minimum:0.5,maximum:1},
        sunAzimuth:{type:'number',minimum:0,maximum:360},
        sunElevation:{type:'number',minimum:5,maximum:89},
        sunIntensity:{type:'number',minimum:0,maximum:5},
        shadowQuality:{type:'integer',enum:[512,1024,2048]},
        chunkSize:{type:'integer',enum:[16,32,64]},
        sideWalls:{type:'boolean'},
        recompile:{type:'boolean',default:false},
      },required:['expectedTuningRevision'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute:(input,options)=>api.setTuning(input,options),
    },
    {
      name:'terrain_reset_view',
      description:'Reset the terrain camera to the fitted inspection view. Requires the latest exact tuning revision.',
      inputSchema:{type:'object',properties:{expectedTuningRevision:revision},required:['expectedTuningRevision'],additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      execute:(input)=>api.resetView(input),
    },
  ];
}

export async function registerTerrainTuningTools(api, onLifecycle = () => {}) {
  const modelContext = globalThis.document?.modelContext;
  if (!modelContext?.registerTool) return { ok:false, reason:'document.modelContext is unavailable.' };
  const tools = getTerrainTuningToolDefinitions(api);
  activeController?.abort();
  activeController = new AbortController();
  const registeredNames = [];
  try {
    for (const tool of tools) {
      const execute = tool.execute;
      await modelContext.registerTool({ ...tool, async execute(input = {}, options = {}) {
        if (options.signal?.aborted) return boundedJson({ok:false,reason:'cancelled'});
        onLifecycle({status:'executing',toolName:tool.name});
        try {
          const result = await execute(input, options);
          onLifecycle({status:result?.ok===false?'rejected':'succeeded',toolName:tool.name,reason:result?.reason??null});
          return boundedJson(result);
        } catch {
          onLifecycle({status:'rejected',toolName:tool.name,reason:'internal_error'});
          return boundedJson({ok:false,reason:'internal_error'});
        }
      }}, { signal:activeController.signal });
      registeredNames.push(tool.name);
      onLifecycle({status:'discovered',toolName:tool.name});
    }
  } catch {
    activeController.abort();
    return {ok:false,reason:'tool_registration_failed',registeredNames};
  }
  return {ok:true,toolCount:tools.length,toolNames:tools.map((tool)=>tool.name)};
}
