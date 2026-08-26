from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / 'ROBO-SIM-MCP-foundation-v0.1.0.zip'
EXCLUDED_PARTS = {'.git', '.venv', '__pycache__', '.pytest_cache', 'node_modules'}
EXCLUDED_SUFFIXES = {'.pyc', '.pyo'}


def included_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob('*'):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if any(part in EXCLUDED_PARTS for part in relative.parts):
            continue
        if path.suffix in EXCLUDED_SUFFIXES:
            continue
        files.append(path)
    return sorted(files)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    verify = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'verify.py')], cwd=ROOT)
    if verify.returncode != 0:
        return verify.returncode

    for cache in list(ROOT.rglob('__pycache__')) + [ROOT / '.pytest_cache']:
        if cache.exists():
            shutil.rmtree(cache)

    files = included_files()
    manifest = {
        'project': 'ROBO-SIM-MCP',
        'version': '0.1.0-foundation',
        'builtAtUtc': datetime.now(timezone.utc).isoformat(),
        'fileCount': len(files),
        'files': [
            {
                'path': str(path.relative_to(ROOT)).replace('\\', '/'),
                'size': path.stat().st_size,
                'sha256': sha256(path),
            }
            for path in files
            if path.name != 'release-manifest.json'
        ],
    }
    manifest_path = ROOT / 'evidence' / 'release-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    files = included_files()

    if OUTPUT.exists():
        OUTPUT.unlink()
    with zipfile.ZipFile(OUTPUT, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, Path('ROBO-SIM-MCP') / path.relative_to(ROOT))

    release = {
        'zip': str(OUTPUT),
        'size': OUTPUT.stat().st_size,
        'sha256': sha256(OUTPUT),
        'fileCount': len(files),
    }
    (ROOT / 'evidence' / 'release.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(release, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
