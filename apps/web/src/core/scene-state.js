const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const INITIAL_SCENE = Object.freeze({
  revision: 0,
  objects: Object.freeze([
    Object.freeze({
      id: 'red-cube-1',
      label: 'Red cube',
      type: 'cube',
      semanticRole: 'workpiece',
      colour: '#ef4444',
      position: Object.freeze({ xMm: 220, yMm: -150, zMm: 25 }),
      size: Object.freeze({ xMm: 50, yMm: 50, zMm: 50 }),
      massKg: 0.18,
      friction: 0.72,
      movable: true,
      graspable: true,
      heldBy: null
    }),
    Object.freeze({
      id: 'blue-cube-1',
      label: 'Blue cube',
      type: 'cube',
      semanticRole: 'workpiece',
      colour: '#3b82f6',
      position: Object.freeze({ xMm: 100, yMm: 210, zMm: 25 }),
      size: Object.freeze({ xMm: 50, yMm: 50, zMm: 50 }),
      massKg: 0.18,
      friction: 0.72,
      movable: true,
      graspable: true,
      heldBy: null
    }),
    Object.freeze({
      id: 'red-bin',
      label: 'Red bin',
      type: 'bin',
      semanticRole: 'destination',
      colour: '#991b1b',
      position: Object.freeze({ xMm: -190, yMm: 210, zMm: 35 }),
      size: Object.freeze({ xMm: 150, yMm: 130, zMm: 70 }),
      movable: false,
      graspable: false,
      acceptsColours: Object.freeze(['#ef4444'])
    }),
    Object.freeze({
      id: 'blue-bin',
      label: 'Blue bin',
      type: 'bin',
      semanticRole: 'destination',
      colour: '#1d4ed8',
      position: Object.freeze({ xMm: -270, yMm: -145, zMm: 35 }),
      size: Object.freeze({ xMm: 150, yMm: 130, zMm: 70 }),
      movable: false,
      graspable: false,
      acceptsColours: Object.freeze(['#3b82f6'])
    }),
    Object.freeze({
      id: 'yellow-obstacle',
      label: 'Yellow obstacle',
      type: 'box',
      semanticRole: 'obstacle',
      colour: '#eab308',
      position: Object.freeze({ xMm: 20, yMm: 20, zMm: 90 }),
      size: Object.freeze({ xMm: 120, yMm: 110, zMm: 180 }),
      movable: false,
      graspable: false
    })
  ])
});

export class SceneState {
  #state;
  #listeners = new Set();

  constructor(initial = INITIAL_SCENE) {
    this.#state = deepClone(initial);
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(event) {
    for (const listener of this.#listeners) listener(event, this.getState());
  }

  getState() {
    return deepClone(this.#state);
  }

  getObject(id) {
    const object = this.#state.objects.find((item) => item.id === id);
    return object ? deepClone(object) : null;
  }

  updateObject(id, patch, eventType = 'object_updated') {
    const index = this.#state.objects.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, reason: 'object_not_found', objectId: id };
    const current = this.#state.objects[index];
    this.#state.objects[index] = {
      ...current,
      ...deepClone(patch),
      position: patch.position ? { ...current.position, ...patch.position } : current.position,
      size: patch.size ? { ...current.size, ...patch.size } : current.size
    };
    this.#state.revision += 1;
    this.#notify({ type: eventType, objectId: id });
    return { ok: true, object: this.getObject(id), revision: this.#state.revision };
  }

  reset() {
    this.#state = deepClone(INITIAL_SCENE);
    this.#notify({ type: 'scene_reset' });
    return this.getState();
  }
}
