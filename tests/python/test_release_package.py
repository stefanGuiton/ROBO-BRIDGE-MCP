"""Temporary-fixture checks only; never write the checkout or a release ZIP."""
from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True

SPEC = importlib.util.spec_from_file_location('release_package', Path(__file__).resolve().parents[2] / 'scripts' / 'build_release.py')
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)


class ReleaseSelectionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = tempfile.TemporaryDirectory(prefix='robo-release-selection-')
        self.addCleanup(self.fixture.cleanup)
        self.root = Path(self.fixture.name).resolve()

    def file(self, relative, data=b'fixture'):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def select(self, *entries, returncode=0):
        listing = ''.join(f'{mode} {"a" * 40} {stage}\t{name}\0'
                          for mode, stage, name in entries)
        result = subprocess.CompletedProcess([], returncode, stdout=listing.encode('utf-8'), stderr=b'')
        with patch.object(RELEASE.subprocess, 'run', return_value=result) as run:
            selected = RELEASE.included_files(self.root)
            self.assertEqual(run.call_args.args[0], ['git', 'ls-files', '--stage', '-z'])
            self.assertFalse(run.call_args.kwargs.get('text', False))
            self.assertNotIn('encoding', run.call_args.kwargs)
            return selected

    def test_only_tracked_regular_files_with_unicode_and_spaces(self):
        expected = self.file('apps/web/colours/bleu été.json')
        self.file('HANDOFF_PRIVATE.md', b'not selected')
        self.file('untracked-file.js')
        self.assertEqual(self.select(('100644', '0', 'apps/web/colours/bleu été.json')), [expected])

    @unittest.skipIf(os.name == 'nt', 'Windows filenames cannot contain tabs or CR/LF.')
    def test_nul_delimited_tabs_and_newlines_preserve_the_tracked_filename(self):
        relative = 'apps/web/bleu\t\r\nété.js'
        expected = self.file(relative, b'tracked')
        self.file(relative.replace('\r\n', '\n'), b'private untracked file')
        self.assertEqual(self.select(('100644', '0', relative)), [expected])

    def test_case_insensitive_private_paths_are_excluded_even_if_tracked(self):
        expected = self.file('apps/web/index.html')
        excluded = ['.ENV', '.env.production', 'SERVER.LOG', '.CoDeX/settings.json',
                    'Browser-Profile/Cookies', 'chromium-profile/Local State', 'user-data-dir/Default/History',
                    'Downloads/private.md', 'Scene_and_3D_Files/model.blend', 'output/private.json',
                    '.oracle-stage-20260902/extracted.js', 'dist/old.zip', 'RELEASE_MANIFEST.json']
        # Excluded tracked paths may be absent; they must not be read or resolved.
        entries = [('100644', '0', 'apps/web/index.html')] + [('100644', '0', name) for name in excluded]
        self.assertEqual(self.select(*entries), [expected])

    def test_standard_browser_profile_files_and_named_env_files_are_excluded(self):
        expected = self.file('apps/web/index.html')
        private = ['User Data/Default/Network/Cookies', 'Default/Login Data', 'Local State',
                   'Default/Preferences', 'Default/SECURE PREFERENCES', 'Default/History',
                   'Network/Cookies-wal', 'Login Data-journal', 'Web Data-shm',
                   'dev.env', '.playwright/.auth/state.json']
        for name in private:
            self.file(name, b'private fixture, even when tracked')
        entries = [('100644', '0', name) for name in ['apps/web/index.html', *private]]
        self.assertEqual(self.select(*entries), [expected])

    def test_git_failure_has_no_walk_fallback(self):
        self.file('apps/web/index.html')
        with self.assertRaisesRegex(RuntimeError, 'Cannot enumerate tracked'):
            self.select(returncode=128)

    def test_missing_git_has_no_walk_fallback(self):
        self.file('apps/web/index.html')
        with patch.object(RELEASE.subprocess, 'run', side_effect=FileNotFoundError('git missing')):
            with self.assertRaises(FileNotFoundError):
                RELEASE.included_files(self.root)

    def test_non_utf8_git_filename_fails_closed(self):
        listing = b'100644 ' + b'a' * 40 + b' 0\tapps/web/invalid-\xff.js\0'
        result = subprocess.CompletedProcess([], 0, stdout=listing, stderr=b'')
        with patch.object(RELEASE.subprocess, 'run', return_value=result):
            with self.assertRaises(UnicodeDecodeError):
                RELEASE.included_files(self.root)

    def test_missing_selected_tracked_file_fails(self):
        with self.assertRaises(FileNotFoundError):
            self.select(('100644', '0', 'apps/web/missing.js'))

    def test_lfs_pointer_rejected_but_real_worktree_asset_preserved(self):
        asset = self.file('apps/web/assets/model.glb', RELEASE.LFS_POINTER_PREFIX + b'\noid sha256:abc\nsize 123\n')
        with self.assertRaisesRegex(RuntimeError, 'unhydrated Git LFS'):
            self.select(('100644', '0', 'apps/web/assets/model.glb'))
        hydrated = b'glTF' + b'\0' * 24
        asset.write_bytes(hydrated)
        self.assertEqual(self.select(('100644', '0', 'apps/web/assets/model.glb')), [asset])
        self.assertEqual(asset.read_bytes(), hydrated)

    def test_git_symlink_submodule_and_conflict_entries_rejected(self):
        self.file('apps/web/source.js')
        for mode, stage in [('120000', '0'), ('160000', '0'), ('100644', '1'), ('100644', '2'), ('100644', '3')]:
            with self.subTest(mode=mode, stage=stage), self.assertRaisesRegex(RuntimeError, 'Unmerged, linked'):
                self.select((mode, stage, 'apps/web/source.js'))

    def test_path_traversal_and_absolute_names_rejected(self):
        for name in ['../secret', '/secret', 'D:/secret', 'apps/../../secret', 'apps\\secret']:
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, 'Unsafe tracked'):
                self.select(('100644', '0', name))

    def test_resolved_parent_link_escape_rejected(self):
        source = self.file('apps/web/source.js')
        original = Path.resolve
        def redirected(path, *args, **kwargs):
            if path == source:
                return self.root.parent / 'outside-private-file'
            return original(path, *args, **kwargs)
        with patch.object(Path, 'resolve', redirected), self.assertRaisesRegex(RuntimeError, 'regular file inside'):
            self.select(('100644', '0', 'apps/web/source.js'))

    def test_internal_link_substitution_is_not_read(self):
        source = self.file('apps/web/source.js')
        other = self.file('local-secret')
        original = Path.resolve
        def redirected(path, *args, **kwargs):
            return other if path == source else original(path, *args, **kwargs)
        with patch.object(Path, 'resolve', redirected), self.assertRaisesRegex(RuntimeError, 'regular file inside'):
            self.select(('100644', '0', 'apps/web/source.js'))

    def test_selection_is_sorted_unique_and_does_not_change_files(self):
        a = self.file('a.js', b'a\r\n')
        z = self.file('z.js', b'z\n')
        selected = self.select(('100755', '0', 'z.js'), ('100644', '0', 'a.js'), ('100644', '0', 'a.js'))
        self.assertEqual(selected, [a, z])
        self.assertEqual(a.read_bytes(), b'a\r\n')
        self.assertEqual(z.read_bytes(), b'z\n')

    def test_empty_selection_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'No tracked release files'):
            self.select()


if __name__ == '__main__':
    unittest.main()
