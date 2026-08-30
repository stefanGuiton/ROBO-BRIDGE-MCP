function graph(family, nodes, members, span = 40) {
  return {
    version: 1,
    nodes,
    members,
    cables: [],
    metadata: { family, span, designRevision: 1 },
  };
}

const node = (id, x, y, role = "joint", supportType = "none") => ({
  id,
  position: { x, y },
  role,
  supportType,
});
const member = (id, a, b, role, memberClass = role) => ({
  id,
  a,
  b,
  role,
  memberClass,
  capacityClass: 3,
});

export const FIXTURES = Object.freeze({
  beam: graph("beam", [
    node(1, 0, 7, "support", "fixed"),
    node(2, 40, 7, "support", "fixed"),
  ], [member(1, 1, 2, "deck", "beam-primary")]),

  trestle: graph("trestle", [
    node(1, 0, 8, "support", "fixed"), node(2, 10, 8, "deck"),
    node(3, 20, 8, "deck"), node(4, 30, 8, "deck"),
    node(5, 40, 8, "support", "fixed"), node(6, 10, 0, "pier", "terrain"),
    node(7, 20, 0, "pier", "terrain"), node(8, 30, 0, "pier", "terrain"),
  ], [
    member(1, 1, 2, "deck"), member(2, 2, 3, "deck"), member(3, 3, 4, "deck"), member(4, 4, 5, "deck"),
    member(5, 6, 2, "pier"), member(6, 7, 3, "pier"), member(7, 8, 4, "pier"),
    member(8, 6, 3, "diagonal", "brace"), member(9, 7, 2, "diagonal", "brace"),
    member(10, 7, 4, "diagonal", "brace"), member(11, 8, 3, "diagonal", "brace"),
  ]),

  warren: graph("warren", [
    node(1, 0, 7, "support", "fixed"), node(2, 10, 7, "deck"), node(3, 20, 7, "deck"),
    node(4, 30, 7, "deck"), node(5, 40, 7, "support", "fixed"),
    node(6, 5, 15), node(7, 15, 15), node(8, 25, 15), node(9, 35, 15),
  ], [
    member(1, 1, 2, "chord", "lower-chord"), member(2, 2, 3, "chord", "lower-chord"),
    member(3, 3, 4, "chord", "lower-chord"), member(4, 4, 5, "chord", "lower-chord"),
    member(5, 6, 7, "chord", "upper-chord"), member(6, 7, 8, "chord", "upper-chord"), member(7, 8, 9, "chord", "upper-chord"),
    member(8, 1, 6, "diagonal"), member(9, 6, 2, "diagonal"), member(10, 2, 7, "diagonal"),
    member(11, 7, 3, "diagonal"), member(12, 3, 8, "diagonal"), member(13, 8, 4, "diagonal"),
    member(14, 4, 9, "diagonal"), member(15, 9, 5, "diagonal"),
  ]),

  pratt: graph("pratt", [
    node(1, 0, 7, "support", "fixed"), node(2, 10, 7, "deck"), node(3, 20, 7, "deck"),
    node(4, 30, 7, "deck"), node(5, 40, 7, "support", "fixed"),
    node(6, 0, 15), node(7, 10, 15), node(8, 20, 15), node(9, 30, 15), node(10, 40, 15),
  ], [
    member(1, 1, 2, "chord", "lower-chord"), member(2, 2, 3, "chord", "lower-chord"), member(3, 3, 4, "chord", "lower-chord"), member(4, 4, 5, "chord", "lower-chord"),
    member(5, 6, 7, "chord", "upper-chord"), member(6, 7, 8, "chord", "upper-chord"), member(7, 8, 9, "chord", "upper-chord"), member(8, 9, 10, "chord", "upper-chord"),
    member(9, 1, 6, "vertical"), member(10, 2, 7, "vertical"), member(11, 3, 8, "vertical"), member(12, 4, 9, "vertical"), member(13, 5, 10, "vertical"),
    member(14, 6, 2, "diagonal"), member(15, 7, 3, "diagonal"), member(16, 9, 3, "diagonal"), member(17, 10, 4, "diagonal"),
  ]),

  arch: graph("arch", [
    node(1, 0, 8, "support", "fixed"), node(2, 8, 8, "deck"), node(3, 16, 8, "deck"),
    node(4, 24, 8, "deck"), node(5, 32, 8, "deck"), node(6, 40, 8, "support", "fixed"),
    node(7, 0, 3, "anchor", "terrain"), node(8, 5, 8), node(9, 10, 12), node(10, 15, 15),
    node(11, 20, 16), node(12, 25, 15), node(13, 30, 12), node(14, 35, 8), node(15, 40, 3, "anchor", "terrain"),
  ], [
    member(1, 1, 2, "deck"), member(2, 2, 3, "deck"), member(3, 3, 4, "deck"), member(4, 4, 5, "deck"), member(5, 5, 6, "deck"),
    member(6, 7, 8, "arch"), member(7, 8, 9, "arch"), member(8, 9, 10, "arch"), member(9, 10, 11, "arch"),
    member(10, 11, 12, "arch"), member(11, 12, 13, "arch"), member(12, 13, 14, "arch"), member(13, 14, 15, "arch"),
    member(14, 8, 1, "vertical"), member(15, 9, 2, "vertical"), member(16, 10, 3, "vertical"),
    member(17, 12, 4, "vertical"), member(18, 13, 5, "vertical"), member(19, 14, 6, "vertical"),
  ]),
});

export function cloneFixture(name) {
  if (!FIXTURES[name]) throw new Error(`Unknown fixture: ${name}`);
  return structuredClone(FIXTURES[name]);
}
