export class RevisionClock {
  #value;

  constructor(initial = 0) {
    if (!Number.isSafeInteger(initial) || initial < 0) throw new TypeError('initial revision must be a non-negative safe integer');
    this.#value = initial;
  }

  get value() {
    return this.#value;
  }

  bump() {
    if (this.#value >= Number.MAX_SAFE_INTEGER) throw new RangeError('world revision exhausted');
    this.#value += 1;
    return this.#value;
  }
}
