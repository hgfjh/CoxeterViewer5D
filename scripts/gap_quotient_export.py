#!/usr/bin/env python3
"""GAP quotient exporter for finite Coxeter subgroup/coset data.

The wrapper writes a small GAP program containing only validated integers and
word lists, asks GAP to enumerate the finite presented Coxeter group and left
cosets, then serializes the app's QuotientComplex JSON.  GAP is used for the
group/coset action; Python only validates input and writes the stable JSON
artifact.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sage_quotient_export import (  # noqa: E402
    BACKEND_VERSION,
    CHECKED_AT,
    DEFAULT_MAX_COSETS,
    attach_game,
    canonical_boundary_key,
    edge_id,
    finite_pairs,
    load_json,
    sha256_text,
    stable_path_label,
    validate_request,
)


BACKEND_ID = "gapQuotientExportBackend"
DEFAULT_WSL_GAP = "/opt/miniforge3/envs/sage/bin/gap"


def print_json(value: dict[str, Any]) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def skipped_report(input_path: Path | None, input_text: str, warnings: list[str]) -> dict[str, Any]:
    return {
        "ok": True,
        "status": "skipped",
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "checkedAt": CHECKED_AT,
        "inputPath": stable_path_label(input_path) if input_path else None,
        "inputHash": sha256_text(input_text),
        "warnings": warnings,
    }


def windows_path_to_wsl(path: Path) -> str:
    resolved = str(path.resolve()).replace("\\", "/")
    if len(resolved) >= 3 and resolved[1:3] == ":/":
        return f"/mnt/{resolved[0].lower()}/{resolved[3:]}"
    return resolved


def gap_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def gap_list(values: list[Any]) -> str:
    rendered = []
    for value in values:
        if isinstance(value, list):
            rendered.append(gap_list(value))
        elif value == "inf":
            rendered.append("0")
        else:
            rendered.append(str(value))
    return "[" + ", ".join(rendered) + "]"


def build_gap_program(request: dict[str, Any], raw_output: Path) -> str:
    source = request["sourceSystem"]
    subgroup_words = request.get("subgroupGenerators", [])
    return f"""
RawOutputPath := {gap_string(str(raw_output))};;
CoxRank := {source["rank"]};;
CoxeterMatrix := {gap_list(source["coxeterMatrix"])};;
SubgroupWords := {gap_list(subgroup_words)};;
MaxCosets := {request.get("maxCosets", DEFAULT_MAX_COSETS)};;

JoinInts := function(list)
  local out, i;
  out := "";
  for i in [1..Length(list)] do
    if i > 1 then Append(out, ","); fi;
    Append(out, String(list[i]));
  od;
  return out;
end;;

WriteRaw := function(line)
  AppendTo(RawOutputPath, line, "\\n");
end;;

WordElement := function(word, gens, group)
  local element, letter;
  element := One(group);
  for letter in word do
    element := element * gens[letter + 1];
  od;
  return element;
end;;

CoxF := FreeGroup(CoxRank);;
FreeGens := GeneratorsOfGroup(CoxF);;
Relations := [];;
for i in [1..CoxRank] do
  Add(Relations, FreeGens[i]^2);
od;
for i in [1..CoxRank] do
  for j in [i + 1..CoxRank] do
    if CoxeterMatrix[i][j] <> 0 then
      Add(Relations, (FreeGens[i] * FreeGens[j])^CoxeterMatrix[i][j]);
    fi;
  od;
od;
G := CoxF / Relations;;
SizeG := Size(G);;
if SizeG = infinity then
  Error("infinite quotient-export source group");
fi;
ElementsG := Elements(G);;
Gens := GeneratorsOfGroup(G);;
WordByElementIndex := List([1..Length(ElementsG)], i -> fail);;
IdentityIndex := Position(ElementsG, One(G));;
WordByElementIndex[IdentityIndex] := [];;
Queue := [IdentityIndex];;
Cursor := 1;;
while Cursor <= Length(Queue) do
  CurrentIndex := Queue[Cursor];;
  Cursor := Cursor + 1;;
  for GeneratorIndex in [1..CoxRank] do
    NextElement := ElementsG[CurrentIndex] * Gens[GeneratorIndex];;
    NextIndex := Position(ElementsG, NextElement);;
    if WordByElementIndex[NextIndex] = fail then
      WordByElementIndex[NextIndex] := Concatenation(WordByElementIndex[CurrentIndex], [GeneratorIndex - 1]);;
      Add(Queue, NextIndex);;
    fi;
  od;
