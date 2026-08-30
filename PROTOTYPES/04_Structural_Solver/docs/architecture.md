# Solver architecture

## Contract boundary

`StructuralGraph` contains only nodes and members. Route and moving-load information is supplied beside the graph so future adapters can compile the graph from bridge/build state without importing renderer objects.

Nodes contain a stable ID, 2D position, support type, and applied static load. Members contain stable endpoint IDs, type, base/current capacity, completion, connectivity, demand, utilisation, failed state, and a many-brick mapping.

## Support connectivity

The active graph excludes failed, disconnected, and zero-completion members. A deterministic multi-source Dijkstra pass records:

- nearest effective support and weighted path distance;
- predecessor node/member for support-path rendering;
- connected components using deterministic depth-first traversal;
- route continuity using breadth-first traversal.

Demand uses a second deterministic shortest-path pass from each loaded node to every reachable support. Inverse-path-distance weights distribute reaction demand across useful supports. This is why a complete centre pier reduces demand on both neighbouring deck spans and removing it increases both.

## Demand and capacity

The fast game model applies load along support paths. Each path member receives a load-times-lever demand plus a small local shear contribution.

Current member capacity is:

```text
baseCapacity × completionFactor
────────────────────────────────────────────────────────
difficulty × (1 + k × typeFactor × (supportDistance / L0)^p)
```

The default exponent is `1.8`. Piers, truss bars, arches, and cables use smaller unsupported-distance factors than open deck/beam members. These factors are tuning controls, not material properties.

A zero-completion critical connection is excluded from connectivity. A partial member remains connected with lower capacity.

## Progressive failure

TEST repeats:

1. solve support connectivity;
2. distribute current loads;
3. calculate demand, effective capacity, and utilisation;
4. choose one member over threshold;
5. mark that member failed;
6. recalculate the changed load path.

Selection is deterministic:

1. highest utilisation;
2. lowest remaining capacity margin;
3. lowest stable member ID.

The default limit is 64 iterations. A `CASCADE_LIMIT` diagnostic is emitted if overloads remain.

BUILD calculates the same diagnostic utilisation on a clone but never enters this loop. BUILD removal edits are copied into a fresh TEST working graph; TEST failure never mutates the BUILD graph.

## Optional truss stiffness mode

The second mode assembles a small dense 2D truss stiffness matrix, constrains both degrees of freedom at fixed/terrain nodes, solves free displacements with deterministic pivoting, and derives axial member force. Singular mechanisms are regularised and explicitly diagnosed. The public graph and result APIs do not change.

## Moving load regions

The train is two point loads whose fractions sum to one. Each point load is distributed between adjacent route nodes. A region signature is derived from axle regions. Calls within the same signature return the previous snapshot; no demand/connectivity solve runs on every animation frame.
