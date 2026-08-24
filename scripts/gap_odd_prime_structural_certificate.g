# Exact structural certificate for the compact 5-cube over GF(5), GF(7), or GF(11).
# A generated driver binds ODD_INPUT and ODD_OUTPUT.

CVOddCertificateVersion := "1.0.0";;
CV_STAGE := "initialization";;

CVJsonEscape := function(value)
  local result, character;
  result := "";
  for character in value do
    if character = '"' then result := Concatenation(result, "\\\"");
    elif character = '\\' then result := Concatenation(result, "\\\\");
    elif character = '\n' then result := Concatenation(result, "\\n");
    elif character = '\r' then result := Concatenation(result, "\\r");
    elif character = '\t' then result := Concatenation(result, "\\t");
    else result := Concatenation(result, [character]);
    fi;
  od;
  return result;
end;;

CVGapToJson := function(stream, value)
  local names, name, position;
  if value = true then AppendTo(stream, "true");
  elif value = false then AppendTo(stream, "false");
  elif value = fail then AppendTo(stream, "null");
  elif IsInt(value) then AppendTo(stream, String(value));
  elif IsString(value) then
    AppendTo(stream, "\"", CVJsonEscape(value), "\"");
  elif IsList(value) then
    AppendTo(stream, "[");
    for position in [1..Length(value)] do
      if position > 1 then AppendTo(stream, ","); fi;
      CVGapToJson(stream, value[position]);
    od;
    AppendTo(stream, "]");
  elif IsRecord(value) then
    AppendTo(stream, "{");
    names := SortedList(RecNames(value));
    for position in [1..Length(names)] do
      if position > 1 then AppendTo(stream, ","); fi;
      name := names[position];
      AppendTo(stream, "\"", CVJsonEscape(name), "\":");
      CVGapToJson(stream, value.(name));
    od;
    AppendTo(stream, "}");
  else
    ErrorNoReturn("The odd-prime certificate contains a non-JSON GAP object.");
  fi;
end;;

CVWriteJson := function(path, value)
  local stream;
  stream := OutputTextFile(path, false);
  SetPrintFormattingStatus(stream, false);
  CVGapToJson(stream, value);
  AppendTo(stream, "\n");
  CloseStream(stream);
  return value;
end;;

CVPackageVersion := function(name)
  local info;
  info := PackageInfo(name);
  if not IsList(info) or Length(info) = 0 or not IsBound(info[1].Version) then
    return "unavailable";
  fi;
  return String(info[1].Version);
end;;

CVTools := function()
  return rec(
    gap := GAPInfo.Version,
    forms := CVPackageVersion("forms"),
    genss := CVPackageVersion("genss"),
    recog := CVPackageVersion("recog"),
    classicalMaximals := CVPackageVersion("ClassicalMaximals")
  );
end;;

CVUnknown := reason -> rec(status := "unknown", reason := reason);;
CVFailed := reason -> rec(status := "failed", reason := reason);;

CVMatrixRows := function(matrix)
  return List([1..NrRows(matrix)], row ->
    List([1..NrCols(matrix)], column -> Int(matrix[row][column])));
end;;

CVMatrixListRows := matrices -> List(matrices, CVMatrixRows);;

CVRowsToMatrix := function(rows, field)
  return ImmutableMatrix(field,
    List(rows, row -> List(row, entry -> (entry mod Size(field)) * One(field))));
end;;

CVRowsToMatrices := function(rows, field)
  return List(rows, matrix -> CVRowsToMatrix(matrix, field));
end;;

CVFormSimilitudeMultiplier := function(change, oldForm, standardForm)
  local transported, row, column, multiplier;
  transported := TransposedMat(change) * oldForm * change;
  for row in [1..NrRows(standardForm)] do
    for column in [1..NrCols(standardForm)] do
      if standardForm[row][column] <> Zero(DefaultFieldOfMatrix(standardForm)) then
        multiplier := transported[row][column] / standardForm[row][column];
        if multiplier <> Zero(DefaultFieldOfMatrix(standardForm))
            and transported = multiplier * standardForm then
          return multiplier;
        fi;
        return fail;
      fi;
    od;
  od;
  return fail;
end;;

CVTargetDegrees := function(lowerBound, maximum)
  local result, degree;
  result := [];
  degree := lowerBound;
  while degree <= maximum do
    Add(result, degree);
    degree := degree + lowerBound;
  od;
  return result;
end;;

CVInitialDegreeLedger := function(input, reason)
  return List(CVTargetDegrees(input.lowerBound, input.maxIndex), degree -> rec(
    degree := degree,
    outcome := "unresolved",
    classificationComplete := false,
    reason := reason
  ));
end;;

