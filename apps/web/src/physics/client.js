const DEFAULT_URL = 'http://127.0.0.1:8001';

function withTimeout(ms, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Physics request timed out', 'TimeoutError')), ms);
  const abort = () => controller.abort(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  signal?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}

export class PhysicsClient {
  constructor(baseUrl = localStorage.getItem('roboSim.physicsUrl') || DEFAULT_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.lastHealth = null;
  }

  async health({ signal } = {}) {
    const timeout = withTimeout(1800, signal);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: timeout.signal });
      if (!response.ok) throw new Error(`Physics health returned ${response.status}`);
      this.lastHealth = await response.json();
      return { ok: true, ...this.lastHealth };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error), backend: 'browser-fallback' };
    } finally {
      timeout.dispose();
    }
  }

  async simulateTrajectory(payload, { signal } = {}) {
    const timeout = withTimeout(12000, signal);
    try {
      const response = await fetch(`${this.baseUrl}/v1/simulate/trajectory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: timeout.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, reason: body.detail || `Physics service returned ${response.status}`, backend: 'service-error' };
      }
      return body;
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        backend: 'browser-fallback',
        fallbackRecommended: true
      };
    } finally {
      timeout.dispose();
    }
  }

  async synchroniseScene(scene, { signal } = {}) {
    return this.#post('/v1/scene/sync', scene, { signal, timeoutMs: 3000 });
  }

  async resetScene({ signal } = {}) {
    return this.#post('/v1/scene/reset', null, { signal, timeoutMs: 3000 });
  }

  async getResult(requestId, { signal } = {}) {
    const timeout = withTimeout(3000, signal);
    try {
      const response = await fetch(`${this.baseUrl}/v1/results/${encodeURIComponent(requestId)}`, { signal: timeout.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, reason: body.detail || `Physics service returned ${response.status}` };
      return body;
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    } finally {
      timeout.dispose();
    }
  }

  async #post(path, payload, { signal, timeoutMs }) {
    const timeout = withTimeout(timeoutMs, signal);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload === null ? undefined : JSON.stringify(payload),
        signal: timeout.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, reason: body.detail || `Physics service returned ${response.status}` };
      return body;
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    } finally {
      timeout.dispose();
    }
  }
}

function pointInsideExpandedBox(point, object, expansionMm) {
  const half = {
    x: object.size.xMm / 2 + expansionMm,
    y: object.size.yMm / 2 + expansionMm,
    z: object.size.zMm / 2 + expansionMm
  };
  return Math.abs(point.xMm - object.position.xMm) <= half.x
    && Math.abs(point.yMm - object.position.yMm) <= half.y
    && Math.abs(point.zMm - object.position.zMm) <= half.z;
}

export function browserFallbackValidate({ trajectory, scene, endEffectorRadiusMm = 34 }) {
  const obstacles = scene.objects.filter((object) => object.semanticRole === 'obstacle');
  const collisions = [];
  for (let index = 0; index < trajectory.length; index += 1) {
    const point = trajectory[index];
    for (const obstacle of obstacles) {
      if (pointInsideExpandedBox(point, obstacle, endEffectorRadiusMm)) {
        collisions.push({ trajectoryIndex: index, obstacleId: obstacle.id, point });
      }
    }
  }
  return {
    ok: collisions.length === 0,
    backend: 'browser-aabb-fallback',
    validatedTrajectory: trajectory,
    collisions,
    warnings: ['This fallback validates end-effector clearance only. Newton must validate final contacts and grasp physics.']
  };
}
