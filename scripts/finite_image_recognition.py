#!/usr/bin/env python3
"""Recognition-first screening for exact finite Coxeter images.

Sage constructs the finite-field matrix image.  This module transfers the
*ordered* Coxeter generators to an isolated GAP 4.16 process before requesting
an expensive permutation copy.  A permutation action is included only for
small images or candidates that survive structural screening.  GAP
independently rechecks the presentation before using AtlasRep, TomLib, or
classical-group recognition.  A screening result is conclusive only when every
catalogue on which it depends is marked complete.

The transfer and result hashes are certificate boundaries, not performance
keys.  They deliberately change when the ordered action or pinned GAP package
manifest changes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable, Sequence

import mod3_structural_certificate as mod3_structural
import odd_prime_structural_certificate as odd_prime_structural


SCRIPT_DIR = Path(__file__).resolve().parent
SCHEMA_VERSION = 1
BRIDGE_VERSION = "1.4.0"
DEFAULT_GAP_RELATIVE = Path(".local/opt/coxeter-gap/gap-4.16.0/gap")
DEFAULT_MANIFEST_RELATIVE = Path(
    ".local/share/coxeter-viewer/gap-4.16.0/toolchain-manifest.json"
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf8"))


def _require_sha256(value: Any, field: str) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise ValueError(f"{field} must be a 64-character SHA-256 hash.")
    if any(character not in "0123456789abcdef" for character in value):
        raise ValueError(f"{field} must contain lowercase hexadecimal digits.")
    return value


def _require_positive_integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field} must be a positive integer.")
    return value


def admissible_target_indices(lower_bound: int, maximum: int) -> list[int]:
    """Return exact candidate degrees imposed by the spherical divisibility bound."""

    lower = _require_positive_integer(lower_bound, "lower_bound")
    if isinstance(maximum, bool) or not isinstance(maximum, int):
        raise TypeError("maximum must be an integer.")
    if maximum < lower:
        return []
    return list(range(lower, maximum + 1, lower))


def possible_goursat_indices(
    left_subgroup_indices: Iterable[dict[str, Any]],
    right_projection_cases: Iterable[dict[str, Any]],
) -> list[int]:
    """Enumerate indices allowed by Goursat's common-quotient formula.

    For ``H <= A x B``, Goursat data gives projection subgroups ``A0,B0``
    and a common quotient ``C``.  The index is

    ``[A:A0] [B:B0] |C|``.

    Keeping ``|C|`` is essential here: ``S3`` and ``O8-(2):2`` both have a
    quotient of order two, so the mod-2 image has non-product fiber subgroups.
    """

    possible: set[int] = set()
    for left in left_subgroup_indices:
        left_index = _require_positive_integer(left.get("index"), "left index")
        left_quotients = {
            _require_positive_integer(value, "left quotient order")
            for value in left.get("quotientOrders", [])
        }
        for right in right_projection_cases:
            right_index = _require_positive_integer(
                right.get("projectionIndex"), "right projection index"
            )
            right_quotients = {
                _require_positive_integer(value, "right quotient order")
                for value in right.get("quotientOrders", [])
            }
            for quotient_order in left_quotients & right_quotients:
                possible.add(left_index * right_index * quotient_order)
    return sorted(possible)


def screen_index_two_extension_target(
    target: int, maximal_normal_factor_indices: Sequence[int]
) -> str:
    """Apply the maximal-index obstruction for ``N normal Q`` of index two.

    If ``H`` maps onto ``Q/N``, then ``[Q:H]=[N:H intersect N]``. Otherwise
    ``H <= N`` and ``[Q:H]=2[N:H]``. A proper subgroup of ``N`` lies in a
    maximal subgroup, so a complete maximal index must divide the target or,
    in the second case, half the target.
    """

    degree = _require_positive_integer(target, "target")
    indices = sorted(
        {
            _require_positive_integer(value, "maximal normal-factor index")
            for value in maximal_normal_factor_indices
        }
    )
    if not indices:
        return "unknown"
    survives = any(
        degree % index == 0 or (degree % 2 == 0 and (degree // 2) % index == 0)
        for index in indices
    )
    return "unknown" if survives else "ruled-out"


def build_recognition_cache_key(
    action_hash: str,
    manifest_hash: str,
    recognizer_hash: str | None = None,
) -> str:
    """Bind a structural certificate to both mathematics and executable tools."""

    return sha256_json(
        {
            "schemaVersion": SCHEMA_VERSION,
            "bridgeVersion": BRIDGE_VERSION,
            "actionHash": _require_sha256(action_hash, "actionHash"),
            "manifestHash": _require_sha256(manifest_hash, "manifestHash"),
            "recognizerHash": (
                _require_sha256(recognizer_hash, "recognizerHash")
                if recognizer_hash is not None
                else "module-default"
            ),
        }
    )


def find_research_gap(
    explicit: str | os.PathLike[str] | None = None,
    home: str | os.PathLike[str] | None = None,
) -> Path | None:
    """Locate the isolated GAP runtime without falling back to Sage's GAP ABI."""

    if explicit is not None:
        path = Path(explicit).expanduser()
        return path if path.is_file() and os.access(path, os.X_OK) else None
    override = os.environ.get("COXETER_RESEARCH_GAP")
    if override:
        path = Path(override).expanduser()
        return path if path.is_file() and os.access(path, os.X_OK) else None
    root = Path(home).expanduser() if home is not None else Path.home()
    path = root / DEFAULT_GAP_RELATIVE
    return path if path.is_file() and os.access(path, os.X_OK) else None


def find_toolchain_manifest(
    explicit: str | os.PathLike[str] | None = None,
    home: str | os.PathLike[str] | None = None,
) -> Path | None:
    if explicit is not None:
        path = Path(explicit).expanduser()
        return path if path.is_file() else None
    override = os.environ.get("COXETER_RESEARCH_GAP_MANIFEST")
    if override:
        path = Path(override).expanduser()
        return path if path.is_file() else None
    root = Path(home).expanduser() if home is not None else Path.home()
    path = root / DEFAULT_MANIFEST_RELATIVE
    return path if path.is_file() else None