CVBaseArtifact := function(input)
  return rec(
    schemaVersion := 1,
    certificateKind := input.certificateKind,
    certificateVersion := CVOddCertificateVersion,
    characteristic := input.characteristic,
    status := "unknown",
    reason := "generation-not-complete",
    provenance := input.provenance,
    coxeterMatrix := input.coxeterMatrix,
    maximalSphericalSubgroups := input.maximalSphericalSubgroups,
    representation := rec(
      status := "unknown",
      characteristic := input.characteristic,
      dimension := input.dimension,
      matrixGeneratorRows := input.matrixGeneratorRows,
      preservedFormRows := input.preservedFormRows
    ),
    equalitySearch := rec(
      strategy := input.equalityStrategy,
      orbitLengthLimit := input.orbitLengthLimit,
      classicalRecognition := rec(
        randomSeed := input.classicalRecognitionRandomSeed,
        requestedRandomElements := input.classicalRecognitionSamples)
    ),
    kernelCertificate := CVUnknown("Maximal spherical restrictions have not run."),
    structuralIdentification := rec(
      preservedSplitForm := CVUnknown("not checked"),
      standardFormConjugacy := CVUnknown("not checked"),
      omegaDerivedSubgroup := CVUnknown("not checked"),
      indexTwoExtension := CVUnknown("not checked")
    ),
    degreeSieve := rec(
      status := "unknown",
      reason := "not run",
      targetLowerBound := input.lowerBound,
      targetMaximum := input.maxIndex,
      degreeLedger := CVInitialDegreeLedger(input, "Index screening has not run."),
      maximalCatalogue := CVUnknown("not run"),
      appliesToImage := false,
      unresolvedFrontier := [rec(index := 1, reason := "not run")]
    ),
    tools := CVTools()
  );
end;;

CVCheckpoint := artifact -> CVWriteJson(ODD_OUTPUT, artifact);;

CVValidateInput := function(input)
  local p, rank, i, j;
  if not IsRecord(input) or not IsBound(input.schemaVersion)
      or input.schemaVersion <> 1 then
    ErrorNoReturn("Unsupported odd-prime certificate input.");
  fi;
  p := input.characteristic;
  if not p in [5, 7, 11] or input.dimension <> 10 then
    ErrorNoReturn("This driver accepts only the rank-ten GF(5), GF(7), and GF(11) models.");
  fi;
  if not IsBound(input.equalityStrategy)
      or not input.equalityStrategy in ["genss", "exact-slp-finder-first",
        "genss-then-exact-slp-finder", "classical-containment-first"] then
    ErrorNoReturn("The Omega equality strategy is missing or unsupported.");
  fi;
  if not IsBound(input.classicalRecognitionRandomSeed)
      or not IsInt(input.classicalRecognitionRandomSeed)
      or input.classicalRecognitionRandomSeed <= 0
      or not IsBound(input.classicalRecognitionSamples)
      or not IsInt(input.classicalRecognitionSamples)
      or input.classicalRecognitionSamples <= 0 then
    ErrorNoReturn("The classical-recognition seed and sample bound must be positive integers.");
  fi;
  rank := Length(input.coxeterMatrix);
  if rank <> 10 or Length(input.matrixGeneratorRows) <> rank
      or Length(input.preservedFormRows) <> rank
      or Length(input.maximalSphericalSubgroups) <> 32 then
    ErrorNoReturn("The exact rank-ten transfer or spherical catalogue is incomplete.");
  fi;
  for i in [1..rank] do
    if Length(input.coxeterMatrix[i]) <> rank
        or Length(input.matrixGeneratorRows[i]) <> rank
        or Length(input.preservedFormRows[i]) <> rank then
      ErrorNoReturn("A stored matrix has the wrong dimension.");
    fi;
    for j in [1..rank] do
      if input.coxeterMatrix[i][j] <> input.coxeterMatrix[j][i] then
        ErrorNoReturn("The Coxeter matrix is asymmetric.");
      fi;
      if Length(input.matrixGeneratorRows[i][j]) <> rank then
        ErrorNoReturn("A matrix generator is not square.");
      fi;
    od;
  od;
  return true;
end;;

CVCheckRelations := function(matrices, coxeterMatrix)
  local identity, checks, i, j, m;
  identity := IdentityMat(Length(matrices), DefaultFieldOfMatrix(matrices[1]));
  checks := [];
  for i in [1..Length(matrices)] do
    if matrices[i]^2 <> identity then
      ErrorNoReturn("An exact odd-prime generator is not an involution.");
    fi;
    Add(checks, rec(kind := "involution", generator := i - 1, passed := true));
  od;
  for i in [1..Length(matrices) - 1] do
    for j in [i + 1..Length(matrices)] do
      m := coxeterMatrix[i][j];
      if m <> 0 then
        if (matrices[i] * matrices[j])^m
            <> IdentityMat(Length(matrices), DefaultFieldOfMatrix(matrices[1])) then
          ErrorNoReturn("An exact odd-prime Coxeter relation failed.");
        fi;
        Add(checks, rec(
          kind := "coxeter", generatorA := i - 1,
          generatorB := j - 1, exponent := m, passed := true));
      fi;
    od;
  od;
  return checks;
end;;

CVCheckSphericalRestrictions := function(matrices, catalogue)
  local checks, item, generators, subgroup, actual;
  checks := [];
  for item in catalogue do
    generators := List(item.subset, index -> matrices[index + 1]);
    subgroup := Group(generators);
    actual := Size(subgroup);
    if actual <> item.expectedOrder then
      return rec(
        status := "failed",
        reason := Concatenation("Spherical restriction ", item.id,
          " has order ", String(actual), " instead of ",
          String(item.expectedOrder), "."),
        checks := checks
      );
    fi;
    Add(checks, rec(
      id := item.id,
      subset := item.subset,
      type := item.type,
      expectedOrder := item.expectedOrder,
      actualOrder := actual,
      injective := true
    ));
  od;
  return rec(status := "verified", checks := checks);
