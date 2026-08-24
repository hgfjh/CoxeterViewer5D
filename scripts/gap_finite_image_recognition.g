# Exact structural recognition and admissible-index screening for finite images.
#
# A generated GAP driver must bind COXETER_INPUT and COXETER_OUTPUT before it
# reads this file.  The input action is revalidated from its ordered permutation
# rows.  Only a mathematically complete branch may exclude target indices.  In
# particular, generic recognition is descriptive: it never substitutes for a
# complete subgroup-index argument.

CoxeterFiniteImageRecognizerId := "gap-finite-image-recognition";;
CoxeterFiniteImageRecognizerVersion := "1.7.0";;

CV_STAGE := "startup";;
CV_FAILURE_CODE := "gap-exception";;
CV_FAILURE_MESSAGE := "GAP raised an exception while recognizing the finite image.";;

CVWriteMinimalJsonFailure := function(path, code, message)
  local escaped;
  # This fallback is used only when the JSON package itself is unavailable.
  # Keep its alphabet deliberately small so manual escaping remains reliable.
  escaped := ReplacedString(message, "\\", "\\\\");
  escaped := ReplacedString(escaped, "\"", "\\\"");
  escaped := ReplacedString(escaped, "\n", " ");
  PrintTo(path,
    "{\"error\":{\"code\":\"", code,
    "\",\"message\":\"", escaped,
    "\",\"stage\":\"startup\"},\"ok\":false,",
    "\"recognizer\":{\"id\":\"", CoxeterFiniteImageRecognizerId,
    "\",\"version\":\"", CoxeterFiniteImageRecognizerVersion,
    "\"},\"schemaVersion\":1,\"status\":\"failed\"}\n");
end;;

if not IsBound(COXETER_OUTPUT) or not IsString(COXETER_OUTPUT) then
  Print("{\"error\":{\"code\":\"missing-output\",",
    "\"message\":\"The generated driver must define COXETER_OUTPUT.\"},",
    "\"ok\":false,\"schemaVersion\":1,\"status\":\"failed\"}\n");
  QUIT_GAP(1);
fi;

CV_JSON_AVAILABLE := LoadPackage("json", false) = true;;

CVPackageVersion := function(name)
  local info;
  info := PackageInfo(name);
  if info = fail or Length(info) = 0 or not IsBound(info[1]!.Version) then
    return "unavailable";
  fi;
  return info[1]!.Version;
end;;

CVToolVersions := function()
  return rec(
    gap := GAPInfo.Version,
    packages := rec(
      atlasRep := CVPackageVersion("AtlasRep"),
      classicalMaximals := CVPackageVersion("ClassicalMaximals"),
      ferret := CVPackageVersion("ferret"),
      genss := CVPackageVersion("genss"),
      json := CVPackageVersion("json"),
      orb := CVPackageVersion("orb"),
      recog := CVPackageVersion("recog"),
      tomLib := CVPackageVersion("TomLib")
    )
  );
end;;

CVJsonEscapeString := function(value)
  local escaped;
  escaped := ReplacedString(value, "\\", "\\\\");
  escaped := ReplacedString(escaped, "\"", "\\\"");
  escaped := ReplacedString(escaped, "\n", "\\n");
  escaped := ReplacedString(escaped, "\r", "\\r");
  escaped := ReplacedString(escaped, "\t", "\\t");
  return escaped;
end;;

CVGapToJsonStream := function(stream, value)
  local first, item, name;
  # GAP regards the empty list as a string in some generic filters.  The
  # representation filter keeps JSON [] distinct from JSON "".
  if IsStringRep(value) then
    WriteAll(stream, "\"");
    WriteAll(stream, CVJsonEscapeString(value));
    WriteAll(stream, "\"");
  elif IsBool(value) then
    if value then
      WriteAll(stream, "true");
    else
      WriteAll(stream, "false");
    fi;
  elif IsInt(value) then
    WriteAll(stream, String(value));
  elif IsList(value) then
    WriteAll(stream, "[");
    first := true;
    for item in value do
      if first then
        first := false;
      else
        WriteAll(stream, ",");
      fi;
      CVGapToJsonStream(stream, item);
    od;
    WriteAll(stream, "]");
  elif IsRecord(value) then
    WriteAll(stream, "{");
    first := true;
    for name in Set(RecNames(value)) do
      if first then
        first := false;
      else
        WriteAll(stream, ",");
      fi;
      CVGapToJsonStream(stream, name);
      WriteAll(stream, ":");
      CVGapToJsonStream(stream, value.(name));
    od;
    WriteAll(stream, "}");
  else
    ErrorNoReturn("Recognition artifact contains a non-JSON GAP object.");
  fi;
end;;

CVWriteArtifact := function(path, artifact)
  local stream;
  stream := OutputTextFile(path, false);
  if stream = fail then
    Print("Could not open recognition artifact path: ", path, "\n");
    return false;
  fi;
  SetPrintFormattingStatus(stream, false);
  if CV_JSON_AVAILABLE then
    CallFuncList(ValueGlobal("GapToJsonStream"), [stream, artifact]);
  else
    # The research toolchain normally supplies the json package.  This small
    # serializer preserves deterministic artifacts when its compiled module is
    # absent; it accepts only the scalar/list/record types emitted here.
    CVGapToJsonStream(stream, artifact);
  fi;
  WriteLine(stream, "");
  CloseStream(stream);
  return true;
end;;

CVFail := function(code, message)
  CV_FAILURE_CODE := code;
  CV_FAILURE_MESSAGE := message;
  ErrorNoReturn(message);
end;;

CVRequire := function(condition, code, message)
  if not condition then
    CVFail(code, message);
  fi;
end;;

CVSafeInputText := function(input, component, fallback)
  if IsRecord(input) and IsBound(input.(component))
      and IsString(input.(component)) then
    return input.(component);
  fi;
  return fallback;
end;;

CVSafeInputInteger := function(input, component, fallback)
  if IsRecord(input) and IsBound(input.(component))
      and IsInt(input.(component)) then
    return input.(component);
  fi;
  return fallback;
end;;

CVIsLowerHexSha256 := function(value)
  return IsString(value) and Length(value) = 64
    and ForAll(value, character -> character in "0123456789abcdef");
end;;

CVBaseArtifact := function(input)
  local order, orderMode;
  order := CVSafeInputInteger(input, "expectedOrder", 1);
  if order < 1 then
    order := 1;
  fi;
  orderMode := "verify-known";
  if IsRecord(input) and IsBound(input.orderMode)
      and IsString(input.orderMode) then
    orderMode := input.orderMode;
  fi;
  return rec(
    actionHash := CVSafeInputText(input, "actionSha256",
      "0000000000000000000000000000000000000000000000000000000000000000"),
    action := rec(
      actionSha256 := CVSafeInputText(input, "actionSha256", "unavailable"),
      candidateId := CVSafeInputText(input, "candidateId", "unknown"),
      characteristic := CVSafeInputInteger(input, "characteristic", -1),
      degree := CVSafeInputInteger(input, "degree", -1),
      expectedOrder := CVSafeInputInteger(input, "expectedOrder", -1),
      orderMode := orderMode,
      toolchainManifestSha256 := CVSafeInputText(
        input, "toolchainManifestSha256", "unavailable")
    ),
    catalogue := rec(
      complete := false,
      finiteImageOrder := order,
      reason := "recognition-incomplete"
    ),
    manifestHash := CVSafeInputText(
      input, "toolchainManifestSha256",
      "0000000000000000000000000000000000000000000000000000000000000000"),
    ok := false,
    recognition := rec(
      complete := false,
      finiteImageOrder := order,
      reason := "recognition-incomplete"
    ),
    recognizer := rec(
      id := CoxeterFiniteImageRecognizerId,
      version := CoxeterFiniteImageRecognizerVersion
    ),
    schemaVersion := 1,
    screening := rec(
      complete := false,
      finiteImageOrder := order,
      possibleIndices := [],
      reason := "recognition-incomplete",
      targetDecisions := []
    ),
    status := "failed",
    tools := CVToolVersions()
  );
end;;

CVHasPermutationInput := function(input)
  return IsBound(input.generatorRows) or IsBound(input.degree);
end;;

CVHasMatrixInput := function(input)
  return IsBound(input.matrixGeneratorRows)
    or IsBound(input.matrixDimension)
    or IsBound(input.residueFieldOrder);
end;;

CVValidateInputShape := function(input)
  local rank, row, matrixRow, hasPermutation, hasMatrix, orderMode, i, j;
  CVRequire(IsRecord(input), "invalid-input", "COXETER_INPUT must be a GAP record.");
  for i in [
      "schemaVersion", "candidateId", "characteristic",
      "coxeterMatrix", "maxIndex", "lowerBound",
      "actionSha256", "toolchainManifestSha256"
    ] do
    CVRequire(IsBound(input.(i)), "missing-input-field",
      Concatenation("COXETER_INPUT is missing ", i, "."));
  od;
  CVRequire(input.schemaVersion = 1, "unsupported-schema-version",
    "Only finite-image recognition schemaVersion 1 is supported.");
  CVRequire(IsString(input.candidateId), "invalid-candidate-id",
    "candidateId must be a string.");
  CVRequire(IsInt(input.characteristic) and input.characteristic > 0,
    "invalid-characteristic", "characteristic must be a positive integer.");
  orderMode := "verify-known";
  if IsBound(input.orderMode) then
    CVRequire(IsString(input.orderMode)
        and input.orderMode in ["verify-known", "discover-recog"],
      "invalid-order-mode",
      "orderMode must be verify-known or discover-recog.");
    orderMode := input.orderMode;
  fi;
  if IsBound(input.expectedOrder) then
    CVRequire(IsInt(input.expectedOrder) and input.expectedOrder > 0,
      "invalid-expected-order", "expectedOrder must be a positive integer.");
  else
    CVRequire(orderMode = "discover-recog",
      "missing-expected-order",
      "Omitting expectedOrder requires orderMode=discover-recog.");
  fi;
  if IsBound(input.orderDiscoveryOnly) then
    CVRequire(IsBool(input.orderDiscoveryOnly),
      "invalid-order-discovery-only",
      "orderDiscoveryOnly must be a boolean when supplied.");
  fi;
  CVRequire(IsInt(input.maxIndex) and input.maxIndex > 0,
    "invalid-max-index", "maxIndex must be a positive integer.");
  CVRequire(IsInt(input.lowerBound) and input.lowerBound > 0,
    "invalid-lower-bound", "lowerBound must be a positive integer.");
  CVRequire(input.lowerBound <= input.maxIndex,
    "empty-target-range", "lowerBound must not exceed maxIndex.");
  CVRequire(CVIsLowerHexSha256(input.actionSha256),
    "invalid-action-hash",
    "actionSha256 must be a lowercase SHA-256 hex string.");
  CVRequire(CVIsLowerHexSha256(input.toolchainManifestSha256),
    "invalid-toolchain-hash",
    "toolchainManifestSha256 must be a lowercase SHA-256 hex string.");
  CVRequire(IsList(input.coxeterMatrix) and Length(input.coxeterMatrix) > 0,
    "invalid-coxeter-matrix", "coxeterMatrix must be a nonempty square matrix.");
  rank := Length(input.coxeterMatrix);
  hasPermutation := CVHasPermutationInput(input);
  hasMatrix := CVHasMatrixInput(input);
  CVRequire(hasPermutation or hasMatrix, "missing-representation",
    "Supply an ordered permutation action, an ordered matrix image, or both.");
  if orderMode = "discover-recog" then
    CVRequire(not hasPermutation and hasMatrix,
      "order-discovery-requires-matrix-only",
      "orderMode=discover-recog accepts exact matrix-only payloads.");
  fi;

  if hasPermutation then
    CVRequire(IsBound(input.generatorRows) and IsBound(input.degree),
      "incomplete-permutation-input",
      "generatorRows and degree must be supplied together.");
    CVRequire(IsInt(input.degree) and input.degree > 0,
      "invalid-degree", "degree must be a positive integer.");
    CVRequire(IsList(input.generatorRows)
        and Length(input.generatorRows) = rank,
      "invalid-generator-rows",
      "generatorRows must have one row per ordered Coxeter generator.");
  else
    CVRequire(input.characteristic >= 3 and IsPrimeInt(input.characteristic),
      "matrix-only-characteristic-unsupported",
      "Matrix-only recognition is restricted to odd prime characteristic.");
  fi;

  for i in [1..rank] do
    if hasPermutation then
      row := input.generatorRows[i];
      CVRequire(IsList(row) and Length(row) = input.degree,
        "invalid-permutation-row",
        Concatenation("Generator row ", String(i - 1),
          " must have exactly degree entries."));
      CVRequire(ForAll(row, IsInt) and Set(row) = [1..input.degree],
        "invalid-permutation-row",
        Concatenation("Generator row ", String(i - 1),
          " is not a permutation of 1..degree."));
    fi;

    matrixRow := input.coxeterMatrix[i];
    CVRequire(IsList(matrixRow) and Length(matrixRow) = rank,
      "invalid-coxeter-matrix", "coxeterMatrix must be square.");
    for j in [1..rank] do
      CVRequire(IsInt(matrixRow[j]) and matrixRow[j] >= 0,
        "invalid-coxeter-entry",
        "Coxeter entries must be nonnegative integers; 0 denotes infinity.");
      CVRequire(matrixRow[j] = input.coxeterMatrix[j][i],
        "asymmetric-coxeter-matrix", "coxeterMatrix must be symmetric.");
      if i = j then
        CVRequire(matrixRow[j] = 1, "invalid-coxeter-diagonal",
          "Every diagonal Coxeter entry must equal 1.");
      elif matrixRow[j] <> 0 then
        CVRequire(matrixRow[j] >= 2, "invalid-coxeter-entry",
          "Finite off-diagonal Coxeter entries must be at least 2.");
      fi;
    od;
  od;
  return true;
end;;

CVReconstructAndCheckAction := function(input)
  local generators, group, identity, generatorChecks, relationChecks,
    orbits, orbitSizes, i, j, m, element;

  if not CVHasPermutationInput(input) then
    return rec(
      public := rec(
        available := false,
        reason := "No permutation action was supplied.",
        status := "not-supplied"
      )
    );
  fi;

  CV_STAGE := "action-validation";
  generators := List(input.generatorRows, PermList);
  CVRequire(ForAll(generators, generator -> generator <> fail),
    "permutation-reconstruction-failed",
    "At least one ordered generator row could not be reconstructed.");
  group := Group(generators);
  identity := One(group);

  generatorChecks := [];
  for i in [1..Length(generators)] do
    CVRequire(ListPerm(generators[i], input.degree) = input.generatorRows[i],
      "ordered-generator-roundtrip-failed",
      Concatenation("Ordered generator ", String(i - 1),
        " did not round-trip through PermList/ListPerm."));
    CVRequire(generators[i]^2 = identity, "generator-not-involution",
      Concatenation("Ordered generator ", String(i - 1),
        " is not an involution."));
    Add(generatorChecks, rec(
      inputIndex := i - 1,
      involution := true,
      order := Order(generators[i]),
      rowRoundTrip := true
    ));
  od;

  relationChecks := [];
  if Length(generators) > 1 then
    for i in [1..Length(generators) - 1] do
      for j in [i + 1..Length(generators)] do
        m := input.coxeterMatrix[i][j];
        if m <> 0 then
          element := (generators[i] * generators[j])^m;
          CVRequire(element = identity, "coxeter-relation-failed",
            Concatenation("The finite Coxeter relation for generators ",
              String(i - 1), " and ", String(j - 1), " failed."));
          Add(relationChecks, rec(
            generatorA := i - 1,
            generatorB := j - 1,
            m := m,
            passed := true
          ));
        fi;
      od;
    od;
  fi;

  CVRequire(Size(group) = input.expectedOrder, "group-order-mismatch",
    Concatenation("Expected image order ", String(input.expectedOrder),
      " but reconstructed order is ", String(Size(group)), "."));
  orbits := Orbits(group, [1..input.degree], OnPoints);
  orbitSizes := SortedList(List(orbits, Length));

  return rec(
    generators := generators,
    group := group,
    orbits := orbits,
    public := rec(
      finiteRelationCheckCount := Length(relationChecks),
      finiteRelations := relationChecks,
      generatorChecks := generatorChecks,
      groupOrder := Size(group),
      orbitSizes := orbitSizes,
      orderedGeneratorCount := Length(generators),
      orderedGeneratorsPreserved := true
    )
  );
end;;

CVTargetIndices := function(lowerBound, maxIndex)
  local targets, multiplier;
  targets := [];
  multiplier := 1;
  while multiplier * lowerBound <= maxIndex do
    Add(targets, multiplier * lowerBound);
    multiplier := multiplier + 1;
  od;
  return targets;
end;;

CVMatrixOverPrimeField := function(matrixRows, dimension, field, fieldOrder)
  return List(matrixRows, row -> List(
    row, entry -> (entry mod fieldOrder) * One(field)));
end;;

CVReconstructAndCheckMatrixImage := function(input, pointAction)
  local rank, dimension, fieldOrder, field, matrices, matrix, row, i, j, m,
    identity, group, generatorChecks, relationChecks, public;

  if not CVHasMatrixInput(input) then
    return rec(
      available := false,
      status := "not-supplied"
    );
  fi;

  CV_STAGE := "matrix-input-validation";
  CVRequire(IsBound(input.matrixGeneratorRows)
      and IsBound(input.matrixDimension)
      and IsBound(input.residueFieldOrder),
    "incomplete-matrix-input",
    Concatenation("matrixGeneratorRows, matrixDimension, and ",
      "residueFieldOrder must be supplied together."));
  CVRequire(IsInt(input.matrixDimension) and input.matrixDimension > 0,
    "invalid-matrix-dimension", "matrixDimension must be a positive integer.");
  CVRequire(IsInt(input.residueFieldOrder)
      and IsPrimeInt(input.residueFieldOrder),
    "unsupported-residue-field",
    "The initial matrix recognizer supports prime residue fields only.");
  CVRequire(input.residueFieldOrder = input.characteristic,
    "residue-characteristic-mismatch",
    "residueFieldOrder must equal characteristic for a prime field.");
  CVRequire(IsList(input.matrixGeneratorRows)
      and Length(input.matrixGeneratorRows) = Length(input.coxeterMatrix),
    "invalid-matrix-generator-count",
    "matrixGeneratorRows must preserve the ordered Coxeter generator count.");

  rank := Length(input.matrixGeneratorRows);
  dimension := input.matrixDimension;
  fieldOrder := input.residueFieldOrder;
  field := GF(fieldOrder);
  matrices := [];
  for i in [1..rank] do
    matrix := input.matrixGeneratorRows[i];
    CVRequire(IsList(matrix) and Length(matrix) = dimension,
      "invalid-matrix-generator",
      Concatenation("Matrix generator ", String(i - 1),
        " must have matrixDimension rows."));
    for row in matrix do
      CVRequire(IsList(row) and Length(row) = dimension and ForAll(row, IsInt),
        "invalid-matrix-generator",
        Concatenation("Matrix generator ", String(i - 1),
          " must be a square integer matrix."));
    od;
    matrix := CVMatrixOverPrimeField(matrix, dimension, field, fieldOrder);
    CVRequire(DeterminantMat(matrix) <> Zero(field),
      "singular-matrix-generator",
      Concatenation("Matrix generator ", String(i - 1), " is singular."));
    Add(matrices, matrix);
  od;

  CV_STAGE := "matrix-action-validation";
  group := Group(matrices);
  identity := One(group);
  generatorChecks := [];
  for i in [1..rank] do
    CVRequire(matrices[i]^2 = identity, "matrix-generator-not-involution",
      Concatenation("Matrix generator ", String(i - 1),
        " is not an involution."));
    Add(generatorChecks, rec(
      inputIndex := i - 1,
      involution := true,
      nonsingular := true,
      order := Order(matrices[i])
    ));
  od;

  relationChecks := [];
  if rank > 1 then
    for i in [1..rank - 1] do
      for j in [i + 1..rank] do
        m := input.coxeterMatrix[i][j];
        if m <> 0 then
          CVRequire((matrices[i] * matrices[j])^m = identity,
            "matrix-coxeter-relation-failed",
            Concatenation("The matrix Coxeter relation for generators ",
              String(i - 1), " and ", String(j - 1), " failed."));
          Add(relationChecks, rec(
            generatorA := i - 1,
            generatorB := j - 1,
            m := m,
            passed := true
          ));
        fi;
      od;
    od;
  fi;

  public := rec(
    available := true,
    crossRepresentationMapConstructed := false,
    finiteRelationCheckCount := Length(relationChecks),
    finiteRelations := relationChecks,
    generatorChecks := generatorChecks,
    matrixDimension := dimension,
    matrixGroupOrderKnown := false,
    orderedGeneratorCount := rank,
    pointActionAvailable := IsBound(pointAction.group),
    primeField := true,
    residueFieldOrder := fieldOrder,
    status := "passed"
  );
  if IsBound(pointAction.group) then
    public.pointActionOrder := Size(pointAction.group);
  fi;

  return rec(
    group := group,
    matrices := matrices,
    public := public
  );
