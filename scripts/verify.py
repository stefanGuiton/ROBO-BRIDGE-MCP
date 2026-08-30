from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_SOURCE_PARTS = {'.git', '.venv', '.playwright-cli', '.test-dist', 'ARCHIVE', 'dist', 'downloads from oracle', 'evidence', 'output', '__pycache__', '.pytest_cache', '.cache', 'node_modules'}


def run(name: str, command: list[str]) -> dict[str, object]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    print(f'[{name}] exit={result.returncode}')
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip())
    return {'name': name, 'command': command, 'exitCode': result.returncode}


def source_fingerprint() -> str:
    digest = hashlib.sha256()
    for current, directories, filenames in os.walk(ROOT):
        directories[:] = sorted(name for name in directories if name not in EXCLUDED_SOURCE_PARTS)
        current_path = Path(current)
        for filename in sorted(filenames):
            path = current_path / filename
            relative = path.relative_to(ROOT)
            digest.update(str(relative).replace('\\', '/').encode())
            digest.update(b'\0')
            data = path.read_bytes()
            try:
                data = data.decode('utf-8').replace('\r\n', '\n').encode('utf-8')
            except UnicodeDecodeError:
                pass
            digest.update(data)
            digest.update(b'\0')
    return digest.hexdigest()


def git_head() -> str | None:
    result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else None


def python_syntax() -> dict[str, object]:
    failures = []
    files = sorted((ROOT / 'scripts').glob('*.py'))
    for path in files:
        try:
            compile(path.read_text(encoding='utf-8'), str(path), 'exec')
        except SyntaxError as exc:
            failures.append({'file': str(path.relative_to(ROOT)), 'error': str(exc)})
    return {'name': 'Python syntax', 'exitCode': 1 if failures else 0, 'files': len(files), 'failures': failures}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--write-evidence', action='store_true')
    args = parser.parse_args()
    checks: list[dict[str, object]] = []
    checks.append(run('JavaScript tests', ['node', '--test', '--test-concurrency=1', *[str(p.relative_to(ROOT)) for p in sorted((ROOT / 'tests' / 'js').glob('*.test.js'))]]))
    checks.append(run('Reliability', ['node', 'scripts/reliability.mjs']))
    js_failures = []
    js_files = sorted((ROOT / 'apps' / 'web' / 'src').rglob('*.js'))
    for path in js_files:
        result = subprocess.run(['node', '--check', str(path.relative_to(ROOT))], cwd=ROOT, text=True, capture_output=True)
        if result.returncode:
            js_failures.append({'file': str(path.relative_to(ROOT)), 'stderr': result.stderr})
    checks.append({'name': 'JavaScript syntax', 'exitCode': 1 if js_failures else 0, 'files': len(js_files), 'failures': js_failures})
    checks.append(python_syntax())
    required = [
        '.gitattributes', 'MASTER_PLAN.md', 'README.md', 'FULL_REMEDIATION_PLAN_5_6_PRO.md', 'apps/web/index.html',
        'apps/web/src/logo/main.js', 'apps/web/src/logo/runtime.js', 'apps/web/src/logo/workcell-adapter.js',
        'apps/web/src/robot/controller.js', 'apps/web/src/robot/collision.js', 'apps/web/src/bricks/build-board.js',
        'apps/web/src/perception/observation-service.js', 'apps/web/src/webmcp/register-tools.js',
        'apps/web/src/player/player-controller.js', 'apps/web/src/player/human-build-adapter.js',
        'apps/web/config/player/LOGO_ROBO_PLAYER_SETTINGS.json', 'docs/MAIN_DEMO_V8_INTEGRATION.md'
    ]
    missing = [path for path in required if not (ROOT / path).is_file()]
    checks.append({'name': 'Required files', 'exitCode': 1 if missing else 0, 'missing': missing})
    removed = ['physics', 'apps/web/src/physics', 'apps/web/src/core', 'apps/web/src/webmcp/register-logo-tools.js']
    unexpectedly_present = [path for path in removed if (ROOT / path).exists()]
    checks.append({'name': 'Removed legacy/Newton paths', 'exitCode': 1 if unexpectedly_present else 0, 'unexpectedlyPresent': unexpectedly_present})
    result = {
        'project': 'ROBO BRIDGE MCP MAIN_DEMO',
        'version': json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version'],
        'generatedAtUtc': datetime.now(timezone.utc).isoformat(),
        'gitHead': git_head(),
        'sourceFingerprintSha256': source_fingerprint(),
        'checks': checks,
        'ok': all(check['exitCode'] == 0 for check in checks),
        'notes': ['Verification is read-only unless --write-evidence is supplied.', 'MAIN_DEMO adapts Player V8 into the one authoritative UR10/BuildBoard runtime.', 'NVIDIA Newton and the duplicate SCARA runtime are not part of this source state.']
    }
    print(json.dumps(result, indent=2))
    if args.write_evidence:
        out = ROOT / 'evidence' / 'generated' / 'verification.json'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
