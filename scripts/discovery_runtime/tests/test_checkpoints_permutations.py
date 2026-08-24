from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.discovery_runtime import (
    CheckpointJournal,
    JournalCorruption,
    JournalIdentityMismatch,
    PackedPermutationSpool,
    sha256_json,
)


class CheckpointTests(unittest.TestCase):
    def test_resume_is_bound_to_input_and_configuration_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "search.jsonl"
            input_hash = sha256_json({"system": "A3"})
            config_hash = sha256_json({"limit": 24})
            journal = CheckpointJournal(
                path, input_hash=input_hash, config_hash=config_hash
            )
            journal.append(stage="module", key="mod2", status="started")
            journal.append(
                stage="module",
                key="mod2",
                status="completed",
                payload={"degree": 24},
            )
            resumed = CheckpointJournal(
                path, input_hash=input_hash, config_hash=config_hash
            )
            self.assertEqual(resumed.completed_keys("module"), {"mod2"})
            self.assertEqual(resumed.latest("module", "mod2").payload["degree"], 24)
            with self.assertRaises(JournalIdentityMismatch):
                CheckpointJournal(
                    path,
                    input_hash=sha256_json({"system": "H3"}),
                    config_hash=config_hash,
                )

    def test_hash_chain_detects_tampering_and_repairs_only_incomplete_tail(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_hash = sha256_json("input")
            config_hash = sha256_json("config")
            repairable = root / "repairable.jsonl"
            journal = CheckpointJournal(
                repairable, input_hash=input_hash, config_hash=config_hash
            )
            journal.append(stage="q", key="2", status="progress", payload={"n": 1})
            with repairable.open("ab") as stream:
                stream.write(b'{"kind":"event"')
            repaired = CheckpointJournal(
                repairable, input_hash=input_hash, config_hash=config_hash
            )
            self.assertTrue(repaired.summary().repaired_truncated_tail)
            self.assertEqual(len(repaired.events()), 1)

            tampered = root / "tampered.jsonl"
            journal = CheckpointJournal(
                tampered, input_hash=input_hash, config_hash=config_hash
            )
            journal.append(stage="q", key="2", status="progress", payload={"n": 1})
            text = tampered.read_text(encoding="utf-8").replace('"n":1', '"n":2')
            tampered.write_text(text, encoding="utf-8", newline="\n")
            with self.assertRaises(JournalCorruption):
                CheckpointJournal(
                    tampered, input_hash=input_hash, config_hash=config_hash
                )


class PackedPermutationTests(unittest.TestCase):
    def test_rows_round_trip_and_invalid_rows_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "action.rows"
            with PackedPermutationSpool(path, degree=4, mode="w") as spool:
                spool.append_row((1, 0, 3, 2))
                spool.commit()
                with self.assertRaises(ValueError):
                    spool.append_row((0, 0, 2, 3))
                summary = spool.finalize_manifest()
            self.assertEqual(summary.element_width_bytes, 1)
            self.assertEqual(summary.row_count, 1)
            with PackedPermutationSpool(path, mode="r") as spool:
                self.assertEqual(spool.read_row(0), (1, 0, 3, 2))

    def test_uncommitted_tail_is_discarded_on_resume(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "action.rows"
            with PackedPermutationSpool(path, degree=3, mode="w") as spool:
                spool.append_row((1, 2, 0))
                spool.commit()
            with path.open("ab") as stream:
                stream.write(bytes((2, 0, 1)))
            with PackedPermutationSpool(path, degree=3, mode="a") as spool:
                self.assertEqual(spool.committed_row_count, 1)
                self.assertEqual(path.stat().st_size, 28 + 3)


if __name__ == "__main__":
    unittest.main()