end;;

CVIsInStandardOmega := function(matrix, p)
  return DeterminantMat(matrix) = One(DefaultFieldOfMatrix(matrix))
    and CallFuncList(ValueGlobal("CM_InOmega"), [matrix, 10, p, 1]);
end;;

CVRecordSlp := function(slp, inputCount, targetIndex, target)
  return rec(
    inputCount := inputCount,
    lines := LinesOfStraightLineProgram(slp),
    targetIndex := targetIndex,
    targetRows := CVMatrixRows(target)
  );
end;;

CVRecognizeOmegaByGenSS := function(evenGenerators, standardOmega, p, orbitLimit)
  local omegaOrder, memoryGenerators, memoryGroup, chainCaught, chain,
    provedCaught, strongGenerators, strongToInput, standardGenerators, entries,
    targetIndex, target, siftCaught, sift, toInput, evaluated;
  if LoadPackage("genss", false) <> true
      or LoadPackage("ClassicalMaximals", false) <> true then
    return CVUnknown("GenSS or ClassicalMaximals is unavailable.");
  fi;
  if not ForAll(evenGenerators, generator -> CVIsInStandardOmega(generator, p)) then
    return CVFailed("An even source generator failed exact CM_InOmega membership.");
  fi;
  omegaOrder := CallFuncList(ValueGlobal("SizeOmega"), [1, 10, p]);
  memoryGenerators := GeneratorsWithMemory(evenGenerators);
  memoryGroup := Group(memoryGenerators);
  chainCaught := CALL_WITH_CATCH(StabilizerChain, [memoryGroup, rec(
    Size := omegaOrder,
    OrbitLengthLimit := orbitLimit,
    FailInsteadOfError := true,
    ErrorBound := 1 / 1048576
  )]);
  if chainCaught[1] <> true or Length(chainCaught) < 2
      or chainCaught[2] = fail or chainCaught[2] = false then
    return CVUnknown("GenSS did not construct the prescribed-order stabilizer chain.");
  fi;
  chain := chainCaught[2];
  provedCaught := CALL_WITH_CATCH(IsProved, [chain]);
  if provedCaught[1] <> true or Length(provedCaught) < 2
      or provedCaught[2] <> true then
    return CVUnknown("The prescribed-order GenSS chain is not proved.");
  fi;
  strongGenerators := StrongGenerators(chain);
  strongToInput := SLPOfElms(strongGenerators);
  standardGenerators := GeneratorsOfGroup(standardOmega);
  entries := [];
  for targetIndex in [1..Length(standardGenerators)] do
    target := standardGenerators[targetIndex];
    siftCaught := CALL_WITH_CATCH(SiftGroupElementSLP, [chain, target]);
    if siftCaught[1] <> true or Length(siftCaught) < 2
        or siftCaught[2] = fail or not IsBound(siftCaught[2].isone)
        or siftCaught[2].isone <> true or not IsBound(siftCaught[2].slp)
        or siftCaught[2].slp = fail then
      return CVUnknown("GenSS could not express every standard Omega generator.");
    fi;
    sift := siftCaught[2];
    toInput := CompositionOfStraightLinePrograms(sift.slp, strongToInput);
    evaluated := ResultOfStraightLineProgram(toInput, evenGenerators);
    if evaluated <> target then
      return CVFailed("A standard-generator SLP failed exact generation-time replay.");
    fi;
    Add(entries, CVRecordSlp(
      toInput, Length(evenGenerators), targetIndex - 1, target));
  od;
  return rec(
    status := "verified",
    identifiedAs := Concatenation("Omega+(10,", String(p), ")"),
    equalityMethod :=
      "CM_InOmega containment and proved GenSS chain of prescribed exact order",
    evenGeneratorRows := CVMatrixListRows(evenGenerators),
    standardOmegaGeneratorRows := CVMatrixListRows(standardGenerators),
    order := omegaOrder,
    exactContainment := rec(
      status := "verified", determinantOne := true, cmInOmega := true,
      checkedGeneratorCount := Length(evenGenerators)),
    stabilizerChain := rec(
      status := "verified", isProved := true,
      prescribedOrder := omegaOrder,
      orbitLengthLimit := orbitLimit,
      failInsteadOfError := true,
      errorBoundNumerator := 1,
      errorBoundDenominator := 1048576,
      strongGeneratorCount := Length(strongGenerators),
      package := "GenSS", packageVersion := CVPackageVersion("genss")),
    standardGeneratorSlps := rec(
      status := "verified",
      evidenceFormat := "genss-composed-straight-line-program",
      entries := entries,
      niceGeneratorsComposedToEvenGenerators := true)
  );
end;;

