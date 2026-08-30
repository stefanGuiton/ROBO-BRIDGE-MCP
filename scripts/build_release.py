from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist' / 'ROBO_BRIDGE_MCP_V3.zip'
EXCLUDED_DIRECTORIES = {'.git', '.venv', 'ARCHIVE', 'dist', 'node_modules', '__pycache__', '.pytest_cache', '.cache', 'generated'}
EXCLUDED_FILES = {'RELEASE_MANIFEST.json'}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_fingerprint(files: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in files:
        rel = str(path.relative_to(ROOT)).replace('\\', '/')
        digest.update(rel.encode('utf-8'))
        digest.update(b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


def git_head() -> str | None:
    result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else None


def included_files() -> list[Path]:
    result = []
    for current, directories, filenames in os.walk(ROOT):
        directories[:] = sorted(name for name in directories if name not in EXCLUDED_DIRECTORIES)
        current_path = Path(current)
        for filename in sorted(filenames):
            if filename in EXCLUDED_FILES:
                continue
            result.append(current_path / filename)
    return sorted(result)


def main() -> int:
    verify = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'verify.py')], cwd=ROOT)
    if verify.returncode:
        return verify.returncode
    files = included_files()
    manifest = {
        'project': 'ROBO BRIDGE MCP V3',
        'version': json.loads((ROOT / 'package.json').read_text())['version'],
        'builtAtUtc': datetime.now(timezone.utc).isoformat(),
        'gitHead': git_head(),
        'sourceFingerprintSha256': source_fingerprint(files),
        'files': [
            {'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'size': path.stat().st_size, 'sha256': sha256_bytes(path.read_bytes())}
            for path in files
        ]
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        OUTPUT.unlink()
    with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, Path('LOGO-ROBO-MCP') / path.relative_to(ROOT))
        archive.writestr('LOGO-ROBO-MCP/RELEASE_MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
    release = {'zip': str(OUTPUT), 'size': OUTPUT.stat().st_size, 'sha256': sha256_bytes(OUTPUT.read_bytes()), 'fileCount': len(files) + 1}
    print(json.dumps(release, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
