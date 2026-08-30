import { cloneGraph } from "../model/graph.js";
import type { DeckRoute, FixtureDefinition, MemberType, StructuralGraph, StructuralMember, StructuralNode, SupportType } from "../model/types.js";

const node = (id: number, x: number, y: number, supportType: SupportType = "none", appliedLoad = 1.5): StructuralNode => ({
  id, position: { x, y }, supportType, appliedLoad,
});

const member = (
  id: number,
  nodeA: number,
  nodeB: number,
  type: MemberType,
  baseCapacity: number,
  completionFactor = 1,
  connected = true,
  brickCount = 6,
): StructuralMember => ({
  id,
  nodeA,
  nodeB,
  type,
  baseCapacity,
  capacity: baseCapacity * completionFactor,
  completionFactor,
  connected,
  demand: 0,
  utilisation: 0,
  failed: false,
  brickIds: Array.from({ length: brickCount }, (_, index) => id * 100 + index + 1),
});

const route = (nodeIds: number[], regionCount = Math.max(8, (nodeIds.length - 1) * 4)): DeckRoute => ({
  nodeIds,
  regionCount,
  pointLoads: [
    { offset: -0.025, massFraction: 0.5 },
    { offset: 0.025, massFraction: 0.5 },
  ],
});

const fixture = (id: string, label: string, description: string, graph: StructuralGraph, deckRoute: DeckRoute): FixtureDefinition => ({
  id, label, description, graph, route: deckRoute,
});

const shortSupported = fixture(
  "short-supported-beam",
  "Short beam · two supports",
  "A compact baseline span with terrain support at both ends.",
  {
    nodes: [node(1, 0, 0, "terrain", 0.5), node(2, 3, 0), node(3, 6, 0, "terrain", 0.5)],
    members: [member(101, 1, 2, "deck", 360, 1, true, 8), member(102, 2, 3, "deck", 360, 1, true, 8)],
  },
  route([1, 2, 3]),
);

const longSupported = fixture(
  "long-supported-beam",
  "Long beam · two supports",
  "A longer unsupported deck whose centre loses effective capacity.",
  {
    nodes: [node(1, 0, 0, "terrain", 0.5), node(2, 4, 0), node(3, 8, 0), node(4, 12, 0), node(5, 16, 0, "terrain", 0.5)],
    members: [
      member(101, 1, 2, "deck", 330, 1, true, 10), member(102, 2, 3, "deck", 330, 1, true, 10),
      member(103, 3, 4, "deck", 330, 1, true, 10), member(104, 4, 5, "deck", 330, 1, true, 10),
    ],
  },
  route([1, 2, 3, 4, 5]),
);

const shortCantilever = fixture(
  "short-cantilever",
  "Short cantilever",
  "A short deck fixed at one end.",
  {
    nodes: [node(1, 0, 0, "fixed", 0.5), node(2, 2, 0), node(3, 4, 0)],
    members: [member(101, 1, 2, "beam", 260, 1, true, 8), member(102, 2, 3, "beam", 260, 1, true, 8)],
  },
  route([1, 2, 3]),
);

const longCantilever = fixture(
  "long-cantilever",
  "Long cantilever",
  "A deliberately vulnerable single-ended span.",
  {
    nodes: [node(1, 0, 0, "fixed", 0.5), node(2, 3, 0), node(3, 6, 0), node(4, 9, 0), node(5, 12, 0)],
    members: [
      member(101, 1, 2, "beam", 260, 1, true, 10), member(102, 2, 3, "beam", 260, 1, true, 10),
      member(103, 3, 4, "beam", 260, 1, true, 10), member(104, 4, 5, "beam", 260, 1, true, 10),
    ],
  },
  route([1, 2, 3, 4, 5]),
);

const tStructure = fixture(
  "t-structure",
  "T structure",
  "The vertical leg is the only support path; deck strength fades with horizontal distance.",
  {
    nodes: [
      node(1, -9, 3), node(2, -6, 3), node(3, -3, 3), node(4, 3, 3), node(5, 6, 3), node(6, 9, 3),
      node(10, 0, 0, "terrain", 0), node(11, 0, 3),
    ],
    members: [
      member(101, 1, 2, "deck", 340), member(102, 2, 3, "deck", 340), member(103, 3, 11, "deck", 340),
      member(104, 11, 4, "deck", 340), member(105, 4, 5, "deck", 340), member(106, 5, 6, "deck", 340),
      member(200, 10, 11, "pier", 800, 1, true, 12),
    ],
  },
  route([1, 2, 3, 11, 4, 5, 6], 24),
);

const pierGraph = (connected: boolean): StructuralGraph => ({
  nodes: [
    node(1, 0, 4, "terrain", 0.5), node(2, 4, 4), node(3, 8, 4), node(4, 12, 4), node(5, 16, 4, "terrain", 0.5),
    node(20, 8, 0, "terrain", 0),
  ],
  members: [
    member(101, 1, 2, "deck", 325), member(102, 2, 3, "deck", 325), member(103, 3, 4, "deck", 325), member(104, 4, 5, "deck", 325),
    member(200, 20, 3, "pier", 700, connected ? 1 : 0, connected, 14),
  ],
});