end;;

CVRecognitionNodeContainsGenerators := function(node, matrices)
  return ForAll(matrices, matrix -> matrix in node);
end;;

CVVerifiedRecogOrder := function(group, generators, context)
  local loaded, caught, node, ready, verifiedCaught, sizeCaught,
    membershipCaught;
  loaded := LoadPackage("recog", false);
  if loaded <> true then
    return rec(
      complete := false,
      reason := Concatenation("recog is unavailable while recognizing ",
        context, ".")
    );
  fi;
  caught := CALL_WITH_CATCH(RecogniseMatrixGroup, [group]);
  if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
    return rec(
      complete := false,
      reason := Concatenation("RecogniseMatrixGroup did not return a tree for ",
        context, ".")
    );
  fi;
  node := caught[2];
  ready := IsReady(node);
  if not ready then
    return rec(
      complete := false,
      reason := Concatenation("The recog tree is not ready for ", context, ".")
    );
  fi;
  verifiedCaught := CALL_WITH_CATCH(IsCorrect, [node]);
  if verifiedCaught[1] <> true or Length(verifiedCaught) < 2
      or verifiedCaught[2] <> true then
    return rec(
      complete := false,
      reason := Concatenation("The recog tree failed IsCorrect for ",
        context, ".")
    );
  fi;
  sizeCaught := CALL_WITH_CATCH(Size, [node]);
  if sizeCaught[1] <> true or Length(sizeCaught) < 2
      or not IsInt(sizeCaught[2]) or sizeCaught[2] <= 0 then
    return rec(
      complete := false,
      reason := Concatenation("The verified recog tree has no order for ",
        context, ".")
    );
  fi;
  membershipCaught := CALL_WITH_CATCH(
    CVRecognitionNodeContainsGenerators, [node, generators]);
  if membershipCaught[1] <> true or Length(membershipCaught) < 2
      or membershipCaught[2] <> true then
    return rec(
      complete := false,
      reason := Concatenation("Constructive membership failed for ",
        context, ".")
    );
  fi;
  return rec(
    complete := true,
    node := node,
    order := sizeCaught[2],
    public := rec(
      context := context,
      generatorMembershipVerified := true,
      order := sizeCaught[2],
      orderSource := "Size of a recog IsCorrect-verified recognition tree",
      packageVersion := CVPackageVersion("recog"),
      recognitionTreeVerified := true,
      status := "passed"
    )
  );
end;;

CVResolveMatrixImageOrder := function(input, matrixImage, pointAction)
  local mode, loaded, caught, node, ready, verifiedCaught, verified,
    sizeCaught, finiteImageOrder, membershipCaught, membershipVerified,
    public, verificationFailureKind, verificationReason;

  mode := "verify-known";
  if IsBound(input.orderMode) then
    mode := input.orderMode;
  fi;

  if mode = "verify-known" then
    CV_STAGE := "matrix-known-order-verification";
    sizeCaught := CALL_WITH_CATCH(Size, [matrixImage.group]);
    CVRequire(sizeCaught[1] = true and Length(sizeCaught) >= 2
        and IsInt(sizeCaught[2]) and sizeCaught[2] > 0,
      "matrix-group-order-computation-failed",
      "GAP could not compute the exact matrix image order.");
    finiteImageOrder := sizeCaught[2];
    CVRequire(finiteImageOrder = input.expectedOrder,
      "matrix-group-order-mismatch",
      Concatenation("Expected matrix image order ",
        String(input.expectedOrder), " but reconstructed order is ",
        String(finiteImageOrder), "."));
    if IsBound(pointAction.group) then
      CVRequire(finiteImageOrder = Size(pointAction.group),
        "matrix-point-action-order-mismatch",
        "The exact matrix image and supplied point action have different orders.");
    fi;
    public := rec(
      attempted := true,
      expectedOrderMatched := true,
      finiteImageOrder := finiteImageOrder,
      mode := mode,
      orderSource := "exact GAP Size(matrix group)",
      recognitionNodeReady := false,
      recognitionTreeReturned := false,
      recognitionTreeVerified := false,
      status := "passed"
    );
    return rec(
      finiteImageOrder := finiteImageOrder,
      public := public
    );
  fi;

  CV_STAGE := "matrix-order-discovery-recognition";
  loaded := LoadPackage("recog", false);
  if loaded <> true then
    return rec(
      public := rec(
        attempted := false,
        mode := mode,
        reason := "The recog package is unavailable.",
        recognitionNodeReady := false,
        recognitionTreeReturned := false,
        recognitionTreeVerified := false,
        status := "unknown"
      )
    );
  fi;
  caught := CALL_WITH_CATCH(RecogniseMatrixGroup, [matrixImage.group]);
  if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
    return rec(
      public := rec(
        attempted := true,
        mode := mode,
        packageVersion := CVPackageVersion("recog"),
        reason := (function()
          if caught[1] = true then return "RecogniseMatrixGroup returned fail."; fi;
          return "RecogniseMatrixGroup raised an error.";
        end)(),
        recognitionNodeReady := false,
        recognitionTreeReturned := caught[1] = true and Length(caught) >= 2,
        recognitionTreeVerified := false,
        status := "unknown"
      )
    );
  fi;
  node := caught[2];
  ready := IsReady(node);
  if not ready then
    return rec(
      public := rec(
        attempted := true,
        mode := mode,
        packageVersion := CVPackageVersion("recog"),
        reason := "The recognition tree was returned but is not ready.",
        recognitionNodeReady := false,
        recognitionTreeReturned := true,
        recognitionTreeVerified := false,
        status := "unknown"
      )
    );
  fi;

  # IsReady alone is probabilistic recognition information.  IsCorrect runs
  # recog's presentation-based verification phase and is the promotion gate
  # for an order discovered from Size(node).
  CV_STAGE := "matrix-order-discovery-verification";
  verifiedCaught := CALL_WITH_CATCH(IsCorrect, [node]);
  verified := verifiedCaught[1] = true and Length(verifiedCaught) >= 2
    and verifiedCaught[2] = true;
  if not verified then
    if verifiedCaught[1] <> true then
      verificationFailureKind := "raised-error";
      verificationReason :=
        "recog IsCorrect raised an error during presentation verification.";
    elif Length(verifiedCaught) < 2 then
      verificationFailureKind := "missing-result";
      verificationReason := "recog IsCorrect returned no verification result.";
    elif verifiedCaught[2] = false then
      verificationFailureKind := "returned-false";
      verificationReason :=
        "recog IsCorrect returned false during presentation verification.";
    else
      verificationFailureKind := "unexpected-result";
      verificationReason :=
        "recog IsCorrect returned an unexpected verification result.";
    fi;
    return rec(
      public := rec(
        attempted := true,
        mode := mode,
        packageVersion := CVPackageVersion("recog"),
        reason := verificationReason,
        recognitionNodeReady := true,
        recognitionTreeReturned := true,
        recognitionTreeVerified := false,
        verificationCallCompleted := verifiedCaught[1] = true,
        verificationFailureKind := verificationFailureKind,
        verificationResultPresent := Length(verifiedCaught) >= 2,
        verificationStage := "presentation-based-IsCorrect",
        status := "unknown"
      )
    );
  fi;

  CV_STAGE := "matrix-order-discovery-size";
  sizeCaught := CALL_WITH_CATCH(Size, [node]);
  if sizeCaught[1] <> true or Length(sizeCaught) < 2
      or not IsInt(sizeCaught[2]) or sizeCaught[2] <= 0 then
    return rec(
      public := rec(
        attempted := true,
        mode := mode,
        packageVersion := CVPackageVersion("recog"),
        reason := "The verified recognition tree did not yield a positive order.",
        recognitionNodeReady := true,
        recognitionTreeReturned := true,
        recognitionTreeVerified := true,
        status := "unknown"
      )
    );
  fi;
  finiteImageOrder := sizeCaught[2];
  membershipCaught := CALL_WITH_CATCH(
    CVRecognitionNodeContainsGenerators, [node, matrixImage.matrices]);
  membershipVerified := membershipCaught[1] = true
    and Length(membershipCaught) >= 2 and membershipCaught[2] = true;
  if not membershipVerified then
    return rec(
      public := rec(
        attempted := true,
        finiteImageOrderCandidate := finiteImageOrder,
        mode := mode,
        packageVersion := CVPackageVersion("recog"),
        reason := Concatenation(
          "The recognition tree was verified, but constructive membership ",
          "did not recover every ordered input generator."),
        recognitionNodeReady := true,
        recognitionTreeReturned := true,
        recognitionTreeVerified := true,
        status := "unknown"
      )
    );
  fi;

  public := rec(
    attempted := true,
    finiteImageOrder := finiteImageOrder,
    inputGeneratorMembershipVerified := true,
    inputRelationsVerifiedSeparately := true,
    mode := mode,
    orderSource := "Size of a recog IsCorrect-verified recognition tree",
    packageVersion := CVPackageVersion("recog"),
    recognitionNodeReady := true,
    recognitionTreeReturned := true,
    recognitionTreeVerified := true,
    status := "passed",
    verificationCallCompleted := true,
    verificationFailureKind := "none",
    verificationResultPresent := true,
    verificationStage := "presentation-based-IsCorrect",
    verificationBoundary := Concatenation(
      "IsCorrect verifies the recognition tree. Exact matrix involution and ",
      "Coxeter relation checks are performed independently before recognition.")
  );
  return rec(
    finiteImageOrder := finiteImageOrder,
    node := node,
    public := public
  );
end;;

CVInvariantFormDiagnosticsUnsafe := function(matrixGroup, field)
  local invariant, form, matrix, respects, formType, wittIndex;
  invariant := InvariantBilinearForm(matrixGroup);
  if invariant = fail or not IsRecord(invariant)
      or not IsBound(invariant.matrix) then
    return rec(
      available := false,
      reason := "InvariantBilinearForm returned no form."
    );
  fi;
  matrix := invariant.matrix;
  respects := ForAll(GeneratorsOfGroup(matrixGroup),
    generator -> generator * matrix * TransposedMat(generator) = matrix);
  form := BilinearFormByMatrix(matrix, field);
  formType := TypeOfForm(form);
  wittIndex := WittIndex(form);
  return rec(
    available := true,
    determinantNonzero := DeterminantMat(matrix) <> Zero(field),
    formTypeCode := String(formType),
    isOrthogonal := IsOrthogonalForm(form),
    matrixRank := RankMat(matrix),
    preservesFormExactly := respects,
    wittIndex := wittIndex
  );
end;;

CVInvariantFormDiagnostics := function(matrixGroup, fieldOrder)
  local loaded, method, caught;
  loaded := LoadPackage("Forms", false);
  if loaded <> true then
    return rec(
      available := false,
      reason := "The Forms package is unavailable."
    );
  fi;
  method := ApplicableMethod(InvariantBilinearForm, [matrixGroup]);
  if method = fail then
    return rec(
      available := false,
      reason := "No invariant-bilinear-form method applies to this matrix group."
    );
  fi;
  caught := CALL_WITH_CATCH(
    CVInvariantFormDiagnosticsUnsafe, [matrixGroup, GF(fieldOrder)]);
  if caught[1] <> true then
    return rec(
      available := false,
      reason := "Invariant-form computation raised an error."
    );
  fi;
  return caught[2];
end;;

CVTransferredFormDiagnosticsUnsafe := function(input, matrixGroup)
  local field, dimension, rows, formMatrix, preserves, form, formType,
    wittIndex;
  field := GF(input.residueFieldOrder);
  dimension := input.matrixDimension;
  CVRequire(IsList(input.invariantFormRows)
      and Length(input.invariantFormRows) = dimension
      and ForAll(input.invariantFormRows,
        row -> IsList(row) and Length(row) = dimension and ForAll(row, IsInt)),
    "invalid-invariant-form",
    "invariantFormRows must be a square integer matrix matching matrixDimension.");
  rows := List(input.invariantFormRows,
    row -> List(row, entry -> (entry mod input.residueFieldOrder) * One(field)));
  formMatrix := ImmutableMatrix(field, rows);
  CVRequire(formMatrix = TransposedMat(formMatrix),
    "nonsymmetric-invariant-form", "The transferred Tits form is not symmetric.");
  CVRequire(DeterminantMat(formMatrix) <> Zero(field),
    "singular-invariant-form", "The transferred Tits form is singular.");
  preserves := ForAll(GeneratorsOfGroup(matrixGroup),
    generator -> TransposedMat(generator) * formMatrix * generator = formMatrix);
  CVRequire(preserves, "invariant-form-not-preserved",
    "A matrix generator does not preserve the transferred Tits form.");
  form := BilinearFormByMatrix(formMatrix, field);
  formType := TypeOfForm(form);
  wittIndex := WittIndex(form);
  return rec(
    available := true,
    determinant := Int(DeterminantMat(formMatrix)),
    determinantNonzero := true,
    formSource := "exact reduced integral Tits form",
    formTypeCode := String(formType),
    isOrthogonal := IsOrthogonalForm(form),
    matrixRank := RankMat(formMatrix),
    preservesFormExactly := true,
    wittIndex := wittIndex
  );
end;;

CVTransferredFormDiagnostics := function(input, matrixGroup)
  local loaded, caught;
  if not IsBound(input.invariantFormRows) then
    return CVInvariantFormDiagnostics(matrixGroup, input.residueFieldOrder);
  fi;
  loaded := LoadPackage("Forms", false);
  if loaded <> true then
    return rec(
      available := false,
      reason := "The Forms package is unavailable."
    );
  fi;
  caught := CALL_WITH_CATCH(
    CVTransferredFormDiagnosticsUnsafe, [input, matrixGroup]);
  if caught[1] <> true then
    return rec(
      available := false,
      reason := "Transferred invariant-form diagnostics raised an error."
    );
  fi;
  return caught[2];
end;;

