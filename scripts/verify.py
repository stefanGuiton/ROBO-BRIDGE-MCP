from __future__ import annotations

import json
import py_compile
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))


def run(name: str, command: list[str], cwd: Path = ROOT) -> dict[str, object]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    print(f'[{name}] exit={result.returncode}')
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip())
    return {'name': name, 'command': command, 'exitCode': result.returncode}


def run_javascript_tests() -> dict[str, object]:
    files = [
        'tests/js/scara.test.js',
        'tests/js/controller.test.js',
        'tests/js/webmcp.test.js',
        'tests/js/robot-kinematics.test.js',
        'tests/js/robot-controller.test.js',
        'tests/js/latch-collision.test.js',
        'tests/js/reliability.test.js',
        'tests/js/logo-webmcp.test.js',
    ]
    command = ['node', '--test', '--test-concurrency=1', *files]
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    if result.returncode == 0:
        print('[JavaScript tests] exit=0')
        print(result.stdout.rstrip())
        return {'name': 'JavaScript tests', 'command': command, 'exitCode': 0, 'mode': 'node-test-runner'}

    combined_output = f'{result.stdout}\n{result.stderr}'
    if 'spawn EPERM' not in combined_output:
        print('[JavaScript tests] exit=1')
        print(combined_output.rstrip())
        return {'name': 'JavaScript tests', 'command': command, 'exitCode': result.returncode}

    # Some managed Windows environments block node:test worker creation. A
    # directly executed test module still uses node:test assertions but stays
    # in one process, so verify each file separately as a fail-closed fallback.
    fallback_results = []
    for path in files:
        fallback = subprocess.run(['node', path], cwd=ROOT, text=True, capture_output=True)
        fallback_results.append({'file': path, 'exitCode': fallback.returncode})
        if fallback.stdout:
            print(fallback.stdout.rstrip())
        if fallback.stderr:
            print(fallback.stderr.rstrip())
    exit_code = 0 if all(item['exitCode'] == 0 for item in fallback_results) else 1
    print(f'[JavaScript tests] managed-worker fallback exit={exit_code}')
    return {
        'name': 'JavaScript tests',
        'command': command,
        'exitCode': exit_code,
        'mode': 'direct-module-fallback-after-spawn-eperm',
        'files': fallback_results,
    }


def main() -> int:
    checks: list[dict[str, object]] = []
    checks.append(run_javascript_tests())
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
        'apps/web/src/logo/main.js',
        'apps/web/src/render/robot-renderer.js',
        'apps/web/src/webmcp/register-logo-tools.js',
        'physics/newton-service/app/main.py',
        'physics/newton-service/app/newton_backend.py',
    ]
    missing = [path for path in required if not (ROOT / path).is_file()]
    checks.append({'name': 'Required files', 'exitCode': 1 if missing else 0, 'missing': missing})

    browser_results_path = ROOT / 'evidence' / 'oracle1' / 'browser-runtime-results.json'
    retained_browser_results_path = ROOT / 'evidence' / 'setup' / 'browser' / 'runtime-results.json'
    newton_results_path = ROOT / 'evidence' / 'setup' / 'newton-runtime-results.json'
    browser_results = json.loads(browser_results_path.read_text(encoding='utf-8')) if browser_results_path.is_file() else None
    retained_browser_results = json.loads(retained_browser_results_path.read_text(encoding='utf-8')) if retained_browser_results_path.is_file() else None
    newton_results = json.loads(newton_results_path.read_text(encoding='utf-8')) if newton_results_path.is_file() else None

    result = {
        'project': 'LOGO ROBO',
        'repository': 'stefanGuiton/LOGO-ROBO-MCP',
        'version': PACKAGE.get('version'),
        'checks': checks,
        'ok': all(check['exitCode'] == 0 for check in checks),
        'browserRuntimeTested': bool(browser_results and browser_results.get('ok')),
        'browserRuntimeEvidence': str(browser_results_path.relative_to(ROOT)) if browser_results else None,
        'retainedFoundationBrowserRuntimeTested': bool(retained_browser_results and retained_browser_results.get('ok')),
        'retainedFoundationBrowserRuntimeEvidence': str(retained_browser_results_path.relative_to(ROOT)) if retained_browser_results else None,
        'newtonRuntimeTested': bool(newton_results and newton_results.get('ok')),
        'newtonRuntimeEvidence': str(newton_results_path.relative_to(ROOT)) if newton_results else None,
        'newtonRuntimeNote': None if newton_results else 'Installed, but runtime qualification is paused by the GPU thermal stop condition.',
        'oracle1WorkspaceEvidence': 'evidence/oracle1/workspace-qualification.json' if (ROOT / 'evidence/oracle1/workspace-qualification.json').is_file() else None,
        'oracle1ReliabilityEvidence': 'evidence/oracle1/reliability-results.json' if (ROOT / 'evidence/oracle1/reliability-results.json').is_file() else None,
        'oracle1PerformanceEvidence': 'evidence/oracle1/performance-results.json' if (ROOT / 'evidence/oracle1/performance-results.json').is_file() else None,
    }
    evidence = ROOT / 'evidence' / 'foundation-verification.json'
    evidence.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