const centrePier = fixture(
  "deck-centre-pier",
  "Deck · centre pier",
  "A complete centre pier shortens both effective support paths.",
  pierGraph(true),
  route([1, 2, 3, 4, 5], 20),
);

const centrePierRemoved = fixture(
  "deck-centre-pier-removed",
  "Deck · centre pier removed",
  "The same deck with the centre support structurally disconnected.",
  pierGraph(false),
  route([1, 2, 3, 4, 5], 20),
);

const warren = (): FixtureDefinition => {
  const nodes = [
    node(1, 0, 0, "terrain", 0.5), node(2, 3, 0), node(3, 6, 0), node(4, 9, 0), node(5, 12, 0, "terrain", 0.5),
    node(11, 1.5, 3, "none", 0), node(12, 4.5, 3, "none", 0), node(13, 7.5, 3, "none", 0), node(14, 10.5, 3, "none", 0),
  ];
  const members = [
    member(101, 1, 2, "deck", 400), member(102, 2, 3, "deck", 400), member(103, 3, 4, "deck", 400), member(104, 4, 5, "deck", 400),
    member(201, 11, 12, "truss", 300), member(202, 12, 13, "truss", 300), member(203, 13, 14, "truss", 300),
    member(301, 1, 11, "truss", 260), member(302, 11, 2, "truss", 260), member(303, 2, 12, "truss", 260), member(304, 12, 3, "truss", 260),
    member(305, 3, 13, "truss", 260), member(306, 13, 4, "truss", 260), member(307, 4, 14, "truss", 260), member(308, 14, 5, "truss", 260),
  ];
  return fixture("warren-truss", "Warren truss", "Alternating diagonals use the generic node/member contract.", { nodes, members }, route([1, 2, 3, 4, 5], 20));
};

const chordTruss = (kind: "pratt" | "howe"): FixtureDefinition => {
  const nodes = [
    node(1, 0, 0, "terrain", 0.5), node(2, 3, 0), node(3, 6, 0), node(4, 9, 0), node(5, 12, 0, "terrain", 0.5),
    node(11, 0, 3, "none", 0), node(12, 3, 3, "none", 0), node(13, 6, 3, "none", 0), node(14, 9, 3, "none", 0), node(15, 12, 3, "none", 0),
  ];
  const members = [
    member(101, 1, 2, "deck", 400), member(102, 2, 3, "deck", 400), member(103, 3, 4, "deck", 400), member(104, 4, 5, "deck", 400),
    member(201, 11, 12, "truss", 300), member(202, 12, 13, "truss", 300), member(203, 13, 14, "truss", 300), member(204, 14, 15, "truss", 300),
    member(301, 1, 11, "truss", 270), member(302, 2, 12, "truss", 270), member(303, 3, 13, "truss", 270), member(304, 4, 14, "truss", 270), member(305, 5, 15, "truss", 270),
  ];
  const diagonals = kind === "pratt"
    ? [member(401, 1, 12, "truss", 250), member(402, 2, 13, "truss", 250), member(403, 5, 14, "truss", 250), member(404, 4, 13, "truss", 250)]
    : [member(401, 2, 11, "truss", 250), member(402, 3, 12, "truss", 250), member(403, 4, 15, "truss", 250), member(404, 3, 14, "truss", 250)];
  return fixture(`${kind}-truss`, `${kind[0]?.toUpperCase()}${kind.slice(1)} truss`, `${kind === "pratt" ? "Inward" : "Outward"}-leaning diagonals on the same StructuralGraph API.`, { nodes, members: [...members, ...diagonals] }, route([1, 2, 3, 4, 5], 20));
};

const incompleteDeck = fixture(
  "incomplete-deck",
  "Incomplete deck",
  "One partial member and one critical missing connection create a lost route.",
  {
    nodes: [node(1, 0, 0, "terrain", 0.5), node(2, 4, 0), node(3, 8, 0), node(4, 12, 0, "terrain", 0.5)],
    members: [member(101, 1, 2, "deck", 330), member(102, 2, 3, "deck", 330, 0.42, true), member(103, 3, 4, "deck", 330, 0, false)],
  },
  route([1, 2, 3, 4], 12),
);

const definitions = [
  shortSupported, longSupported, shortCantilever, longCantilever, tStructure,
  centrePier, centrePierRemoved, warren(), chordTruss("pratt"), chordTruss("howe"), incompleteDeck,
];

export const FIXTURES: readonly FixtureDefinition[] = definitions;

export const getFixture = (id: string): FixtureDefinition => {
  const found = FIXTURES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown structural fixture: ${id}`);
  return { ...found, graph: cloneGraph(found.graph), route: { ...found.route, nodeIds: [...found.route.nodeIds], pointLoads: found.route.pointLoads.map((load) => ({ ...load })) } };
};
