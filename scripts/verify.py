from __future__ import annotations

import json
import py_compile
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(name: str, command: list[str], cwd: Path = ROOT) -> dict[str, object]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    print(f'[{name}] exit={result.returncode}')
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip())
    return {'name': name, 'command': command, 'exitCode': result.returncode}


def main() -> int:
    checks: list[dict[str, object]] = []
    checks.append(run('JavaScript tests', ['node', '--test', 'tests/js/scara.test.js', 'tests/js/controller.test.js', 'tests/js/webmcp.test.js']))
    checks.append(run('Physics tests', [sys.executable, '-m', 'pytest', 'physics/newton-service/tests', '-q']))

    js_files = sorted(str(path.relative_to(ROOT)) for path in (ROOT / 'apps' / 'web' / 'src').rglob('*.js'))
    syntax_failures = []
    for relative in js_files:
        result = subprocess.run(['node', '--check', relative], cwd=ROOT, text=True, capture_output=True)
        if result.returncode != 0:
            syntax_failures.append({'file': relative, 'stderr': result.stderr})
    checks.append({'name': 'JavaScript syntax', 'exitCode': 1 if syntax_failures else 0, 'files': len(js_files), 'failures': syntax_failures})

    compiled = 0
    for path in (ROOT / 'physics' / 'newton-service').rglob('*.py'):
        py_compile.compile(str(path), doraise=True)
        compiled += 1
    for path in (ROOT / 'scripts').glob('*.py'):
        py_compile.compile(str(path), doraise=True)
        compiled += 1
    checks.append({'name': 'Python compile', 'exitCode': 0, 'files': compiled})

    required = [
        'MASTER_PLAN.md',
        'README.md',
        'PREEXISTING_WORK.md',
        'apps/web/index.html',
        'apps/web/src/main.js',
        'apps/web/src/webmcp/register-tools.js',
        'physics/newton-service/app/main.py',
        'physics/newton-service/app/newton_backend.py',
    ]
    missing = [path for path in required if not (ROOT / path).is_file()]
    checks.append({'name': 'Required files', 'exitCode': 1 if missing else 0, 'missing': missing})

    result = {
        'project': 'ROBO-SIM-MCP',
        'version': '0.1.0-foundation',
        'checks': checks,
        'ok': all(check['exitCode'] == 0 for check in checks),
        'browserRuntimeTested': False,
        'browserRuntimeNote': 'The build VM had no direct network access, so Three.js CDN loading and WebMCP browser execution require the target PC.',
        'newtonRuntimeTested': False,
        'newtonRuntimeNote': 'Newton and Warp were not installed in the build VM. The integration boundary is scaffolded; deterministic fallback tests pass.',
    }
    evidence = ROOT / 'evidence' / 'foundation-verification.json'
    evidence.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
