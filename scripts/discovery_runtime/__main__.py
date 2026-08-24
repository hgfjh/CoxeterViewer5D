"""Command-line self-test for the discovery runtime package."""

from __future__ import annotations

import argparse
import json

from .selftest import run_self_test


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--wsl",
        action="store_true",
        help="require the scratch test to use a live WSL ext4 workspace",
    )
    args = parser.parse_args()
    print(json.dumps(run_self_test(include_wsl=args.wsl), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
