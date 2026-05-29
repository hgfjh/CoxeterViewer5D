# GAP/KBMAG finite spherical exporter for Coxeter Viewer 5D.
#
# The Python launcher validates JSON and writes a temporary GAP record named
# COXETER_VIEWER_INPUT. GAP then loads KBMAG, builds the Coxeter presentation,
# maps the finite group to a permutation group, and emits a small line protocol
# that the launcher turns into GeneratedCayleyBall JSON.

CoxeterViewerBackendId := "gapKbmagExportBackend";;
CoxeterViewerBackendVersion := "1.0.0";;

CoxeterViewerHasArg := function(name)
  return Position(ARGV, name) <> fail;
end;;

CoxeterViewerArgValue := function(name)
  local position;
  position := Position(ARGV, name);
  if position = fail or position = Length(ARGV) then
    return fail;
  fi;
  return ARGV[position + 1];
end;;

CoxeterViewerPrintHelp := function()
  Print("Usage: python scripts/gap_kbmag_export_backend.py --input input.json --radius R --output ball.json\n");
  Print("GAP-internal usage: gap -q scripts/gap_kbmag_export_backend.g --data input.g --raw-output raw.txt\n");
  Print("Inspection: --help, --contract, --check-runtime\n");
  Print("Contract: scripts/exact_export_contract.json\n");
end;;

CoxeterViewerJsonStatus := function(ok, code, message)
  Print("{\"ok\":", ok, ",\"code\":\"", code, "\",\"backend\":\"",
    CoxeterViewerBackendId,
    "\",\"backendVersion\":\"", CoxeterViewerBackendVersion,
    "\",\"requiredRuntime\":\"GAP with KBMAG\",\"message\":\"", message, "\"}\n");
end;;

CoxeterViewerPackageVersion := function(name)
  local info;
  info := PackageInfo(name);
  if info = fail or Length(info) = 0 then
    return "unknown";
  fi;
  if IsBound(info[1].Version) then
    return info[1].Version;
  fi;
  return "unknown";
end;;

CoxeterViewerJoinIntegers := function(values)
  local index, text;
  if Length(values) = 0 then
    return "";
  fi;
  text := String(values[1]);
  for index in [2..Length(values)] do
    text := Concatenation(text, ",", String(values[index]));
  od;
  return text;
end;;

CoxeterViewerBoolText := function(value)
  if value then
    return "true";
  fi;
  return "false";
end;;

CoxeterViewerFindEdge := function(edges, sourceKey, targetKey, generator)
  local edge;
  for edge in edges do
    if edge.generator = generator and
      ((edge.sourceKey = sourceKey and edge.targetKey = targetKey) or
       (edge.sourceKey = targetKey and edge.targetKey = sourceKey)) then
      return edge;
    fi;
  od;
  return fail;
end;;

CoxeterViewerGenerate := function(input)
  local rank, matrix, radius, maxNodes, maxEdges, freeGroup, freeGenerators,
    relators, i, j, m, fpGroup, fpGenerators, permutationMap,
    permutationGroup, permutationGenerators, identity, nodes, keys, edges,
    cursor, node, generatorIndex, target, targetKey, targetPosition, word,
    nodeCapHit, edgeCapHit, groupOrder;

  rank := input.rank;
  matrix := input.coxeterMatrix;
  radius := input.radius;
  maxNodes := input.maxNodes;
  maxEdges := input.maxEdges;

  freeGroup := FreeGroup(rank, "s");
  freeGenerators := GeneratorsOfGroup(freeGroup);
  relators := [];

  for i in [1..rank] do
    Add(relators, freeGenerators[i]^2);
  od;

  if rank > 1 then
    for i in [1..(rank - 1)] do
      for j in [(i + 1)..rank] do
        m := matrix[i][j];
        if m <> 0 then
          Add(relators, (freeGenerators[i] * freeGenerators[j])^m);
        fi;
      od;
    od;
  fi;

  fpGroup := freeGroup / relators;
  fpGenerators := GeneratorsOfGroup(fpGroup);

  permutationMap := IsomorphismPermGroup(fpGroup);
  if permutationMap = fail then
    return rec(ok := false, code := "gap-no-finite-permutation-image");
  fi;

  permutationGroup := Image(permutationMap);
  groupOrder := Size(permutationGroup);
  permutationGenerators := List(fpGenerators, generator -> Image(permutationMap, generator));
  identity := One(permutationGroup);

  nodes := [rec(
    key := String(identity),
    word := [],
    length := 0,
    element := identity
  )];
  keys := [String(identity)];
  edges := [];
  nodeCapHit := false;
  edgeCapHit := false;
  cursor := 1;

  while cursor <= Length(nodes) do
    node := nodes[cursor];

    for generatorIndex in [1..rank] do
      target := node.element * permutationGenerators[generatorIndex];
      targetKey := String(target);
      targetPosition := Position(keys, targetKey);

      if targetPosition = fail then
        if node.length >= radius then
          continue;
        fi;

        if Length(nodes) >= maxNodes then
          nodeCapHit := true;
          continue;
        fi;

        word := ShallowCopy(node.word);
        Add(word, generatorIndex - 1);
        Add(keys, targetKey);
        Add(nodes, rec(
          key := targetKey,
          word := word,
          length := node.length + 1,
          element := target
        ));
        targetPosition := Length(nodes);
      fi;

      if CoxeterViewerFindEdge(edges, node.key, targetKey, generatorIndex - 1) = fail then
        if Length(edges) >= maxEdges then
          edgeCapHit := true;
          continue;
        fi;

        Add(edges, rec(
          sourceKey := node.key,
          targetKey := targetKey,
          generator := generatorIndex - 1
        ));
      fi;
    od;

    cursor := cursor + 1;
  od;

  return rec(
    ok := true,
    groupOrder := groupOrder,
    nodes := nodes,
    edges := edges,
    nodeCapHit := nodeCapHit,
    edgeCapHit := edgeCapHit
  );