CVRecognizeOmegaByExactRecogSlps := function(evenGenerators, standardOmega, p)
  local matrixGroup, caught, readyCaught, node, niceToInput,
    standardGenerators, entries, targetIndex, target, toNice, toInput,
    evaluated, omegaOrder;
  if LoadPackage("recog", false) <> true then
    return CVUnknown("recog is unavailable as a standard-generator word finder.");
  fi;
  if not ForAll(evenGenerators, generator -> CVIsInStandardOmega(generator, p)) then
    return CVFailed("An even source generator failed exact CM_InOmega membership.");
  fi;
  # Recog supplies its own word map. GenSS memory wrappers change the matrix
  # filters and are not valid inputs to RecogniseMatrixGroup.
  matrixGroup := Group(evenGenerators);
  caught := CALL_WITH_CATCH(RecogniseMatrixGroup, [matrixGroup]);
  if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
    return CVUnknown("recog did not produce a ready word-finding tree.");
  fi;
  node := caught[2];
  readyCaught := CALL_WITH_CATCH(IsReady, [node]);
  if readyCaught[1] <> true or Length(readyCaught) < 2
      or readyCaught[2] <> true then
    return CVUnknown("recog did not produce a ready word-finding tree.");
  fi;
  caught := CALL_WITH_CATCH(SLPforNiceGens, [node]);
  if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
    return CVUnknown("recog did not expose words from its nice generators.");
  fi;
  niceToInput := caught[2];
  standardGenerators := GeneratorsOfGroup(standardOmega);
  entries := [];
  for targetIndex in [1..Length(standardGenerators)] do
    target := standardGenerators[targetIndex];
    caught := CALL_WITH_CATCH(SLPforElement, [node, target]);
    if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
      return CVUnknown("recog found no word for a standard Omega generator.");
    fi;
    toNice := caught[2];
    toInput := CompositionOfStraightLinePrograms(toNice, niceToInput);
    evaluated := ResultOfStraightLineProgram(toInput, evenGenerators);
    if evaluated <> target then
      return CVFailed("A word-finder SLP failed exact matrix evaluation.");
    fi;
    Add(entries, CVRecordSlp(
      toInput, Length(evenGenerators), targetIndex - 1, target));
  od;
  omegaOrder := CallFuncList(ValueGlobal("SizeOmega"), [1, 10, p]);
  return rec(
    status := "verified",
    identifiedAs := Concatenation("Omega+(10,", String(p), ")"),
    equalityMethod :=
      "mutual containment via exactly evaluated standard-generator SLPs",
    evenGeneratorRows := CVMatrixListRows(evenGenerators),
    standardOmegaGeneratorRows := CVMatrixListRows(standardGenerators),
    order := omegaOrder,
    exactContainment := rec(
      status := "verified", determinantOne := true, cmInOmega := true,
      checkedGeneratorCount := Length(evenGenerators)),
    wordFinder := rec(
      status := "diagnostic-only", package := "recog",
      packageVersion := CVPackageVersion("recog"), isReady := true,
      recognitionTreeTrustedForOrder := false,
      recognitionTreeTrustedForEquality := false,
      exactWordEvaluationIsPrimaryEvidence := true),
    standardGeneratorSlps := rec(
      status := "verified",
      evidenceFormat := "recog-composed-slps-exactly-evaluated-in-source-generators",
      entries := entries,
      niceGeneratorsComposedToEvenGenerators := true)
  );
end;;

CVRecognizeOmegaByClassicalContainment := function(
    evenGenerators, standardOmega, p, randomSeed, requestedRandomElements)
  local caught, result, omegaOrder, sampled, observedOrders, ppdExponents,
    largePpdExponents, basicPpdExponents, largeBasicPpdExponents;
  if LoadPackage("recog", false) <> true then
    return CVUnknown("recog is unavailable for specialized classical containment.");
  fi;
  if not ForAll(evenGenerators, generator -> CVIsInStandardOmega(generator, p)) then
    return CVFailed("An even source generator failed exact CM_InOmega membership.");
  fi;

  # RecogniseClassical is a one-sided naming algorithm: a positive
  # isOmegaContained result is conclusive, while a negative result may only
  # mean that this finite seeded sample did not find enough ppd witnesses.
  Reset(GlobalMersenneTwister, randomSeed);
  Reset(GlobalRandomSource, randomSeed);
  caught := CALL_WITH_CATCH(RecogniseClassical, [Group(evenGenerators), rec(
    case := "orthogonalplus",
    nrrandels := requestedRandomElements,
    infoLevel := 0
  )]);
  if caught[1] <> true or Length(caught) < 2 or not IsRecord(caught[2]) then
    return CVUnknown("Specialized classical containment recognition raised an error.");
  fi;
  result := caught[2];
  if not IsBound(result.isOmegaContained)
      or result.isOmegaContained <> true then
    return CVUnknown("The one-sided classical search found no conclusive Omega-containment witness.");
  fi;
  sampled := -1;
  if IsBound(result.n) and IsInt(result.n) then sampled := result.n; fi;
  observedOrders := [];
  if IsBound(result.orders) and IsList(result.orders) then
    observedOrders := ShallowCopy(result.orders);
  fi;
  ppdExponents := [];
  if IsBound(result.E) and IsList(result.E) then
    ppdExponents := ShallowCopy(result.E);
  fi;
  largePpdExponents := [];
  if IsBound(result.LE) and IsList(result.LE) then
    largePpdExponents := ShallowCopy(result.LE);
  fi;
  basicPpdExponents := [];
  if IsBound(result.BE) and IsList(result.BE) then
    basicPpdExponents := ShallowCopy(result.BE);
  fi;
  largeBasicPpdExponents := [];
  if IsBound(result.LB) and IsList(result.LB) then
    largeBasicPpdExponents := ShallowCopy(result.LB);
  fi;
  omegaOrder := CallFuncList(ValueGlobal("SizeOmega"), [1, 10, p]);
  return rec(
    status := "verified",
    identifiedAs := Concatenation("Omega+(10,", String(p), ")"),
    equalityMethod :=
      "CM_InOmega containment and conclusive one-sided classical Omega-containment",
    evenGeneratorRows := CVMatrixListRows(evenGenerators),
    standardOmegaGeneratorRows :=
      CVMatrixListRows(GeneratorsOfGroup(standardOmega)),
    order := omegaOrder,
    exactContainment := rec(
      status := "verified", determinantOne := true, cmInOmega := true,
      checkedGeneratorCount := Length(evenGenerators)),
    classicalContainment := rec(
      status := "verified",
      algorithm := "RecogniseClassical",
      case := "orthogonalplus",
      isOmegaContained := true,
      oneSidedPositiveIsConclusive := true,
      negativeWouldBeInconclusive := true,
      recognitionOutputTrustedForContainment := true,
      recognitionOutputTrustedForOrder := false,
      orderTakenFromStandardOmegaAfterMutualContainment := true,
      randomSeed := randomSeed,
      requestedRandomElements := requestedRandomElements,
      sampledRandomElements := sampled,
      observedElementOrders := observedOrders,
      ppdExponents := ppdExponents,
      largePpdExponents := largePpdExponents,
      basicPpdExponents := basicPpdExponents,
      largeBasicPpdExponents := largeBasicPpdExponents,
      package := "recog",
      packageVersion := CVPackageVersion("recog"),
      references := [
        "recog RecogniseClassical API: positive isOmegaContained is a containment conclusion",
        "Praeger, Primitive prime divisor elements in finite classical groups: one-sided recognition"
      ]),
    standardGeneratorSlps := CVUnknown(
      "This proof uses conclusive classical containment instead of constructive words.")
  );