def validate_screening_certificate(
    certificate: dict[str, Any],
    expected_action_hash: str,
    expected_manifest_hash: str,
) -> bool:
    """Validate certificate plumbing and completeness implications.

    This is intentionally stricter than ordinary JSON validation.  A complete
    index obstruction may not depend on incomplete recognition or an incomplete
    subgroup catalogue.  Inconclusive records remain valid artifacts, but their
    screening decision is ``unknown``.
    """

    if not isinstance(certificate, dict):
        raise ValueError("The recognition certificate must be an object.")
    if certificate.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("Unsupported recognition certificate schemaVersion.")
    action_hash = _require_sha256(certificate.get("actionHash"), "actionHash")
    manifest_hash = _require_sha256(certificate.get("manifestHash"), "manifestHash")
    if action_hash != _require_sha256(expected_action_hash, "expected action hash"):
        raise ValueError("The recognition certificate action hash is stale.")
    if manifest_hash != _require_sha256(
        expected_manifest_hash, "expected manifest hash"
    ):
        raise ValueError("The recognition certificate manifest hash is stale.")

    sections: dict[str, dict[str, Any]] = {}
    orders: set[int] = set()
    for name in ("recognition", "catalogue", "screening"):
        section = certificate.get(name)
        if not isinstance(section, dict):
            raise ValueError(f"Recognition certificate is missing {name}.")
        sections[name] = section
        orders.add(
            _require_positive_integer(
                section.get("finiteImageOrder"), f"{name} finite image order"
            )
        )
    if len(orders) != 1:
        raise ValueError("Recognition, catalogue, and screening group orders disagree.")

    screening_complete = sections["screening"].get("complete") is True
    if screening_complete and sections["recognition"].get("complete") is not True:
        raise ValueError("Complete screening requires complete recognition.")
    if screening_complete and sections["catalogue"].get("complete") is not True:
        raise ValueError("Complete screening requires a complete subgroup catalogue.")

    possible = sections["screening"].get("possibleIndices", [])
    if not isinstance(possible, list):
        raise ValueError("screening.possibleIndices must be an array.")
    parsed = [
        _require_positive_integer(value, "possible subgroup index")
        for value in possible
    ]
    if parsed != sorted(set(parsed)):
        raise ValueError("screening.possibleIndices must be sorted and unique.")

    decisions = sections["screening"].get("targetDecisions", [])
    if not isinstance(decisions, list):
        raise ValueError("screening.targetDecisions must be an array.")
    seen: set[int] = set()
    for decision in decisions:
        if not isinstance(decision, dict):
            raise ValueError("Each target decision must be an object.")
        target = _require_positive_integer(decision.get("target"), "screening target")
        if target in seen:
            raise ValueError("screening.targetDecisions contains a duplicate target.")
        seen.add(target)
        if decision.get("decision") not in {"admissible", "ruled-out", "unknown"}:
            raise ValueError("A target decision has an unsupported status.")
        if (
            not screening_complete
            and decision.get("decision") == "ruled-out"
            and decision.get("complete") is not True
        ):
            raise ValueError("Incomplete screening cannot rule out an index.")
    minimum_degree = sections["screening"].get("minimumNontrivialTransitiveDegree")
    if minimum_degree is not None:
        _require_positive_integer(
            minimum_degree, "minimum nontrivial transitive degree"
        )
        if minimum_degree <= 1:
            raise ValueError("minimumNontrivialTransitiveDegree must exceed one.")
    factor_screen = sections["screening"].get("transitiveFactorScreen")
    if factor_screen is not None:
        if not isinstance(factor_screen, dict):
            raise ValueError("screening.transitiveFactorScreen must be an object.")
        compatible = factor_screen.get("compatibleDegrees", [])
        if not isinstance(compatible, list):
            raise ValueError("compatibleDegrees must be an array.")
        parsed_compatible = [
            _require_positive_integer(value, "compatible factor degree")
            for value in compatible
        ]
        if parsed_compatible != sorted(set(parsed_compatible)):
            raise ValueError("compatibleDegrees must be sorted and unique.")
        if factor_screen.get("complete") is True and not screening_complete:
            raise ValueError(
                "A complete factor screen requires complete index screening."
            )
    return True


def validate_order_discovery_certificate(
    certificate: dict[str, Any],
    expected_action_hash: str,
    expected_manifest_hash: str,
) -> int | None:
    """Validate the verified-recognition order boundary.

    An inconclusive recognition artifact is valid evidence that the attempt was
    made, but it returns ``None``.  A positive order is accepted after either a
    verified recog tree, a faithful spanning-orbit action with exact BSGS
    order, a proved GenSS chain, exact words for every standard generator, or a
    conclusive positive result from the one-sided classical-containment
    algorithm. All routes still require exact upper containment and
    independently checked Coxeter relations.
    """

    if not isinstance(certificate, dict) or certificate.get("schemaVersion") != 1:
        raise ValueError("Unsupported order-discovery certificate schemaVersion.")
    if certificate.get("actionHash") != _require_sha256(
        expected_action_hash, "expected action hash"
    ):
        raise ValueError("The order-discovery action hash is stale.")
    if certificate.get("manifestHash") != _require_sha256(
        expected_manifest_hash, "expected manifest hash"
    ):
        raise ValueError("The order-discovery manifest hash is stale.")
    discovery = certificate.get("orderDiscovery")
    if not isinstance(discovery, dict) or discovery.get("status") != "passed":
        return None
    recognition_verified = (
        discovery.get("recognitionTreeVerified") is True
        or discovery.get("faithfulSpanningOrbitVerified") is True
        or discovery.get("provedGenSSChainVerified") is True
        or discovery.get("exactMutualContainmentSlpsVerified") is True
        or discovery.get("oneSidedClassicalContainmentVerified") is True
    )
    if (
        not recognition_verified
        or discovery.get("inputGeneratorMembershipVerified") is not True
        or discovery.get("inputRelationsVerifiedSeparately") is not True
    ):
        raise ValueError(
            "A discovered order lacks verified recognition, membership, or relation checks."
        )
    order = _require_positive_integer(
        discovery.get("finiteImageOrder"), "discovered finite image order"
    )
    if certificate.get("discoveredFiniteImageOrder") != order:
        raise ValueError("The two discovered finite-image order fields disagree.")
    matrix = certificate.get("matrixValidation")
    if not isinstance(matrix, dict) or matrix.get("status") != "passed":
        raise ValueError("Order discovery lacks exact matrix validation.")
    if matrix.get("orderedGeneratorCount") != len(matrix.get("generatorChecks", [])):
        raise ValueError("Order discovery did not check every ordered generator.")
    if any(check.get("involution") is not True for check in matrix["generatorChecks"]):
        raise ValueError("Order discovery contains a failed generator check.")
    if any(
        check.get("passed") is not True for check in matrix.get("finiteRelations", [])
    ):
        raise ValueError("Order discovery contains a failed Coxeter relation.")
    return order


def screening_decision(certificate: dict[str, Any], target: int) -> str:
    """Return ``admissible``, ``ruled-out``, or fail-closed ``unknown``."""

    target_value = _require_positive_integer(target, "target")
    screening = certificate.get("screening", {})
    if not isinstance(screening, dict):
        return "unknown"
    screening_complete = screening.get("complete") is True
    for record in screening.get("targetDecisions", []):
        if isinstance(record, dict) and record.get("target") == target_value:
            if not screening_complete and record.get("complete") is not True:
                return "unknown"
            return str(record.get("decision", "unknown"))
    if not screening_complete:
        return "unknown"
    possible = screening.get("possibleIndices", [])
    return "admissible" if target_value in possible else "ruled-out"


def minimum_nontrivial_transitive_degree(
    certificate: dict[str, Any],
) -> int | None:
    """Read a certified subgroup-index lower bound from structural screening.

    A nontrivial transitive action of a finite group has degree equal to a
    proper subgroup index.  The field is usable only when the surrounding
    screening catalogue is complete; a recognizer hint never becomes a search
    exclusion by itself.
    """

    screening = certificate.get("screening")
    if not isinstance(screening, dict) or screening.get("complete") is not True:
        return None
    value = screening.get("minimumNontrivialTransitiveDegree")
    if isinstance(value, bool) or not isinstance(value, int) or value <= 1:
        return None
    return value


def no_compatible_transitive_factor(
    certificate: dict[str, Any], target_indices: Sequence[int]
) -> bool:
    """Return whether a complete certificate excludes every nontrivial factor.

    A transitive diagonal orbit maps equivariantly onto each transitive factor,
    so the factor degree divides the final degree.  This helper consumes either
    an explicit complete factor screen or a certified minimum subgroup index.
    """

    targets = [
        _require_positive_integer(value, "target index") for value in target_indices
    ]
    if not targets:
        return True
    screening = certificate.get("screening")
    if not isinstance(screening, dict) or screening.get("complete") is not True:
        return False
    factor_screen = screening.get("transitiveFactorScreen")
    if isinstance(factor_screen, dict) and factor_screen.get("complete") is True:
        compatible = factor_screen.get("compatibleDegrees")
        if isinstance(compatible, list) and all(
            isinstance(value, int) and not isinstance(value, bool) and value > 1
            for value in compatible
        ):
            return len(compatible) == 0
    minimum = minimum_nontrivial_transitive_degree(certificate)
    return minimum is not None and minimum > max(targets)