CVOddPrimeOrthogonalMatrixDiagnostics := function(input, matrixImage)
  local loaded, caught, node, ready, recognitionReturned, recognitionReason,
    derived, derivedRecognition, derivedOrder, derivedIndex, derivedPerfect,
    formDiagnostics,
    classicalLoaded, orthogonalSign, orthogonalType, omegaName,
    standardOmega, expectedOmegaOrder, omegaIdentified, maxCaught,
    maximalSubgroups, maximalIndices, minimumOmegaDegree, targets,
    detailedDecisions, survivingTargets, completeForTargets,
    normalizedDecisions, noCompatibleModule;

  CV_STAGE := "odd-prime-matrix-recognition";
  CVRequire(input.characteristic >= 3 and IsPrimeInt(input.characteristic),
    "odd-prime-recognition-requires-prime",
    "The matrix-only orthogonal branch requires odd prime characteristic.");

  # Recog is useful corroboration, but no exclusion below depends on a name
  # returned by its recognition tree. Reuse a verified order-discovery node
  # when one was already built so matrix-only discovery never runs twice.
  loaded := LoadPackage("recog", false);
  ready := false;
  recognitionReturned := false;
  recognitionReason := "The recog package is unavailable.";
  if IsBound(matrixImage.orderRecognition)
      and IsBound(matrixImage.orderRecognition.node) then
    node := matrixImage.orderRecognition.node;
    ready := IsReady(node);
    recognitionReturned := true;
    recognitionReason := "Reused the verified matrix order-discovery tree.";
  elif loaded = true then
    caught := CALL_WITH_CATCH(RecogniseMatrixGroup, [matrixImage.group]);
    if caught[1] = true and Length(caught) >= 2 and caught[2] <> fail then
      node := caught[2];
      ready := IsReady(node);
      recognitionReturned := true;
      recognitionReason := "RecogniseMatrixGroup returned a recognition tree.";
    elif caught[1] = true then
      recognitionReason := "RecogniseMatrixGroup returned fail.";
    else
      recognitionReason := "RecogniseMatrixGroup raised an error.";
    fi;
  fi;

  CV_STAGE := "odd-prime-derived-subgroup";
  derived := DerivedSubgroup(matrixImage.group);
  derivedRecognition := CVVerifiedRecogOrder(derived,
    GeneratorsOfGroup(derived), "the derived matrix subgroup");
  if not derivedRecognition.complete then
    return rec(
      attempted := true,
      classicalMaximals := rec(
        attempted := false,
        reason := derivedRecognition.reason,
        status := "not-run"
      ),
      derivedSubgroup := rec(
        identifiedAs := "unknown",
        recognition := rec(
          reason := derivedRecognition.reason,
          status := "unknown"
        )
      ),
      noCompatibleModule := rec(
        complete := false,
        decision := "unknown",
        reason := "The derived matrix subgroup has no verified exact order."
      ),
      screeningReason := derivedRecognition.reason,
      screeningStatus := "unknown"
    );
  fi;
  derivedOrder := derivedRecognition.order;
  CVRequire(matrixImage.finiteImageOrder mod derivedOrder = 0,
    "odd-prime-derived-order-does-not-divide-image",
    "The verified derived order does not divide the verified image order.");
  derivedIndex := matrixImage.finiteImageOrder / derivedOrder;
  derivedPerfect := false;
  formDiagnostics := CVTransferredFormDiagnostics(input, matrixImage.group);
  classicalLoaded := LoadPackage("ClassicalMaximals", false) = true;

  orthogonalSign := 0;
  orthogonalType := "unknown";
  omegaName := "unidentified orthogonal derived subgroup";
  if input.matrixDimension = 10
      and IsBound(formDiagnostics.available)
      and formDiagnostics.available = true
      and formDiagnostics.isOrthogonal = true
      and formDiagnostics.matrixRank = 10
      and formDiagnostics.preservesFormExactly = true then
    if formDiagnostics.wittIndex = 5 then
      orthogonalSign := 1;
      orthogonalType := "O+";
      omegaName := Concatenation(
        "Omega+(10,", String(input.residueFieldOrder), ")");
    elif formDiagnostics.wittIndex = 4 then
      orthogonalSign := -1;
      orthogonalType := "O-";
      omegaName := Concatenation(
        "Omega-(10,", String(input.residueFieldOrder), ")");
    fi;
  fi;

  omegaIdentified := false;
  expectedOmegaOrder := 0;
  if orthogonalSign <> 0 and derivedIndex = 2 then
    CV_STAGE := "odd-prime-omega-identification";
    standardOmega := Omega(
      orthogonalSign, 10, input.residueFieldOrder);
    expectedOmegaOrder := Size(standardOmega);
    omegaIdentified := derivedOrder = expectedOmegaOrder;
    if omegaIdentified then derivedPerfect := true; fi;
  fi;

  if omegaIdentified and classicalLoaded then
    # The supplied column-action matrices satisfy g^T F g=F. Therefore
    # Q' <= O(F)'=Omega(F). Equality follows from the exact order comparison;
    # this identifies the derived subgroup, not the extension Q up to isomorphism.
    CV_STAGE := "odd-prime-classical-maximals";
    maxCaught := CALL_WITH_CATCH(ValueGlobal("ClassicalMaximalsGeneric"),
      [orthogonalType, 10, input.residueFieldOrder]);
    if maxCaught[1] = true and Length(maxCaught) >= 2
        and IsList(maxCaught[2]) then
      CV_STAGE := "odd-prime-maximal-index-extraction";
      maximalSubgroups := maxCaught[2];
      maximalIndices := Set(List(maximalSubgroups,
        subgroup -> expectedOmegaOrder / Size(subgroup)));
      CVRequire(Length(maximalIndices) > 0
          and ForAll(maximalIndices, IsInt),
        "odd-prime-maximal-index-invalid",
        "The complete Omega maximal-index list is empty or nonintegral.");
      minimumOmegaDegree := Minimum(maximalIndices);

      CV_STAGE := "odd-prime-target-screening";
      targets := CVTargetIndices(input.lowerBound, input.maxIndex);
      detailedDecisions := List(targets, function(index)
        # N=Q' has index two. For H<=Q, [N:H intersect N] is index or
        # half-index. Unless H is Q or N, H intersect N lies in a maximal
        # subgroup of N, whose index must divide the corresponding value.
        if index = 1 or index = 2 then
          return rec(
            decision := "unknown",
            reason := "The whole group and its derived subgroup realize indices 1 and 2.",
            target := index
          );
        fi;
        if ForAny(maximalIndices, maximalIndex ->
            index mod maximalIndex = 0
            or (index mod 2 = 0
              and (index / 2) mod maximalIndex = 0)) then
          return rec(
            decision := "unknown",
            reason := Concatenation(
              "A complete ", omegaName,
              " maximal index divides the target or half-target."),
            target := index
          );
        fi;
        return rec(
          decision := "ruled-out",
          reason := Concatenation(
            "No complete ", omegaName,
            " maximal index divides the target or half-target."),
          target := index
        );
      end);
      survivingTargets := List(
        Filtered(detailedDecisions, item -> item.decision <> "ruled-out"),
        item -> item.target);
      completeForTargets := Length(survivingTargets) = 0;
      if completeForTargets then
        normalizedDecisions := detailedDecisions;
        noCompatibleModule := rec(
          complete := true,
          decision := "none-in-requested-range",
          reason := Concatenation(
            "No transitive coset action at a requested index passes the ",
            "complete maximal-index divisibility test."),
          targetIndices := targets
        );
      else
        normalizedDecisions := List(detailedDecisions, item -> rec(
          decision := "unknown",
          reason := "Maximal-index screening does not decide every requested target.",
          target := item.target
        ));
        noCompatibleModule := rec(
          complete := false,
          decision := "unknown",
          reason := "At least one requested index survives the necessary filter.",
          survivingTargetIndices := survivingTargets
        );
      fi;

      CV_STAGE := "odd-prime-certificate-assembly";
      return rec(
        attempted := true,
        classicalMaximals := rec(
          attempted := true,
          completeForDimension := true,
          dimension := 10,
          maximalClassCount := Length(maximalSubgroups),
          maximalIndices := maximalIndices,
          minimumNontrivialDerivedTransitiveDegree := minimumOmegaDegree,
          packageAvailable := true,
          packageVersion := CVPackageVersion("ClassicalMaximals"),
          status := "passed",
          type := orthogonalType
        ),
        derivedSubgroup := rec(
          centerOrder := Size(Center(standardOmega)),
          identifiedAs := omegaName,
          identificationProof :=
            "Q' lies in O(F)'=Omega(F) and has the exact standard order.",
          index := derivedIndex,
          isPerfect := derivedPerfect,
          order := derivedOrder,
          recognition := derivedRecognition.public,
          standardOrder := expectedOmegaOrder
        ),
        extension := rec(
          derivedIndex := 2,
          fullGroupIsomorphismClaimed := false,
          statement := Concatenation(
            "Q is an index-two orthogonal extension of ", omegaName,
            "; its extension isomorphism type is not inferred from order.")
        ),
        invariantForm := formDiagnostics,
        minimumNontrivialTransitiveDegree := 2,
        minimumNontrivialTransitiveDegreeKernel := omegaName,
        noCompatibleModule := noCompatibleModule,
        recognitionNodeReady := ready,
        recognitionReason := recognitionReason,
        recognitionTreeReturned := recognitionReturned,
        screening := rec(
          complete := completeForTargets,
          completeNoCompatibleModule := completeForTargets,
          finiteImageOrder := matrixImage.finiteImageOrder,
          method := Concatenation(
            "complete ", omegaName,
            " maximal indices with index-two extension arithmetic"),
          minimumNontrivialDerivedTransitiveDegree := minimumOmegaDegree,
          minimumNontrivialTransitiveDegree := 2,
          noCompatibleModule := noCompatibleModule,
          partialTargetDecisions := detailedDecisions,
          possibleIndices := survivingTargets,
          reason := (function()
            if completeForTargets then
              return "No Omega maximal index divides any target or half-target.";
            fi;
            return "At least one target survives the necessary maximal-index filter.";
          end)(),
          targetDecisions := normalizedDecisions
        ),
        screeningReason := "Complete maximal-index divisibility test for the requested target range.",
        screeningStatus := (function()
          if completeForTargets then return "complete"; fi;
          return "unknown";
        end)()
      );
    fi;
  fi;

  return rec(
    attempted := true,
    classicalMaximals := rec(
      attempted := false,
      packageAvailable := classicalLoaded,
      reason := Concatenation(
        "ClassicalMaximalsGeneric was not called successfully because the ",
        "exact form, derived-index, perfectness, order, or package checks did ",
        "not identify the derived subgroup with Omega(F)."),
      status := "not-run"
    ),
    derivedSubgroup := rec(
      identifiedAs := "unknown",
      index := derivedIndex,
      isPerfect := derivedPerfect,
      order := derivedOrder,
      recognition := derivedRecognition.public,
      standardOrder := expectedOmegaOrder
    ),
    extension := rec(
      fullGroupIsomorphismClaimed := false,
      statement := "No orthogonal extension isomorphism type has been certified."
    ),
    invariantForm := formDiagnostics,
    noCompatibleModule := rec(
      complete := false,
      decision := "unknown",
      reason := "The normal classical factor or its complete maximal list was not certified."
    ),
    recognitionNodeReady := ready,
    recognitionReason := recognitionReason,
    recognitionTreeReturned := recognitionReturned,
    screeningReason := Concatenation(
      "Exact orthogonal identification and complete maximal-index coverage ",
      "have not both been proved for this image."),
    screeningStatus := "unknown"
  );
end;;

# Keep the historical entry point for callers and artifacts that name the
# characteristic-three diagnostic explicitly.
CVCharacteristic3MatrixDiagnostics := function(input, matrixImage)
  return CVOddPrimeOrthogonalMatrixDiagnostics(input, matrixImage);
end;;

CVIndexSpectrum := function(indices)
  local unique;
  unique := Set(indices);
  return List(unique, index -> rec(
    conjugacyClassCount := Number(indices, value -> value = index),
    index := index
  ));
end;;

CVTomMark := function(tom, rowPosition, columnPosition)
  local compressedPosition;
  compressedPosition := Position(SubsTom(tom)[rowPosition], columnPosition);
  if compressedPosition = fail then
    return 0;
  fi;
  return MarksTom(tom)[rowPosition][compressedPosition];
end;;

CVEvaluateGeneratorWord := function(group, generators, word)
  local element, inputIndex;
  CVRequire(IsList(word) and ForAll(word, IsInt),
    "invalid-torsion-witness-word",
    "Every torsion witness word must be a list of generator indices.");
  element := One(group);
  for inputIndex in word do
    CVRequire(inputIndex >= 0 and inputIndex < Length(generators),
      "invalid-torsion-witness-word",
      "A torsion witness refers to an unknown ordered generator.");
    element := element * generators[inputIndex + 1];
  od;
  return element;
end;;

CVSmallFactorFixedPointCount := function(group, subgroup, element)
  local cosets, action, permutation;
  cosets := RightCosets(group, subgroup);
  action := ActionHomomorphism(group, cosets, OnRight);
  permutation := Image(action, element);
  return Number([1..Length(cosets)], point -> point^permutation = point);
end;;

CVTomPositionOfSubgroup := function(tom, atlasGroup, subgroup)
  local orders, positions, position, representative;
  orders := OrdersTom(tom);
  positions := Filtered([1..Length(orders)],
    candidate -> orders[candidate] = Size(subgroup));
  for position in positions do
    representative := RepresentativeTomByGenerators(
      tom, position, GeneratorsOfGroup(atlasGroup));
    if representative <> fail
        and IsConjugate(atlasGroup, subgroup, representative) then
      return position;
    fi;
  od;
  return fail;
end;;

CVPrimeCyclicTomPosition := function(tom, atlasGroup, element, primeOrder)
  if IsOne(element) then
    return Position(OrdersTom(tom), 1);
  fi;
  return CVTomPositionOfSubgroup(tom, atlasGroup, Group([element]));
end;;

CVOuterTomPosition := function(tom, atlasGroup, simpleIsomorphism,
    outerElement, position)
  local atlasSubgroup, derivedSubgroup, outerSubgroup, atlasOuterSubgroup;
  atlasSubgroup := RepresentativeTomByGenerators(
    tom, position, GeneratorsOfGroup(atlasGroup));
  CVRequire(atlasSubgroup <> fail,
    "mod2-tom-representative-materialization-failed",
    "A Tom class could not be reconstructed in the ATLAS simple group.");
  derivedSubgroup := PreImage(simpleIsomorphism, atlasSubgroup);
  outerSubgroup := derivedSubgroup ^ outerElement;
  atlasOuterSubgroup := Image(simpleIsomorphism, outerSubgroup);
  return CVTomPositionOfSubgroup(tom, atlasGroup, atlasOuterSubgroup);
end;;

CVMod2ProductLiftMarksSweep := function(input, group, generators,
    smallKernel, largeKernel, derived, action3, action119,
    simpleIsomorphism, atlasSimple, tom, s3Classes, classIndices, targets)
  local productCandidates, aPosition, aSubgroup, aIndex, cPosition, cIndex,
    target, witnesses, catalogueComplete, smallRestriction,
    largeRestriction, classifiedWitnesses, witness, witnessElement,
    primeOrder, smallComponent, largeComponent, atlasElement, tomPosition,
    publicWitnesses, candidate, rejected, rejection, smallFixed,
    largeInnerMark, largeOuterMark, largeFixed, outerElement,
    outerTomPositions, outerTomPosition, candidateMarksEvidence, marksEvidence,
    survivingDescriptors, survivingFactorDescriptors, rejectionEvidence,
    atlasSubgroup, derivedSubgroup, embeddedSubgroup, descriptor,
    rejectedCandidateCount, unresolvedCandidateCount;

  productCandidates := [];
  for aPosition in [1..Length(s3Classes)] do
    aSubgroup := Representative(s3Classes[aPosition]);
    aIndex := 6 / Size(aSubgroup);
    for cPosition in [1..Length(classIndices)] do
      cIndex := classIndices[cPosition];
      target := aIndex * 2 * cIndex;
      if target in targets then
        Add(productCandidates, rec(
          s3ClassPosition := aPosition,
          s3Index := aIndex,
          s3Order := Size(aSubgroup),
          targetIndex := target,
          tomIndex := cIndex,
          tomOrder := Size(derived) / cIndex,
          tomPosition := cPosition
        ));
      fi;
    od;
  od;
  Sort(productCandidates, function(left, right)
    if left.targetIndex <> right.targetIndex then
      return left.targetIndex < right.targetIndex;
    elif left.s3ClassPosition <> right.s3ClassPosition then
      return left.s3ClassPosition < right.s3ClassPosition;
    fi;
    return left.tomPosition < right.tomPosition;
  end);

  if Length(productCandidates) = 0 then
    return rec(
      attempted := true,
      candidateProductLiftCount := 0,
      completeForProductLiftScope := true,
      embeddedGeneratorWordsAvailable := false,
      embeddedGeneratorWordsReason :=
        "No index-compatible canonical product lift exists in the requested range.",
      rejectionEvidence := [],
      scope := "canonical direct-product lifts A x C only",
      scopeComplete := true,
      scopeLimitation := Concatenation(
        "The sweep does not enumerate non-product Goursat subgroups or ",
        "subgroups projecting outside the certified derived factor."),
      status := "no-index-compatible-product-lift",
      survivingFactorDescriptors := [],
      torsionFreeConclusion := "not-claimed-by-this-marks-sweep-alone",
      survivingEmbeddedSubgroups := []
    );
  fi;

  if not IsBound(input.torsionWitnesses) then
    return rec(
      attempted := false,
      candidateProductLiftCount := Length(productCandidates),
      completeForProductLiftScope := false,
      embeddedGeneratorWordsAvailable := false,
      embeddedGeneratorWordsReason := Concatenation(
        "The transfer contains no prime-order torsion witness catalogue; ",
        "Tom positions cannot yet be certified as fixed-point-free."),
      indexCompatibleProductLifts := productCandidates,
      rejectionEvidence := [],
      scope := "canonical direct-product lifts A x C only",
      scopeComplete := false,
      scopeLimitation := Concatenation(
        "The sweep does not enumerate non-product Goursat subgroups or ",
        "subgroups projecting outside the certified derived factor."),
      status := "witness-catalogue-not-supplied",
      survivingFactorDescriptors := [],
      torsionFreeConclusion := "not-claimed-by-this-marks-sweep-alone",
      survivingEmbeddedSubgroups := []
    );
  fi;

  witnesses := input.torsionWitnesses;
  CVRequire(IsList(witnesses) and Length(witnesses) > 0,
    "invalid-torsion-witness-catalogue",
    "torsionWitnesses must be a nonempty list when supplied.");
  catalogueComplete := IsBound(input.torsionWitnessCatalogueComplete)
    and input.torsionWitnessCatalogueComplete = true;
  smallRestriction := RestrictedMapping(action3, smallKernel);
  largeRestriction := RestrictedMapping(action119, largeKernel);
  outerElement := First(GeneratorsOfGroup(largeKernel),
    element -> not element in derived);
  CVRequire(outerElement <> fail,
    "mod2-outer-element-unavailable",
    "The certified index-two extension has no detected outer-coset generator.");
  outerTomPositions := List([1..Length(classIndices)], position -> 0);
  classifiedWitnesses := [];
  publicWitnesses := [];
  for witness in witnesses do
    CVRequire(IsRecord(witness) and IsBound(witness.word)
        and IsBound(witness.primeOrder),
      "invalid-torsion-witness",
      "Each torsion witness requires word and primeOrder fields.");
    primeOrder := witness.primeOrder;
    CVRequire(IsInt(primeOrder) and IsPrimeInt(primeOrder),
      "invalid-torsion-witness-order",
      "Every torsion witness order must be prime.");
    witnessElement := CVEvaluateGeneratorWord(group, generators, witness.word);
    CVRequire(Order(witnessElement) = primeOrder,
      "torsion-witness-order-mismatch",
      "A transferred torsion witness has the wrong finite-image order.");
    smallComponent := PreImagesRepresentative(
      smallRestriction, Image(action3, witnessElement));
    largeComponent := PreImagesRepresentative(
      largeRestriction, Image(action119, witnessElement));
    CVRequire(smallComponent <> fail and largeComponent <> fail
        and smallComponent * largeComponent = witnessElement,
      "mod2-factor-decomposition-failed",
      "A torsion witness did not decompose into the certified direct factors.");

    tomPosition := 0;
    if largeComponent in derived then
      atlasElement := Image(simpleIsomorphism, largeComponent);
      tomPosition := CVPrimeCyclicTomPosition(
        tom, atlasSimple, atlasElement, primeOrder);
      CVRequire(tomPosition <> fail,
        "mod2-witness-tom-class-unresolved",
        "A normal-factor witness was not located in the O8-(2) table of marks.");
    fi;
    Add(classifiedWitnesses, rec(
      largeTomPosition := tomPosition,
      primeOrder := primeOrder,
      smallElement := smallComponent,
      word := witness.word
    ));
    Add(publicWitnesses, rec(
      largeComponentInDerivedFactor := largeComponent in derived,
      largeComponentOrder := Order(largeComponent),
      largeTomPosition := tomPosition,
      primeOrder := primeOrder,
      smallComponentOrder := Order(smallComponent),
      word := witness.word
    ));
  od;

  survivingDescriptors := [];
  survivingFactorDescriptors := [];
  rejectionEvidence := [];
  for candidate in productCandidates do
    aSubgroup := Representative(s3Classes[candidate.s3ClassPosition]);
    rejected := false;
    rejection := fail;
    candidateMarksEvidence := [];
    if outerTomPositions[candidate.tomPosition] = 0 then
      outerTomPosition := CVOuterTomPosition(
        tom, atlasSimple, simpleIsomorphism, outerElement,
        candidate.tomPosition);
      CVRequire(outerTomPosition <> fail,
        "mod2-outer-tom-class-unresolved",
        "The outer conjugate of a candidate Tom class was not identified.");
      outerTomPositions[candidate.tomPosition] := outerTomPosition;
    else
      outerTomPosition := outerTomPositions[candidate.tomPosition];
    fi;
    for witness in classifiedWitnesses do
      smallFixed := CVSmallFactorFixedPointCount(
        smallKernel, aSubgroup, witness.smallElement);
      if witness.largeTomPosition = 0 then
        # A point stabilizer C lies in the normal derived factor.  An element
        # outside that factor cannot lie in a conjugate of C.
        largeInnerMark := 0;
        largeOuterMark := 0;
      else
        # B/C has two N-orbits for N=O8-(2): N/C and the orbit belonging to
        # the outer conjugate of C.  Both Tom marks are required.
        largeInnerMark := CVTomMark(
          tom, candidate.tomPosition, witness.largeTomPosition);
        largeOuterMark := CVTomMark(
          tom, outerTomPosition, witness.largeTomPosition);
      fi;
      largeFixed := largeInnerMark + largeOuterMark;
      marksEvidence := rec(
        fixedCosetProduct := smallFixed * largeFixed,
        largeFactorFixedCosets := largeFixed,
        largeInnerTomMark := largeInnerMark,
        largeOuterTomMark := largeOuterMark,
        largeWitnessTomPosition := witness.largeTomPosition,
        outerTomPosition := outerTomPosition,
        primeOrder := witness.primeOrder,
        s3ClassPosition := candidate.s3ClassPosition,
        s3FixedCosets := smallFixed,
        targetIndex := candidate.targetIndex,
        tomPosition := candidate.tomPosition,
        witnessWord := witness.word
      );
      Add(candidateMarksEvidence, marksEvidence);
      if marksEvidence.fixedCosetProduct > 0 then
        rejected := true;
        rejection := marksEvidence;
        break;
      fi;
    od;
    if rejected then
      Add(rejectionEvidence, rejection);
    else
      descriptor := rec(
        allSuppliedPrimeOrderWitnessMarksZero := true,
        mappedIntoCertifiedDerivedFactor := true,
        marksEvidence := candidateMarksEvidence,
        s3ClassPosition := candidate.s3ClassPosition,
        s3Order := candidate.s3Order,
        targetIndex := candidate.targetIndex,
        tomIndex := candidate.tomIndex,
        tomOrder := candidate.tomOrder,
        tomPosition := candidate.tomPosition,
        outerTomPosition := outerTomPosition,
        witnessCheckCount := Length(classifiedWitnesses)
      );
      Add(survivingFactorDescriptors, descriptor);
    fi;
    if not rejected and catalogueComplete then
      # Coset construction is deferred until every exact witness mark vanishes.
      atlasSubgroup := RepresentativeTomByGenerators(
        tom, candidate.tomPosition, GeneratorsOfGroup(atlasSimple));
      CVRequire(atlasSubgroup <> fail,
        "mod2-tom-representative-materialization-failed",
        "A surviving Tom class could not be reconstructed in the ATLAS group.");
      derivedSubgroup := PreImage(simpleIsomorphism, atlasSubgroup);
      embeddedSubgroup := ClosureGroup(aSubgroup, derivedSubgroup);
      CVRequire(Size(derivedSubgroup) = candidate.tomOrder
          and Index(group, embeddedSubgroup) = candidate.targetIndex,
        "mod2-product-lift-index-mismatch",
        "A reconstructed canonical product lift has the wrong order or index.");
      descriptor := rec(
        allSuppliedPrimeOrderWitnessMarksZero := true,
        embeddedIndex := Index(group, embeddedSubgroup),
        embeddedOrder := Size(embeddedSubgroup),
        generatorWordsAvailable := false,
        generatorWordsReason := Concatenation(
          "The Tom representative is exact in the certified ATLAS/derived ",
          "factor, but no verified straight-line preimage in the ordered ",
          "Coxeter generators is available in this script."),
        mappedIntoCertifiedDerivedFactor := true,
        marksEvidence := candidateMarksEvidence,
        outerTomPosition := outerTomPosition,
        s3ClassPosition := candidate.s3ClassPosition,
        s3Order := candidate.s3Order,
        targetIndex := candidate.targetIndex,
        tomIndex := candidate.tomIndex,
        tomOrder := candidate.tomOrder,
        tomPosition := candidate.tomPosition,
        witnessCheckCount := Length(classifiedWitnesses)
      );
      Add(survivingDescriptors, descriptor);
    fi;
  od;
  rejectedCandidateCount := Length(rejectionEvidence);
  unresolvedCandidateCount := Length(productCandidates)
    - rejectedCandidateCount - Length(survivingDescriptors);

  return rec(
    attempted := true,
    candidateProductLiftCount := Length(productCandidates),
    catalogueCompletenessBasis := Concatenation(
      "GAP verifies every supplied witness word and image order. The claim ",
      "that this list exhausts source spherical prime-order torsion is ",
      "transferred, not rederived in this script."),
    classifiedWitnesses := publicWitnesses,
    completeForProductLiftScope := catalogueComplete,
    embeddedGeneratorWordsAvailable := false,
    embeddedGeneratorWordsReason := Concatenation(
      "Exact factor/Tom positions are emitted for Python materialization; ",
      "source-generator words are not certified here."),
    largeFactorFixedPointFormula := Concatenation(
      "Fix_{(O8-(2):2)/C}(b) is zero for b outside O8-(2), and otherwise ",
      "equals mark(C,<b>) + mark(C^outer,<b>)."),
    rejectionEvidence := rejectionEvidence,
    rejectedProductLiftCount := rejectedCandidateCount,
    scope := "canonical direct-product lifts A x C only",
    scopeComplete := catalogueComplete,
    scopeLimitation := Concatenation(
      "Product lifts do not exhaust non-product Goursat subgroups, outer ",
      "subgroups of O8-(2).2, or mixed projections."),
    status := (function()
      if catalogueComplete then
        return "marks-complete-for-declared-witness-catalogue";
      fi;
      return "partial-witness-catalogue";
    end)(),
    survivingFactorDescriptors := survivingFactorDescriptors,
    survivingEmbeddedSubgroups := survivingDescriptors,
    torsionFreeConclusion := "not-claimed-by-this-marks-sweep-alone",
    unresolvedProductLiftCount := unresolvedCandidateCount,
    witnessCatalogueComplete := catalogueComplete,
    witnessCount := Length(classifiedWitnesses)
  );