end;;

CVVerifyOuterRepresentative := function(transformed, standardForm, standardOmega, p)
  local field, outer, identity, checks, index, quotientElement, normalizes;
  field := DefaultFieldOfMatrix(transformed[1]);
  identity := IdentityMat(Length(transformed[1]), field);
  outer := transformed[1];
  if outer^2 <> identity or DeterminantMat(outer) = One(field)
      or TransposedMat(outer) * standardForm * outer <> standardForm
      or CVIsInStandardOmega(outer, p) then
    return CVFailed("The first source reflection is not an outer orthogonal representative.");
  fi;
  checks := [];
  for index in [1..Length(transformed)] do
    quotientElement := transformed[index] * outer^-1;
    if not CVIsInStandardOmega(quotientElement, p) then
      return CVFailed("A source reflection is not in the selected outer Omega coset.");
    fi;
    Add(checks, rec(generator := index - 1, omegaCosetMembership := true));
  od;
  normalizes := ForAll(GeneratorsOfGroup(standardOmega),
    generator -> CVIsInStandardOmega(generator^outer, p));
  if not normalizes then
    return CVFailed("The selected outer representative does not normalize Omega.");
  fi;
  return rec(
    status := "verified",
    quotient := "C2",
    quotientIndex := 2,
    sourceGeneratorIndex := 0,
    determinant := Int(DeterminantMat(outer)),
    involution := true,
    preservesStandardForm := true,
    outsideOmega := true,
    normalizesOmega := true,
    imageEqualsExtension := false,
    standardBasisRows := CVMatrixRows(outer),
    sourceGeneratorCosetChecks := checks
  );
end;;

CVOuterLift := function(omega, subgroup, outer)
  local caught, conjugator, candidate;
  caught := CALL_WITH_CATCH(RepresentativeAction,
    [omega, subgroup^outer, subgroup, OnPoints]);
  if caught[1] <> true or Length(caught) < 2 then
    return CVUnknown("Outer conjugacy test raised an error.");
  fi;
  if caught[2] = fail then
    return rec(status := "verified", liftExists := false,
      reason := "The outer image is not Omega-conjugate to this maximal class.");
  fi;
  conjugator := caught[2];
  candidate := outer * conjugator;
  if subgroup^candidate = subgroup and candidate^2 in subgroup then
    return rec(status := "verified", liftExists := true,
      reason := "An outer-coset normalizer with square in the subgroup was verified.");
  fi;
  return CVUnknown("The returned conjugator did not certify the extension condition.");
end;;

