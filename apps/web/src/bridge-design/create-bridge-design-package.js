'use strict';

import { BridgeDesignService } from './bridge-design-service.js';
import { createV46Adapter } from './v46-adapter.js';
import { createBridgeToolRuntime, registerBridgeWebMcpTools } from './webmcp-bridge-tools.js';

export function createBridgeDesignPackage({
  host,
  modelContext = globalThis.document?.modelContext,
  onLifecycle = () => {},
  maxResultChars = 16000
} = {}) {
  const adapter = createV46Adapter(host);
  const service = new BridgeDesignService(adapter);
  const runtime = createBridgeToolRuntime(service);
  return Object.freeze({
    adapter,
    service,
    tools: runtime.tools,
    invoke: runtime.invoke,
    register() {
      return registerBridgeWebMcpTools({ service, modelContext, onLifecycle, maxResultChars });
    }
  });
}
