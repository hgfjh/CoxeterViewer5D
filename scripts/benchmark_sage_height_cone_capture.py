#!/usr/bin/env python3
"""Benchmark both exact cone engines on a sealed request-capture sidecar."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import sage_exact_height_cone as cone


def load_capture(path: Path) -> dict[str, Any]:
    capture = json.loads(path.read_text(encoding="utf-8"))
    if (
        not isinstance(capture, dict)
        or capture.get("schemaVersion") != 1
        or capture.get("kind") != "exact-height-cone-request-capture"
    ):
        raise ValueError("The input is not an exact cone request capture.")
    supplied_digest = capture.get("captureDigest")
    without_digest = dict(capture)
    without_digest["captureDigest"] = ""
    if supplied_digest != cone.canonical_sha256(without_digest):
        raise ValueError("The exact cone request capture digest is invalid.")
    return cone.validate_request(capture.get("request"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--engines",
        choices=("both", "reduced-auto", "legacy-ppl"),
        default="both",
    )
    args = parser.parse_args()
    request = load_capture(args.capture)
    engines = (
        ("reduced-auto", "legacy-ppl")
        if args.engines == "both"
        else (args.engines,)
    )
    results = []
    for engine in engines:
        started = time.perf_counter()
        certificate = cone.solve(request, engine)
        results.append(
            {
                "engine": engine,
                "elapsedSeconds": time.perf_counter() - started,
                "certificate": certificate,
            }
        )
    artifact = {
        "schemaVersion": 1,
        "kind": "exact-height-cone-engine-benchmark",
        "request": request,
        "results": results,
        "artifactDigest": "",
    }
    artifact["artifactDigest"] = cone.canonical_sha256(artifact)
    if args.output is not None:
        cone.write_new_json(args.output, artifact, force=False)
    print(
        cone.canonical_json(
            {
                "requestHash": request["requestHash"],
                "assignmentCount": len(request["assignments"]),
                "results": [
                    {
                        "engine": result["engine"],
                        "elapsedSeconds": result["elapsedSeconds"],
                        "kind": result["certificate"]["result"]["kind"],
                        "certificateHash": result["certificate"][
                            "certificateHash"
                        ],
                    }
                    for result in results
                ],
                "artifactDigest": artifact["artifactDigest"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