end;;

CVProductLiftTargetOutcome := function(productLiftMarks, target)
  local rejected, surviving, materialized, compatible, candidateCount,
    complete, outcome;

  rejected := [];
  surviving := [];
  materialized := [];
  compatible := [];
  if IsBound(productLiftMarks.rejectionEvidence) then
    rejected := Filtered(productLiftMarks.rejectionEvidence,
      item -> item.targetIndex = target);
  fi;
  if IsBound(productLiftMarks.survivingFactorDescriptors) then
    surviving := Filtered(productLiftMarks.survivingFactorDescriptors,
      item -> item.targetIndex = target);
  fi;
  if IsBound(productLiftMarks.survivingEmbeddedSubgroups) then
    materialized := Filtered(productLiftMarks.survivingEmbeddedSubgroups,
      item -> item.targetIndex = target);
  fi;
  if IsBound(productLiftMarks.indexCompatibleProductLifts) then
    compatible := Filtered(productLiftMarks.indexCompatibleProductLifts,
      item -> item.targetIndex = target);
  fi;
  candidateCount := Length(rejected) + Length(surviving);
  if candidateCount = 0 then
    candidateCount := Length(compatible);
  fi;
  complete := IsBound(productLiftMarks.completeForProductLiftScope)
    and productLiftMarks.completeForProductLiftScope = true;

  if candidateCount = 0 then
    outcome := "no-index-compatible-product-lift";
  elif complete and Length(rejected) = candidateCount then
    outcome := "witness-contaminated";
  elif Length(surviving) > 0 then
    outcome := "survived-fixed-point-marks";
  else
    outcome := "unresolved";
  fi;

  return rec(
    candidateCount := candidateCount,
    completeForDeclaredFamily := complete,
    family := "canonical-product",
    materializedSubgroupCount := Length(materialized),
    outcome := outcome,
    rejectedByFixedPointMarksCount := Length(rejected),
    scope := "A0 x K with A0 <= S3 and K <= O8-(2)",
    survivingFixedPointMarkCount := Length(surviving),
    torsionFreeConclusion := "not-claimed-without-independent-spherical-freeness"
  );
end;;

CVMod2Index97920ArithmeticFrontier := function(input, group, largeKernel, derived,
    simpleIsomorphism, atlasSimple, tom, s3Classes, classIndices,
    productLiftMarks)
  local target, outerElement, outerTomPositions, arithmeticCandidates,
    aPosition, aSubgroup, leftIndex, quotientOrders, quotientOrder, divisor,
    largeProjectionIndex, normalIndex, tomPosition, outerTomPosition,
    projectionKind, family, productOutcome, normalFiberCount,
    outerProductCount, outerFiberCount, outerUnstableCount;

  target := 97920;
  productOutcome := CVProductLiftTargetOutcome(productLiftMarks, target);
  outerElement := First(GeneratorsOfGroup(largeKernel),
    element -> not element in derived);
  CVRequire(outerElement <> fail,
    "mod2-outer-element-unavailable",
    "The certified index-two extension has no detected outer-coset generator.");
  outerTomPositions := List([1..Length(classIndices)], position -> 0);
  arithmeticCandidates := [];
  outerUnstableCount := 0;

  # Goursat's formula determines the projection indices and common quotient
  # order.  TomLib supplies every K <= O8-(2), but not the subgroup classes of
  # O8-(2):2.  The records below therefore separate exact normal-factor
  # subgroup classes from outer-stable intersection classes whose extension
  # lifts still require normalizer-quotient enumeration.
  for aPosition in [1..Length(s3Classes)] do
    aSubgroup := Representative(s3Classes[aPosition]);
    leftIndex := 6 / Size(aSubgroup);
    quotientOrders := Set(List(NormalSubgroups(aSubgroup),
      normal -> Size(aSubgroup) / Size(normal)));
    for quotientOrder in quotientOrders do
      divisor := leftIndex * quotientOrder;
      if target mod divisor = 0 then
        largeProjectionIndex := target / divisor;

        # B0=K lies in N=O8-(2), so [B:B0]=2[N:K].  These K classes are
        # exhausted by the table of marks.  For quotientOrder > 1, however,
        # TomLib does not say whether K has the required normal quotient.
        if largeProjectionIndex mod 2 = 0 then
          normalIndex := largeProjectionIndex / 2;
          for tomPosition in Positions(classIndices, normalIndex) do
            if quotientOrder = 1 then
              family := "canonical-product";
            else
              family := "normal-factor-goursat-fiber-product";
            fi;
            Add(arithmeticCandidates, rec(
              commonQuotientOrder := quotientOrder,
              family := family,
              largeProjectionIndex := largeProjectionIndex,
              normalFactorIndex := normalIndex,
              normalFactorSubgroupClassExact := true,
              outerExtensionClassEnumerated := false,
              projectionKind := "contained-in-O8-(2)",
              quotientExistenceChecked := quotientOrder = 1,
              s3ClassPosition := aPosition,
              s3ProjectionIndex := leftIndex,
              targetIndex := target,
              tomPosition := tomPosition
            ));
          od;
        fi;

        # If B0 projects onto B/N, then K=B0 intersect N has index
        # [B:B0] in N.  An outer lift can exist only when the outer
        # automorphism fixes the N-conjugacy class of K.  That test is exact,
        # but it does not enumerate the possible split or nonsplit extensions
        # inside N_B(K)/K because TomLib has no table for O8-(2):2.
        normalIndex := largeProjectionIndex;
        for tomPosition in Positions(classIndices, normalIndex) do
          if outerTomPositions[tomPosition] = 0 then
            outerTomPosition := CVOuterTomPosition(
              tom, atlasSimple, simpleIsomorphism, outerElement,
              tomPosition);
            CVRequire(outerTomPosition <> fail,
              "mod2-outer-tom-class-unresolved",
              "An outer image of a target-97920 Tom class was not identified.");
            outerTomPositions[tomPosition] := outerTomPosition;
          else
            outerTomPosition := outerTomPositions[tomPosition];
          fi;
          if outerTomPosition = tomPosition then
            if quotientOrder = 1 then
              family := "outer-factor-lift";
            else
              family := "outer-goursat-fiber-product";
            fi;
            Add(arithmeticCandidates, rec(
              commonQuotientOrder := quotientOrder,
              family := family,
              largeProjectionIndex := largeProjectionIndex,
              normalFactorIndex := normalIndex,
              normalFactorSubgroupClassExact := true,
              outerClassStable := true,
              outerExtensionClassEnumerated := false,
              outerTomPosition := outerTomPosition,
              projectionKind := "projects-to-outer-C2",
              quotientExistenceChecked := false,
              s3ClassPosition := aPosition,
              s3ProjectionIndex := leftIndex,
              targetIndex := target,
              tomPosition := tomPosition
            ));
          else
            outerUnstableCount := outerUnstableCount + 1;
          fi;
        od;
      fi;
    od;
  od;

  normalFiberCount := Number(arithmeticCandidates,
    item -> item.family = "normal-factor-goursat-fiber-product");
  outerProductCount := Number(arithmeticCandidates,
    item -> item.family = "outer-factor-lift");
  outerFiberCount := Number(arithmeticCandidates,
    item -> item.family = "outer-goursat-fiber-product");

  return rec(
    admissibleIndex := target,
    arithmeticCandidates := arithmeticCandidates,
    familyCoverage := [
      productOutcome,
      rec(
        candidateIntersectionClassCount := outerProductCount,
        completeForDeclaredFamily := false,
        family := "outer-factor-lift",
        outcome := (function()
          if outerProductCount = 0 then return "no-outer-stable-intersection-class"; fi;
          return "outer-stable-intersections-found-lifts-unresolved";
        end)(),
        scope := "A0 x B0 with B0 mapping onto O8-(2):2/O8-(2)",
        unresolvedData := Concatenation(
          "TomLib has no O8-(2).2 table. Exact classes in N_B(K)/K, ",
          "including split versus nonsplit outer lifts, are not enumerated."),
        witnessMarksApplied := false
      ),
      rec(
        candidateNormalProjectionCount := normalFiberCount,
        candidateOuterProjectionCount := outerFiberCount,
        completeForDeclaredFamily := false,
        family := "goursat-fiber-product",
        outcome := "projection-arithmetic-enumerated-common-quotients-unresolved",
        scope := "nontrivial common quotients of S3 projections and large-factor projections",
        unresolvedData := Concatenation(
          "Normal subgroups and quotient isomorphisms of the materialized ",
          "large-factor projection subgroups have not been enumerated."),
        witnessMarksApplied := false
      ),
      rec(
        completeForDeclaredFamily := false,
        family := "nonsplit-outer-subgroups",
        outcome := "unresolved-without-extension-normalizer-quotients",
        scope := "outer projection subgroups B0 with B0 intersect O8-(2)=K",
        unresolvedData := Concatenation(
          "Outer stability of K is necessary, but split and nonsplit ",
          "extensions are distinguished only after enumerating N_B(K)/K."),
        witnessMarksApplied := false
      )
    ],
    mathematicalBoundary := Concatenation(
      "The O8-(2) table exhausts K classes and the common-quotient index ",
      "arithmetic is exact. It does not exhaust subgroup classes of the ",
      "full extension O8-(2):2."),
    overallComplete := false,
    overallDecision := "unknown",
    outerUnstableIntersectionCount := outerUnstableCount,
    status := "family-scoped-fail-closed"
  );
end;;

CVNormalQuotientRecordsAtMost := function(subgroup, maximumOrder)
  local records, normals, position, kernel, homomorphism, quotient, order;
  records := [];
  normals := NormalSubgroups(subgroup);
  for position in [1..Length(normals)] do
    kernel := normals[position];
    homomorphism := NaturalHomomorphismByNormalSubgroup(subgroup, kernel);
    quotient := Image(homomorphism);
    order := Size(quotient);
    if order <= maximumOrder then
      Add(records, rec(
        homomorphism := homomorphism,
        kernel := kernel,
        normalPosition := position,
        order := order,
        parent := subgroup,
        quotient := quotient,
        structure := StructureDescription(quotient)
      ));
    fi;
  od;
  return records;
end;;

CVOuterLiftsFromNormalizerQuotientUnsafe := function(largeKernel, derived,
    subgroup, tomPosition, requiredIndex)
  local outerElement, outerConjugate, transporter, outerNormalizerElement,
    normalizerInDerived, normalizerInExtension, quotientMap, quotient,
    quotientKernel, subgroupClasses, complementClasses, candidates,
    position, complement, lift;

  normalizerInDerived := Normalizer(derived, subgroup);
  outerElement := First(GeneratorsOfGroup(largeKernel),
    element -> not element in derived);
  CVRequire(outerElement <> fail,
    "mod2-outer-element-unavailable",
    "The index-two extension has no detected outer-coset generator.");
  outerConjugate := subgroup ^ outerElement;
  transporter := RepresentativeAction(
    derived, outerConjugate, subgroup, OnPoints);
  if transporter = fail then
    return rec(
      candidates := [],
      complete := true,
      public := rec(
        complementClassCount := 0,
        complete := true,
        diagonalTomMark := fail,
        normalFactorIndex := Index(derived, subgroup),
        outcome := "outer-class-not-stable",
        requiredExtensionIndex := requiredIndex,
        transporterFound := false,
        tomPosition := tomPosition
      )
    );
  fi;

  # If (K^t)^r=K, then x=t*r normalizes K and lies outside N.  Hence
  # N_B(K)=<N_N(K),x>; computing Normalizer(B,K) from scratch is unnecessary.
  outerNormalizerElement := outerElement * transporter;
  CVRequire(subgroup ^ outerNormalizerElement = subgroup,
    "mod2-outer-transporter-invalid",
    "The derived-factor transporter did not produce an outer normalizer element.");
  normalizerInExtension := ClosureGroup(
    normalizerInDerived, outerNormalizerElement);
  CVRequire(Index(normalizerInExtension, normalizerInDerived) = 2,
    "mod2-outer-normalizer-index-mismatch",
    "The constructed extension normalizer is not index two over N_N(K).");

  quotientMap := NaturalHomomorphismByNormalSubgroup(
    normalizerInExtension, subgroup);
  quotient := Image(quotientMap);
  quotientKernel := Image(quotientMap, normalizerInDerived);
  subgroupClasses := ConjugacyClassesSubgroups(quotient);
  complementClasses := Filtered(subgroupClasses, class ->
    Size(Representative(class)) = 2
      and Size(Intersection(Representative(class), quotientKernel)) = 1);
  candidates := [];
  for position in [1..Length(complementClasses)] do
    complement := Representative(complementClasses[position]);
    lift := PreImage(quotientMap, complement);
    # PreImage records the normalizer as parent.  SubdirectProducts must see
    # B0 as a subgroup of the certified extension B, not of N_B(K).
    lift := Subgroup(largeKernel, GeneratorsOfGroup(lift));
    CVRequire(Index(largeKernel, lift) = requiredIndex,
      "mod2-outer-lift-index-mismatch",
      "A normalizer-quotient complement lifted to the wrong extension index.");
    CVRequire(Intersection(lift, derived) = subgroup,
      "mod2-outer-lift-intersection-mismatch",
      "An outer lift does not have the requested intersection with O8-(2).");
    Add(candidates, rec(
      complementClassPosition := position,
      family := "outer-surjective",
      normalFactorIndex := Index(derived, subgroup),
      normalizerQuotientOrder := Size(quotient),
      normalizerQuotientKernelOrder := Size(quotientKernel),
      requiredExtensionIndex := requiredIndex,
      structure := StructureDescription(lift),
      subgroup := lift,
      transporterFound := true,
      tomPosition := tomPosition
    ));
  od;
  return rec(
    candidates := candidates,
    complete := true,
    public := rec(
      complementClassCount := Length(complementClasses),
      complete := true,
      normalFactorIndex := Index(derived, subgroup),
      normalizerIndexOverDerivedNormalizer := 2,
      normalizerQuotientKernelOrder := Size(quotientKernel),
      normalizerQuotientOrder := Size(quotient),
      outcome := "all-outer-complements-enumerated",
      requiredExtensionIndex := requiredIndex,
      transporterFound := true,
      tomPosition := tomPosition
    )
  );
end;;

CVOuterLiftsFromNormalizerQuotient := function(largeKernel, derived,
    subgroup, tomPosition, requiredIndex)
  local caught;
  caught := CALL_WITH_CATCH(CVOuterLiftsFromNormalizerQuotientUnsafe,
    [largeKernel, derived, subgroup, tomPosition, requiredIndex]);
  if caught[1] = true and Length(caught) >= 2 then
    return caught[2];
  fi;
  return rec(
    candidates := [],
    complete := false,
    public := rec(
      complete := false,
      normalFactorIndex := Index(derived, subgroup),
      outcome := "resumable-normalizer-quotient-frontier",
      requiredExtensionIndex := requiredIndex,
      resumeOperation := Concatenation(
        "Transport Tom class ", String(tomPosition),
        ", find r with (K^t)^r=K, form <N_N(K),t*r>/K, enumerate ",
        "order-two complements outside N_N(K)/K, and lift their preimages."),
      resumeStage := "outer-normalizer-quotient",
      tomPosition := tomPosition
    )
  );
end;;

CVBuildGoursatFiberSubgroup := function(ambientGroup, leftRecord,
    rightRecord, quotientIsomorphism, quotientAutomorphism)
  local generators, quotientGenerator, leftLift, rightImage, rightLift,
    subgroup;

  generators := Concatenation(
    GeneratorsOfGroup(leftRecord.kernel),
    GeneratorsOfGroup(rightRecord.kernel));
  for quotientGenerator in GeneratorsOfGroup(leftRecord.quotient) do
    leftLift := PreImagesRepresentative(
      leftRecord.homomorphism, quotientGenerator);
    rightImage := Image(quotientAutomorphism,
      Image(quotientIsomorphism, quotientGenerator));
    rightLift := PreImagesRepresentative(rightRecord.homomorphism, rightImage);
    Add(generators, leftLift * rightLift);
  od;
  subgroup := Subgroup(ambientGroup, generators);
  CVRequire(Size(Intersection(subgroup, leftRecord.parent))
      = Size(leftRecord.kernel),
    "mod2-goursat-left-kernel-mismatch",
    "A constructed Goursat subgroup has the wrong left kernel.");
  CVRequire(Size(Intersection(subgroup, rightRecord.parent))
      = Size(rightRecord.kernel),
    "mod2-goursat-right-kernel-mismatch",
    "A constructed Goursat subgroup has the wrong right kernel.");
  CVRequire(Size(subgroup) = Size(leftRecord.kernel)
      * Size(rightRecord.kernel) * leftRecord.order,
    "mod2-goursat-order-mismatch",
    "A constructed Goursat subgroup has the wrong order.");
  return subgroup;
end;;