CVClassicalMaximalLedger := function(omega, outer, input)
  local p, omegaOrder, targets, classes, classNumber, caught, subgroup,
    subgroupOrder, index, rootRows, rootIndices, classRecords, classComplete,
    compatibleTargets, lift, target, containedIndex, containedRows, outerRows,
    containedExact, outerExactLift, containedOutcome, outerOutcome,
    outcome, complete, rows, allRowsComplete, unresolved;
  p := input.characteristic;
  omegaOrder := CallFuncList(ValueGlobal("SizeOmega"), [1, 10, p]);
  targets := CVTargetDegrees(input.lowerBound, input.maxIndex);
  classes := [1..9];
  rootRows := [];
  classRecords := [];
  classComplete := true;
  for classNumber in classes do
    caught := CALL_WITH_CATCH(ValueGlobal("ClassicalMaximalsGeneric"),
      ["O+", 10, p, [classNumber]]);
    if caught[1] <> true or Length(caught) < 2 or not IsList(caught[2]) then
      classComplete := false;
      Add(classRecords, rec(class := classNumber, status := "unknown",
        reason := "ClassicalMaximalsGeneric failed for this Aschbacher class."));
    else
      Add(classRecords, rec(class := classNumber, status := "verified",
        representativeCount := Length(caught[2])));
      for subgroup in caught[2] do
        subgroupOrder := Size(subgroup);
        if omegaOrder mod subgroupOrder <> 0 then
          classComplete := false;
          Add(rootRows, rec(class := classNumber, status := "failed",
            reason := "A reported maximal subgroup has nonintegral index."));
        else
          index := omegaOrder / subgroupOrder;
          compatibleTargets := Filtered(targets, degree ->
            (IsEvenInt(degree) and (degree / 2) mod index = 0)
              or degree mod index = 0);
          if index <= input.maxIndex and Length(compatibleTargets) > 0 then
            lift := CVOuterLift(omega, subgroup, outer);
          else
            lift := rec(status := "verified", liftExists := false,
              reason := "No bounded requested degree requires an outer lift of this class.");
          fi;
          Add(rootRows, rec(
            class := classNumber,
            classRepresentative := Length(Filtered(rootRows,
              row -> IsBound(row.class) and row.class = classNumber)) + 1,
            status := "verified",
            subgroupOrder := subgroupOrder,
            index := index,
            compatibleTargetDegrees := compatibleTargets,
            outerLift := lift
          ));
        fi;
      od;
    fi;
  od;
  rootIndices := SortedList(Set(List(Filtered(rootRows,
    row -> IsBound(row.index)), row -> row.index)));
  rows := [];
  for target in targets do
    containedIndex := target / 2;
    containedRows := [];
    if IsEvenInt(target) then
      containedRows := Filtered(rootRows, row -> IsBound(row.index)
        and containedIndex mod row.index = 0);
    fi;
    outerRows := Filtered(rootRows, row -> IsBound(row.index)
      and target mod row.index = 0);
    containedExact := Filtered(containedRows, row -> row.index = containedIndex);
    outerExactLift := Filtered(outerRows, row -> row.index = target
      and row.outerLift.status = "verified"
      and row.outerLift.liftExists = true);
    if not classComplete then
      containedOutcome := "unresolved";
      outerOutcome := "unresolved";
    else
      if Length(containedRows) = 0 then containedOutcome := "impossible";
      elif Length(containedExact) > 0 then containedOutcome := "admissible";
      else containedOutcome := "unresolved";
      fi;
      if Length(outerRows) = 0 then outerOutcome := "impossible";
      elif Length(outerExactLift) > 0 then outerOutcome := "admissible";
      elif ForAll(outerRows, row -> row.index = target
          and row.outerLift.status = "verified"
          and row.outerLift.liftExists = false) then
        outerOutcome := "impossible";
      else outerOutcome := "unresolved";
      fi;
    fi;
    if containedOutcome = "admissible" or outerOutcome = "admissible" then
      outcome := "admissible"; complete := true;
    elif containedOutcome = "impossible" and outerOutcome = "impossible" then
      outcome := "impossible"; complete := true;
    else
      outcome := "unresolved"; complete := false;
    fi;
    Add(rows, rec(
      degree := target,
      outcome := outcome,
      classificationComplete := complete,
      containedCase := rec(
        omegaIndex := containedIndex,
        outcome := containedOutcome,
        compatibleMaximalIndices := SortedList(Set(List(containedRows,
          row -> row.index)))),
      outerSurjectiveCase := rec(
        omegaIndex := target,
        outcome := outerOutcome,
        compatibleMaximalIndices := SortedList(Set(List(outerRows,
          row -> row.index)))),
      reason := (function()
        if outcome = "impossible" then
          return "No complete root maximal class can contain a subgroup of either required Omega index.";
        elif outcome = "admissible" then
          return "A root maximal subgroup or verified outer lift realizes this index.";
        fi;
        return "A compatible maximal class requires deeper subgroup or outer-lift analysis.";
      end)()
    ));
  od;
  allRowsComplete := classComplete and ForAll(rows,
    row -> row.classificationComplete = true);
  unresolved := Filtered(rows, row -> row.classificationComplete <> true);
  return rec(
    status := (function()
      if allRowsComplete then return "verified"; fi;
      return "unknown";
    end)(),
    reason := (function()
      if allRowsComplete then
        return "Every requested degree is decided by the complete maximal-index catalogue.";
      fi;
      return "The maximal catalogue is recorded, but compatible descendant branches remain.";
    end)(),
    ambientGroup := Concatenation("Omega+(10,", String(p), "):2"),
    appliesToImage := false,
    maximalCatalogue := rec(
      status := (function()
        if classComplete then return "verified"; fi;
        return "unknown";
      end)(),
      source := Concatenation("ClassicalMaximalsGeneric(\"O+\",10,",
        String(p), ",[1..9])"),
      completeByPackageRange := classComplete,
      packageVersion := CVPackageVersion("ClassicalMaximals"),
      aschbacherClasses := classRecords,
      maximalClassCount := Length(Filtered(rootRows,
        row -> IsBound(row.index))),
      maximalIndices := rootIndices,
      representatives := rootRows
    ),
    extensionLogic := rec(
      containedCase := "[G:L]=2[Omega:L] when L is contained in Omega",
      outerSurjectiveCase := "[G:L]=[Omega:L intersect Omega] with an outer-coset lift",
      rootDivisibilityCompleteForRejection := true
    ),
    targetLowerBound := input.lowerBound,
    targetMaximum := input.maxIndex,
    targetCount := Length(targets),
    degreeLedger := rows,
    unresolvedFrontier := List(unresolved, row -> rec(
      index := row.degree,
      reason := "compatible maximal class requires descendant analysis"))
  );
