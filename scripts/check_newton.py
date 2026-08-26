from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHYSICS_ROOT = ROOT / 'physics' / 'newton-service'
sys.path.insert(0, str(PHYSICS_ROOT))

from app.newton_backend import detect_newton  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description='Check installed Newton packages and optionally initialise the runtime.')
    parser.add_argument('--runtime', action='store_true', help='Import Newton/Warp and enumerate devices.')
    parser.add_argument('--device', default='cpu', help='Warp device selected for the runtime probe (default: cpu).')
    args = parser.parse_args()

    result = dict(detect_newton().__dict__)
    result['runtimeTested'] = False
    if args.runtime:
        os.environ.setdefault('WARP_DEVICE', args.device)
        os.environ.setdefault('WARP_CACHE_PATH', str(ROOT / '.cache' / 'warp'))
        try:
            import newton  # type: ignore
            import warp as wp  # type: ignore

            wp.set_device(args.device)
            result.update(
                runtimeTested=True,
                runtimeImportOk=True,
                selectedDevice=str(wp.get_device()),
                devices=[str(device) for device in wp.get_devices()],
                newtonRuntimeVersion=getattr(newton, '__version__', result['newton_version']),
                warpRuntimeVersion=getattr(wp, '__version__', result['warp_version']),
            )
        except Exception as exc:
            result.update(runtimeTested=True, runtimeImportOk=False, runtimeReason=f'{type(exc).__name__}: {exc}')

    print(json.dumps(result, indent=2))
    return 0 if result['available'] and (not args.runtime or result.get('runtimeImportOk')) else 1


if __name__ == '__main__':
    raise SystemExit(main())
