function integer(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return Math.round(value);
}

export function normalizeBridgeGraph(input) {
  if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.members)) {
    throw new Error("BridgeGraph2D requires nodes[] and members[]");
  }
  const nodes = input.nodes.map((source, index) => {
    const position = source.position ?? source;
    return {
      id: source.id ?? index + 1,
      position: {
        x: integer(position.x, `nodes[${index}].x`),
        y: integer(position.y, `nodes[${index}].y`),
      },
      role: source.role ?? "joint",
      supportType: source.supportType ?? "none",
    };
  }).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  const nodeIds = new Set(nodes.map((entry) => entry.id));
  const members = input.members.map((source, index) => {
    const a = source.a ?? source.nodeA;
    const b = source.b ?? source.nodeB;
    if (!nodeIds.has(a) || !nodeIds.has(b)) throw new Error(`members[${index}] references an unknown node`);
    return {
      id: source.id ?? index + 1,
      a,
      b,
      role: source.role ?? "beam",
      memberClass: source.memberClass ?? source.role ?? "beam",
      capacityClass: source.capacityClass ?? 1,
    };
  }).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  return {
    version: input.version ?? 1,
    nodes,
    members,
    cables: Array.isArray(input.cables) ? structuredClone(input.cables) : [],
    metadata: {
      family: input.metadata?.family ?? "imported",
      span: input.metadata?.span ?? Math.max(...nodes.map((entry) => entry.position.x)),
      designRevision: input.metadata?.designRevision ?? 1,
    },
  };
}