CVPreparePrimeOrderWitnessClasses := function(input, group, generators)
  local witnesses, sourceCount, records, witness, element, existing;
  if not IsBound(input.torsionWitnesses) then
    return rec(
      catalogueComplete := false,
      records := [],
      sourceWitnessCount := 0,
      status := "witness-catalogue-not-supplied"
    );
  fi;
  witnesses := input.torsionWitnesses;
  CVRequire(IsList(witnesses) and Length(witnesses) > 0,
    "invalid-torsion-witness-catalogue",
    "torsionWitnesses must be a nonempty list when supplied.");
  records := [];
  sourceCount := 0;
  for witness in witnesses do
    CVRequire(IsRecord(witness) and IsBound(witness.word)
        and IsBound(witness.primeOrder),
      "invalid-torsion-witness",
      "Each torsion witness requires word and primeOrder fields.");
    CVRequire(IsInt(witness.primeOrder) and IsPrimeInt(witness.primeOrder),
      "invalid-torsion-witness-order",
      "Every torsion witness order must be prime.");
    element := CVEvaluateGeneratorWord(group, generators, witness.word);
    CVRequire(Order(element) = witness.primeOrder,
      "torsion-witness-order-mismatch",
      "A transferred torsion witness has the wrong finite-image order.");
    sourceCount := sourceCount + 1;
    existing := First(records, record ->
      record.primeOrder = witness.primeOrder
        and IsConjugate(group, record.element, element));
    if existing = fail then
      Add(records, rec(
        element := element,
        primeOrder := witness.primeOrder,
        representativeWord := witness.word,
        sourceMultiplicity := 1
      ));
    else
      existing.sourceMultiplicity := existing.sourceMultiplicity + 1;
    fi;
  od;
  return rec(
    catalogueComplete := IsBound(input.torsionWitnessCatalogueComplete)
      and input.torsionWitnessCatalogueComplete = true,
    records := records,
    sourceWitnessCount := sourceCount,
    status := "exact-image-conjugacy-classes-prepared"
  );
end;;

CVExactWitnessTestForSubgroupUnsafe := function(ambientGroup, subgroup,
    witnessClasses)
  local subgroupClasses, representatives, witness, matching;
  subgroupClasses := ConjugacyClasses(subgroup);
  representatives := List(subgroupClasses, Representative);
  for witness in witnessClasses.records do
    matching := First(representatives, representative ->
      Order(representative) = witness.primeOrder
        and IsConjugate(ambientGroup, witness.element, representative));
    if matching <> fail then
      return rec(
        complete := true,
        outcome := "witness-contaminated",
        rejectedByPrimeOrder := witness.primeOrder,
        rejectedByWitnessWord := witness.representativeWord,
        testedImageConjugacyClassCount :=
          Position(witnessClasses.records, witness)
      );
    fi;
  od;
  return rec(
    complete := true,
    outcome := "all-supplied-witnesses-fixed-point-free",
    testedImageConjugacyClassCount := Length(witnessClasses.records)
  );
end;;

CVExactWitnessTestForSubgroup := function(ambientGroup, subgroup,
    witnessClasses)
  local caught;
  if not witnessClasses.catalogueComplete then
    return rec(
      complete := false,
      outcome := "witness-catalogue-incomplete",
      resumeOperation := Concatenation(
        "Attach the complete prime-order torsion witness catalogue generated ",
        "from all spherical special subgroups, then rerun this candidate."),
      resumeStage := "torsion-witness-catalogue-transfer",
      testedImageConjugacyClassCount := 0
    );
  fi;
  caught := CALL_WITH_CATCH(CVExactWitnessTestForSubgroupUnsafe,
    [ambientGroup, subgroup, witnessClasses]);
  if caught[1] = true and Length(caught) >= 2 then
    return caught[2];
  fi;
  return rec(
    complete := false,
    outcome := "resumable-exact-witness-test-frontier",
    resumeOperation := Concatenation(
      "Compute conjugacy classes of the order-", String(Size(subgroup)),
      " candidate and test ",
      "ambient conjugacy against each prime-order image witness."),
    resumeStage := "exact-prime-order-witness-test",
    testedImageConjugacyClassCount := 0
  );
end;;

CVMod2Index97920ExactFamilyReportUnsafe := function(input, group, generators,
    smallKernel, largeKernel, derived, simpleIsomorphism, atlasSimple, tom,
    s3Classes, classIndices, productLiftMarks)
  local target, leftQuotients, requiredExtensionIndices, aPosition,
    leftSubgroup, leftIndex, quotientRecord, divisor, requiredIndex,
    bCandidates, frontiers, requiredBIndex, normalIndex, tomPosition,
    atlasSubgroup, subgroup, outerResult, candidate, b0Candidate,
    rightQuotients, rightQuotientRecord, quotientIsomorphism,
    automorphisms, automorphismPosition,
    automorphism, goursatSubgroup, existing, candidateDescriptor,
    constructedCount, witnessClasses, witnessCheck, publicCandidates,
    completeEnumeration, completeWitnessTesting, rejectedCount, survivorCount,
    classification, overallComplete;

  target := 97920;
  leftQuotients := [];
  for aPosition in [1..Length(s3Classes)] do
    leftSubgroup := Representative(s3Classes[aPosition]);
    leftIndex := 6 / Size(leftSubgroup);
    for quotientRecord in CVNormalQuotientRecordsAtMost(leftSubgroup, 6) do
      quotientRecord.s3ClassPosition := aPosition;
      quotientRecord.s3ProjectionIndex := leftIndex;
      Add(leftQuotients, quotientRecord);
    od;
  od;
  requiredExtensionIndices := [];
  for quotientRecord in leftQuotients do
    divisor := quotientRecord.s3ProjectionIndex * quotientRecord.order;
    if target mod divisor = 0 then
      AddSet(requiredExtensionIndices, target / divisor);
    fi;
  od;
  CVRequire(requiredExtensionIndices = [16320, 32640, 48960, 97920],
    "mod2-index-97920-projection-index-mismatch",
    "The exact S3 quotient calculation gave unexpected B0 indices.");

  bCandidates := [];
  frontiers := [];
  for requiredBIndex in requiredExtensionIndices do
    if requiredBIndex mod 2 = 0 then
      normalIndex := requiredBIndex / 2;
      for tomPosition in Positions(classIndices, normalIndex) do
        atlasSubgroup := RepresentativeTomByGenerators(
          tom, tomPosition, GeneratorsOfGroup(atlasSimple));
        CVRequire(atlasSubgroup <> fail,
          "mod2-tom-representative-materialization-failed",
          "A contained-N Tom class could not be reconstructed.");
        subgroup := PreImage(simpleIsomorphism, atlasSubgroup);
        CVRequire(Index(largeKernel, subgroup) = requiredBIndex,
          "mod2-contained-lift-index-mismatch",
          "A contained-N subgroup has the wrong extension index.");
        Add(bCandidates, rec(
          complementClassPosition := 0,
          family := "contained-in-normal-factor",
          normalFactorIndex := normalIndex,
          requiredExtensionIndex := requiredBIndex,
          structure := StructureDescription(subgroup),
          subgroup := subgroup,
          tomPosition := tomPosition
        ));
      od;
    fi;

    normalIndex := requiredBIndex;
    for tomPosition in Positions(classIndices, normalIndex) do
      atlasSubgroup := RepresentativeTomByGenerators(
        tom, tomPosition, GeneratorsOfGroup(atlasSimple));
      CVRequire(atlasSubgroup <> fail,
        "mod2-tom-representative-materialization-failed",
        "An outer-lift Tom class could not be reconstructed.");
      subgroup := PreImage(simpleIsomorphism, atlasSubgroup);
      outerResult := CVOuterLiftsFromNormalizerQuotient(
        largeKernel, derived, subgroup, tomPosition, requiredBIndex);
      Add(frontiers, outerResult.public);
      Append(bCandidates, outerResult.candidates);
    od;
  od;

  candidate := [];
  constructedCount := 0;
  for quotientRecord in leftQuotients do
    for b0Candidate in bCandidates do
      if quotientRecord.s3ProjectionIndex
          * b0Candidate.requiredExtensionIndex * quotientRecord.order = target then
        rightQuotients := CVNormalQuotientRecordsAtMost(
          b0Candidate.subgroup, 6);
        for rightQuotientRecord in List(rightQuotients, function(record)
          record.b0Descriptor := ShallowCopy(b0Candidate);
          return record;
        end) do
          if quotientRecord.order = rightQuotientRecord.order then
            quotientIsomorphism := IsomorphismGroups(
              quotientRecord.quotient, rightQuotientRecord.quotient);
            if quotientIsomorphism <> fail then
              automorphisms := Elements(AutomorphismGroup(
                rightQuotientRecord.quotient));
              for automorphismPosition in [1..Length(automorphisms)] do
                automorphism := automorphisms[automorphismPosition];
                goursatSubgroup := CVBuildGoursatFiberSubgroup(
                  group, quotientRecord, rightQuotientRecord,
                  quotientIsomorphism, automorphism);
                CVRequire(Index(group, goursatSubgroup) = target,
                  "mod2-index-97920-goursat-index-mismatch",
                  "A constructed Goursat subgroup has index other than 97920.");
                constructedCount := constructedCount + 1;
                existing := First(candidate, item ->
                  IsConjugate(group, item.subgroup, goursatSubgroup));
                if existing = fail then
                  candidateDescriptor := rec(
                    automorphismMultiplicity := 1,
                    b0ComplementClassPosition :=
                      rightQuotientRecord.b0Descriptor.complementClassPosition,
                    b0Family := rightQuotientRecord.b0Descriptor.family,
                    b0Index :=
                      rightQuotientRecord.b0Descriptor.requiredExtensionIndex,
                    b0NormalKernelPosition := rightQuotientRecord.normalPosition,
                    b0Structure := rightQuotientRecord.b0Descriptor.structure,
                    commonQuotientOrder := quotientRecord.order,
                    commonQuotientStructure := quotientRecord.structure,
                    s3ClassPosition := quotientRecord.s3ClassPosition,
                    s3NormalKernelPosition := quotientRecord.normalPosition,
                    s3ProjectionIndex := quotientRecord.s3ProjectionIndex,
                    subgroup := goursatSubgroup,
                    subgroupIndex := target,
                    subgroupOrder := Size(goursatSubgroup),
                    tomPosition := rightQuotientRecord.b0Descriptor.tomPosition
                  );
                  Add(candidate, candidateDescriptor);
                else
                  existing.automorphismMultiplicity :=
                    existing.automorphismMultiplicity + 1;
                fi;
              od;
            fi;
          fi;
        od;
      fi;
    od;
  od;

  witnessClasses := CVPreparePrimeOrderWitnessClasses(
    input, group, generators);
  publicCandidates := [];
  rejectedCount := 0;
  survivorCount := 0;
  completeWitnessTesting := witnessClasses.catalogueComplete;
  for candidateDescriptor in candidate do
    witnessCheck := CVExactWitnessTestForSubgroup(
      group, candidateDescriptor.subgroup, witnessClasses);
    if not witnessCheck.complete then
      completeWitnessTesting := false;
    elif witnessCheck.outcome = "witness-contaminated" then
      rejectedCount := rejectedCount + 1;
    else
      survivorCount := survivorCount + 1;
    fi;
    Add(publicCandidates, rec(
      automorphismMultiplicity := candidateDescriptor.automorphismMultiplicity,
      b0ComplementClassPosition :=
        candidateDescriptor.b0ComplementClassPosition,
      b0Family := candidateDescriptor.b0Family,
      b0Index := candidateDescriptor.b0Index,
      b0NormalKernelPosition := candidateDescriptor.b0NormalKernelPosition,
      b0Structure := candidateDescriptor.b0Structure,
      commonQuotientOrder := candidateDescriptor.commonQuotientOrder,
      commonQuotientStructure := candidateDescriptor.commonQuotientStructure,
      s3ClassPosition := candidateDescriptor.s3ClassPosition,
      s3NormalKernelPosition := candidateDescriptor.s3NormalKernelPosition,
      s3ProjectionIndex := candidateDescriptor.s3ProjectionIndex,
      subgroupIndex := candidateDescriptor.subgroupIndex,
      subgroupOrder := candidateDescriptor.subgroupOrder,
      tomPosition := candidateDescriptor.tomPosition,
      witnessCheck := witnessCheck
    ));
  od;

  completeEnumeration := ForAll(frontiers, item -> item.complete = true);
  overallComplete := completeEnumeration and completeWitnessTesting;
  if overallComplete and survivorCount = 0 then
    classification := "materialized-and-rejected";
  elif overallComplete and survivorCount > 0 then
    classification := "witness-free-candidate-found";
  else
    classification := "unresolved-resumable-frontier";
  fi;

  return rec(
    admissibleIndex := target,
    b0CandidateCount := Length(bCandidates),
    candidateConjugacyClassCount := Length(candidate),
    classification := classification,
    completeFamilyEnumeration := completeEnumeration,
    completeWitnessTesting := completeWitnessTesting,
    constructedGoursatCountBeforeConjugacyDeduplication := constructedCount,
    exactCandidates := publicCandidates,
    familyCoverage := rec(
      containedNormalFactorSubgroups := rec(
        complete := true,
        method := "all TomLib classes at B0 index divided by two"
      ),
      goursatFiberProducts := rec(
        complete := completeEnumeration,
        method := Concatenation(
          "all normal quotients of A0 and B0 of order at most six, all ",
          "quotient isomorphisms modulo every quotient automorphism")
      ),
      outerAndNonsplitLifts := rec(
        complete := completeEnumeration,
        method := Concatenation(
          "all order-two complement classes outside N_N(K)/K in ",
          "N_B(K)/K, lifted by exact preimage")
      )
    ),
    mathematicalBoundary := Concatenation(
      "Completeness is for subgroups of S3 x (O8-(2):2) at index 97920. ",
      "TomLib exhausts K<=O8-(2); normalizer quotients exhaust outer lifts; ",
      "Goursat data exhausts common quotients with A0<=S3."),
    normalizerQuotientFrontiers := frontiers,
    overallComplete := overallComplete,
    overallDecision := (function()
      if overallComplete and survivorCount = 0 then return "ruled-out"; fi;
      return "unknown";
    end)(),
    productLiftMarksCrossCheck := CVProductLiftTargetOutcome(
      productLiftMarks, target),
    rejectedCandidateCount := rejectedCount,
    requiredExtensionSubgroupIndices := requiredExtensionIndices,
    status := "exact-normalizer-quotient-goursat-enumeration",
    survivingCandidateCount := survivorCount,
    witnessCatalogueComplete := witnessClasses.catalogueComplete,
    witnessImageConjugacyClassCount := Length(witnessClasses.records),
    witnessSourceCount := witnessClasses.sourceWitnessCount
  );
end;;

CVMod2Index97920FamilyReport := function(input, group, generators,
    smallKernel, largeKernel, derived, simpleIsomorphism, atlasSimple, tom,
    s3Classes, classIndices, productLiftMarks)
  local caught, fallback;
  caught := CALL_WITH_CATCH(CVMod2Index97920ExactFamilyReportUnsafe,
    [input, group, generators, smallKernel, largeKernel, derived,
      simpleIsomorphism, atlasSimple, tom, s3Classes, classIndices,
      productLiftMarks]);
  if caught[1] = true and Length(caught) >= 2 then
    return caught[2];
  fi;
  fallback := CVMod2Index97920ArithmeticFrontier(
    input, group, largeKernel, derived, simpleIsomorphism, atlasSimple,
    tom, s3Classes, classIndices, productLiftMarks);
  fallback.exactEnumerationAttempted := true;
  fallback.exactEnumerationComplete := false;
  fallback.resumableFrontier := rec(
    normalFactorIndices := [8160, 16320, 24480, 32640, 48960, 97920],
    operation := Concatenation(
      "Resume exact Tom representative transport, N_B(K)/K complement ",
      "enumeration, Goursat fiber construction, and witness conjugacy tests."),
    status := "gap-exact-api-raised-error"
  );
  return fallback;
end;;

CVMod2AdmissibleIndexClassification := function(targets,
    necessaryTargetIndices, productLiftMarks, special97920)
  return List(targets, function(target)
    local productOutcome;
    productOutcome := CVProductLiftTargetOutcome(productLiftMarks, target);
    if not target in necessaryTargetIndices then
      return rec(
        canonicalProduct := productOutcome,
        classification := "impossible",
        complete := true,
        reason := Concatenation(
          "No S3 projection, O8-(2):2 intersection index, and common ",
          "quotient order satisfy Goursat's index formula."),
        target := target
      );
    fi;
    if target = 97920 and special97920 <> fail then
      if IsBound(special97920.overallComplete)
          and special97920.overallComplete = true then
        return rec(
          canonicalProduct := productOutcome,
          classification := special97920.classification,
          complete := true,
          exactCandidateCount := special97920.candidateConjugacyClassCount,
          familyReport := special97920.familyCoverage,
          reason := Concatenation(
            "All contained-N, outer-surjective, split/nonsplit lift, and ",
            "Goursat candidates at index 97920 were enumerated through ",
            "exact normalizer quotients and tested against the complete ",
            "transferred witness catalogue."),
          target := target
        );
      fi;
      return rec(
        canonicalProduct := productOutcome,
        classification := "unresolved-resumable-frontier",
        complete := false,
        familyReport := special97920.familyCoverage,
        reason := Concatenation(
          "Exact index-97920 enumeration was attempted, but an API frontier ",
          "or incomplete witness catalogue keeps the result fail-closed."),
        target := target
      );
    fi;
    return rec(
      canonicalProduct := productOutcome,
      classification := "unresolved-family-coverage",
      complete := false,
      reason := Concatenation(
        "The necessary index survives. Canonical products are reported, ",
        "but outer and non-product Goursat families were not enumerated at ",
        "this index."),
      target := target
    );
  end);
end;;

# The complete range classifier below supersedes the historical 97920-only
# report.  Internal catalogue records retain GAP groups and homomorphisms; only
# their `public` components are copied into the JSON certificate.
CVSafeNormalQuotientRecordsAtMost := function(subgroup, maximumOrder, context)
  local caught, records;
  caught := CALL_WITH_CATCH(CVNormalQuotientRecordsAtMost,
    [subgroup, maximumOrder]);
  if caught[1] = true and Length(caught) >= 2 then
    records := caught[2];
    return rec(
      complete := true,
      public := rec(
        complete := true,
        context := context,
        quotientCount := Length(records),
        quotients := List(records, item -> rec(
          normalPosition := item.normalPosition,
          order := item.order,
          structure := item.structure
        )),
        status := "all-normal-quotients-through-order-six-enumerated"
      ),
      records := records
    );
  fi;
  return rec(
    complete := false,
    public := rec(
      complete := false,
      context := context,
      quotientCount := 0,
      quotients := [],
      resumeOperation := Concatenation(
        "Run NormalSubgroups for ", context,
        " and retain every quotient of order at most ",
        String(maximumOrder), "."),
      resumeStage := "normal-quotient-enumeration",
      status := "resumable-normal-quotient-frontier"
    ),
    records := []
  );
end;;

CVBuildS3ProjectionCatalogue := function(smallKernel, s3Classes)
  local catalogue, position, subgroup, quotientResult;
  catalogue := [];
  for position in [1..Length(s3Classes)] do
    subgroup := Subgroup(smallKernel,
      GeneratorsOfGroup(Representative(s3Classes[position])));
    quotientResult := CVSafeNormalQuotientRecordsAtMost(
      subgroup, 6, Concatenation("S3 class ", String(position)));
    Add(catalogue, rec(
      classPosition := position,
      complete := quotientResult.complete,
      index := 6 / Size(subgroup),
      order := Size(subgroup),
      quotientPublic := quotientResult.public,
      quotientRecords := quotientResult.records,
      structure := StructureDescription(subgroup),
      subgroup := subgroup
    ));
  od;
  return catalogue;
end;;

