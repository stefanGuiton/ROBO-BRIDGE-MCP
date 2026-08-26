from __future__ import annotations

import argparse
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description='Start the ROBO-SIM-MCP physics service and web app.')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    physics_root = root / 'physics' / 'newton-service'
    python = sys.executable
    processes: list[subprocess.Popen[str]] = []
    try:
        processes.append(
            subprocess.Popen(
                [python, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001'],
                cwd=physics_root,
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
