export const FAMILY_CATALOGUE = Object.freeze({
  beam: {
    label: "Brick beam",
    group: "brick",
    constructionSystem: "system-brick",
    compatibility: "brick-native",
    description: "Layered deck spanning between end supports, with optional intermediate piers.",
    parameters: ["panelCount", "pierCount", "pierSpacing"],
  },
  pier: {
    label: "Pier and beam",
    group: "brick",
    constructionSystem: "system-brick",
    compatibility: "brick-native",
    description: "Repeated bonded masonry piers supporting a layered deck.",
    parameters: ["panelCount", "pierCount", "pierSpacing"],
  },
  arch: {
    label: "Masonry arch",
    group: "brick",
    constructionSystem: "system-brick",
    compatibility: "brick-native",
    description: "Single closed-spandrel segmental or semi-elliptical masonry arch.",
    parameters: ["panelCount", "archShape", "archRise"],
  },
  viaduct: {
    label: "Multi-arch viaduct",
    group: "brick",
    constructionSystem: "system-brick",
    compatibility: "brick-native",
    description: "Repeated masonry arch modules sharing substantial piers.",
    parameters: ["archCount", "archShape", "archRise"],
  },
  corbelled: {
    label: "Corbelled bridge",
    group: "brick",
    constructionSystem: "system-brick",
    compatibility: "brick-native",
    description: "Stepped horizontal courses project inward from both abutments.",
    parameters: ["archRise"],
  },
  boxCulvert: {
    label: "Brick box culvert",
    group: "brick",
    constructionSystem: "system-brick",
    compatibility: "brick-native",
    description: "Rectangular portal opening with bonded side walls and a layered lintel deck.",
    parameters: ["panelCount"],
  },
  trestle: {
    label: "Braced trestle",
    group: "hybrid",
    constructionSystem: "hybrid",
    compatibility: "hybrid",
    description: "Brick deck with repeated Technic-style braced trestle bents.",
    parameters: ["panelCount", "pierCount", "pierSpacing", "crossBracing"],
  },
  warren: {
    label: "Warren truss",
    group: "hybrid",
    constructionSystem: "technic",
    compatibility: "hybrid",
    description: "Alternating triangular Technic frame with a brick-compatible deck.",
    parameters: ["panelCount", "trussHeight", "crossBracing"],
  },
  pratt: {
    label: "Pratt truss",
    group: "hybrid",
    constructionSystem: "technic",
    compatibility: "hybrid",
    description: "Vertical frame members with diagonals directed towards the centre.",
    parameters: ["panelCount", "trussHeight", "crossBracing"],
  },
  howe: {
    label: "Howe truss",
    group: "hybrid",
    constructionSystem: "technic",
    compatibility: "hybrid",
    description: "Pratt-derived frame with the diagonal direction reversed.",
    parameters: ["panelCount", "trussHeight", "crossBracing"],
  },
  tiedArch: {
    label: "Tied through-arch",
    group: "hybrid",
    constructionSystem: "hybrid",
    compatibility: "hybrid",
    description: "Deck tie suspended from two conceptual arch ribs by vertical hangers.",
    parameters: ["panelCount", "trussHeight", "hangerSpacing", "crossBracing"],
  },
  suspension: {
    label: "Suspension",
    group: "hybrid",
    constructionSystem: "hybrid",
    compatibility: "hybrid",
    description: "Brick towers and deck with analytic main cables and hanger targets.",
    parameters: ["panelCount", "towerHeight", "cableSag", "hangerSpacing"],
  },
  bascule: {
    label: "Tower bascule",
    group: "hybrid",
    constructionSystem: "hybrid",
    compatibility: "hybrid",
    description: "Static double-leaf bascule intent with masonry towers and explicit hinges.",
    parameters: ["panelCount", "towerHeight"],
  },
});

export const FAMILY_IDS = Object.freeze(Object.keys(FAMILY_CATALOGUE));
export const BRICK_FAMILY_IDS = Object.freeze(FAMILY_IDS.filter((id) => FAMILY_CATALOGUE[id].group === "brick"));
export const HYBRID_FAMILY_IDS = Object.freeze(FAMILY_IDS.filter((id) => FAMILY_CATALOGUE[id].group === "hybrid"));

export function familyProfile(family) {
  return FAMILY_CATALOGUE[family] ?? null;
}
