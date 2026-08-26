from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description='Start the ROBO-SIM-MCP physics service and web app.')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument(
        '--physics-backend',
        choices=('fallback', 'newton'),
        default='fallback',
        help='Select the explicit physics authority. Newton must be installed and qualified before use.',
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    physics_root = root / 'physics' / 'newton-service'
    python = sys.executable
    processes: list[subprocess.Popen[str]] = []
    physics_environment = os.environ.copy()
    physics_environment['ROBO_SIM_PHYSICS_BACKEND'] = args.physics_backend
    physics_environment.setdefault('WARP_CACHE_PATH', str(root / '.cache' / 'warp'))
    try:
        processes.append(
            subprocess.Popen(
                [python, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'],
                cwd=physics_root,
                env=physics_environment,
                text=True,
            )
        )
        processes.append(
            subprocess.Popen([python, str(root / 'scripts' / 'serve_web.py')], cwd=root, text=True)
        )
        time.sleep(1.3)
        if not args.no_browser:
            webbrowser.open('http://127.0.0.1:8769')
        print('Press Ctrl+C to stop both services.')
        while all(process.poll() is None for process in processes):
            time.sleep(0.4)
        return next((process.returncode or 1 for process in processes if process.poll() is not None), 1)
    except KeyboardInterrupt:
        return 0
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=4)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == '__main__':
    raise SystemExit(main())
