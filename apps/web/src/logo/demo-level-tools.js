// Projection/availability only. Tools still use the one existing registrar and
// services; this layer never changes controller, board, revisions or mission.
export function guardDemoLevelTools(tools, getMode, getWorldRevision) {
  return tools.map(tool => ({ ...tool,
    async execute(input, options) {
      const mode = getMode();
      if (tool.name === 'test_bridge' && mode !== 'train') return {
        ok: false, reason: 'LEVEL3_ONLY', message: 'Train tests require Level 3. Level 2 has no Train.', worldRevision: getWorldRevision()
      };
      if (mode === 'simple' && !tool.annotations?.readOnlyHint) return {
        ok: false, reason: 'wrong_mode', message: 'Select a bridge level before changing a bridge mission.', worldRevision: getWorldRevision()
      };
      const result = await tool.execute(input, options);
      if (mode === 'train' || !result) return result;
      const projected = { ...result };
      if (Array.isArray(result.nextActions)) projected.nextActions = result.nextActions.filter(action => action !== 'test_bridge');
      if (Array.isArray(result.error?.allowedNextActions)) projected.error = {
        ...result.error, allowedNextActions: result.error.allowedNextActions.filter(action => action !== 'test_bridge')
      };
      return projected;
    }
  }));
}
