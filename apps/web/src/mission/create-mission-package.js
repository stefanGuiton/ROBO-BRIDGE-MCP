'use strict';
import { MissionService } from './mission-service.js';
import { createMissionEventAdapter } from './mission-events.js';
import { createMissionToolRuntime } from './webmcp-mission-tools.js';
import { guardBridgeToolsForMission } from './bridge-tool-guard.js';

export function createMissionPackage({eventSink=()=>{},events=null,...services}={},options={}) {
  const eventAdapter=events??createMissionEventAdapter({sink:eventSink,now:options.now});
  const service=new MissionService(services,{...options,events:eventAdapter});
  const runtime=createMissionToolRuntime(service);
  return Object.freeze({service,events:eventAdapter,tools:runtime.tools,invoke:runtime.invoke,
    async getToolsForRegistration({maximumOptions=100}={}) {
      const maximum=Number.isSafeInteger(maximumOptions)?Math.max(1,Math.min(500,maximumOptions)):100;
      const ids=new Set(); let cursor=0,nextCursor=0;
      while (ids.size<maximum) {
        const page=await service.getTerrainOptions({cursor,limit:Math.min(20,maximum-ids.size)});
        if (!page.ok) throw new Error(`ChallengeService tool-schema discovery failed: ${page.error?.code??'UNKNOWN'}.`);
        for (const option of page.options) if (option.enabled!==false) ids.add(option.id);
        nextCursor=page.nextCursor; if (nextCursor===null) break;
        if (!Number.isSafeInteger(nextCursor)||nextCursor<=cursor) throw new Error('ChallengeService returned an invalid tool-schema cursor.');
        cursor=nextCursor;
      }
      if (nextCursor!==null) throw new Error(`ChallengeService exposed more than ${maximum} terrain options.`);
      if (!ids.size) throw new Error('ChallengeService exposed no enabled terrain IDs.');
      return createMissionToolRuntime(service,{challengeIds:[...ids]}).tools;
    },
    guardBridgeTools(tools) { return guardBridgeToolsForMission(tools,service); }
  });
}