end;;

CoxeterViewerWriteRaw := function(path, result)
  local node, edge;
  PrintTo(path, "STATUS|ok\n");
  AppendTo(path, "GAP_VERSION|", GAPInfo.Version, "\n");
  AppendTo(path, "KBMAG_VERSION|", CoxeterViewerPackageVersion("kbmag"), "\n");
  AppendTo(path, "GROUP_ORDER|", String(result.groupOrder), "\n");
  AppendTo(path, "NODE_CAP_HIT|", CoxeterViewerBoolText(result.nodeCapHit), "\n");
  AppendTo(path, "EDGE_CAP_HIT|", CoxeterViewerBoolText(result.edgeCapHit), "\n");

  for node in result.nodes do
    AppendTo(path, "NODE|", node.key, "|", String(node.length), "|",
      CoxeterViewerJoinIntegers(node.word), "\n");
  od;

  for edge in result.edges do
    AppendTo(path, "EDGE|", edge.sourceKey, "|", edge.targetKey, "|",
      String(edge.generator), "\n");
  od;
end;;

if CoxeterViewerHasArg("--help") then
  CoxeterViewerPrintHelp();
  QUIT_GAP(0);
fi;

if CoxeterViewerHasArg("--contract") then
  Print("{\"ok\":true,\"contract\":\"scripts/exact_export_contract.json\"}\n");
  QUIT_GAP(0);
fi;

if LoadPackage("kbmag") = fail then
  CoxeterViewerJsonStatus("false", "missing-kbmag", "GAP is running, but the KBMAG package is not available.");
  QUIT_GAP(2);
fi;

if CoxeterViewerHasArg("--check-runtime") then
  Print("{\"ok\":true,\"backend\":\"", CoxeterViewerBackendId,
    "\",\"backendVersion\":\"", CoxeterViewerBackendVersion,
    "\",\"requiredRuntime\":\"GAP with KBMAG\",\"gapVersion\":\"", GAPInfo.Version,
    "\",\"kbmagVersion\":\"", CoxeterViewerPackageVersion("kbmag"),
    "\",\"message\":\"GAP loaded KBMAG.\"}\n");
  QUIT_GAP(0);
fi;

CoxeterViewerDataPath := CoxeterViewerArgValue("--data");;
CoxeterViewerRawOutputPath := CoxeterViewerArgValue("--raw-output");;

if CoxeterViewerDataPath = fail or CoxeterViewerRawOutputPath = fail then
  CoxeterViewerJsonStatus("false", "invalid-gap-arguments", "GAP exporter requires --data and --raw-output when called directly.");
  QUIT_GAP(4);
fi;

Read(CoxeterViewerDataPath);

if not IsBound(COXETER_VIEWER_INPUT) then
  CoxeterViewerJsonStatus("false", "invalid-gap-input", "The temporary GAP data file did not define COXETER_VIEWER_INPUT.");
  QUIT_GAP(4);
fi;

CoxeterViewerResult := CoxeterViewerGenerate(COXETER_VIEWER_INPUT);;
if not CoxeterViewerResult.ok then
  CoxeterViewerJsonStatus("false", CoxeterViewerResult.code, "GAP could not construct a finite permutation image for this Coxeter presentation.");
  QUIT_GAP(3);
fi;

CoxeterViewerWriteRaw(CoxeterViewerRawOutputPath, CoxeterViewerResult);
Print("{\"ok\":true,\"backend\":\"", CoxeterViewerBackendId,
  "\",\"backendVersion\":\"", CoxeterViewerBackendVersion,
  "\",\"deduplication\":\"external-gap-kbmag\"}\n");
QUIT_GAP(0);