CVRequiredB0IndicesForTarget := function(target, leftCatalogue)
  local required, left, quotientOrders, quotientRecord, divisor;
  required := [];
  for left in leftCatalogue do
    if left.complete then
      quotientOrders := Set(List(left.quotientRecords,
        quotientRecord -> quotientRecord.order));
    else
      # This is a conservative frontier only.  A quotient order divides
      # |A0|, so retaining all divisors prevents a failed NormalSubgroups call
      # from silently deleting a possible B0 index.
      quotientOrders := DivisorsInt(left.order);
    fi;
    for quotientRecord in quotientOrders do
      divisor := left.index * quotientRecord;
      if target mod divisor = 0 then
        AddSet(required, target / divisor);
      fi;
    od;
  od;
  return required;
end;;

CVAddB0CandidateConjugacyUnique := function(entry, candidate, extension)
  local existing;
  existing := First(entry.candidates, item ->
    IsConjugate(extension, item.subgroup, candidate.subgroup));
  if existing = fail then
    candidate.sourceMultiplicity := 1;
    Add(entry.candidates, candidate);
  else
    existing.sourceMultiplicity := existing.sourceMultiplicity + 1;
    Append(existing.sourceRecords, candidate.sourceRecords);
  fi;
end;;

CVBuildB0IndexCatalogueEntryUnsafe := function(requiredIndex, extension,
    derived, simpleIsomorphism, atlasSimple, tom, classIndices)
  local entry, normalIndex, tomPosition, atlasSubgroup, subgroup, candidate,
    outerResult, outerCandidate, quotientResult, publicCandidates;

  entry := rec(
    candidates := [],
    complete := true,
    normalizerOperations := [],
    requiredExtensionIndex := requiredIndex
  );

  # B0 <= N has [N:B0]=[B:B0]/2.  Enumerating every N-class and then
  # deduplicating under B-conjugacy also handles pairs of classes interchanged
  # by the outer automorphism.
  if requiredIndex mod 2 = 0 then
    normalIndex := requiredIndex / 2;
    for tomPosition in Positions(classIndices, normalIndex) do
      atlasSubgroup := RepresentativeTomByGenerators(
        tom, tomPosition, GeneratorsOfGroup(atlasSimple));
      CVRequire(atlasSubgroup <> fail,
        "mod2-tom-representative-materialization-failed",
        "A contained-normal-factor Tom class could not be reconstructed.");
      subgroup := PreImage(simpleIsomorphism, atlasSubgroup);
      subgroup := Subgroup(derived, GeneratorsOfGroup(subgroup));
      CVRequire(Index(extension, subgroup) = requiredIndex,
        "mod2-contained-lift-index-mismatch",
        "A contained-normal-factor subgroup has the wrong extension index.");
      candidate := rec(
        complementClassPosition := 0,
        family := "contained-in-normal-factor",
        normalFactorIndex := normalIndex,
        requiredExtensionIndex := requiredIndex,
        sourceRecords := [rec(
          family := "contained-in-normal-factor",
          normalFactorIndex := normalIndex,
          tomPosition := tomPosition
        )],
        structure := StructureDescription(subgroup),
        subgroup := Subgroup(extension, GeneratorsOfGroup(subgroup)),
        tomPosition := tomPosition
      );
      CVAddB0CandidateConjugacyUnique(entry, candidate, extension);
    od;
  fi;

  # B0 maps onto B/N precisely when K=B0 intersect N has [N:K]=[B:B0].
  # The transporter-normalizer quotient enumerates split and nonsplit lifts
  # uniformly; no table of marks for the full extension is assumed.
  normalIndex := requiredIndex;
  for tomPosition in Positions(classIndices, normalIndex) do
    atlasSubgroup := RepresentativeTomByGenerators(
      tom, tomPosition, GeneratorsOfGroup(atlasSimple));
    CVRequire(atlasSubgroup <> fail,
      "mod2-tom-representative-materialization-failed",
      "An outer-lift Tom class could not be reconstructed.");
    subgroup := PreImage(simpleIsomorphism, atlasSubgroup);
    subgroup := Subgroup(derived, GeneratorsOfGroup(subgroup));
    outerResult := CVOuterLiftsFromNormalizerQuotient(
      extension, derived, subgroup, tomPosition, requiredIndex);
    outerResult.public.diagonalTomMark := CVTomMark(tom, tomPosition, tomPosition);
    Add(entry.normalizerOperations, outerResult.public);
    if not outerResult.complete then
      entry.complete := false;
    fi;
    for outerCandidate in outerResult.candidates do
      candidate := ShallowCopy(outerCandidate);
      candidate.sourceRecords := [rec(
        complementClassPosition := outerCandidate.complementClassPosition,
        diagonalTomMark := CVTomMark(tom, tomPosition, tomPosition),
        family := "outer-surjective",
        normalFactorIndex := normalIndex,
        tomPosition := tomPosition
      )];
      CVAddB0CandidateConjugacyUnique(entry, candidate, extension);
    od;
  od;

  publicCandidates := [];
  for candidate in entry.candidates do
    quotientResult := CVSafeNormalQuotientRecordsAtMost(
      candidate.subgroup, 6,
      Concatenation("B0 index ", String(requiredIndex),
        " class ", String(Length(publicCandidates) + 1)));
    candidate.quotientRecords := quotientResult.records;
    candidate.quotientsComplete := quotientResult.complete;
    candidate.quotientPublic := quotientResult.public;
    if not quotientResult.complete then
      entry.complete := false;
    fi;
    Add(publicCandidates, rec(
      classPosition := Length(publicCandidates) + 1,
      family := candidate.family,
      normalFactorIndex := candidate.normalFactorIndex,
      quotientCatalogue := quotientResult.public,
      sourceMultiplicity := candidate.sourceMultiplicity,
      sourceRecords := candidate.sourceRecords,
      structure := candidate.structure,
      tomPosition := candidate.tomPosition
    ));
  od;

  entry.public := rec(
    candidateConjugacyClassCount := Length(entry.candidates),
    checkpoint := rec(
      completedCandidateClasses := Length(entry.candidates),
      phase := "B0-lifts-and-small-normal-quotients",
      requiredExtensionIndex := requiredIndex
    ),
    complete := entry.complete,
    normalizerQuotientOperations := entry.normalizerOperations,
    requiredExtensionIndex := requiredIndex,
    subgroupClasses := publicCandidates,
    status := (function()
      if entry.complete then return "complete"; fi;
      return "unresolved-resumable-frontier";
    end)()
  );
  return entry;
end;;

CVBuildB0IndexCatalogueEntry := function(requiredIndex, extension, derived,
    simpleIsomorphism, atlasSimple, tom, classIndices)
  local caught;
  caught := CALL_WITH_CATCH(CVBuildB0IndexCatalogueEntryUnsafe,
    [requiredIndex, extension, derived, simpleIsomorphism, atlasSimple,
      tom, classIndices]);
  if caught[1] = true and Length(caught) >= 2 then
    return caught[2];
  fi;
  return rec(
    candidates := [],
    complete := false,
    normalizerOperations := [],
    public := rec(
      candidateConjugacyClassCount := 0,
      checkpoint := rec(
        completedCandidateClasses := 0,
        phase := "B0-lifts-and-small-normal-quotients",
        requiredExtensionIndex := requiredIndex
      ),
      complete := false,
      normalizerQuotientOperations := [],
      requiredExtensionIndex := requiredIndex,
      resumeOperation := Concatenation(
        "Materialize every Tom K class at indices ",
        String(requiredIndex / 2), " (contained case, when integral) and ",
        String(requiredIndex), " (outer-surjective case), then resume exact ",
        "transporter/normalizer-quotient lift enumeration."),
      resumeStage := "B0-catalogue",
      status := "gap-exact-api-raised-error",
      subgroupClasses := []
    ),
    requiredExtensionIndex := requiredIndex
  );
end;;

CVBuildB0Catalogue := function(requiredIndices, extension, derived,
    simpleIsomorphism, atlasSimple, tom, classIndices)
  return List(requiredIndices, requiredIndex ->
    CVBuildB0IndexCatalogueEntry(requiredIndex, extension, derived,
      simpleIsomorphism, atlasSimple, tom, classIndices));
end;;

CVB0CatalogueEntry := function(catalogue, requiredIndex)
  return First(catalogue,
    entry -> entry.requiredExtensionIndex = requiredIndex);
end;;

CVCommonSmallQuotientOrders := function(leftRecords, rightRecords)
  local orders, leftRecord, rightRecord, isomorphism;
  orders := [];
  for leftRecord in leftRecords do
    for rightRecord in rightRecords do
      if leftRecord.order = rightRecord.order then
        isomorphism := IsomorphismGroups(
          leftRecord.quotient, rightRecord.quotient);
        if isomorphism <> fail then
          AddSet(orders, leftRecord.order);
        fi;
      fi;
    od;
  od;
  return orders;
end;;

CVSubdirectPairUnsafe := function(ambientGroup, smallFactor, largeFactor,
    left, b0Candidate, requestedTargets)
  local leftSubgroup, rightSubgroup, commonOrders, subdirects, candidates,
    position, subgroup, commonOrder, target;
  leftSubgroup := Subgroup(smallFactor,
    GeneratorsOfGroup(left.subgroup));
  rightSubgroup := Subgroup(largeFactor,
    GeneratorsOfGroup(b0Candidate.subgroup));
  CVRequire(Size(Intersection(leftSubgroup, rightSubgroup)) = 1,
    "mod2-product-factor-intersection-nontrivial",
    "The S3 and extension projection subgroups intersect nontrivially.");
  CVRequire(Size(CommutatorSubgroup(
      leftSubgroup, rightSubgroup)) = 1,
    "mod2-product-factors-do-not-commute",
    "The certified direct factors do not centralize one another.");
  commonOrders := CVCommonSmallQuotientOrders(
    left.quotientRecords, b0Candidate.quotientRecords);
  subdirects := SubdirectProducts(leftSubgroup, rightSubgroup);
  candidates := [];
  for position in [1..Length(subdirects)] do
    subgroup := Subgroup(ambientGroup,
      GeneratorsOfGroup(subdirects[position]));
    commonOrder := Size(leftSubgroup) * Size(rightSubgroup)
      / Size(subgroup);
    CVRequire(IsInt(commonOrder) and commonOrder in commonOrders,
      "mod2-subdirect-common-quotient-mismatch",
      "SubdirectProducts returned an unaccounted common quotient.");
    target := left.index * b0Candidate.requiredExtensionIndex * commonOrder;
    CVRequire(Index(ambientGroup, subgroup) = target,
      "mod2-subdirect-index-mismatch",
      "A subdirect product has the wrong ambient index.");
    if target in requestedTargets then
      Add(candidates, rec(
        b0Family := b0Candidate.family,
        b0Index := b0Candidate.requiredExtensionIndex,
        b0SourceRecords := b0Candidate.sourceRecords,
        b0Structure := b0Candidate.structure,
        commonQuotientOrder := commonOrder,
        s3ClassPosition := left.classPosition,
        s3Order := left.order,
        s3ProjectionIndex := left.index,
        sourceRows := [rec(
          b0ClassTomPosition := b0Candidate.tomPosition,
          b0Index := b0Candidate.requiredExtensionIndex,
          commonQuotientOrder := commonOrder,
          s3ClassPosition := left.classPosition,
          s3Order := left.order,
          subdirectClassPosition := position
        )],
        subgroup := subgroup,
        subgroupIndex := target,
        subgroupOrder := Size(subgroup),
        subdirectClassPosition := position,
        tomPosition := b0Candidate.tomPosition
      ));
    fi;
  od;
  return rec(
    candidates := candidates,
    complete := true,
    public := rec(
      b0Index := b0Candidate.requiredExtensionIndex,
      commonQuotientOrders := commonOrders,
      complete := true,
      enumeratedSubdirectClassCount := Length(subdirects),
      retainedRequestedTargetCount := Length(candidates),
      s3ClassPosition := left.classPosition,
      s3ProjectionIndex := left.index,
      status := "all-subdirect-products-enumerated",
      targetIndices := Set(List(candidates, item -> item.subgroupIndex))
    )
  );
end;;

CVPotentialPairTargetIndices := function(left, b0Candidate, requestedTargets)
  local commonOrders;
  commonOrders := DivisorsInt(Gcd(left.order, Size(b0Candidate.subgroup)));
  return Intersection(requestedTargets,
    Set(List(commonOrders, commonOrder ->
      left.index * b0Candidate.requiredExtensionIndex * commonOrder)));
end;;

CVSkippedSubdirectPairFrontier := function(left, b0Candidate, targetIndices)
  return rec(
    b0Index := b0Candidate.requiredExtensionIndex,
    commonQuotientOrders := [],
    complete := false,
    enumeratedSubdirectClassCount := 0,
    retainedRequestedTargetCount := 0,
    resumeOperation := Concatenation(
      "Complete the missing normal-quotient catalogue for S3 class ",
      String(left.classPosition), " or B0 index ",
      String(b0Candidate.requiredExtensionIndex),
      ", then run SubdirectProducts and exact ambient conjugacy deduplication."),
    resumeStage := "skipped-subdirect-pair-after-quotient-frontier",
    s3ClassPosition := left.classPosition,
    s3ProjectionIndex := left.index,
    status := "resumable-skipped-subdirect-pair",
    targetIndices := targetIndices
  );
end;;

CVSubdirectPair := function(ambientGroup, smallFactor, largeFactor, left,
    b0Candidate, requestedTargets)
  local caught;
  caught := CALL_WITH_CATCH(CVSubdirectPairUnsafe,
    [ambientGroup, smallFactor, largeFactor, left, b0Candidate,
      requestedTargets]);
  if caught[1] = true and Length(caught) >= 2 then
    return caught[2];
  fi;
  return rec(
    candidates := [],
    complete := false,
    public := rec(
      b0Index := b0Candidate.requiredExtensionIndex,
      commonQuotientOrders := [],
      complete := false,
      enumeratedSubdirectClassCount := 0,
      resumeOperation := Concatenation(
        "Run SubdirectProducts for S3 class ", String(left.classPosition),
        " and B0 index ", String(b0Candidate.requiredExtensionIndex),
        ", filter by exact subgroup index, and deduplicate in the full image."),
      resumeStage := "subdirect-product-enumeration",
      s3ClassPosition := left.classPosition,
      s3ProjectionIndex := left.index,
      status := "gap-subdirect-products-raised-error",
      targetIndices := requestedTargets
    )
  );
end;;

CVAddExactCandidateConjugacyUnique := function(candidates, candidate,
    ambientGroup)
  local existing;
  existing := First(candidates, item ->
    item.subgroupIndex = candidate.subgroupIndex
      and IsConjugate(ambientGroup, item.subgroup, candidate.subgroup));
  if existing = fail then
    candidate.sourceMultiplicity := 1;
    Add(candidates, candidate);
  else
    existing.sourceMultiplicity := existing.sourceMultiplicity + 1;
    Append(existing.sourceRows, candidate.sourceRows);
  fi;
end;;

CVProductMarksRejectionForCandidate := function(productLiftMarks, candidate)
  local containedSource;
  if candidate.commonQuotientOrder <> 1
      or not IsBound(productLiftMarks.completeForProductLiftScope)
      or productLiftMarks.completeForProductLiftScope <> true
      or not IsBound(productLiftMarks.rejectionEvidence) then
    return fail;
  fi;
  containedSource := First(candidate.b0SourceRecords,
    source -> source.family = "contained-in-normal-factor");
  if containedSource = fail then
    return fail;
  fi;
  return First(productLiftMarks.rejectionEvidence, evidence ->
    evidence.targetIndex = candidate.subgroupIndex
      and evidence.s3ClassPosition = candidate.s3ClassPosition
      and evidence.tomPosition = containedSource.tomPosition);
end;;

CVRowsCanonicalText := function(rows)
  return Concatenation("[", JoinStringsWithSeparator(
    List(rows, row -> Concatenation("[", JoinStringsWithSeparator(
      List(row, String), ","), "]")), ","), "]");
end;;

CVCompactSubgroupMaterialization := function(input, ambientGroup, subgroup)
  local reparented, compactGenerators, rows, canonicalText, reconstructed;
  reparented := Subgroup(ambientGroup, GeneratorsOfGroup(subgroup));
  compactGenerators := GeneratorsOfGroup(reparented);
  rows := List(compactGenerators,
    generator -> ListPerm(generator, input.degree));
  canonicalText := CVRowsCanonicalText(rows);
  reconstructed := Subgroup(ambientGroup, List(rows, PermList));
  CVRequire(Size(reconstructed) = Size(reparented)
      and Index(ambientGroup, reconstructed) = Index(ambientGroup, reparented),
    "mod2-compact-subgroup-row-roundtrip-failed",
    "Compact 122-point subgroup generator rows did not reconstruct the subgroup.");
  return rec(
    ambientActionDegree := input.degree,
    ambientActionSha256 := input.actionSha256,
    hashEncoding := Concatenation(
      "sha256(actionSha256 + ':' + canonical compact generator rows; ",
      "rows use JSON-style brackets and decimal point images)"),
    subgroupGeneratorCount := Length(rows),
    subgroupGeneratorRows := rows,
    subgroupGeneratorRowsSha256 := HexSHA256(Concatenation(
      input.actionSha256, ":", canonicalText)),
    subgroupIndex := Index(ambientGroup, reparented),
    subgroupOrder := Size(reparented)
  );
end;;

CVPublicExactCandidate := function(candidate)
  local public;
  public := rec(
    b0Family := candidate.b0Family,
    b0Index := candidate.b0Index,
    b0SourceRecords := candidate.b0SourceRecords,
    b0Structure := candidate.b0Structure,
    commonQuotientOrder := candidate.commonQuotientOrder,
    s3ClassPosition := candidate.s3ClassPosition,
    s3Order := candidate.s3Order,
    s3ProjectionIndex := candidate.s3ProjectionIndex,
    sourceMultiplicity := candidate.sourceMultiplicity,
    sourceRows := candidate.sourceRows,
    subgroupIndex := candidate.subgroupIndex,
    subgroupOrder := candidate.subgroupOrder,
    tomPosition := candidate.tomPosition,
    witnessCheck := candidate.witnessCheck
  );
  if IsBound(candidate.materialization) then
    public.compactSubgroupMaterialization := candidate.materialization;
  fi;
  return public;
end;;

CVIndex97920Audit := function(b0Catalogue, candidates)
  local expectedB0Counts, observedB0Counts, expectedRows, observedRows,
    item, entry, filtered;
  expectedB0Counts := [
    rec(candidateCount := 1, index := 16320),
    rec(candidateCount := 3, index := 32640),
    rec(candidateCount := 1, index := 48960),
    rec(candidateCount := 1, index := 97920)
  ];
  observedB0Counts := [];
  for item in expectedB0Counts do
    entry := CVB0CatalogueEntry(b0Catalogue, item.index);
    Add(observedB0Counts, rec(
      candidateCount := (function()
        if entry = fail then return 0; fi;
        return Length(entry.candidates);
      end)(),
      index := item.index
    ));
  od;
  expectedRows := [
    rec(b0Index := 16320, commonQuotientOrder := 1, count := 1, s3Order := 1),
    rec(b0Index := 32640, commonQuotientOrder := 1, count := 3, s3Order := 2),
    rec(b0Index := 16320, commonQuotientOrder := 2, count := 3, s3Order := 2),
    rec(b0Index := 48960, commonQuotientOrder := 1, count := 1, s3Order := 3),
    rec(b0Index := 16320, commonQuotientOrder := 3, count := 0, s3Order := 3),
    rec(b0Index := 97920, commonQuotientOrder := 1, count := 1, s3Order := 6),
    rec(b0Index := 48960, commonQuotientOrder := 2, count := 1, s3Order := 6),
    rec(b0Index := 16320, commonQuotientOrder := 6, count := 0, s3Order := 6)
  ];
  observedRows := [];
  for item in expectedRows do
    filtered := Filtered(candidates, candidate ->
      candidate.subgroupIndex = 97920
        and candidate.b0Index = item.b0Index
        and candidate.commonQuotientOrder = item.commonQuotientOrder
        and candidate.s3Order = item.s3Order);
    Add(observedRows, rec(
      b0Index := item.b0Index,
      commonQuotientOrder := item.commonQuotientOrder,
      count := Length(filtered),
      s3Order := item.s3Order
    ));
  od;
  return rec(
    candidateConjugacyClassCount := Number(candidates,
      candidate -> candidate.subgroupIndex = 97920),
    expectedB0ClassCounts := expectedB0Counts,
    expectedCandidateConjugacyClassCount := 10,
    expectedGoursatRows := expectedRows,
    observedB0ClassCounts := observedB0Counts,
    observedGoursatRows := observedRows,
    passed := observedB0Counts = expectedB0Counts
      and observedRows = expectedRows
      and Number(candidates,
        candidate -> candidate.subgroupIndex = 97920) = 10,
    source := "independent GAP normalizer-quotient and Goursat audit"
  );
