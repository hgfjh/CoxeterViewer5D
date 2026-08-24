#!/usr/bin/env bash
set -euo pipefail

# The official GAP archive is the package source of record. Its checksum pins
# both GAP and the bundled package tree; the version checks below guard against
# a partially upgraded or user-shadowed installation.
INSTALLER_VERSION="1.1.0"
GAP_VERSION="4.16.0"
ARCHIVE_SHA256="aaa296b32a5d7bf25fd80f241d23ec1f58b74e991ae730fafe40e54eb3af6e7e"
INSTALL_ROOT="${COXETER_GAP_INSTALL_ROOT:-$HOME/.local/opt/coxeter-gap}"
CACHE_ROOT="${COXETER_GAP_BUILD_CACHE:-$HOME/.cache/coxeter-viewer/tool-build}"
STATE_ROOT="${COXETER_GAP_STATE_ROOT:-$HOME/.local/share/coxeter-viewer/gap-$GAP_VERSION}"
GAP_ROOT="$INSTALL_ROOT/gap-$GAP_VERSION"
GAP_BIN="$GAP_ROOT/gap"
ARCHIVE="$CACHE_ROOT/gap-$GAP_VERSION.tar.gz"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

PACKAGE_PINS=(
  "AtlasRep:2.1.11"
  "TomLib:1.2.11"
  "Forms:1.3.0"
  "orb:5.1.0"
  "genss:1.6.9"
  "recog:1.5.1"
  "ClassicalMaximals:1.1"
  "ferret:1.0.16"
)
NATIVE_PACKAGES=(io orb ferret)

mode="${1:---install}"
case "$mode" in
  --install | --check | --print-manifest) ;;
  *)
    echo "usage: $0 [--install|--check|--print-manifest]" >&2
    exit 2
    ;;
esac

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}

verify_archive() {
  local actual
  actual="$(sha256_file "$ARCHIVE")"
  if [[ "$actual" != "$ARCHIVE_SHA256" ]]; then
    echo "Checksum mismatch for $ARCHIVE" >&2
    exit 1
  fi
}

install_gap() {
  mkdir -p "$INSTALL_ROOT" "$CACHE_ROOT" "$STATE_ROOT"
  if [[ ! -x "$GAP_BIN" ]]; then
    if [[ ! -f "$ARCHIVE" ]]; then
      curl -fL --retry 3 --retry-delay 2 \
        -o "$ARCHIVE" \
        "https://github.com/gap-system/gap/releases/download/v$GAP_VERSION/gap-$GAP_VERSION.tar.gz"
    fi
    verify_archive

    # The release archive has one fixed top-level directory. Never derive this
    # removal target from command-line input.
    if [[ -e "$GAP_ROOT" ]]; then
      rm -rf "$GAP_ROOT"
    fi
    tar -xzf "$ARCHIVE" -C "$INSTALL_ROOT"
    (
      cd "$GAP_ROOT"
      ./configure
      make -j"${COXETER_GAP_BUILD_JOBS:-4}"
    )
  elif [[ -f "$ARCHIVE" ]]; then
    verify_archive
  fi

  # These packages contain native components. BuildPackages is incremental and
  # doubles as the repair path after a compiler or GAP ABI change. genss,
  # recog, and ClassicalMaximals are verified below but require no native build.
  (
    cd "$GAP_ROOT/pkg"
    ../bin/BuildPackages.sh --strict "${NATIVE_PACKAGES[@]}"
  )
}

if [[ "$mode" == "--install" ]]; then
  install_gap
elif [[ ! -x "$GAP_BIN" ]]; then
  echo "Pinned GAP $GAP_VERSION is not installed at $GAP_BIN" >&2
  exit 1
else
  mkdir -p "$STATE_ROOT"
fi

gap_wanted=""
for pin in "${PACKAGE_PINS[@]}"; do
  name="${pin%%:*}"
  version="${pin#*:}"
  gap_wanted+="[\"$name\",\"$version\"],"
done
gap_wanted="${gap_wanted%,}"

smoke_script="$STATE_ROOT/toolchain-smoke.g"
cat >"$smoke_script" <<GAP
Check := function(condition, message)
  if not condition then Error(message); fi;
end;;

Check(GAPInfo.Version = "$GAP_VERSION", "wrong GAP version");
Check(ForAll(GAPInfo.RootPaths,
  p -> PositionSublist(p, "/opt/miniforge3") = fail),
  "Sage GAP root leaked into the standalone runtime");