end;;

CVGenerate := function(input)
  local artifact, p, field, matrices, form, relationChecks, sphericalChecks,
    oldForm, standardOmega, standardForm, newForm, rowChange, candidates,
    candidateMethods, candidateMultipliers, candidatePosition, change,
    formMultiplier, transformed, outerRecord,
    sieve, evenGenerators, omegaRecord;
  CVValidateInput(input);
  CV_STAGE := "base-artifact";
  artifact := CVBaseArtifact(input);
  CVCheckpoint(artifact);
  if LoadPackage("Forms", false) <> true
      or LoadPackage("ClassicalMaximals", false) <> true
      or LoadPackage("genss", false) <> true then
    artifact.reason := "Forms, ClassicalMaximals, and GenSS are required.";
    CVCheckpoint(artifact);
    return artifact;
  fi;
  p := input.characteristic;
  CV_STAGE := "exact-relations-and-spherical-restrictions";
  field := GF(p);
  matrices := CVRowsToMatrices(input.matrixGeneratorRows, field);
  form := CVRowsToMatrix(input.preservedFormRows, field);
  relationChecks := CVCheckRelations(matrices, input.coxeterMatrix);
  sphericalChecks := CVCheckSphericalRestrictions(
    matrices, input.maximalSphericalSubgroups);
  if sphericalChecks.status <> "verified" then
    artifact.status := "failed";
    artifact.reason := sphericalChecks.reason;
    artifact.kernelCertificate := sphericalChecks;
    CVCheckpoint(artifact);
    return artifact;
  fi;
  artifact.kernelCertificate := rec(
    status := "verified",
    level := "torsion-free-finite-index-kernel-exact-index-unknown",
    reason := "Every maximal spherical special subgroup injects into the finite matrix image.",
    exactIndex := fail,
    finiteImage := true,
    maximalSphericalCatalogueComplete := true,
    maximalSphericalRestrictionChecks := sphericalChecks.checks,
    claim := "The congruence kernel is torsion-free and finite index.",
    nonClaim := "The image order and a manageable permutation cover are not yet certified."
  );
  artifact.representation.status := "verified";
  artifact.representation.relationChecks := relationChecks;
  CVCheckpoint(artifact);

  if form <> TransposedMat(form) or DeterminantMat(form) = Zero(field)
      or not ForAll(matrices,
        generator -> TransposedMat(generator) * form * generator = form) then
    artifact.status := "failed";
    artifact.reason := "The transferred symmetric form failed exact preservation.";
    artifact.structuralIdentification.preservedSplitForm := CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  oldForm := BilinearFormByMatrix(form, field);
  if WittIndex(oldForm) <> 5 then
    artifact.status := "failed";
    artifact.reason := "The preserved form is not split of Witt index five.";
    artifact.structuralIdentification.preservedSplitForm := CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  artifact.structuralIdentification.preservedSplitForm := rec(
    status := "verified", characteristic := p, dimension := 10,
    symmetric := true, nonsingular := true, wittIndex := 5,
    orthogonalType := "plus", rows := input.preservedFormRows,
    everyGeneratorPreservesForm := true);
  CVCheckpoint(artifact);

  standardOmega := Omega(1, 10, p);
  CV_STAGE := "standard-split-form";
  standardForm := InvariantBilinearForm(standardOmega).matrix;
  newForm := BilinearFormByMatrix(standardForm, field);
  rowChange := BaseChangeToCanonical(oldForm)^-1
    * BaseChangeToCanonical(newForm);
  candidates := [rowChange, TransposedMat(rowChange), rowChange^-1,
    TransposedMat(rowChange)^-1];
  candidateMethods := ["row-change", "transpose(row-change)",
    "inverse(row-change)", "inverse(transpose(row-change))"];
  candidateMultipliers := List(candidates,
    candidate -> CVFormSimilitudeMultiplier(candidate, form, standardForm));
  candidatePosition := PositionProperty(candidateMultipliers,
    multiplier -> multiplier <> fail);
  if candidatePosition = fail then
    artifact.status := "failed";
    artifact.reason := "No exact column-action basis change reaches the standard split form.";
    artifact.structuralIdentification.standardFormConjugacy := CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  change := candidates[candidatePosition];
  formMultiplier := candidateMultipliers[candidatePosition];
  transformed := List(matrices, generator -> generator^change);
  if not ForAll(transformed,
      generator -> TransposedMat(generator) * standardForm * generator = standardForm) then
    artifact.status := "failed";
    artifact.reason := "The exact standard-form basis change failed replay checks.";
    artifact.structuralIdentification.standardFormConjugacy := CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  artifact.structuralIdentification.standardFormConjugacy := rec(
    status := "verified",
    method := Concatenation("column-action variant: ",
      candidateMethods[candidatePosition],
      " of BaseChangeToCanonical(old)^-1 * BaseChangeToCanonical(standard)"),
    standardFormSource := Concatenation(
      "InvariantBilinearForm(Omega(1,10,", String(p), "))"),
    standardFormRows := CVMatrixRows(standardForm),
    formSimilitudeMultiplier := Int(formMultiplier),
    changeOfBasisRows := CVMatrixRows(change),
    transformedGeneratorRows := CVMatrixListRows(transformed),
    everyTransformedGeneratorPreservesStandardForm := true);
  CVCheckpoint(artifact);

  outerRecord := CVVerifyOuterRepresentative(
    transformed, standardForm, standardOmega, p);
  artifact.structuralIdentification.indexTwoExtension := outerRecord;
  CVCheckpoint(artifact);
  if outerRecord.status = "verified" then
    CV_STAGE := "classical-maximal-index-ledger";
    sieve := CVClassicalMaximalLedger(
      standardOmega, CVRowsToMatrix(outerRecord.standardBasisRows, field), input);
    artifact.degreeSieve := sieve;
  else
    artifact.degreeSieve.reason := "The ambient outer coset is not verified.";
  fi;
  CVCheckpoint(artifact);

  evenGenerators := List([2..Length(transformed)],
    index -> transformed[index] * transformed[1]^-1);
  CV_STAGE := "omega-equality";
  if IsBound(input.equalityStrategy)
      and input.equalityStrategy = "classical-containment-first" then
    omegaRecord := CVRecognizeOmegaByClassicalContainment(
      evenGenerators, standardOmega, p,
      input.classicalRecognitionRandomSeed,
      input.classicalRecognitionSamples);
    if omegaRecord.status = "unknown" then
      omegaRecord := CVRecognizeOmegaByGenSS(
        evenGenerators, standardOmega, p, input.orbitLengthLimit);
    fi;
  elif IsBound(input.equalityStrategy)
      and input.equalityStrategy = "exact-slp-finder-first" then
    omegaRecord := CVRecognizeOmegaByExactRecogSlps(
      evenGenerators, standardOmega, p);
    if omegaRecord.status = "unknown" then
      omegaRecord := CVRecognizeOmegaByGenSS(
        evenGenerators, standardOmega, p, input.orbitLengthLimit);
    fi;
  else
    omegaRecord := CVRecognizeOmegaByGenSS(
      evenGenerators, standardOmega, p, input.orbitLengthLimit);
    if omegaRecord.status = "unknown" and IsBound(input.equalityStrategy)
        and input.equalityStrategy = "genss-then-exact-slp-finder" then
      omegaRecord := CVRecognizeOmegaByExactRecogSlps(
        evenGenerators, standardOmega, p);
    fi;
  fi;
  artifact.structuralIdentification.omegaDerivedSubgroup := omegaRecord;
  CVCheckpoint(artifact);
  if omegaRecord.status = "verified" and outerRecord.status = "verified" then
    artifact.structuralIdentification.indexTwoExtension.imageEqualsExtension := true;
    artifact.degreeSieve.appliesToImage := true;
    artifact.kernelCertificate.level :=
      "torsion-free-finite-index-kernel-exact-index-known";
    artifact.kernelCertificate.exactIndex := 2 * omegaRecord.order;
    artifact.kernelCertificate.nonClaim :=
      "No manageable coset action is claimed until a bounded degree survives.";
  fi;
  if omegaRecord.status = "failed" or outerRecord.status = "failed" then
    artifact.status := "failed";
    artifact.reason := "An exact structural identity failed.";
  elif omegaRecord.status = "verified" and outerRecord.status = "verified"
      and artifact.degreeSieve.status = "verified" then
    artifact.status := "verified";
    artifact.reason := "Omega equality, outer coset, and every bounded degree row are verified.";
  else
    artifact.status := "unknown";
    artifact.reason := "The torsion-free kernel is certified; exact image promotion remains incomplete.";
  fi;
  CVCheckpoint(artifact);
  return artifact;