end;;

CVMod2ExactFamilyLedger := function(input, group, generators, smallKernel,
    largeKernel, derived, simpleIsomorphism, atlasSimple, tom, s3Classes,
    classIndices, targets, necessaryTargetIndices, productLiftMarks)
  local survivingTargets, leftCatalogue, requiredByTarget, requiredBIndices,
    target, required, b0Catalogue, left, b0Entry, b0Candidate,
    commonOrders, possibleTargets, pairResult, pairReports, candidates,
    candidate, productRejection, witnessClasses, audit97920, ledger,
    targetCandidates, rejectedCandidates, witnessFreeCandidates,
    requiredEntries, relevantPairReports, relevantLeftPositions,
    relevantLeftEntries, frontiers, item,
    familyComplete, witnessComplete, classification, complete,
    publicCandidates, publicLeftCatalogue, cacheSummary;

  survivingTargets := Intersection(targets, necessaryTargetIndices);
  leftCatalogue := CVBuildS3ProjectionCatalogue(smallKernel, s3Classes);
  requiredByTarget := [];
  requiredBIndices := [];
  for target in survivingTargets do
    required := CVRequiredB0IndicesForTarget(target, leftCatalogue);
    Add(requiredByTarget, rec(indices := required, target := target));
    UniteSet(requiredBIndices, required);
  od;
  b0Catalogue := CVBuildB0Catalogue(requiredBIndices, largeKernel, derived,
    simpleIsomorphism, atlasSimple, tom, classIndices);

  pairReports := [];
  candidates := [];
  for left in leftCatalogue do
    for b0Entry in b0Catalogue do
      for b0Candidate in b0Entry.candidates do
        if left.complete and b0Candidate.quotientsComplete then
          commonOrders := CVCommonSmallQuotientOrders(
            left.quotientRecords, b0Candidate.quotientRecords);
          possibleTargets := Intersection(survivingTargets,
            Set(List(commonOrders, commonOrder ->
              left.index * b0Candidate.requiredExtensionIndex
                * commonOrder)));
          if Length(possibleTargets) > 0 then
            pairResult := CVSubdirectPair(
              group, smallKernel, largeKernel, left, b0Candidate,
              possibleTargets);
            Add(pairReports, pairResult.public);
            for candidate in pairResult.candidates do
              CVAddExactCandidateConjugacyUnique(
              candidates, candidate, group);
            od;
          fi;
        else
          possibleTargets := CVPotentialPairTargetIndices(
            left, b0Candidate, survivingTargets);
          if Length(possibleTargets) > 0 then
            Add(pairReports, CVSkippedSubdirectPairFrontier(
              left, b0Candidate, possibleTargets));
          fi;
        fi;
      od;
    od;
  od;

  witnessClasses := CVPreparePrimeOrderWitnessClasses(
    input, group, generators);
  for candidate in candidates do
    productRejection := CVProductMarksRejectionForCandidate(
      productLiftMarks, candidate);
    if productRejection <> fail then
      candidate.witnessCheck := rec(
        complete := true,
        method := "Tom fixed-point marks on the canonical product action",
        outcome := "witness-contaminated",
        rejectedByPrimeOrder := productRejection.primeOrder,
        rejectedByWitnessWord := productRejection.witnessWord,
        testedImageConjugacyClassCount := 1
      );
    else
      candidate.witnessCheck := CVExactWitnessTestForSubgroup(
        group, candidate.subgroup, witnessClasses);
      candidate.witnessCheck.method :=
        "exact subgroup conjugacy-class intersection in the finite image";
    fi;
    if candidate.witnessCheck.complete
        and candidate.witnessCheck.outcome
          = "all-supplied-witnesses-fixed-point-free" then
      candidate.materialization := CVCompactSubgroupMaterialization(
        input, group, candidate.subgroup);
    fi;
  od;

  audit97920 := fail;
  if 97920 in survivingTargets then
    audit97920 := CVIndex97920Audit(b0Catalogue, candidates);
  fi;
  ledger := [];
  for target in targets do
    if not target in necessaryTargetIndices then
      Add(ledger, rec(
        canonicalProduct := CVProductLiftTargetOutcome(
          productLiftMarks, target),
        classification := "impossible",
        complete := true,
        completeFamilyEnumeration := true,
        completeWitnessTesting := true,
        exactCandidateCount := 0,
        reason := Concatenation(
          "No S3 projection, O8-(2):2 projection index, and common quotient ",
          "satisfy Goursat's exact index formula."),
        resumableFrontiers := [],
        target := target
      ));
    else
      required := First(requiredByTarget, record -> record.target = target).indices;
      requiredEntries := List(required,
        requiredIndex -> CVB0CatalogueEntry(b0Catalogue, requiredIndex));
      relevantPairReports := Filtered(pairReports, report ->
        target in report.targetIndices);
      targetCandidates := Filtered(candidates,
        candidate -> candidate.subgroupIndex = target);
      rejectedCandidates := Filtered(targetCandidates, candidate ->
        candidate.witnessCheck.complete
          and candidate.witnessCheck.outcome = "witness-contaminated");
      witnessFreeCandidates := Filtered(targetCandidates, candidate ->
        candidate.witnessCheck.complete
          and candidate.witnessCheck.outcome
            = "all-supplied-witnesses-fixed-point-free");
      relevantLeftPositions := Set(List(relevantPairReports,
        report -> report.s3ClassPosition));
      relevantLeftEntries := Filtered(leftCatalogue,
        left -> left.classPosition in relevantLeftPositions);
      familyComplete := ForAll(requiredEntries,
          entry -> entry <> fail and entry.complete)
        and ForAll(relevantLeftEntries, left -> left.complete)
        and ForAll(relevantPairReports, report -> report.complete);
      witnessComplete := ForAll(targetCandidates,
        candidate -> candidate.witnessCheck.complete);
      frontiers := [];
      for item in requiredEntries do
        if item = fail then
          Add(frontiers, rec(
            requiredExtensionIndex := required[Position(requiredEntries, item)],
            resumeOperation := "Build the missing B0 catalogue entry.",
            resumeStage := "B0-catalogue",
            status := "missing-cache-entry"
          ));
        elif not item.complete then
          Add(frontiers, item.public);
        fi;
      od;
      for item in relevantPairReports do
        if not item.complete then Add(frontiers, item); fi;
      od;
      for item in relevantLeftEntries do
        if not item.complete then
          Add(frontiers, rec(
            quotientCatalogue := item.quotientPublic,
            resumeOperation := Concatenation(
              "Complete all normal quotients of S3 class ",
              String(item.classPosition), " before classifying target ",
              String(target), "."),
            resumeStage := "S3-normal-quotient-catalogue",
            s3ClassPosition := item.classPosition,
            status := "resumable-left-quotient-frontier",
            target := target
          ));
        fi;
      od;
      for item in targetCandidates do
        if not item.witnessCheck.complete then
          Add(frontiers, rec(
            candidateSourceRows := item.sourceRows,
            resumeOperation := item.witnessCheck.resumeOperation,
            resumeStage := item.witnessCheck.resumeStage,
            status := item.witnessCheck.outcome,
            target := target
          ));
        fi;
      od;
      if target = 97920 and audit97920 <> fail and not audit97920.passed then
        familyComplete := false;
        Add(frontiers, rec(
          audit := audit97920,
          resumeOperation := Concatenation(
            "Reconcile the 97920 B0 and Goursat row counts with the ",
            "independent ten-class GAP audit."),
          resumeStage := "index-97920-independent-count-audit",
          status := "exact-candidate-count-mismatch"
        ));
      fi;

      if Length(witnessFreeCandidates) > 0 then
        classification := "witness-free-candidate-found";
        complete := familyComplete and witnessComplete;
      elif familyComplete and witnessComplete
          and Length(targetCandidates) = 0 then
        classification := "impossible";
        complete := true;
      elif familyComplete and witnessComplete
          and Length(rejectedCandidates) = Length(targetCandidates) then
        classification := "materialized-and-rejected";
        complete := true;
      else
        classification := "unresolved-resumable-frontier";
        complete := false;
      fi;
      publicCandidates := List(targetCandidates, CVPublicExactCandidate);
      Add(ledger, rec(
        canonicalProduct := CVProductLiftTargetOutcome(
          productLiftMarks, target),
        certifiedTorsionFreeCandidateCount := 0,
        checkpoint := rec(
          b0CacheIndices := required,
          completedCandidateClasses := Length(targetCandidates),
          phase := (function()
            if complete then return "classified"; fi;
            return "resumable-exact-family-frontier";
          end)(),
          target := target
        ),
        classification := classification,
        complete := complete,
        completeFamilyEnumeration := familyComplete,
        completeWitnessTesting := witnessComplete,
        exactCandidateCount := Length(targetCandidates),
        exactCandidates := publicCandidates,
        independentIndex97920Audit := (function()
          if target = 97920 then return audit97920; fi;
          return rec(applicable := false);
        end)(),
        materializedAndRejectedCount := Length(rejectedCandidates),
        reason := (function()
          if classification = "witness-free-candidate-found" then
            return Concatenation(
              "An exact subgroup avoids every conjugacy class in the ",
              "complete prime-order spherical torsion witness catalogue. ",
              "This is not a final torsion-free-cover certificate until ",
              "Python reconstructs Q/H and independently checks every ",
              "spherical subgroup orbit.");
          elif classification = "materialized-and-rejected" then
            return Concatenation(
              "Every exact subgroup class was materialized and contains a ",
              "conjugate of a prime-order spherical torsion witness.");
          elif classification = "impossible" then
            return "Complete exact family enumeration produced no subgroup class.";
          fi;
          return Concatenation(
            "A concrete GAP operation or the transferred witness catalogue ",
            "remains incomplete; no exclusion or existence claim is made.");
        end)(),
        requiredExtensionSubgroupIndices := required,
        resumableFrontiers := frontiers,
        target := target,
        witnessFreeCandidateCount := Length(witnessFreeCandidates)
      ));
    fi;
  od;

  publicLeftCatalogue := List(leftCatalogue, left -> rec(
    classPosition := left.classPosition,
    complete := left.complete,
    index := left.index,
    order := left.order,
    quotientCatalogue := left.quotientPublic,
    structure := left.structure
  ));
  cacheSummary := rec(
    b0Catalogue := List(b0Catalogue, entry -> entry.public),
    b0IndexCount := Length(requiredBIndices),
    b0Indices := requiredBIndices,
    exactCandidateConjugacyClassCount := Length(candidates),
    leftProjectionCatalogue := publicLeftCatalogue,
    reusePolicy := Concatenation(
      "Each Tom representative, transporter-normalizer quotient, B0 normal ",
      "quotient, and S3/B0 SubdirectProducts pair is computed once and ",
      "shared by every requested target."),
    subdirectPairOperationCount := Length(pairReports),
    subdirectPairOperations := pairReports
  );
  return rec(
    cache := cacheSummary,
    completeForEveryAdmissibleIndex := ForAll(ledger,
      row -> row.complete = true),
    ledger := ledger,
    method := Concatenation(
      "complete O8-(2) Tom classes; exact transporter-normalizer quotients ",
      "in O8-(2):2; GAP SubdirectProducts for every S3/B0 pair; exact ",
      "prime-order witness intersection tests before any coset action"),
    survivingNecessarySieveTargets := survivingTargets,
    witnessCatalogue := rec(
      complete := witnessClasses.catalogueComplete,
      imageConjugacyClassCount := Length(witnessClasses.records),
      sourceWitnessCount := witnessClasses.sourceWitnessCount,
      status := witnessClasses.status
    )
  );
end;;