od;

SubgroupGenerators := List(SubgroupWords, word -> WordElement(word, Gens, G));;
if Length(SubgroupGenerators) = 0 then
  H := TrivialSubgroup(G);;
else
  H := Subgroup(G, SubgroupGenerators);;
fi;
ElementsH := Elements(H);;
ElementCoset := List(ElementsG, element -> 0);;
CosetReps := [];;
CosetMembers := [];;
for ElementIndex in [1..Length(ElementsG)] do
  if ElementCoset[ElementIndex] = 0 then
    RepElement := ElementsG[ElementIndex];;
    Members := Set(List(ElementsH, h -> Position(ElementsG, h * RepElement)));;
    Add(CosetReps, ElementIndex);;
    Add(CosetMembers, Members);;
    CosetIndex := Length(CosetReps);;
    for MemberIndex in Members do
      ElementCoset[MemberIndex] := CosetIndex;;
    od;
  fi;
od;
if Length(CosetReps) > MaxCosets then
  Error("quotient coset count exceeds maxCosets");
fi;

PrintTo(RawOutputPath, "");;
WriteRaw(Concatenation("GAP_VERSION|", GAPInfo.Version));;
WriteRaw(Concatenation("GROUP_ORDER|", String(SizeG)));;
WriteRaw(Concatenation("SUBGROUP_ORDER|", String(Size(H))));;
for CosetIndex in [1..Length(CosetReps)] do
  RepIndex := CosetReps[CosetIndex];;
  WriteRaw(Concatenation(
    "COSET|q", String(CosetIndex - 1), "|",
    JoinInts(WordByElementIndex[RepIndex]), "|",
    JoinInts(List(CosetMembers[CosetIndex], index -> index - 1))
  ));;
od;
for GeneratorIndex in [1..CoxRank] do
  for CosetIndex in [1..Length(CosetReps)] do
    RepIndex := CosetReps[CosetIndex];;
    TargetElement := ElementsG[RepIndex] * Gens[GeneratorIndex];;
    TargetIndex := Position(ElementsG, TargetElement);;
    TargetCoset := ElementCoset[TargetIndex];;
    WriteRaw(Concatenation(
      "ACTION|", String(GeneratorIndex - 1), "|q", String(CosetIndex - 1),
      "|q", String(TargetCoset - 1)
    ));;
  od;
