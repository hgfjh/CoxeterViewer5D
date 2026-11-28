#!/usr/bin/env python3
r"""Materialize a finite-index Coxeter subgroup as an exact coset action.

This is an import adapter, not a subgroup search.  The caller supplies words
generating the subgroup.  GAP/ACE performs a bounded Todd--Coxeter enumeration
for the Coxeter presentation and returns the action on left cosets H\W by
right multiplication.  The TypeScript pipeline independently checks every
Coxeter relation and every spherical-subgroup stabilizer afterwards.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

from discovery_runtime.processes import ManagedProcessRunner


BACKEND = "gap-bounded-coset-enumeration"
BACKEND_VERSION = "1"
DEFAULT_MAX_COSETS = 576_000
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_WSL_GAP = "/opt/miniforge3/envs/sage/bin/gap"
DEFAULT_WSL_DISTRO = "Ubuntu-24.04"
DEFAULT_MEMORY_MB = 8_192
MAX_SUBGROUP_GENERATOR_WORDS = 100_000
MAX_SUBGROUP_GENERATOR_LETTERS = 1_000_000


class ImportInputError(ValueError):
    """Raised before an external process starts."""


class ImportIncompleteError(RuntimeError):
    """Raised when the bounded external calculation does not finish."""


def is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def load_object(path: Path, label: str) -> dict[str, Any]:
    with path.open("r", encoding="utf8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ImportInputError(f"{label} must be a JSON object")
    return value


def validate_system(raw: dict[str, Any]) -> dict[str, Any]:
    rank = raw.get("rank")
    matrix = raw.get("coxeterMatrix")
    generators = raw.get("generators")
    if raw.get("schemaVersion") != 1:
        raise ImportInputError("system.schemaVersion must be 1")
    if not is_int(rank) or rank < 1:
        raise ImportInputError("system.rank must be a positive integer")
    if not isinstance(generators, list) or len(generators) != rank:
        raise ImportInputError("system.generators must contain rank entries")
    if not isinstance(matrix, list) or len(matrix) != rank:
        raise ImportInputError("system.coxeterMatrix must be rank by rank")
    for row_index, row in enumerate(matrix):
        if not isinstance(row, list) or len(row) != rank:
            raise ImportInputError(
                f"system.coxeterMatrix[{row_index}] must contain rank entries"
            )
        for column_index, entry in enumerate(row):
            if row_index == column_index:
                if entry != 1:
                    raise ImportInputError("Coxeter matrix diagonal entries must be 1")
            elif entry != "inf" and (not is_int(entry) or entry < 2):
                raise ImportInputError(
                    "off-diagonal Coxeter entries must be integers >=2 or 'inf'"
                )
            if matrix[column_index][row_index] != entry:
                raise ImportInputError("Coxeter matrix must be symmetric")
    return raw


def positive_integer(value: Any, label: str, default: int | None = None) -> int:
    if value is None and default is not None:
        return default
    if not is_int(value) or value < 1:
        raise ImportInputError(f"{label} must be a positive integer")
    return value


def validate_request(raw: dict[str, Any], rank: int) -> dict[str, Any]:
    if raw.get("schemaVersion") != 1 or raw.get("kind") != "subgroup-generators":
        raise ImportInputError(
            "request must have schemaVersion 1 and kind 'subgroup-generators'"
        )
    action_id = raw.get("id")
    if not isinstance(action_id, str) or not action_id.strip():
        raise ImportInputError("request.id must be a nonempty string")
    allowed = {
        "schemaVersion",
        "kind",
        "id",
        "name",
        "subgroupGenerators",
        "expectedIndex",
        "maxCosets",
        "timeoutSeconds",
        "memoryMb",
        "source",
        "notes",
    }
    unknown = sorted(set(raw) - allowed)
    if unknown:
        raise ImportInputError(f"request has unknown fields: {', '.join(unknown)}")
    words = raw.get("subgroupGenerators")
    if not isinstance(words, list):
        raise ImportInputError("subgroupGenerators must be an array of words")
    if len(words) > MAX_SUBGROUP_GENERATOR_WORDS:
        raise ImportInputError(
            f"subgroupGenerators exceeds the {MAX_SUBGROUP_GENERATOR_WORDS}-word bound"
        )
    total_letters = 0
    for word_index, word in enumerate(words):
        if not isinstance(word, list):
            raise ImportInputError(f"subgroupGenerators[{word_index}] must be an array")
        total_letters += len(word)
        if total_letters > MAX_SUBGROUP_GENERATOR_LETTERS:
            raise ImportInputError(
                f"subgroupGenerators exceeds the {MAX_SUBGROUP_GENERATOR_LETTERS}-letter bound"
            )
        for letter_index, letter in enumerate(word):
            if not is_int(letter) or letter < 0 or letter >= rank:
                raise ImportInputError(
                    f"subgroupGenerators[{word_index}][{letter_index}] must lie in 0..{rank - 1}"
                )
    expected_index = raw.get("expectedIndex")
    if expected_index is not None:
        positive_integer(expected_index, "expectedIndex")
    max_cosets = positive_integer(
        raw.get("maxCosets"), "maxCosets", DEFAULT_MAX_COSETS
    )
    if max_cosets < 2:
        raise ImportInputError("maxCosets must be at least 2 for ACE")
    positive_integer(
        raw.get("timeoutSeconds"), "timeoutSeconds", DEFAULT_TIMEOUT_SECONDS
    )
    positive_integer(raw.get("memoryMb"), "memoryMb", DEFAULT_MEMORY_MB)
    for label in ("name", "source"):
        value = raw.get(label)
        if value is not None and (not isinstance(value, str) or not value.strip()):
            raise ImportInputError(f"{label} must be a nonempty string when supplied")
    notes = raw.get("notes")
    if notes is not None and (
        not isinstance(notes, list)
        or any(not isinstance(note, str) for note in notes)
    ):
        raise ImportInputError("notes must be an array of strings when supplied")
    return raw


def gap_list(value: list[Any]) -> str:
    rendered: list[str] = []
    for entry in value:
        if isinstance(entry, list):
            rendered.append(gap_list(entry))
        elif entry == "inf":
            rendered.append("0")
        elif is_int(entry):
            rendered.append(str(entry))
        else:
            raise ImportInputError("cannot encode a non-integral value for GAP")
    return "[" + ",".join(rendered) + "]"


def gap_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def build_gap_program(
    system: dict[str, Any], request: dict[str, Any], raw_output_path: str
) -> str:
    rank = system["rank"]
    matrix = system["coxeterMatrix"]
    max_cosets = request.get("maxCosets", DEFAULT_MAX_COSETS)
    return f"""