def unknown_certificate(
    action_hash: str,
    manifest_hash: str,
    finite_image_order: int,
    reason: str,
    detail: str | None = None,
) -> dict[str, Any]:
    order = _require_positive_integer(finite_image_order, "finite image order")
    value: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "bridgeVersion": BRIDGE_VERSION,
        "actionHash": _require_sha256(action_hash, "actionHash"),
        "manifestHash": _require_sha256(manifest_hash, "manifestHash"),
        "recognition": {
            "complete": False,
            "finiteImageOrder": order,
            "reason": reason,
        },
        "catalogue": {
            "complete": False,
            "finiteImageOrder": order,
            "reason": "recognition-incomplete",
        },
        "screening": {
            "complete": False,
            "finiteImageOrder": order,
            "possibleIndices": [],
            "targetDecisions": [],
            "reason": "recognition-incomplete",
        },
    }
    if detail:
        value["recognition"]["detail"] = detail
    return value


def unknown_order_discovery_certificate(
    action_hash: str,
    manifest_hash: str,
    reason: str,
    detail: str | None = None,
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "bridgeVersion": BRIDGE_VERSION,
        "actionHash": _require_sha256(action_hash, "actionHash"),
        "manifestHash": _require_sha256(manifest_hash, "manifestHash"),
        "status": "unknown",
        "orderDiscovery": {
            "status": "unknown",
            "reason": reason,
            "recognitionTreeVerified": False,
            "inputGeneratorMembershipVerified": False,
            "inputRelationsVerifiedSeparately": False,
        },
    }
    if detail:
        value["orderDiscovery"]["detail"] = detail
    return value


def _structural_unknown_certificate(
    payload: dict[str, Any],
    manifest_hash: str,
    artifact: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    """Return an ordinary fail-closed bridge record for unusable stored evidence."""

    action_hash = _require_sha256(payload.get("actionSha256"), "actionSha256")
    expected_order = payload.get("expectedOrder")
    if isinstance(expected_order, int) and not isinstance(expected_order, bool):
        certificate = unknown_certificate(
            action_hash, manifest_hash, expected_order, reason
        )
    else:
        certificate = unknown_order_discovery_certificate(
            action_hash, manifest_hash, reason
        )
    certificate["structuralCertificate"] = {
        "kind": mod3_structural.CERTIFICATE_KIND,
        "artifactHash": artifact.get("artifactHash"),
        "status": artifact.get("status", "unknown"),
        "promotion": "not-promoted",
        "reason": reason,
    }
    return certificate


def validate_mod3_payload_binding(
    artifact: dict[str, Any], payload: dict[str, Any], manifest_hash: str
) -> None:
    """Bind a reusable GF(3) artifact to the worker's exact matrix transfer."""

    claimed_action_hash = _require_sha256(payload.get("actionSha256"), "actionSha256")
    unhashed = {key: value for key, value in payload.items() if key != "actionSha256"}
    if sha256_json(unhashed) != claimed_action_hash:
        raise ValueError("The finite-image action transfer hash is stale.")
    if payload.get("characteristic") != 3 or payload.get("residueFieldOrder") != 3:
        raise ValueError(
            "The compact-cube structural certificate applies only over GF(3)."
        )
    if payload.get("toolchainManifestSha256") != _require_sha256(
        manifest_hash, "manifestHash"
    ):
        raise ValueError("The action transfer names another GAP toolchain manifest.")
    representation = artifact.get("representation")
    if not isinstance(representation, dict):
        raise ValueError("The structural certificate has no exact representation.")
    exact_fields = (
        ("coxeterMatrix", artifact.get("coxeterMatrix")),
        ("matrixGeneratorRows", representation.get("matrixGeneratorRows")),
        ("invariantFormRows", representation.get("preservedFormRows")),
    )
    for payload_name, expected in exact_fields:
        if payload.get(payload_name) != expected:
            raise ValueError(
                f"The structural certificate does not match {payload_name} in the action transfer."
            )


def _verified_mod3_image_order(artifact: dict[str, Any]) -> int | None:
    """Read the image order only after exact equality and outer-coset evidence."""

    if artifact.get("status") == "failed":
        return None
    structural = artifact.get("structuralIdentification")
    if not isinstance(structural, dict):
        return None
    omega = structural.get("omegaDerivedSubgroup")
    outer = structural.get("indexTwoExtension")
    if not isinstance(omega, dict) or not isinstance(outer, dict):
        return None
    tree = omega.get("recognitionTree")
    chain = omega.get("stabilizerChain")
    orbit = omega.get("faithfulOrbit")
    slps = omega.get("standardGeneratorSlps")
    tree_verified = (
        isinstance(tree, dict)
        and tree.get("status") == "verified"
        and tree.get("isCorrect") is True
        and tree.get("isReady") is True
    )
    chain_verified = (
        isinstance(chain, dict)
        and chain.get("status") == "verified"
        and chain.get("isProved") is True
        and chain.get("prescribedOrder") == omega.get("order")
        and chain.get("orbitLengthLimit") == 60_000
        and chain.get("errorBoundNumerator") == 1
        and chain.get("errorBoundDenominator") == 1_048_576
    )
    orbit_verified = (
        isinstance(orbit, dict)
        and orbit.get("status") == "verified"
        and orbit.get("kernelTrivialBySpanningOrbit") is True
        and orbit.get("orderEquality") is True
        and orbit.get("spanRank") == 10
        and orbit.get("moduleDimension") == 10
        and orbit.get("permutationActionOrder") == omega.get("order")
        and orbit.get("standardOmegaOrder") == omega.get("order")
    )
    if (
        omega.get("status") != "verified"
        or not (chain_verified or tree_verified or orbit_verified)
        or not isinstance(slps, dict)
        or slps.get("status") != "verified"
        or outer.get("status") != "verified"
        or outer.get("quotientIndex") != 2
    ):
        return None
    omega_order = _require_positive_integer(omega.get("order"), "Omega order")
    return 2 * omega_order


def adapt_mod3_structural_certificate(
    artifact: dict[str, Any],
    payload: dict[str, Any],
    manifest_hash: str,
    replay: dict[str, Any],
) -> dict[str, Any]:
    """Translate replayed structural evidence into the finite-image bridge schema.

    The 100-row ledger is consumed row by row.  A completed row may decide its
    degree even when another recursive subgroup branch remains unresolved.
    """

    validate_mod3_payload_binding(artifact, payload, manifest_hash)
    action_hash = _require_sha256(payload.get("actionSha256"), "actionSha256")
    image_order = _verified_mod3_image_order(artifact)
    if image_order is None or replay.get("status") != "verified":
        return _structural_unknown_certificate(
            payload,
            manifest_hash,
            artifact,
            "structural-certificate-not-replayable",
        )
    expected_order = payload.get("expectedOrder")
    if expected_order is not None and expected_order != image_order:
        raise ValueError(
            "The structural certificate image order disagrees with the finite-image worker."
        )

    sieve = artifact.get("degreeSieve")
    ledger = sieve.get("degreeLedger") if isinstance(sieve, dict) else None
    if not isinstance(ledger, list):
        raise ValueError("The structural certificate has no degree ledger.")
    ledger_by_degree = {
        int(row["degree"]): row
        for row in ledger
        if isinstance(row, dict)
        and isinstance(row.get("degree"), int)
        and not isinstance(row.get("degree"), bool)
    }
    targets = admissible_target_indices(
        _require_positive_integer(payload.get("lowerBound"), "lower bound"),
        _require_positive_integer(payload.get("maxIndex"), "maximum index"),
    )
    decisions: list[dict[str, Any]] = []
    possible: list[int] = []
    for target in targets:
        row = ledger_by_degree.get(target)
        complete = bool(row and row.get("classificationComplete") is True)
        outcome = row.get("outcome") if row else "unresolved"
        if complete and outcome == "admissible":
            decision = "admissible"
            possible.append(target)
        elif complete and outcome == "impossible":
            decision = "ruled-out"
        else:
            decision = "unknown"
            complete = False
        decisions.append(
            {
                "target": target,
                "decision": decision,
                "complete": complete,
                "sourceOutcome": outcome,
                "reason": (
                    row.get(
                        "reason", "No structural-certificate row covers this degree."
                    )
                    if row
                    else "No structural-certificate row covers this degree."
                ),
            }
        )
    screening_complete = all(record["complete"] for record in decisions)
    structural_summary = {
        "kind": mod3_structural.CERTIFICATE_KIND,
        "artifactHash": artifact.get("artifactHash"),
        "status": artifact.get("status"),
        "promotion": "replayed",
        "replayStatus": replay.get("status"),
        "degreeLedgerSha256": sha256_json(ledger),
        "omegaEqualityMethod": artifact["structuralIdentification"][
            "omegaDerivedSubgroup"
        ].get("equalityMethod"),
    }
    relation_checks = artifact["representation"].get("relationChecks", [])
    involution_checks = [
        {"generator": check.get("generator"), "involution": True}
        for check in relation_checks
        if isinstance(check, dict)
        and check.get("kind") == "involution"
        and check.get("passed") is True
    ]
    finite_relations = [
        check
        for check in relation_checks
        if isinstance(check, dict) and check.get("kind") == "coxeter"
    ]
    generator_count = len(artifact["representation"]["matrixGeneratorRows"])
    if len(involution_checks) != generator_count or any(
        check.get("passed") is not True for check in finite_relations
    ):
        raise ValueError("The structural certificate lacks complete relation checks.")
    certificate: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "bridgeVersion": BRIDGE_VERSION,
        "status": "passed" if screening_complete else "unknown",
        "actionHash": action_hash,
        "manifestHash": _require_sha256(manifest_hash, "manifestHash"),
        "discoveredFiniteImageOrder": image_order,
        "orderDiscovery": {
            "status": "passed",
            "finiteImageOrder": image_order,
            "recognitionTreeVerified": bool(
                isinstance(
                    artifact["structuralIdentification"]["omegaDerivedSubgroup"].get(
                        "recognitionTree"
                    ),
                    dict,
                )
                and artifact["structuralIdentification"]["omegaDerivedSubgroup"][
                    "recognitionTree"
                ].get("status")
                == "verified"
            ),
            "faithfulSpanningOrbitVerified": bool(
                isinstance(
                    artifact["structuralIdentification"]["omegaDerivedSubgroup"].get(
                        "faithfulOrbit"
                    ),
                    dict,
                )
                and artifact["structuralIdentification"]["omegaDerivedSubgroup"][
                    "faithfulOrbit"
                ].get("status")
                == "verified"
            ),
            "provedGenSSChainVerified": bool(
                isinstance(
                    artifact["structuralIdentification"]["omegaDerivedSubgroup"].get(
                        "stabilizerChain"
                    ),
                    dict,
                )
                and artifact["structuralIdentification"]["omegaDerivedSubgroup"][
                    "stabilizerChain"
                ].get("isProved")
                is True
            ),
            "standardGeneratorWordsReplayed": True,
            "inputGeneratorMembershipVerified": True,
            "inputRelationsVerifiedSeparately": True,
            "source": "replayed-compact-5-cube-mod3-structural-certificate",
        },
        "matrixValidation": {
            "status": "passed",
            "orderedGeneratorCount": generator_count,
            "generatorChecks": involution_checks,
            "finiteRelations": finite_relations,
        },
        "recognition": {
            "complete": True,
            "finiteImageOrder": image_order,
            "identifiedAs": "Omega+(10,3):2",
            "source": (
                "proved-genss-chain-and-replayed-standard-generator-slps"
                if artifact["structuralIdentification"]["omegaDerivedSubgroup"]
                .get("stabilizerChain", {})
                .get("isProved")
                is True
                else "faithful-spanning-orbit-order-and-replayed-generator-words"
            ),
        },
        "catalogue": {
            "complete": screening_complete,
            "finiteImageOrder": image_order,
            "scope": "requested-degrees-from-complete-structural-ledger-rows",
            "reason": (
                "Every requested degree has a complete ledger row."
                if screening_complete
                else "At least one requested degree remains unresolved."
            ),
        },
        "screening": {
            "complete": screening_complete,
            "finiteImageOrder": image_order,
            "possibleIndices": sorted(possible),
            "targetDecisions": decisions,
            "reason": (
                "Consumed every requested degree from the replayed structural ledger."
                if screening_complete
                else "Consumed the ledger fail-closed; unresolved rows remain unknown."
            ),
        },
        "structuralCertificate": structural_summary,
    }
    validate_order_discovery_certificate(certificate, action_hash, manifest_hash)
    validate_screening_certificate(certificate, action_hash, manifest_hash)
    return certificate