end;;

if not IsBound(ODD_OUTPUT) or not IsString(ODD_OUTPUT) then
  Print("ODD_OUTPUT is required.\n");
  QUIT_GAP(1);
fi;
if not IsBound(ODD_INPUT) or not IsRecord(ODD_INPUT) then
  CVWriteJson(ODD_OUTPUT, rec(
    schemaVersion := 1, certificateKind := "odd-prime-structural-certificate",
    status := "failed", reason := "ODD_INPUT is required.", tools := CVTools()));
  QUIT_GAP(1);
fi;

CV_RESULT := CALL_WITH_CATCH(CVGenerate, [ODD_INPUT]);;
if CV_RESULT[1] = true and Length(CV_RESULT) >= 2 then
  CVWriteJson(ODD_OUTPUT, CV_RESULT[2]);
else
  Print("ODD_EXCEPTION_STAGE=", CV_STAGE, "\n");
  Print("ODD_EXCEPTION_RECORD=", CV_RESULT, "\n");
  if not IsExistingFile(ODD_OUTPUT) then
    CVWriteJson(ODD_OUTPUT, rec(
      schemaVersion := 1,
      certificateKind := ODD_INPUT.certificateKind,
      characteristic := ODD_INPUT.characteristic,
      status := "unknown",
      reason := "GAP raised an exception before the first checkpoint.",
      provenance := ODD_INPUT.provenance,
      tools := CVTools()));
  fi;
fi;