AceAvailable := LoadPackage(\"ace\", false) <> fail;;
RawOutputPath := {gap_string(raw_output_path)};;
CoxRank := {rank};;
CoxeterMatrix := {gap_list(matrix)};;
SubgroupWords := {gap_list(request["subgroupGenerators"])};;
MaxCosets := {max_cosets};;

JoinInts := function(values)
  local text, position;
  text := \"\";
  for position in [1..Length(values)] do
    if position > 1 then Append(text, \",\"); fi;
    Append(text, String(values[position]));
  od;
  return text;
end;;

WordElement := function(word, generators, group)
  local element, letter;
  element := One(group);
  for letter in word do
    element := element * generators[letter + 1];
  od;
  return element;
end;;

F := FreeGroup(CoxRank);;
FreeGenerators := GeneratorsOfGroup(F);;
Relations := List(FreeGenerators, generator -> generator^2);;
for i in [1..CoxRank] do
  for j in [i + 1..CoxRank] do
    if CoxeterMatrix[i][j] <> 0 then
      Add(Relations, (FreeGenerators[i] * FreeGenerators[j])^CoxeterMatrix[i][j]);
    fi;
  od;
od;
SubgroupGenerators := List(
  SubgroupWords,
  word -> WordElement(word, FreeGenerators, F)
);;
if AceAvailable then
  Engine := \"ACE\";;
  Table := ACECosetTable(
    FreeGenerators,
    Relations,
    SubgroupGenerators : silent := true, hard := true, max := MaxCosets
  );;
else
  Engine := \"GAP-library\";;
  Table := CosetTableFromGensAndRels(
    FreeGenerators,
    Relations,
    SubgroupGenerators : silent := true, max := MaxCosets
  );;
fi;
if Table = fail then
  PrintTo(RawOutputPath, \"INCOMPLETE|bounded coset enumeration did not complete within maxCosets\\n\");
  QUIT_GAP(2);
fi;
if Length(Table) <> 2 * CoxRank then
  Error(\"ACE returned an unexpected number of coset-table rows\");
fi;
CosetCount := Length(Table[1]);;
if CosetCount > MaxCosets then
  Error(\"ACE returned more cosets than maxCosets\");
fi;
PrintTo(RawOutputPath, Concatenation(\"VERSION|\", GAPInfo.Version, \"\\n\"));
AppendTo(RawOutputPath, Concatenation(\"ENGINE|\", Engine, \"\\n\"));
AppendTo(RawOutputPath, Concatenation(\"INDEX|\", String(CosetCount), \"\\n\"));
for generator in [1..CoxRank] do
  if Table[2 * generator - 1] <> Table[2 * generator] then
    Error(\"an involutory Coxeter generator has unequal forward and inverse rows\");
  fi;
  AppendTo(RawOutputPath, Concatenation(
    \"ROW|\", String(generator - 1), \"|\",
    JoinInts(List(Table[2 * generator - 1], image -> image - 1)), \"\\n\"
  ));
od;
QUIT_GAP(0);
"""


def windows_path_to_wsl(path: Path) -> str:
    resolved = str(path.resolve()).replace("\\", "/")
    if len(resolved) >= 3 and resolved[1:3] == ":/":
        return f"/mnt/{resolved[0].lower()}/{resolved[3:]}"
    return resolved


def parse_raw_output(path: Path, rank: int) -> dict[str, Any]:
    if not path.exists():
        raise ImportIncompleteError("GAP/ACE did not publish a coset table")
    version: str | None = None
    engine: str | None = None
    index: int | None = None
    rows: dict[int, list[int]] = {}
    for raw_line in path.read_text(encoding="utf8").splitlines():
        parts = raw_line.strip().split("|")
        if parts[0] == "INCOMPLETE":
            raise ImportIncompleteError(parts[1] if len(parts) > 1 else "ACE incomplete")
        if parts[0] == "VERSION":
            version = parts[1]
        elif parts[0] == "ENGINE":
            engine = parts[1]
        elif parts[0] == "INDEX":
            index = int(parts[1])
        elif parts[0] == "ROW":
            generator = int(parts[1])
            rows[generator] = [int(entry) for entry in parts[2].split(",")]
        else:
            raise ImportIncompleteError(f"unknown GAP output record {parts[0]!r}")
    if version is None or engine is None or index is None or len(rows) != rank:
        raise ImportIncompleteError("GAP/ACE output is incomplete")
    ordered_rows = [rows[generator] for generator in range(rank)]
    for generator, row in enumerate(ordered_rows):
        if len(row) != index or sorted(row) != list(range(index)):
            raise ImportIncompleteError(
                f"GAP row {generator} is not a permutation of 0..{index - 1}"
            )
        if any(row[row[point]] != point for point in range(index)):
            raise ImportIncompleteError(f"GAP row {generator} is not an involution")
    return {
        "gapVersion": version,
        "engine": engine,
        "index": index,
        "generatorImages": ordered_rows,
    }


def run_gap_import(
    system: dict[str, Any], request: dict[str, Any]
) -> tuple[dict[str, Any], str]:
    timeout = request.get("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS)
    memory_bytes = request.get("memoryMb", DEFAULT_MEMORY_MB) * 1024 * 1024
    with tempfile.TemporaryDirectory(prefix="compact-action-import-") as directory:
        temporary = Path(directory)
        script_path = temporary / "import.g"
        raw_path = temporary / "action.txt"
        stdout_path = temporary / "gap.stdout.log"
        stderr_path = temporary / "gap.stderr.log"
        native_gap = shutil.which("gap")
        wsl = shutil.which("wsl.exe") or shutil.which("wsl")
        if native_gap:
            raw_path_for_gap = str(raw_path.resolve()).replace("\\", "/")
            command = [native_gap, "-q", str(script_path)]
            backend_command = native_gap
            mode = "native"
        elif wsl:
            raw_path_for_gap = windows_path_to_wsl(raw_path)
            command = [
                DEFAULT_WSL_GAP,
                "-q",
                windows_path_to_wsl(script_path),
            ]
            backend_command = f"wsl:{DEFAULT_WSL_GAP}"
            mode = "wsl"
        else:
            raise ImportIncompleteError("neither GAP nor WSL is available")
        script_path.write_text(
            build_gap_program(system, request, raw_path_for_gap), encoding="utf8"
        )
        runner = ManagedProcessRunner(
            poll_seconds=0.1, terminate_grace_seconds=1.0
        )
        if mode == "native":
            completed = runner.run(
                command,
                timeout_seconds=timeout,
                memory_limit_bytes=memory_bytes,
                stdout_path=stdout_path,
                stderr_path=stderr_path,
                check=False,
            )
        else:
            completed = runner.run_wsl(
                command,
                distro=os.environ.get("COXETER_WSL_DISTRO", DEFAULT_WSL_DISTRO),
                execution_control_directory="/tmp/coxeter-compact-action-import-control",
                timeout_seconds=timeout,
                memory_limit_bytes=memory_bytes,
                stdout_path=stdout_path,
                stderr_path=stderr_path,
                check=False,
            )
        stdout = stdout_path.read_text(encoding="utf8", errors="replace")
        stderr = stderr_path.read_text(encoding="utf8", errors="replace")
        if completed.timed_out:
            raise ImportIncompleteError(
                f"GAP/ACE exceeded the {timeout}-second wall-clock limit"
            )
        if completed.returncode != 0:
            if raw_path.exists():
                try:
                    return parse_raw_output(raw_path, system["rank"]), backend_command
                except ImportIncompleteError:
                    pass
            detail = (stderr or stdout or "GAP/ACE failed").strip()
            raise ImportIncompleteError(detail[-2000:])
        try:
            parsed = parse_raw_output(raw_path, system["rank"])
        except ImportIncompleteError as error:
            detail = (stderr or stdout or "").strip()
            if detail:
                raise ImportIncompleteError(f"{error}: {detail[-2000:]}") from error
            raise
        return parsed, backend_command


def materialize_candidate(
    system: dict[str, Any], request: dict[str, Any], raw: dict[str, Any], command: str
) -> dict[str, Any]:
    index = raw["index"]
    expected_index = request.get("expectedIndex")
    if expected_index is not None and index != expected_index:
        raise ImportInputError(
            f"enumerated subgroup index {index} does not match expectedIndex {expected_index}"
        )
    return {
        "id": request["id"],
        "name": request.get("name", f"{system.get('name', 'Coxeter')} imported coset action"),
        "index": index,
        "generatorImages": raw["generatorImages"],
        "backend": BACKEND,
        "backendVersion": BACKEND_VERSION,
        "source": request.get("source", "user-supplied finite-index subgroup generators"),
        "notes": [
            *request.get("notes", []),
            f"GAP {raw['gapVersion']} with {raw['engine']} enumerated exactly {index} cosets via {command}.",
            "This import does not trust a torsion-free label; the downstream spherical-action certificate is required.",
        ],
    }


def write_new_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf8", newline="\n") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")


def parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--system", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args(argv)
    if not args.validate_only and args.output is None:
        parser.error("--output is required unless --validate-only is used")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_arguments(sys.argv[1:] if argv is None else argv)
    try:
        system = validate_system(load_object(args.system, "system"))
        request = validate_request(load_object(args.input, "request"), system["rank"])
        if args.validate_only:
            print(
                json.dumps(
                    {
                        "status": "validated",
                        "kind": request["kind"],
                        "rank": system["rank"],
                        "subgroupGeneratorCount": len(request["subgroupGenerators"]),
                    },
                    sort_keys=True,
                )
            )
            return 0
        raw, command = run_gap_import(system, request)
        candidate = materialize_candidate(system, request, raw, command)
        write_new_json(args.output, candidate)
        print(
            json.dumps(
                {
                    "status": "materialized",
                    "backend": BACKEND,
                    "index": candidate["index"],
                    "output": str(args.output),
                },
                sort_keys=True,
            )
        )
        return 0
    except ImportIncompleteError as error:
        print(json.dumps({"status": "incomplete", "error": str(error)}, sort_keys=True))
        return 2
    except (ImportInputError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "failed", "error": str(error)}, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
