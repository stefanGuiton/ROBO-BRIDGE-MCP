from __future__ import annotations

import argparse
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description='Start the ROBO BRIDGE MCP V3 local web app.')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    process = subprocess.Popen([sys.executable, str(root / 'scripts' / 'serve_web.py')], cwd=root, text=True)
    try:
        time.sleep(0.7)
        if not args.no_browser:
            webbrowser.open('http://127.0.0.1:8769')
        print('ROBO BRIDGE MCP V3: http://127.0.0.1:8769')
        print('Press Ctrl+C to stop.')
        return process.wait()
    except KeyboardInterrupt:
        return 0
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == '__main__':
    raise SystemExit(main())