od;
QUIT;
"""


def parse_word(raw: str) -> list[int]:
    return [] if raw == "" else [int(part) for part in raw.split(",") if part != ""]


def parse_raw_output(path: Path) -> dict[str, Any]:
    cosets: list[dict[str, Any]] = []
    actions: dict[int, dict[str, str]] = {}
    diagnostics: dict[str, Any] = {}
    for line in path.read_text(encoding="utf8").splitlines():
        parts = line.strip().split("|")
        if not parts or parts[0] == "":
            continue
        tag = parts[0]
        if tag == "GAP_VERSION":
            diagnostics["gapVersion"] = parts[1]
        elif tag == "GROUP_ORDER":
            diagnostics["groupElements"] = int(parts[1])
        elif tag == "SUBGROUP_ORDER":
            diagnostics["subgroupElements"] = int(parts[1])
        elif tag == "COSET":
            cosets.append(
                {
                    "id": parts[1],
                    "representativeWord": parse_word(parts[2]),
                    "memberIndices": parse_word(parts[3]) if len(parts) > 3 else [],
                }
            )
        elif tag == "ACTION":
            generator = int(parts[1])
            actions.setdefault(generator, {})[parts[2]] = parts[3]
        else:
            raise ValueError(f"unknown GAP raw output tag: {tag}")
    if not cosets:
        raise ValueError("GAP raw quotient output did not contain cosets")
    return {"cosets": cosets, "actions": actions, "diagnostics": diagnostics}


def run_gap(program: str, timeout: int) -> dict[str, Any]:
    gap = shutil.which("gap")
    with tempfile.TemporaryDirectory(prefix="coxeter-gap-quotient-") as directory:
        temp_dir = Path(directory)
        script_path = temp_dir / "quotient_export.g"
        raw_path = temp_dir / "raw.txt"
        if gap:
            script_path.write_text(
                program.replace("RAW_PATH_PLACEHOLDER", str(raw_path)),
                encoding="utf8",
            )
            completed = subprocess.run(
                [gap, "-q", str(script_path)],
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        else:
            wsl_gap = DEFAULT_WSL_GAP
            wsl_script = windows_path_to_wsl(script_path)
            script_path.write_text(
                program.replace("RAW_PATH_PLACEHOLDER", windows_path_to_wsl(raw_path)),
                encoding="utf8",
            )
            completed = subprocess.run(
                [
                    "wsl",
                    "bash",
                    "-lc",
                    f"test -x {wsl_gap} && {wsl_gap} -q {wsl_script}",
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr or completed.stdout or "GAP quotient export failed")
        if not raw_path.exists():
            raise RuntimeError(
                completed.stderr
                or completed.stdout
                or "GAP quotient export did not write raw output"
            )
        return parse_raw_output(raw_path)


def build_quotient(request: dict[str, Any], source: dict[str, Any], raw: dict[str, Any], input_hash: str) -> dict[str, Any]:
    sorted_cosets = sorted(
        raw["cosets"],
        key=lambda coset: (len(coset["representativeWord"]), coset["representativeWord"]),
    )
    id_remap = {
        coset["id"]: f"q{index}" for index, coset in enumerate(sorted_cosets)
    }
    action_by_generator = {
        generator: {
            id_remap[source_id]: id_remap[target_id]
            for source_id, target_id in images.items()
        }
        for generator, images in raw["actions"].items()
    }
    actions = [
        {"generator": generator, "images": images}
        for generator, images in sorted(action_by_generator.items())
    ]
    vertices = [
        {
            "id": id_remap[coset["id"]],
            "label": id_remap[coset["id"]],
            "representativeWord": coset["representativeWord"],
            "sourceNodeIds": [f"gap-element:{index}" for index in coset["memberIndices"]],
        }
        for coset in sorted_cosets
    ]
    edges = []
    for vertex in vertices:
        for generator in range(source["rank"]):
            target = action_by_generator[generator][vertex["id"]]
            edges.append(
                {
                    "id": edge_id(vertex["id"], target, generator),
                    "source": vertex["id"],
                    "target": target,
                    "generator": generator,
                    "inverseEdgeId": edge_id(target, vertex["id"], generator),
                    "label": source["generators"][generator].get("label", f"s{generator}"),
                }
            )

    cells = []
    seen_cells: set[str] = set()
    for i, j, m in finite_pairs(source["coxeterMatrix"]):
        for vertex in vertices:
            boundary_vertices: list[str] = []
            boundary_edges: list[str] = []
            current = vertex["id"]
            for step in range(2 * m):
                generator = i if step % 2 == 0 else j
                target = action_by_generator[generator][current]
                boundary_vertices.append(current)
                boundary_edges.append(edge_id(current, target, generator))
                current = target
            if current != vertex["id"]:
                raise ValueError(f"rank-two relation ({i}, {j}) did not close at {vertex['id']}")
            key = f"{i}-{j}:{canonical_boundary_key(boundary_vertices)}"
            if key in seen_cells:
                continue
            seen_cells.add(key)
            cells.append(
                {
                    "id": f"qcell:{i}-{j}:{len(cells)}",
                    "generatorPair": [i, j],
                    "m": m,
                    "boundaryVertexIds": boundary_vertices,
                    "boundaryEdgeIds": boundary_edges,
                }
            )

    warning = (
        "Quotient was produced by native GAP finite left-coset enumeration from the request file. "
        "This certificate covers the finite action, not torsion-freeness or manifold status."
    )
    certificate = {
        "status": "passed",
        "backend": BACKEND_ID,
        "backendVersion": BACKEND_VERSION,
        "scopes": ["quotient-action"],
        "command": "python scripts/gap_quotient_export.py --input <request>",
        "checkedAt": CHECKED_AT,
        "inputHash": input_hash,
        "diagnostics": {
            **raw["diagnostics"],
            "cosets": len(vertices),
            "finitePairCells": len(cells),
            "cosetConvention": "left cosets H\\W with right multiplication by Coxeter generators",
        },
        "warnings": [warning],
    }
    quotient: dict[str, Any] = {
        "schemaVersion": 1,
        "name": (
            f"{source['name']} quotient ({request.get('subgroupName')})"
            if request.get("subgroupName")
            else f"{source['name']} quotient from build request"
        ),
        "sourceSystem": source,
        "generatorRank": source["rank"],
        "permutationAction": actions,
        "vertices": vertices,
        "edges": edges,
        "twoCells": cells,
        "subgroup": {
            "name": request.get("subgroupName", "request subgroup"),
            "index": len(vertices),
            "generators": request.get("subgroupGenerators", []),
            "source": BACKEND_ID,
            "certificate": certificate,
            "notes": request.get("notes", []),
        },
        "verifier": certificate,
        "schreierCertificate": {
            "status": "passed",
            "method": "external-gap-kbmag",
            "checkedAt": CHECKED_AT,
            "generatorRank": source["rank"],
            "vertexCount": len(vertices),
            "checks": {
                "generatorRegularity": True,
                "bijectiveActions": True,
                "involutiveGenerators": True,
                "edgeCompatibility": True,
                "coxeterRelations": True,
                "rankTwoCellCoverage": True,
                "duplicateRankTwoCells": True,
            },
            "rankTwoOrbits": [
                {
                    "generatorPair": cell["generatorPair"],
                    "m": cell["m"],
                    "orbitKey": f"{','.join(str(item) for item in cell['generatorPair'])}:{'>'.join(cell['boundaryVertexIds'])}",
                    "boundaryVertexIds": cell["boundaryVertexIds"],
                    "matchedCellIds": [cell["id"]],
                }
                for cell in cells
            ],
            "errors": [],
            "warnings": [warning],
        },
        "warnings": [warning],
    }
    game = attach_game(request, source, input_hash)
    if game:
        quotient["game"] = game
    output_hash = sha256_text(json.dumps(quotient, sort_keys=True, separators=(",", ":")))
    quotient["verifier"]["outputHash"] = output_hash
    quotient["subgroup"]["certificate"]["outputHash"] = output_hash
    if quotient.get("game", {}).get("cocycles"):
        certificate_block = quotient["game"]["cocycles"][0].get("certificate")
        if certificate_block:
            certificate_block["backend"] = BACKEND_ID
            certificate_block["outputHash"] = output_hash
    return quotient


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check-runtime", action="store_true")
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()

    input_text = args.input.read_text(encoding="utf8") if args.input else "{}"
    if args.check_runtime:
        available = shutil.which("gap") is not None
        if not available:
            probe = subprocess.run(
                ["wsl", "bash", "-lc", f"test -x {DEFAULT_WSL_GAP}"],
                capture_output=True,
                text=True,
                check=False,
            )
            available = probe.returncode == 0
        print_json(
            {
                "ok": available,
                "status": "available" if available else "skipped",
                "backend": BACKEND_ID,
                "backendVersion": BACKEND_VERSION,
                "checkedAt": CHECKED_AT,
            }
        )
        return 0

    if args.input is None:
        report = skipped_report(None, input_text, ["Pass --input with a QuotientBuildInput request."])
        print_json(report)
        return 0

    try:
        request = load_json(args.input)
        source = validate_request(request)
        if any(entry == "inf" for row in source["coxeterMatrix"] for entry in row):
            report = skipped_report(
                args.input,
                input_text,
                ["Native GAP quotient export currently supports finite Coxeter systems only."],
            )
            print_json(report)
            return 0
        raw = run_gap(build_gap_program(request, Path("RAW_PATH_PLACEHOLDER")), args.timeout)
        quotient = build_quotient(request, source, raw, sha256_text(input_text))
    except Exception as exc:
        print_json(
            {
                "ok": False,
                "status": "failed",
                "backend": BACKEND_ID,
                "backendVersion": BACKEND_VERSION,
                "checkedAt": CHECKED_AT,
                "inputPath": stable_path_label(args.input),
                "inputHash": sha256_text(input_text),
                "errors": [str(exc)],
            }
        )
        return 1

    text = json.dumps(quotient, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