wanted := [$gap_wanted];;
for spec in wanted do
  info := PackageInfo(spec[1]);
  Check(Length(info) > 0, Concatenation("missing ", spec[1]));
  Check(info[1].Version = spec[2], Concatenation("wrong version for ", spec[1]));
  Check(LoadPackage(spec[1]) = true, Concatenation("cannot load ", spec[1]));
od;

o := Orb([(1,2,3)], 1, OnPoints);;
Enumerate(o);;
Check(Set(UnderlyingPlist(o)) = [1,2,3], "orb smoke test failed");

chain := StabilizerChain(SymmetricGroup(5));;
Check(Size(chain) = 120, "genss smoke test failed");
Check(RecogniseGroup(SymmetricGroup(5)) <> fail, "recog smoke test failed");

maximals := ClassicalMaximalsGeneric("L", 3, 4, [1]);;
Check(Length(maximals) > 0, "ClassicalMaximals smoke test failed");

h := Solve([
  ConInGroup(SymmetricGroup(5)),
  ConStabilize([1,2], OnSets)
]);;
Check(Size(h) = 12, "ferret smoke test failed");
Print("Coxeter GAP toolchain smoke test passed\n");
QUIT;
GAP

# -r ignores ~/.gap, including packages built against Sage's GAP 4.14 ABI.
# Capture package chatter so --print-manifest remains valid JSON on stdout.
smoke_log="$STATE_ROOT/toolchain-smoke.log"
if ! "$GAP_BIN" -r -q --quitonbreak --nointeract "$smoke_script" >"$smoke_log" 2>&1; then
  cat "$smoke_log" >&2
  exit 1
fi

binary_sha256="$(sha256_file "$GAP_BIN")"
installer_sha256="$(sha256_file "$SCRIPT_PATH")"
archive_present=false
archive_actual_sha256=""
if [[ -f "$ARCHIVE" ]]; then
  archive_present=true
  archive_actual_sha256="$(sha256_file "$ARCHIVE")"
fi

manifest_script="$STATE_ROOT/toolchain-manifest.g"
cat >"$manifest_script" <<GAP
wanted := [$gap_wanted];;
Print("{\n");
Print("  \"schemaVersion\": 1,\n");
Print("  \"installerVersion\": \"$INSTALLER_VERSION\",\n");
Print("  \"installerSha256\": \"$installer_sha256\",\n");
Print("  \"isolated\": true,\n");
Print("  \"gap\": {\n");
Print("    \"version\": \"", GAPInfo.Version, "\",\n");
Print("    \"binarySha256\": \"$binary_sha256\",\n");
Print("    \"archiveExpectedSha256\": \"$ARCHIVE_SHA256\",\n");
Print("    \"archivePresent\": $archive_present,\n");
Print("    \"archiveActualSha256\": \"$archive_actual_sha256\"\n");
Print("  },\n");
Print("  \"packages\": {");
for i in [1..Length(wanted)] do
  spec := wanted[i];
  info := PackageInfo(spec[1])[1];
  if i > 1 then Print(","); fi;
  Print("\n    \"", spec[1], "\": {");
  Print("\"expectedVersion\": \"", spec[2], "\", ");
  Print("\"actualVersion\": \"", info.Version, "\", ");
  Print("\"loaded\": true}");
od;
Print("\n  },\n");
Print("  \"smokeChecks\": {\n");
Print("    \"orb\": true,\n");
Print("    \"genss\": true,\n");
Print("    \"recog\": true,\n");
Print("    \"ClassicalMaximals\": true,\n");
Print("    \"ferret\": true\n");
Print("  }\n");
Print("}\n");
QUIT;
GAP

manifest="$STATE_ROOT/toolchain-manifest.json"
# A wide virtual screen prevents GAP from inserting continuation backslashes
# into long hashes, which would make the emitted manifest invalid JSON.
"$GAP_BIN" -r -q -x 4096 --quitonbreak --nointeract "$manifest_script" >"$manifest"
sha256_file "$manifest" >"$manifest.sha256"

if [[ "$mode" == "--print-manifest" || "$mode" == "--install" ]]; then
  cat "$manifest"
else
  echo "Coxeter GAP toolchain smoke test passed"
  echo "Pinned GAP research toolchain is healthy"
  echo "manifest: $manifest"
  echo "manifest sha256: $(cat "$manifest.sha256")"
fi
