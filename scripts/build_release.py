from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist' / 'ROBO_BRIDGE_MCP_MAIN_DEMO.zip'
EXCLUDED_DIRECTORIES = {'.git', '.venv', '.playwright', '.playwright-cli', '.test-dist', '.npm-cache', 'ARCHIVE', 'dist', 'downloads from oracle', 'Downloads', 'Scene_and_3D_Files', 'artifacts', 'evidence', 'node_modules', 'output', '__pycache__', '.pytest_cache', '.cache', 'generated', '.agent', '.agents', '.codex', '.vscode', 'browser-profile', 'browser-profiles', 'chrome-profile', 'chromium-profile', 'user-data-dir', 'user data'}
EXCLUDED_FILES = {'.git', 'RELEASE_MANIFEST.json', 'apps.zip', 'Downloads.zip'}
BROWSER_PROFILE_FILES = {'cookies', 'login data', 'web data', 'local state', 'preferences', 'secure preferences', 'history', 'bookmarks', 'network persistent state', 'top sites', 'favicons', 'visited links'}
LFS_POINTER_PREFIX = b'version https://git-lfs.github.com/spec/v1'


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


def included_files(root: Path = ROOT) -> list[Path]:
    """Select tracked worktree bytes, never arbitrary local files or LFS stubs."""
    root = root.resolve(strict=True)
    # Preserve the NUL-delimited path bytes: text=True rewrites CR/CRLF inside
    # legal POSIX filenames and can select a different, untracked local file.
    tracked = subprocess.run(['git', 'ls-files', '--stage', '-z'], cwd=root,
                             capture_output=True)
    if tracked.returncode:
        raise RuntimeError('Cannot enumerate tracked release files; no filesystem-walk fallback is allowed.')
    excluded_directories = {name.casefold() for name in EXCLUDED_DIRECTORIES}
    excluded_files = {name.casefold() for name in EXCLUDED_FILES}
    private_profile_files = {name + suffix for name in BROWSER_PROFILE_FILES
                             for suffix in ('', '-journal', '-wal', '-shm')}
    selected: set[Path] = set()
    for entry in tracked.stdout.split(b'\0'):
        if not entry:
            continue
        metadata, raw_relative = entry.split(b'\t', 1)
        mode, _object_id, stage = metadata.decode('ascii').split()
        relative = raw_relative.decode('utf-8')
        name = PurePosixPath(relative)
        if name.is_absolute() or '..' in name.parts or '\\' in relative or ':' in relative:
            raise RuntimeError(f'Unsafe tracked release path: {relative!r}')
        parts = [part.casefold() for part in name.parts]
        if not parts:
            raise RuntimeError('Empty tracked release path.')
        if any(part in excluded_directories or part.startswith('.oracle-stage-') for part in parts[:-1]):
            continue
        filename = parts[-1]
        if (filename in excluded_files or filename in private_profile_files
                or filename == '.env' or filename.startswith('.env.')
                or filename.endswith(('.env', '.log'))):
            continue
        if stage != '0' or mode not in {'100644', '100755'}:
            raise RuntimeError(f'Unmerged, linked or non-regular release entry: {relative!r}')
        path = root.joinpath(*name.parts)
        resolved = path.resolve(strict=True)
        if not resolved.is_relative_to(root) or resolved != path or path.is_symlink() or not path.is_file():
            raise RuntimeError(f'Release entry must be a regular file inside the checkout: {relative!r}')
        with path.open('rb') as stream:
            if stream.read(len(LFS_POINTER_PREFIX)) == LFS_POINTER_PREFIX:
                raise RuntimeError(f'Release asset is an unhydrated Git LFS pointer: {relative!r}')
        selected.add(path)
    if not selected:
        raise RuntimeError('No tracked release files were selected.')
    return sorted(selected)


def main() -> int:
    verify = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'verify.py')], cwd=ROOT)
    if verify.returncode:
        return verify.returncode
    files = included_files()
    manifest = {
        'project': 'ROBO BRIDGE MCP MAIN_DEMO',
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
            archive.write(path, Path('ROBO-BRIDGE-MCP') / path.relative_to(ROOT))
        archive.writestr('ROBO-BRIDGE-MCP/RELEASE_MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
    release = {'zip': str(OUTPUT), 'size': OUTPUT.stat().st_size, 'sha256': sha256_bytes(OUTPUT.read_bytes()), 'fileCount': len(files) + 1}
    print(json.dumps(release, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