CVCertifyMod2StructureAndIndices := function(input, checked)
  local group, orbit3, orbit119, action3, action119, largeKernel,
    smallKernel, intersection, generatedProduct, mutualCommutator, smallId,
    derived, derivedSimple, derivedIndex, derivedCentralizer, atlasSimple,
    atlasExtension, simpleIsomorphism, extensionIsomorphism, tom,
    subgroupOrders, simpleOrder, classIndices, boundedClassIndices,
    historicalBound, non17HistoricalIndices, non17BoundedIndices,
    expectedPossible, possibleNon17Indices,
    subgroupOrdersS3, s3Classes, s3ProjectionData, extensionOrder,
    extensionProjectionIndexOccurrences, extensionProjectionIndices,
    necessaryTargetIndices, leftProjection, rightIndex, rightOrder,
    quotientOrder, candidateIndex, targets, detailedDecisions, decisions,
    candidateTargetDecisions, allTargetsDecided, productLiftMarks,
    exactFamilyClassification, classificationRow,
    admissibleIndexClassification;

  CV_STAGE := "mod2-orbit-kernels";
  CVRequire(checked.public.orbitSizes = [3, 119],
    "mod2-orbit-profile-mismatch",
    "The certified mod-2 branch requires orbit sizes [3,119].");
  group := checked.group;
  orbit3 := First(checked.orbits, orbit -> Length(orbit) = 3);
  orbit119 := First(checked.orbits, orbit -> Length(orbit) = 119);
  CVRequire(orbit3 <> fail and orbit119 <> fail,
    "mod2-orbit-profile-mismatch", "Required mod-2 orbits were not found.");

  action3 := ActionHomomorphism(group, orbit3, OnPoints);
  action119 := ActionHomomorphism(group, orbit119, OnPoints);
  largeKernel := Kernel(action3);
  smallKernel := Kernel(action119);
  intersection := Intersection(smallKernel, largeKernel);
  generatedProduct := ClosureGroup(smallKernel, largeKernel);
  mutualCommutator := CommutatorSubgroup(smallKernel, largeKernel);

  CVRequire(Size(Image(action3)) = 6, "mod2-orbit-action-order-mismatch",
    "The degree-3 orbit action must have image order 6.");
  CVRequire(Size(Image(action119)) = 394813440,
    "mod2-orbit-action-order-mismatch",
    "The degree-119 orbit action must have image order 394813440.");
  CVRequire(Size(smallKernel) = 6 and Size(largeKernel) = 394813440,
    "mod2-kernel-order-mismatch", "The two orbit kernels have unexpected orders.");
  CVRequire(Size(intersection) = 1, "mod2-kernel-intersection-nontrivial",
    "The orbit kernels do not have trivial intersection.");
  CVRequire(Size(generatedProduct) = Size(group), "mod2-kernels-do-not-generate",
    "The orbit kernels do not generate the full mod-2 image.");
  CVRequire(Size(mutualCommutator) = 1, "mod2-kernels-do-not-commute",
    "The orbit kernels do not centralize one another.");

  CV_STAGE := "mod2-atlas-identification";
  CVRequire(LoadPackage("AtlasRep", false) = true,
    "missing-atlasrep-package", "AtlasRep is required for the mod-2 certificate.");
  smallId := IdGroup(smallKernel);
  CVRequire(smallId = [6, 1], "mod2-small-kernel-not-s3",
    "The order-6 orbit kernel was not identified as S3.");

  derived := DerivedSubgroup(largeKernel);
  derivedSimple := IsSimpleGroup(derived);
  derivedIndex := Index(largeKernel, derived);
  derivedCentralizer := Centralizer(largeKernel, derived);
  CVRequire(Size(derived) = 197406720 and derivedSimple = true,
    "mod2-derived-subgroup-mismatch",
    "The large kernel derived subgroup is not the expected simple group.");
  CVRequire(derivedIndex = 2, "mod2-derived-index-mismatch",
    "The simple derived subgroup must have index 2 in the large kernel.");
  CVRequire(Size(derivedCentralizer) = 1, "mod2-derived-centralizer-nontrivial",
    "The centralizer of the simple derived subgroup must be trivial.");

  atlasSimple := AtlasGroup("O8-(2)");
  atlasExtension := AtlasGroup("O8-(2).2");
  CVRequire(atlasSimple <> fail and atlasExtension <> fail,
    "atlas-group-unavailable", "Required O8-(2) ATLAS groups are unavailable.");
  simpleIsomorphism := IsomorphismGroups(derived, atlasSimple);
  extensionIsomorphism := IsomorphismGroups(largeKernel, atlasExtension);
  CVRequire(simpleIsomorphism <> fail and IsBijective(simpleIsomorphism),
    "mod2-simple-atlas-isomorphism-failed",
    "Could not certify a bijective isomorphism to AtlasGroup(\"O8-(2)\").");
  CVRequire(extensionIsomorphism <> fail and IsBijective(extensionIsomorphism),
    "mod2-extension-atlas-isomorphism-failed",
    "Could not certify a bijective isomorphism to AtlasGroup(\"O8-(2).2\").");

  CV_STAGE := "mod2-table-of-marks";
  CVRequire(LoadPackage("TomLib", false) = true,
    "missing-tomlib-package", "TomLib is required for complete index screening.");
  tom := TableOfMarks("O8-(2)");
  CVRequire(tom <> fail, "mod2-table-of-marks-unavailable",
    "TomLib did not provide TableOfMarks(\"O8-(2)\").");
  subgroupOrders := OrdersTom(tom);
  simpleOrder := Size(derived);
  CVRequire(Length(subgroupOrders) = 5351,
    "mod2-table-of-marks-class-count-mismatch",
    "The O8-(2) table of marks did not contain the expected 5351 classes.");
  CVRequire(Maximum(subgroupOrders) = simpleOrder,
    "mod2-table-of-marks-order-mismatch",
    "The O8-(2) table of marks has the wrong ambient group order.");
  CVRequire(ForAll(subgroupOrders, order -> simpleOrder mod order = 0),
    "mod2-table-of-marks-invalid-order",
    "A table-of-marks subgroup order did not divide |O8-(2)|.");

  classIndices := List(subgroupOrders, order -> simpleOrder / order);
  boundedClassIndices := Filtered(classIndices, index -> index <= input.maxIndex);
  non17BoundedIndices := Set(Filtered(
    boundedClassIndices, index -> index mod 17 <> 0));
  historicalBound := Minimum(input.maxIndex, 23040);
  non17HistoricalIndices := Set(Filtered(
    classIndices,
    index -> index <= historicalBound and index mod 17 <> 0));
  CVRequire(non17HistoricalIndices = [1],
    "mod2-historical-non17-index-obstruction-failed",
    Concatenation(
      "The O8-(2) non-17 index obstruction changed in its certified ",
      "range through 23040."));

  # Goursat's lemma is needed here: S3 and O8-(2).2 share a C2 quotient, so
  # subgroups of the direct product need not split as products. Through index
  # 23040, TomLib forces every non-17 projection to the large factor to contain
  # N=O8-(2), hence that projection is N or B=O8-(2).2.
  # For B0=N the common quotient is trivial.  For B0=B the only common quotient
  # with a subgroup of S3 is 1 or C2.  The formula
  #   [S3 x B : H] = [S3:A0] [B:B0] |C|
  # therefore gives exactly the six indices checked below.
  subgroupOrdersS3 := Set(List(
    ConjugacyClassesSubgroups(smallKernel),
    class -> Size(Representative(class))));
  CVRequire(subgroupOrdersS3 = [1, 2, 3, 6],
    "mod2-s3-subgroup-orders-mismatch",
    "The certified S3 factor has an unexpected subgroup-order spectrum.");
  expectedPossible := [1, 2, 3, 4, 6, 12];
  possibleNon17Indices := Set(Flat([
    # B0=N, C=1: [B:N]=2 and A0 ranges over subgroups of S3.
    List(subgroupOrdersS3, order -> (6 / order) * 2),
    # B0=B, C=1.
    List(subgroupOrdersS3, order -> 6 / order),
    # B0=B, C=C2.  Only A0=C2 or A0=S3 has a C2 quotient.
    [ (6 / 2) * 2, (6 / 6) * 2 ]
  ]));
  CVRequire(possibleNon17Indices = expectedPossible,
    "mod2-goursat-index-mismatch",
    "The common-C2 Goursat index calculation did not give the expected set.");

  # For arbitrary indices, let B=O8-(2).2 and N=O8-(2).  If B0<=B and
  # K=B0 intersect N, then [B:B0] is [N:K] or 2[N:K].  TomLib supplies every
  # possible [N:K].  Goursat then multiplies this projection index by
  # [S3:A0] and the order of a common quotient.  We know every quotient of
  # A0 exactly; divisibility by |B0| is retained as a necessary condition on
  # the other quotient.  Thus absence from the spectrum is conclusive, while
  # membership is only a candidate and does not assert an embedded subgroup.
  CV_STAGE := "mod2-marks-index-sweep";
  s3Classes := ConjugacyClassesSubgroups(smallKernel);
  s3ProjectionData := List(s3Classes, function(class)
    local subgroup, quotientOrders;
    subgroup := Representative(class);
    quotientOrders := Set(List(NormalSubgroups(subgroup),
      normal -> Size(subgroup) / Size(normal)));
    return rec(
      index := 6 / Size(subgroup),
      order := Size(subgroup),
      quotientOrders := quotientOrders
    );
  end);
  Sort(s3ProjectionData, function(left, right)
    if left.index = right.index then
      return left.order < right.order;
    fi;
    return left.index < right.index;
  end);

  extensionOrder := 2 * simpleOrder;
  extensionProjectionIndexOccurrences := Concatenation(
    Filtered(classIndices, index -> index <= input.maxIndex),
    Filtered(List(classIndices, index -> 2 * index),
      index -> index <= input.maxIndex));
  extensionProjectionIndices := Set(extensionProjectionIndexOccurrences);
  necessaryTargetIndices := [];
  for leftProjection in s3ProjectionData do
    for rightIndex in extensionProjectionIndices do
      CVRequire(extensionOrder mod rightIndex = 0,
        "mod2-extension-projection-index-invalid",
        "A derived extension projection index does not divide |O8-(2).2|.");
      rightOrder := extensionOrder / rightIndex;
      for quotientOrder in leftProjection.quotientOrders do
        if rightOrder mod quotientOrder = 0 then
          candidateIndex := leftProjection.index * rightIndex * quotientOrder;
          if candidateIndex <= input.maxIndex then
            AddSet(necessaryTargetIndices, candidateIndex);
          fi;
        fi;
      od;
    od;
  od;

  targets := CVTargetIndices(input.lowerBound, input.maxIndex);
  productLiftMarks := CVMod2ProductLiftMarksSweep(
    input, group, checked.generators, smallKernel, largeKernel, derived,
    action3, action119, simpleIsomorphism, atlasSimple, tom, s3Classes,
    classIndices, targets);
  CV_STAGE := "mod2-all-admissible-indices-exact-family-ledger";
  exactFamilyClassification := CVMod2ExactFamilyLedger(
    input, group, checked.generators, smallKernel, largeKernel, derived,
    simpleIsomorphism, atlasSimple, tom, s3Classes, classIndices, targets,
    necessaryTargetIndices, productLiftMarks);
  admissibleIndexClassification := exactFamilyClassification.ledger;
  detailedDecisions := List(admissibleIndexClassification, function(row)
    if row.classification in ["impossible", "materialized-and-rejected"] then
      return rec(
        decision := "ruled-out",
        reason := row.reason,
        target := row.target
      );
    elif row.classification = "witness-free-candidate-found" then
      return rec(
        decision := "admissible",
        reason := row.reason,
        target := row.target
      );
    fi;
    return rec(
      decision := "unknown",
      reason := row.reason,
      target := row.target
    );
  end);
  candidateTargetDecisions := List(admissibleIndexClassification, row -> rec(
    classification := row.classification,
    complete := row.complete,
    exactCandidateCount := row.exactCandidateCount,
    reason := row.reason,
    target := row.target
  ));
  allTargetsDecided := ForAll(admissibleIndexClassification,
    row -> row.complete = true
      and row.classification <> "unresolved-resumable-frontier");
  decisions := detailedDecisions;
  if not allTargetsDecided then
    # The Python integration contract permits ruled-out decisions only when the
    # complete flag is true.  Preserve the stronger partial proof in the detail
    # record, but expose fail-closed unknown decisions at the normalized layer.
    decisions := List(decisions, item -> rec(
      decision := "unknown",
      reason := "Requested target screening is not complete as a whole.",
      target := item.target
    ));
  fi;

  return rec(
    directProductCertificate := rec(
      closureOrder := Size(generatedProduct),
      commuting := Size(mutualCommutator) = 1,
      fullProduct := Size(generatedProduct) = Size(group),
      intersectionOrder := Size(intersection),
      largeKernelOrder := Size(largeKernel),
      smallKernelIdGroup := smallId,
      smallKernelOrder := Size(smallKernel),
      statement := "Q2 is isomorphic to S3 x (O8-(2):2)."
    ),
    goursatProof := rec(
      commonQuotientOrders := [1, 2],
      formula := "[A x B : H] = [A:A0] [B:B0] |C|",
      largeFactorProjectionOptionsWithout17 := ["O8-(2)", "O8-(2).2"],
      logic := Concatenation(
        "TomLib forces B0 to contain N=O8-(2) at non-17 index. ",
        "Simplicity of N and its trivial centralizer in B show that the only ",
        "normal subgroups of B are 1, N, and B. Thus B has only the common ",
        "quotients 1 and C2 with subgroups of S3."),
      possibleNon17DivisibleIndices := possibleNon17Indices,
      certifiedThroughIndex := historicalBound,
      proofKind := "Goursat lemma with the common C2 quotient",
      s3SubgroupOrders := subgroupOrdersS3
    ),
    identification := rec(
      derivedCentralizerOrder := Size(derivedCentralizer),
      derivedIndexInLargeKernel := derivedIndex,
      derivedIsSimple := derivedSimple,
      derivedOrder := Size(derived),
      extensionAtlasIsomorphismBijective := IsBijective(extensionIsomorphism),
      extensionAtlasName := "O8-(2).2",
      simpleAtlasIsomorphismBijective := IsBijective(simpleIsomorphism),
      simpleAtlasName := "O8-(2)"
    ),
    finiteIndexClassification := rec(
      admissibleIndexCount := Length(targets),
      admissibleIndices := targets,
      classificationCeiling := input.maxIndex,
      completeNecessaryIndexSieve := true,
      completeSubgroupFamilyClassification := ForAll(
        admissibleIndexClassification, item -> item.complete = true),
      exactFamilyEnumeration := exactFamilyClassification,
      index97920 := (function()
        classificationRow := First(admissibleIndexClassification,
          row -> row.target = 97920);
        if classificationRow = fail then
          return rec(
            requested := false,
            status := "outside-requested-range"
          );
        fi;
        return classificationRow;
      end)(),
      outcomeVocabulary := [
        "impossible",
        "materialized-and-rejected",
        "witness-free-candidate-found",
        "unresolved-resumable-frontier"
      ],
      report := admissibleIndexClassification,
      requestedCeiling576000Covered := input.maxIndex >= 576000,
      statement := Concatenation(
        "Every lower-bound multiple is reported. A necessary-sieve survivor ",
        "is never treated as classified: exact B0 lifts, all subdirect ",
        "products, and prime-order witness tests must finish, or the row ",
        "contains a concrete resumable frontier."),
      targetLowerBound := input.lowerBound
    ),
    marksSweep := rec(
      candidateTargetDecisions := candidateTargetDecisions,
      candidateTargetIndices := Intersection(targets, necessaryTargetIndices),
      completeNecessarySieve := true,
      embeddedGeneratorWordsAvailable := false,
      embeddedGeneratorWordsReason := Concatenation(
        "TomLib class representatives are not expressed as words in the ",
        "ordered Coxeter generators of this finite image."),
      extensionProjectionIndexSpectrumAtMostMaxIndex :=
        CVIndexSpectrum(extensionProjectionIndexOccurrences),
      extensionProjectionIndicesAtMostMaxIndex := extensionProjectionIndices,
      goursatFormula := "[A x B : H] = [A:A0] [B:B0] |C|",
      normalFactorClassCountAtMostMaxIndex := Length(boundedClassIndices),
      normalFactorIndexSpectrumAtMostMaxIndex :=
        CVIndexSpectrum(boundedClassIndices),
      normalFactorTableClassCount := Length(subgroupOrders),
      necessaryIndexCountAtMostMaxIndex := Length(necessaryTargetIndices),
      necessaryIndicesAtMostMaxIndex := necessaryTargetIndices,
      s3ProjectionData := s3ProjectionData,
      sieveStrength := "necessary-only",
      statement := Concatenation(
        "Absence rules out an index. Presence does not certify a subgroup, ",
        "a torsion-free action, or exhaustion of embedded candidates."),
      tableName := "O8-(2)"
    ),
    productLiftMarks := productLiftMarks,
    screening := rec(
      complete := allTargetsDecided,
      finiteImageOrder := Size(group),
      method := Concatenation(
        "complete O8-(2) table of marks, exact transporter-normalizer ",
        "quotients in O8-(2):2, all GAP SubdirectProducts families, and ",
        "exact prime-order spherical witness tests"),
      partialTargetDecisions := detailedDecisions,
      possibleIndices := List(Filtered(admissibleIndexClassification, row ->
        row.classification in ["witness-free-candidate-found",
          "unresolved-resumable-frontier"]), row -> row.target),
      reason := (function()
        if allTargetsDecided then
          return "Every requested index has an exact negative or positive classification.";
        fi;
        return "At least one exact GAP family or witness operation has a resumable frontier.";
      end)(),
      scope := "all requested target indices up to maxIndex",
      status := (function()
        if allTargetsDecided then
          return "complete-for-requested-targets";
        fi;
        return "partial";
      end)(),
      targetDecisions := decisions
    ),
    tableOfMarks := rec(
      ambientGroupOrder := simpleOrder,
      completeConjugacyClassCount := Length(subgroupOrders),
      library := "TomLib",
      non17DivisibleIndicesAtMostMaxIndex := non17BoundedIndices,
      non17DivisibleIndicesInHistoricalCertifiedRange :=
        non17HistoricalIndices,
      subgroupIndexSpectrumAtMostMaxIndex := CVIndexSpectrum(boundedClassIndices),
      tableName := "O8-(2)"
    )
  );
end;;

CVAttemptGenericRecognition := function(group)
  local loaded, caught, node;
  CV_STAGE := "generic-recognition";
  loaded := LoadPackage("recog", false);
  if loaded <> true then
    return rec(
      attempted := false,
      recognized := false,
      reason := "The recog package is unavailable."
    );
  fi;
  caught := CALL_WITH_CATCH(RecogniseGroup, [group]);
  if caught[1] <> true then
    CVFail("generic-recognition-error",
      "RecogniseGroup raised an error; no index conclusion was made.");
  fi;
  if Length(caught) < 2 or caught[2] = fail then
    return rec(
      attempted := true,
      recognized := false,
      reason := "RecogniseGroup returned fail."
    );
  fi;
  node := caught[2];
  return rec(
    attempted := true,
    recognitionNodeReady := IsReady(node),
    recognized := true
  );
end;;

CVRunRecognition := function(input)
  local artifact, checked, matrixImage, genericGroup, genericRecognition,
    orderResolution, finiteImageOrder, discoveryOnly, mod2, oddPrime;
  CV_STAGE := "input-validation";
  CVValidateInputShape(input);
  artifact := CVBaseArtifact(input);
  checked := CVReconstructAndCheckAction(input);
  artifact.actionValidation := checked.public;
  artifact.ok := true;
  matrixImage := CVReconstructAndCheckMatrixImage(input, checked);
  if IsBound(matrixImage.public) then
    artifact.matrixValidation := matrixImage.public;
  else
    artifact.matrixValidation := matrixImage;
  fi;
  finiteImageOrder := CVSafeInputInteger(input, "expectedOrder", 0);
  if IsBound(matrixImage.group) then
    orderResolution := CVResolveMatrixImageOrder(input, matrixImage, checked);
    artifact.orderDiscovery := orderResolution.public;
    if not IsBound(orderResolution.finiteImageOrder) then
      artifact.recognition := rec(
        complete := false,
        finiteImageOrder := 0,
        finiteImageOrderKnown := false,
        reason := "Matrix recognition did not produce a verified finite image order."
      );
      artifact.catalogue := rec(
        complete := false,
        finiteImageOrder := 0,
        finiteImageOrderKnown := false,
        reason := "Order discovery is incomplete."
      );
      artifact.screening := rec(
        complete := false,
        finiteImageOrder := 0,
        finiteImageOrderKnown := false,
        method := "none",
        possibleIndices := [],
        reason := "No index screening is valid before verified order discovery.",
        status := "unknown",
        targetDecisions := List(
          CVTargetIndices(input.lowerBound, input.maxIndex),
          index -> rec(
            decision := "unknown",
            reason := "Finite image order discovery is incomplete.",
            target := index
          ))
      );
      artifact.status := "unknown";
      return artifact;
    fi;
    finiteImageOrder := orderResolution.finiteImageOrder;
    matrixImage.finiteImageOrder := finiteImageOrder;
    matrixImage.orderRecognition := orderResolution;
    artifact.matrixValidation.matrixGroupOrder := finiteImageOrder;
    artifact.matrixValidation.matrixGroupOrderKnown := true;
    artifact.discoveredFiniteImageOrder := finiteImageOrder;
  fi;

  discoveryOnly := IsBound(input.orderDiscoveryOnly)
    and input.orderDiscoveryOnly = true;
  if discoveryOnly then
    artifact.recognition := rec(
      complete := false,
      finiteImageOrder := finiteImageOrder,
      finiteImageOrderKnown := true,
      orderCertified := true,
      reason := "Order discovery only; structural recognition was not requested."
    );
    artifact.catalogue := rec(
      complete := false,
      finiteImageOrder := finiteImageOrder,
      reason := "Order discovery only; no subgroup catalogue was built."
    );
    artifact.screening := rec(
      complete := false,
      finiteImageOrder := finiteImageOrder,
      method := "none",
      possibleIndices := [],
      reason := "Order discovery only; no subgroup-index conclusion was attempted.",
      status := "unknown",
      targetDecisions := List(
        CVTargetIndices(input.lowerBound, input.maxIndex),
        index -> rec(
          decision := "unknown",
          reason := "Order discovery only.",
          target := index
        ))
    );
    artifact.status := "passed-order-discovery";
    return artifact;
  fi;

  if input.characteristic = 2
      and finiteImageOrder = 2368880640
      and IsBound(checked.group)
      and IsBound(checked.public.orbitSizes)
      and checked.public.orbitSizes = [3, 119] then
    mod2 := CVCertifyMod2StructureAndIndices(input, checked);
    artifact.recognition := rec(
      complete := true,
      finiteImageOrder := finiteImageOrder,
      structure := "S3 x (O8-(2):2)"
    );
    artifact.catalogue := rec(
      complete := true,
      finiteImageOrder := finiteImageOrder,
      scope := Concatenation(
        "Complete O8-(2) subgroup classes and complete necessary index ",
        "screening; not a complete subgroup-class catalogue of O8-(2).2."),
      source := Concatenation(
        "TomLib:O8-(2) plus exact necessary Goursat/common-quotient ",
        "index arithmetic"),
      subgroupClassCount := mod2.tableOfMarks.completeConjugacyClassCount
    );
    artifact.mod2Certificate := mod2;
    artifact.screening := mod2.screening;
    artifact.status := "passed";
    return artifact;
  fi;

  if input.characteristic >= 3 and IsPrimeInt(input.characteristic)
      and IsBound(matrixImage.group) then
    oddPrime := CVOddPrimeOrthogonalMatrixDiagnostics(input, matrixImage);
    artifact.oddPrimeMatrixDiagnostics := oddPrime;
    if input.characteristic = 3 then
      artifact.characteristic3MatrixDiagnostics := oddPrime;
    fi;
    if IsBound(oddPrime.screening)
        and oddPrime.screening.complete = true then
      artifact.recognition := rec(
        complete := true,
        finiteImageOrder := finiteImageOrder,
        fullGroupIsomorphismClaimed := false,
        structure := oddPrime.extension.statement
      );
      artifact.catalogue := rec(
        complete := true,
        finiteImageOrder := finiteImageOrder,
        source := Concatenation(
          "ClassicalMaximals:",
          oddPrime.derivedSubgroup.identifiedAs,
          ", complete in dimension 10"),
        subgroupClassCount :=
          oddPrime.classicalMaximals.maximalClassCount
      );
      artifact.screening := oddPrime.screening;
      artifact.status := "passed";
      return artifact;
    fi;
  fi;

  if IsBound(checked.group) then
    genericGroup := checked.group;
  elif IsBound(matrixImage.group) then
    genericGroup := matrixImage.group;
  else
    CVFail("missing-reconstructed-group",
      "No exact permutation or matrix group was reconstructed.");
  fi;
  genericRecognition := CVAttemptGenericRecognition(genericGroup);
  artifact.genericRecognition := genericRecognition;
  artifact.recognition := rec(
    complete := false,
    finiteImageOrder := finiteImageOrder,
    reason := Concatenation(
      "Generic recognition does not supply a complete structural ",
      "identification and subgroup-index proof for this image.")
  );
  artifact.catalogue := rec(
    complete := false,
    finiteImageOrder := finiteImageOrder,
    reason := "recognition-incomplete"
  );
  artifact.screening := rec(
    complete := false,
    finiteImageOrder := finiteImageOrder,
    method := "none",
    possibleIndices := [],
    reason := Concatenation(
      "Generic recognition does not provide a complete subgroup-index ",
      "classification for this image."),
    status := "unknown",
    targetDecisions := List(
      CVTargetIndices(input.lowerBound, input.maxIndex),
      index -> rec(
        decision := "unknown",
        reason := "No mathematically complete screening route is implemented.",
        target := index
      ))
  );
  artifact.status := "unknown";
  return artifact;
end;;

if not IsBound(COXETER_INPUT) then
  CVWriteArtifact(COXETER_OUTPUT, rec(
    error := rec(
      code := "missing-input",
      message := "The generated driver must define COXETER_INPUT.",
      stage := "startup"
    ),
    ok := false,
    recognizer := rec(
      id := CoxeterFiniteImageRecognizerId,
      version := CoxeterFiniteImageRecognizerVersion
    ),
    schemaVersion := 1,
    status := "failed",
    tools := CVToolVersions()
  ));
  QUIT_GAP(1);
fi;

CV_CAUGHT := CALL_WITH_CATCH(CVRunRecognition, [COXETER_INPUT]);;
if CV_CAUGHT[1] = true and Length(CV_CAUGHT) >= 2 then
  if not CVWriteArtifact(COXETER_OUTPUT, CV_CAUGHT[2]) then
    QUIT_GAP(1);
  fi;
  QUIT_GAP(0);
fi;

CV_ERROR_ARTIFACT := CVBaseArtifact(COXETER_INPUT);;
CV_ERROR_ARTIFACT.error := rec(
  code := CV_FAILURE_CODE,
  message := CV_FAILURE_MESSAGE,
  stage := CV_STAGE
);;
CV_ERROR_ARTIFACT.ok := false;;
CV_ERROR_ARTIFACT.status := "failed";;
CVWriteArtifact(COXETER_OUTPUT, CV_ERROR_ARTIFACT);;
QUIT_GAP(1);