def load_and_replay_mod3_structural_certificate(
    payload: dict[str, Any],
    *,
    certificate_path: Path,
    source_path: Path,
    manifest_bytes: bytes,
    manifest_hash: str,
    gap_location: str,
    gap_script: Path,
    orchestrator: Path,
    replay_script: Path | None = None,
    timeout_seconds: int,
    wsl_distro: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate and replay stored p=3 evidence without running generic recog."""

    replay_verifier = (
        replay_script.resolve()
        if replay_script is not None
        else mod3_structural.DEFAULT_REPLAY_GAP_SCRIPT.resolve()
    )
    certificate_bytes = certificate_path.read_bytes()
    expected_file_hash = payload.get("structuralCertificateFileSha256")
    if expected_file_hash is not None and expected_file_hash != sha256_bytes(
        certificate_bytes
    ):
        raise ValueError(
            "The structural certificate file changed after transfer setup."
        )
    artifact = json.loads(certificate_bytes.decode("utf8"))
    mod3_structural.validate_certificate(
        artifact,
        source_path=source_path,
        manifest_bytes=manifest_bytes,
        gap_script=gap_script,
        orchestrator=orchestrator,
        replay_script=replay_verifier,
    )
    validate_mod3_payload_binding(artifact, payload, manifest_hash)
    if _verified_mod3_image_order(artifact) is None:
        return (
            _structural_unknown_certificate(
                payload,
                manifest_hash,
                artifact,
                "structural-certificate-evidence-incomplete",
            ),
            {
                "mode": "structural-certificate",
                "genericRecognitionRun": False,
                "replayRun": False,
                "artifactHash": artifact.get("artifactHash"),
            },
        )
    runtime = mod3_structural.resolve_gap_runtime(gap_location, wsl_distro)
    started = __import__("time").monotonic()
    replay, execution = mod3_structural.run_gap(
        mod3_structural.build_replay_payload(artifact),
        runtime=runtime,
        script=replay_verifier,
        timeout_seconds=timeout_seconds,
    )
    certificate = adapt_mod3_structural_certificate(
        artifact, payload, manifest_hash, replay
    )
    return certificate, {
        "mode": "structural-certificate",
        "genericRecognitionRun": False,
        "replayRun": True,
        "replayStatus": replay.get("status", "unknown"),
        "artifactHash": artifact.get("artifactHash"),
        "execution": execution,
        "elapsedSeconds": round(__import__("time").monotonic() - started, 6),
    }


def validate_odd_prime_payload_binding(
    artifact: dict[str, Any], payload: dict[str, Any], manifest_hash: str
) -> None:
    """Bind a p=5,7,11 certificate to one exact matrix-image transfer."""

    action_hash = _require_sha256(payload.get("actionSha256"), "actionSha256")
    unhashed = {key: value for key, value in payload.items() if key != "actionSha256"}
    if sha256_json(unhashed) != action_hash:
        raise ValueError("The finite-image action transfer hash is stale.")
    characteristic = odd_prime_structural.require_supported_characteristic(
        artifact.get("characteristic")
    )
    if (
        payload.get("characteristic") != characteristic
        or payload.get("residueFieldOrder") != characteristic
    ):
        raise ValueError(
            "The odd-prime structural certificate belongs to another residue field."
        )
    if payload.get("toolchainManifestSha256") != _require_sha256(
        manifest_hash, "manifestHash"
    ):
        raise ValueError("The action transfer names another GAP toolchain manifest.")
    representation = artifact.get("representation")
    if not isinstance(representation, dict):
        raise ValueError("The structural certificate has no exact representation.")
    exact_fields = (
        ("coxeterMatrix", artifact.get("coxeterMatrix")),
        ("matrixGeneratorRows", representation.get("matrixGeneratorRows")),
        ("invariantFormRows", representation.get("preservedFormRows")),
    )
    for payload_name, expected in exact_fields:
        if payload.get(payload_name) != expected:
            raise ValueError(
                "The odd-prime structural certificate does not match "
                f"{payload_name} in the action transfer."
            )


def _odd_prime_equality_proof_flags(
    omega: dict[str, Any],
) -> tuple[bool, bool, bool]:
    """Identify the exact lower-containment proof stored for Omega."""

    chain = omega.get("stabilizerChain")
    genss_proof = (
        isinstance(chain, dict)
        and chain.get("status") == "verified"
        and chain.get("isProved") is True
        and chain.get("prescribedOrder") == omega.get("order")
    )
    word_finder = omega.get("wordFinder")
    exact_slp_proof = (
        omega.get("equalityMethod")
        == "mutual containment via exactly evaluated standard-generator SLPs"
        and isinstance(word_finder, dict)
        and word_finder.get("exactWordEvaluationIsPrimaryEvidence") is True
        and word_finder.get("recognitionTreeTrustedForOrder") is False
        and word_finder.get("recognitionTreeTrustedForEquality") is False
    )
    classical = omega.get("classicalContainment")
    classical_proof = (
        omega.get("equalityMethod")
        == "CM_InOmega containment and conclusive one-sided classical Omega-containment"
        and isinstance(classical, dict)
        and classical.get("status") == "verified"
        and classical.get("algorithm") == "RecogniseClassical"
        and classical.get("case") == "orthogonalplus"
        and classical.get("isOmegaContained") is True
        and classical.get("oneSidedPositiveIsConclusive") is True
        and classical.get("recognitionOutputTrustedForContainment") is True
        and classical.get("recognitionOutputTrustedForOrder") is False
        and classical.get("orderTakenFromStandardOmegaAfterMutualContainment") is True
    )
    return genss_proof, exact_slp_proof, classical_proof


def _verified_odd_prime_image_order(artifact: dict[str, Any]) -> int | None:
    """Return |Omega+(10,p):2| only after the direct proof is complete."""

    if artifact.get("status") == "failed":
        return None
    structural = artifact.get("structuralIdentification")
    if not isinstance(structural, dict):
        return None
    omega = structural.get("omegaDerivedSubgroup")
    outer = structural.get("indexTwoExtension")
    if not isinstance(omega, dict) or not isinstance(outer, dict):
        return None
    genss_proof, exact_slp_proof, classical_proof = (
        _odd_prime_equality_proof_flags(omega)
    )
    slps = omega.get("standardGeneratorSlps")
    slps_verified = (
        isinstance(slps, dict)
        and slps.get("status") == "verified"
        and isinstance(slps.get("entries"), list)
        and bool(slps["entries"])
    )
    if (
        omega.get("status") != "verified"
        or not (((genss_proof or exact_slp_proof) and slps_verified) or classical_proof)
        or outer.get("status") != "verified"
        or outer.get("quotientIndex") != 2
        or outer.get("imageEqualsExtension") is not True
    ):
        return None
    return 2 * _require_positive_integer(omega.get("order"), "Omega order")


def _odd_prime_unknown_certificate(
    payload: dict[str, Any],
    manifest_hash: str,
    artifact: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    action_hash = _require_sha256(payload.get("actionSha256"), "actionSha256")
    certificate = unknown_order_discovery_certificate(
        action_hash, manifest_hash, reason
    )
    kernel = artifact.get("kernelCertificate")
    certificate["torsionFreeKernel"] = {
        "status": (
            "passed"
            if isinstance(kernel, dict) and kernel.get("status") == "verified"
            else "unknown"
        ),
        "level": kernel.get("level") if isinstance(kernel, dict) else None,
        "exactIndex": kernel.get("exactIndex") if isinstance(kernel, dict) else None,
        "source": "exact-maximal-spherical-restriction-checks",
    }
    certificate["structuralCertificate"] = {
        "kind": artifact.get("certificateKind"),
        "artifactHash": artifact.get("artifactHash"),
        "characteristic": artifact.get("characteristic"),
        "status": artifact.get("status", "unknown"),
        "promotion": "not-promoted",
        "reason": reason,
    }
    return certificate


def adapt_odd_prime_structural_certificate(
    artifact: dict[str, Any],
    payload: dict[str, Any],
    manifest_hash: str,
    replay: dict[str, Any],
) -> dict[str, Any]:
    """Translate a replayed direct orthogonal proof into the bridge schema."""

    validate_odd_prime_payload_binding(artifact, payload, manifest_hash)
    action_hash = _require_sha256(payload.get("actionSha256"), "actionSha256")
    image_order = _verified_odd_prime_image_order(artifact)
    if image_order is None or replay.get("status") != "verified":
        return _odd_prime_unknown_certificate(
            payload,
            manifest_hash,
            artifact,
            "odd-prime-structural-certificate-not-replayable",
        )
    expected_order = payload.get("expectedOrder")
    if expected_order is not None and expected_order != image_order:
        raise ValueError(
            "The odd-prime certificate image order disagrees with the worker transfer."
        )
    sieve = artifact.get("degreeSieve")
    ledger = sieve.get("degreeLedger") if isinstance(sieve, dict) else None
    if not isinstance(ledger, list) or sieve.get("appliesToImage") is not True:
        raise ValueError("The odd-prime certificate has no applicable degree ledger.")
    ledger_by_degree = {
        int(row["degree"]): row
        for row in ledger
        if isinstance(row, dict)
        and isinstance(row.get("degree"), int)
        and not isinstance(row.get("degree"), bool)
    }
    targets = admissible_target_indices(
        _require_positive_integer(payload.get("lowerBound"), "lower bound"),
        _require_positive_integer(payload.get("maxIndex"), "maximum index"),
    )
    decisions: list[dict[str, Any]] = []
    possible: list[int] = []
    for target in targets:
        row = ledger_by_degree.get(target)
        complete = bool(row and row.get("classificationComplete") is True)
        outcome = row.get("outcome") if row else "unresolved"
        if complete and outcome == "admissible":
            decision = "admissible"
            possible.append(target)
        elif complete and outcome == "impossible":
            decision = "ruled-out"
        else:
            decision = "unknown"
            complete = False
        decisions.append(
            {
                "target": target,
                "decision": decision,
                "complete": complete,
                "sourceOutcome": outcome,
                "reason": (
                    row.get("reason", "No structural ledger row covers this degree.")
                    if row
                    else "No structural ledger row covers this degree."
                ),
            }
        )
    screening_complete = all(record["complete"] for record in decisions)
    representation = artifact["representation"]
    relation_checks = representation.get("relationChecks", [])
    generator_count = len(representation["matrixGeneratorRows"])
    involutions = [
        {"generator": check.get("generator"), "involution": True}
        for check in relation_checks
        if isinstance(check, dict)
        and check.get("kind") == "involution"
        and check.get("passed") is True
    ]
    finite_relations = [
        check
        for check in relation_checks
        if isinstance(check, dict) and check.get("kind") == "coxeter"
    ]
    if len(involutions) != generator_count or any(
        check.get("passed") is not True for check in finite_relations
    ):
        raise ValueError("The odd-prime certificate lacks complete relation checks.")
    p = odd_prime_structural.require_supported_characteristic(
        artifact.get("characteristic")
    )
    omega_record = artifact["structuralIdentification"]["omegaDerivedSubgroup"]
    genss_proof, exact_slp_proof, classical_proof = (
        _odd_prime_equality_proof_flags(omega_record)
    )
    certificate: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "bridgeVersion": BRIDGE_VERSION,
        "status": "passed" if screening_complete else "unknown",
        "actionHash": action_hash,
        "manifestHash": _require_sha256(manifest_hash, "manifestHash"),
        "discoveredFiniteImageOrder": image_order,
        "torsionFreeKernel": {
            "status": "passed",
            "level": "torsion-free-finite-index-kernel-exact-index-known",
            "exactIndex": image_order,
            "source": "exact-maximal-spherical-restriction-checks",
        },
        "orderDiscovery": {
            "status": "passed",
            "finiteImageOrder": image_order,
            "recognitionTreeVerified": False,
            "provedGenSSChainVerified": genss_proof,
            "exactMutualContainmentSlpsVerified": exact_slp_proof,
            "oneSidedClassicalContainmentVerified": classical_proof,
            "standardGeneratorWordsReplayed": genss_proof or exact_slp_proof,
            "inputGeneratorMembershipVerified": True,
            "inputRelationsVerifiedSeparately": True,
            "source": f"replayed-direct-orthogonal-structural-certificate-p{p}",
        },
        "matrixValidation": {
            "status": "passed",
            "orderedGeneratorCount": generator_count,
            "generatorChecks": involutions,
            "finiteRelations": finite_relations,
        },
        "recognition": {
            "complete": True,
            "finiteImageOrder": image_order,
            "identifiedAs": f"Omega+(10,{p}):2",
            "source": (
                "cm-in-omega-proved-genss-chain-and-replayed-standard-generator-slps"
                if genss_proof
                else "cm-in-omega-and-exact-mutual-containment-standard-generator-slps"
                if exact_slp_proof
                else "cm-in-omega-and-conclusive-one-sided-classical-containment"
            ),
        },
        "catalogue": {
            "complete": screening_complete,
            "finiteImageOrder": image_order,
            "scope": "complete-ClassicalMaximals-root-ledger-through-bound",
            "reason": (
                "Every requested degree has a complete maximal-index decision."
                if screening_complete
                else "Some compatible maximal branch needs deeper subgroup analysis."
            ),
        },
        "screening": {
            "complete": screening_complete,
            "finiteImageOrder": image_order,
            "possibleIndices": sorted(possible),
            "targetDecisions": decisions,
            "reason": "Consumed every requested row from the replayed maximal-index ledger.",
        },
        "structuralCertificate": {
            "kind": artifact.get("certificateKind"),
            "artifactHash": artifact.get("artifactHash"),
            "characteristic": p,
            "status": artifact.get("status"),
            "promotion": "replayed",
            "replayStatus": replay.get("status"),
            "degreeLedgerSha256": sha256_json(ledger),
            "omegaEqualityMethod": artifact["structuralIdentification"][
                "omegaDerivedSubgroup"
            ].get("equalityMethod"),
        },
    }
    validate_order_discovery_certificate(certificate, action_hash, manifest_hash)
    validate_screening_certificate(certificate, action_hash, manifest_hash)
    return certificate


def load_and_replay_odd_prime_structural_certificate(
    payload: dict[str, Any],
    *,
    certificate_path: Path,
    source_path: Path,
    manifest_bytes: bytes,
    manifest_hash: str,
    gap_location: str,
    gap_script: Path,
    orchestrator: Path,
    replay_script: Path | None = None,
    timeout_seconds: int,
    wsl_distro: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate and replay p=5,7,11 evidence without generic recognition."""

    replay_verifier = (
        replay_script.resolve()
        if replay_script is not None
        else odd_prime_structural.DEFAULT_REPLAY_GAP_SCRIPT.resolve()
    )
    certificate_bytes = certificate_path.read_bytes()
    expected_file_hash = payload.get("structuralCertificateFileSha256")
    if expected_file_hash is not None and expected_file_hash != sha256_bytes(
        certificate_bytes
    ):
        raise ValueError("The odd-prime certificate changed after transfer setup.")
    artifact = json.loads(certificate_bytes.decode("utf8"))
    odd_prime_structural.validate_certificate(
        artifact,
        source_path=source_path,
        manifest_bytes=manifest_bytes,
        gap_script=gap_script,
        orchestrator=orchestrator,
        replay_script=replay_verifier,
    )
    validate_odd_prime_payload_binding(artifact, payload, manifest_hash)
    if _verified_odd_prime_image_order(artifact) is None:
        return (
            _odd_prime_unknown_certificate(
                payload,
                manifest_hash,
                artifact,
                "odd-prime-structural-certificate-evidence-incomplete",
            ),
            {
                "mode": "odd-prime-structural-certificate",
                "genericRecognitionRun": False,
                "replayRun": False,
                "artifactHash": artifact.get("artifactHash"),
            },
        )
    runtime = odd_prime_structural.resolve_gap_runtime(gap_location, wsl_distro)
    started = __import__("time").monotonic()
    replay, execution = odd_prime_structural.run_gap(
        odd_prime_structural.build_replay_payload(artifact),
        runtime=runtime,
        script=replay_verifier,
        timeout_seconds=timeout_seconds,
    )
    certificate = adapt_odd_prime_structural_certificate(
        artifact, payload, manifest_hash, replay
    )
    return certificate, {
        "mode": "odd-prime-structural-certificate",
        "genericRecognitionRun": False,
        "replayRun": True,
        "replayStatus": replay.get("status", "unknown"),
        "artifactHash": artifact.get("artifactHash"),
        "execution": execution,
        "elapsedSeconds": round(__import__("time").monotonic() - started, 6),
    }


def build_action_transfer(
    *,
    candidate_id: str,
    characteristic: int,
    finite_image_order: int | None,
    coxeter_matrix: Sequence[Sequence[int]],
    lower_bound: int,
    max_index: int,
    manifest_hash: str,
    degree: int | None = None,
    generator_rows: Sequence[Sequence[int]] | None = None,
    matrix_generator_rows: Sequence[Sequence[Sequence[int]]] | None = None,
    invariant_form_rows: Sequence[Sequence[int]] | None = None,
    residue_field_order: int | None = None,
    torsion_witnesses: Sequence[dict[str, Any]] | None = None,
    torsion_witness_catalogue_complete: bool = False,
    structural_certificate_sha256: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Build a deterministic exact-image payload and its certificate hash.

    ``generator_rows`` and ``degree`` are an all-or-nothing optional pair.  A
    matrix-only payload is the normal higher-prime path; it cannot be used to
    export a coset action until a later materialization step supplies rows.
    """

    rank = len(coxeter_matrix)
    matrix_rows = [[int(value) for value in row] for row in coxeter_matrix]
    if any(len(row) != rank for row in matrix_rows):
        raise ValueError("The Coxeter matrix must be square.")
    if (degree is None) != (generator_rows is None):
        raise ValueError(
            "Permutation degree and generator rows must be supplied together."
        )
    rows = (
        [[int(point) for point in row] for row in generator_rows]
        if generator_rows is not None
        else None
    )
    if rows is not None:
        permutation_degree = _require_positive_integer(degree, "permutation degree")
        if len(rows) != rank or any(len(row) != permutation_degree for row in rows):
            raise ValueError(
                "Ordered generator rows do not match rank and action degree."
            )
    elif matrix_generator_rows is None:
        raise ValueError(
            "An exact transfer needs matrix generators or permutation rows."
        )
    payload: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "bridgeVersion": BRIDGE_VERSION,
        "candidateId": candidate_id,
        "characteristic": _require_positive_integer(
            characteristic, "residue characteristic"
        ),
        "actionMode": "permutation+matrix" if rows is not None else "matrix-only",
        "coxeterMatrix": matrix_rows,
        "lowerBound": _require_positive_integer(lower_bound, "lower bound"),
        "maxIndex": _require_positive_integer(max_index, "maximum index"),
        "toolchainManifestSha256": _require_sha256(
            manifest_hash, "toolchain manifest hash"
        ),
    }
    if finite_image_order is None:
        if rows is not None:
            raise ValueError("Order discovery accepts matrix-only payloads.")
        payload.update(
            {
                "orderMode": "discover-recog",
                # Continue into structural screening in the same GAP process.
                # Reconstructing the matrix group in a second process would
                # throw away recog's verified tree and repeat the expensive work.
                "orderDiscoveryOnly": False,
            }
        )
    else:
        payload.update(
            {
                "expectedOrder": _require_positive_integer(
                    finite_image_order, "finite image order"
                ),
                "orderMode": "verify-known",
            }
        )
    if rows is not None:
        payload.update({"degree": permutation_degree, "generatorRows": rows})
    if matrix_generator_rows is not None:
        matrices = [
            [[int(entry) for entry in row] for row in generator]
            for generator in matrix_generator_rows
        ]
        dimension = len(matrices[0]) if matrices else 0
        if (
            len(matrices) != rank
            or dimension == 0
            or any(len(generator) != dimension for generator in matrices)
            or any(len(row) != dimension for generator in matrices for row in generator)
        ):
            raise ValueError(
                "Matrix-generator transfer must be rank-many square matrices."
            )
        payload.update(
            {
                "matrixDimension": dimension,
                "matrixGeneratorRows": matrices,
                "residueFieldOrder": _require_positive_integer(
                    residue_field_order, "residue field order"
                ),
            }
        )
    if invariant_form_rows is not None:
        form = [[int(entry) for entry in row] for row in invariant_form_rows]
        dimension = int(payload.get("matrixDimension", 0))
        if (
            dimension == 0
            or len(form) != dimension
            or any(len(row) != dimension for row in form)
        ):
            raise ValueError("Invariant-form transfer must match matrixDimension.")
        payload["invariantFormRows"] = form
    if torsion_witnesses is not None:
        checked_witnesses: list[dict[str, Any]] = []
        for position, witness in enumerate(torsion_witnesses):
            if not isinstance(witness, dict):
                raise ValueError(f"torsion witness {position} must be an object.")
            word = witness.get("word")
            prime_order = witness.get("primeOrder")
            if not isinstance(word, list) or any(
                isinstance(letter, bool)
                or not isinstance(letter, int)
                or letter < 0
                or letter >= rank
                for letter in word
            ):
                raise ValueError(
                    f"torsion witness {position} has an invalid generator word."
                )
            checked_witnesses.append(
                {
                    "id": str(witness.get("id", f"tw{position}")),
                    "word": [int(letter) for letter in word],
                    "primeOrder": _require_positive_integer(
                        prime_order, f"torsion witness {position} primeOrder"
                    ),
                }
            )
        payload["torsionWitnesses"] = checked_witnesses
        payload["torsionWitnessCatalogueComplete"] = bool(
            torsion_witness_catalogue_complete
        )
    if structural_certificate_sha256 is not None:
        payload["structuralCertificateFileSha256"] = _require_sha256(
            structural_certificate_sha256, "structural certificate file hash"
        )
    action_hash = sha256_json(payload)
    payload["actionSha256"] = action_hash
    return payload, action_hash


def _gap_quote(path: Path) -> str:
    return str(path).replace("\\", "/").replace('"', '\\"')


def _gap_literal(value: Any) -> str:
    """Encode the restricted action payload as a native GAP literal.

    The audit copy remains JSON, but execution must not depend on GAP's optional
    JSON parser package.  Payload keys are controlled by this module and become
    record component names; imported user strings remain quoted scalar values.
    """

    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=True)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_gap_literal(item) for item in value) + "]"
    if isinstance(value, dict):
        fields: list[str] = []
        for key in sorted(value):
            if not isinstance(key, str) or not key.replace("_", "a").isalnum():
                raise ValueError(f"Unsupported GAP record component: {key!r}")
            fields.append(f"{key}:={_gap_literal(value[key])}")
        return "rec(" + ",".join(fields) + ")"
    raise TypeError(f"Unsupported GAP transfer value: {type(value).__name__}")


def run_gap_recognition(
    payload: dict[str, Any],
    *,
    gap: Path,
    manifest_hash: str,
    cache_root: Path,
    timeout_seconds: int,
    script: Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run or restore an isolated GAP recognition certificate.

    The returned metadata records cache use and external timings.  A missing or
    failed recognizer yields a valid incomplete certificate; callers must never
    turn that state into an impossibility claim.
    """

    action_hash = _require_sha256(payload.get("actionSha256"), "actionSha256")
    manifest = _require_sha256(manifest_hash, "manifestHash")
    discovering_order = payload.get("orderMode") == "discover-recog"
    static_script = script or SCRIPT_DIR / "gap_finite_image_recognition.g"
    recognizer_hash = (
        sha256_bytes(static_script.read_bytes())
        if static_script.is_file()
        else sha256_json({"status": "recognizer-script-unavailable"})
    )
    key = build_recognition_cache_key(action_hash, manifest, recognizer_hash)
    cache_dir = (
        cache_root.expanduser()
        / ("order-discovery" if discovering_order else "recognition")
        / key
    )
    cache_path = cache_dir / "certificate.json"
    action_path = cache_dir / "action.json"
    if cache_path.is_file():
        cached = json.loads(cache_path.read_text(encoding="utf8"))
        if discovering_order:
            validate_order_discovery_certificate(cached, action_hash, manifest)
        else:
            validate_screening_certificate(cached, action_hash, manifest)
        return cached, {
            "cacheHit": True,
            "cacheKey": key,
            "recognizerHash": recognizer_hash,
            "elapsedSeconds": 0.0,
        }

    started = __import__("time").monotonic()
    if not gap.is_file() or not static_script.is_file():
        certificate = (
            unknown_order_discovery_certificate(
                action_hash, manifest, "recognition-runtime-unavailable"
            )
            if discovering_order
            else unknown_certificate(
                action_hash,
                manifest,
                int(payload["expectedOrder"]),
                "recognition-runtime-unavailable",
            )
        )
        return certificate, {
            "cacheHit": False,
            "cacheKey": key,
            "recognizerHash": recognizer_hash,
            "elapsedSeconds": 0.0,
        }

    cache_dir.mkdir(parents=True, exist_ok=True)
    encoded_payload = canonical_json(payload) + "\n"
    if action_path.is_file():
        restored = json.loads(action_path.read_text(encoding="utf8"))
        if restored != payload:
            raise ValueError("Recognition cache action payload does not match its key.")
    else:
        temporary_action = action_path.with_name(
            f".{action_path.name}.{os.getpid()}.tmp"
        )
        temporary_action.write_text(encoded_payload, encoding="utf8")
        os.replace(temporary_action, action_path)
    with tempfile.TemporaryDirectory(
        prefix="coxeter-recognition-", dir=cache_dir
    ) as tmp:
        work = Path(tmp)
        input_path = work / "action.json"
        output_path = work / "certificate.json"
        driver_path = work / "driver.g"
        input_path.write_text(encoded_payload, encoding="utf8")
        driver_path.write_text(
            f"COXETER_INPUT := {_gap_literal(payload)};;\n"
            f'COXETER_OUTPUT := "{_gap_quote(output_path)}";;\n'
            f'Read("{_gap_quote(static_script)}");;\n',
            encoding="utf8",
        )
        try:
            process = subprocess.run(
                [
                    str(gap),
                    "-r",
                    "-q",
                    "--quitonbreak",
                    "--nointeract",
                    str(driver_path),
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=max(1, timeout_seconds),
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            certificate = (
                unknown_order_discovery_certificate(
                    action_hash,
                    manifest,
                    "recognition-process-failed",
                    str(exc),
                )
                if discovering_order
                else unknown_certificate(
                    action_hash,
                    manifest,
                    int(payload["expectedOrder"]),
                    "recognition-process-failed",
                    str(exc),
                )
            )
            return certificate, {
                "cacheHit": False,
                "cacheKey": key,
                "recognizerHash": recognizer_hash,
                "elapsedSeconds": round(__import__("time").monotonic() - started, 6),
            }

        if process.returncode != 0 and output_path.is_file():
            failed_certificate = json.loads(output_path.read_text(encoding="utf8"))
            if discovering_order:
                validate_order_discovery_certificate(
                    failed_certificate, action_hash, manifest
                )
            else:
                validate_screening_certificate(
                    failed_certificate, action_hash, manifest
                )
            return failed_certificate, {
                "cacheHit": False,
                "cacheKey": key,
                "recognizerHash": recognizer_hash,
                "processReturnCode": process.returncode,
                "elapsedSeconds": round(__import__("time").monotonic() - started, 6),
            }
        if process.returncode != 0 or not output_path.is_file():
            detail = (
                process.stderr or process.stdout or "GAP wrote no certificate"
            ).strip()
            certificate = (
                unknown_order_discovery_certificate(
                    action_hash,
                    manifest,
                    "recognition-process-failed",
                    detail[-4000:],
                )
                if discovering_order
                else unknown_certificate(
                    action_hash,
                    manifest,
                    int(payload["expectedOrder"]),
                    "recognition-process-failed",
                    detail[-4000:],
                )
            )
            return certificate, {
                "cacheHit": False,
                "cacheKey": key,
                "recognizerHash": recognizer_hash,
                "elapsedSeconds": round(__import__("time").monotonic() - started, 6),
            }
        certificate = json.loads(output_path.read_text(encoding="utf8"))
        if discovering_order:
            validate_order_discovery_certificate(certificate, action_hash, manifest)
        else:
            validate_screening_certificate(certificate, action_hash, manifest)
        temporary = cache_path.with_name(f".{cache_path.name}.{os.getpid()}.tmp")
        temporary.write_text(
            json.dumps(certificate, indent=2, sort_keys=True) + "\n", encoding="utf8"
        )
        os.replace(temporary, cache_path)
        process_metadata = {
            "processReturnCode": process.returncode,
            "processStdoutTail": (process.stdout or "")[-4000:],
            "processStderrTail": (process.stderr or "")[-4000:],
        }
    return certificate, {
        "cacheHit": False,
        "cacheKey": key,
        "recognizerHash": recognizer_hash,
        "elapsedSeconds": round(__import__("time").monotonic() - started, 6),
        **process_metadata,
    }


def main() -> int:
    """Re-run recognition from a durable action transfer without rebuilding Sage."""

    parser = argparse.ArgumentParser(
        description="Recognise and screen a cached exact finite-image action."
    )
    parser.add_argument("--action", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--gap", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--structural-certificate", type=Path)
    parser.add_argument(
        "--structural-source", type=Path, default=None
    )
    parser.add_argument(
        "--structural-gap-script",
        type=Path,
        default=None,
    )
    parser.add_argument(
        "--structural-replay-gap-script",
        type=Path,
        default=None,
    )
    parser.add_argument(
        "--structural-orchestrator",
        type=Path,
        default=None,
    )
    parser.add_argument("--wsl-distro")
    args = parser.parse_args()
    payload = json.loads(args.action.read_text(encoding="utf8"))
    claimed = payload.get("actionSha256")
    unhashed = {key: value for key, value in payload.items() if key != "actionSha256"}
    actual = sha256_json(unhashed)
    if claimed != actual:
        raise ValueError("Cached actionSha256 does not match its payload.")
    if args.structural_certificate is not None:
        characteristic = int(payload.get("characteristic", 0))
        structural_module = (
            mod3_structural if characteristic == 3 else odd_prime_structural
        )
        if characteristic != 3:
            odd_prime_structural.require_supported_characteristic(characteristic)
        manifest_location = (
            str(args.manifest)
            if args.manifest is not None
            else structural_module.DEFAULT_MANIFEST
        )
        manifest_bytes = structural_module.read_runtime_file(
            manifest_location, args.wsl_distro
        )
        manifest_hash = sha256_bytes(manifest_bytes)
        if payload.get("toolchainManifestSha256") != manifest_hash:
            raise ValueError("Cached action names a different GAP toolchain manifest.")
        replay_loader = (
            load_and_replay_mod3_structural_certificate
            if characteristic == 3
            else load_and_replay_odd_prime_structural_certificate
        )
        certificate, metrics = replay_loader(
            payload,
            certificate_path=args.structural_certificate.resolve(),
            source_path=Path(
                args.structural_source or structural_module.DEFAULT_SOURCE
            ).resolve(),
            manifest_bytes=manifest_bytes,
            manifest_hash=manifest_hash,
            gap_location=(
                str(args.gap) if args.gap is not None else structural_module.DEFAULT_GAP
            ),
            gap_script=Path(
                args.structural_gap_script or structural_module.DEFAULT_GAP_SCRIPT
            ).resolve(),
            replay_script=Path(
                args.structural_replay_gap_script
                or structural_module.DEFAULT_REPLAY_GAP_SCRIPT
            ).resolve(),
            orchestrator=Path(
                args.structural_orchestrator
                or Path(structural_module.__file__).resolve()
            ).resolve(),
            timeout_seconds=args.timeout,
            wsl_distro=args.wsl_distro,
        )
        result = {"certificate": certificate, "execution": metrics}
        encoded = json.dumps(result, indent=2, sort_keys=True) + "\n"
        if args.output is None:
            print(encoded, end="")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(encoded, encoding="utf8")
        return 0 if certificate.get("status") in {"passed", "unknown"} else 1

    gap = find_research_gap(args.gap)
    manifest_path = find_toolchain_manifest(args.manifest)
    if gap is None or manifest_path is None:
        raise FileNotFoundError("The isolated GAP runtime or manifest is unavailable.")
    manifest_hash = sha256_bytes(manifest_path.read_bytes())
    if payload.get("toolchainManifestSha256") != manifest_hash:
        raise ValueError("Cached action names a different GAP toolchain manifest.")
    certificate, metrics = run_gap_recognition(
        payload,
        gap=gap,
        manifest_hash=manifest_hash,
        cache_root=args.cache_dir,
        timeout_seconds=args.timeout,
    )
    result = {"certificate": certificate, "execution": metrics}
    encoded = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output is None:
        print(encoded, end="")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf8")
    return 0 if certificate.get("status") in {"passed", "unknown"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
