from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.discovery_runtime import (
    PersistentCachePolicy,
    ScratchPolicy,
    copy_file_streaming,
    create_scratch_workspace,
    create_persistent_cache_location,
    sha256_file,
)


class HashingScratchTests(unittest.TestCase):
    def test_streaming_copy_matches_standard_hash(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.bin"
            destination = root / "destination.bin"
            payload = bytes(range(256)) * 4099
            source.write_bytes(payload)
            copied = copy_file_streaming(source, destination, chunk_bytes=997)
            self.assertEqual(copied.bytes_copied, len(payload))
            self.assertEqual(copied.sha256, hashlib.sha256(payload).hexdigest())
            self.assertEqual(sha256_file(destination), copied.sha256)

    def test_local_scratch_records_and_verifies_both_copy_directions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "request.json"
            source.write_text('{"rank":2}\n', encoding="utf-8")
            published = root / "action.bin"
            manifest = root / "manifest.json"
            policy = ScratchPolicy(
                prefer_wsl=False,
                keep_on_failure=False,
                local_base_directory=root / "scratch",
                manifest_destination=manifest,
            )
            with create_scratch_workspace(policy) as workspace:
                scratch_root = workspace.host_path
                staged = workspace.stage_input(
                    source, relative_path="inputs/request.json"
                )
                self.assertEqual(staged.sha256, sha256_file(source))
                result = workspace.host_file("outputs/action.bin")
                result.parent.mkdir(parents=True)
                result.write_bytes(b"permutation rows")
                output = workspace.publish_output("outputs/action.bin", published)
                self.assertEqual(output.sha256, sha256_file(published))
                with self.assertRaises(ValueError):
                    workspace.host_file("../escape")
            self.assertFalse(scratch_root.exists())
            record = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(record["status"], "completed")
            self.assertEqual(len(record["inputs"]), 1)
            self.assertEqual(len(record["outputs"]), 1)

    def test_persistent_cache_is_distinct_and_rejects_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cache = create_persistent_cache_location(
                PersistentCachePolicy(
                    prefer_wsl=False,
                    native_base_directory=root / "persistent-cache",
                )
            )
            host, execution = cache.ensure_directory("runs/input-hash/config-hash")
            marker = host / "checkpoint"
            marker.write_text("resume", encoding="utf-8")
            self.assertTrue(marker.is_file())
            self.assertIn("runs", execution)
            with self.assertRaises(ValueError):
                cache.host_file("../../escape")


if __name__ == "__main__":
    unittest.main()
