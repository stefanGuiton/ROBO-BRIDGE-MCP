# Prototype contracts

## Rail support

This is the only external route-failure input consumed by train physics:

```ts
type RailSupportSegment = {
  id: number;
  startS: number;
  endS: number;
  supported: boolean;
};
```

Rules:

- `startS` is inclusive; `endS` is exclusive except for the final route endpoint.
- IDs are stable for one route.
- read queries do not mutate support state or physics revisions;
- `setRailSupport(id, supported)` is the only public support mutation;
- the train does not know why support changed or which structure/brick generated it.

The future integrated adapter may carry additional mapping metadata beside this minimal contract. It must not make the train depend on that metadata.

## Train load output

`getTrainLoads()` returns one record per active train body:

```ts
type TrainLoad = {
  bodyIndex: number;
  role: "locomotive" | "carriage";
  active: boolean;
  routeS: number;
  position: { x: number; y: number; z: number };
  approximateMass: number;
  approximateLoadNewtons: number;
};
```

`getLoadPositions()` returns the smaller moving-load projection: `bodyIndex`, `routeS`, world `position`, and `approximateLoadNewtons`.

These are approximate body-centre loads. They contain no structural member, placement, bridge family, or generator reference. A future structural adapter decides how to distribute them.

## Public browser interface

The page exposes a frozen `window.roboBridgeTrain` object:

```ts
startTest(): TrainSnapshot
stopTest(): TrainSnapshot
resetTrain(): TrainSnapshot

setRailSupport(segmentId: number, supported: boolean): boolean

getTrainProgress(): { routeS: number; normalized: number; elapsed: number }
getTrainLoads(): TrainLoad[]
getLoadPositions(): LoadPosition[]
getSnapshot(): TrainSnapshot

onDerail(listener): () => void
onFall(listener): () => void
onComplete(listener): () => void
```

The returned function from each event registration unsubscribes the listener.

`TrainSnapshot.performance` reports logical steps, actual Rapier steps, skipped Rapier steps, step-path kind and Rapier usage ratio. `TrainSnapshot.couplers` reports the two gameplay angles (`yawRadians`, `pitchRadians`) without exposing Rapier handles.

Outcomes are `DERAILED`, `TRAIN_FELL`, `CROSSED`, or `STOPPED`. A derail event may be emitted before the final fall outcome so integrated presentation can show the transition.
