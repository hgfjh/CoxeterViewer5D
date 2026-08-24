# Replayable structural certificate for the compact 5-cube image over GF(3).
#
# A generated driver binds MOD3_INPUT and MOD3_OUTPUT.  No conclusion is
# inferred from a package name or an unverified recognition tree.  GAP writes
# checkpoints before expensive subgroup work, so a timeout remains an explicit
# unknown frontier rather than an accidental impossibility claim.

CVMod3CertificateId := "compact-5-cube-mod3-structural-certificate";;
CVMod3CertificateVersion := "1.1.0";;
CV_IO_AVAILABLE := LoadPackage("io", false) = true and IsBound(IO_rename);;

CVJsonEscape := function(value)
  local escaped;
  escaped := ReplacedString(value, "\\", "\\\\");
  escaped := ReplacedString(escaped, "\"", "\\\"");
  escaped := ReplacedString(escaped, "\n", "\\n");
  escaped := ReplacedString(escaped, "\r", "\\r");
  escaped := ReplacedString(escaped, "\t", "\\t");
  return escaped;
end;;

CVGapToJson := function(stream, value)
  local first, item, name;
  if IsStringRep(value) then
    WriteAll(stream, "\"");
    WriteAll(stream, CVJsonEscape(value));
    WriteAll(stream, "\"");
  elif IsBool(value) then
    if value then WriteAll(stream, "true"); else WriteAll(stream, "false"); fi;
  elif IsInt(value) then
    WriteAll(stream, String(value));
  elif value = fail then
    WriteAll(stream, "null");
  elif IsList(value) then
    WriteAll(stream, "[");
    first := true;
    for item in value do
      if first then first := false; else WriteAll(stream, ","); fi;
      CVGapToJson(stream, item);
    od;
    WriteAll(stream, "]");
  elif IsRecord(value) then
    WriteAll(stream, "{");
    first := true;
    for name in Set(RecNames(value)) do
      if first then first := false; else WriteAll(stream, ","); fi;
      CVGapToJson(stream, name);
      WriteAll(stream, ":");
      CVGapToJson(stream, value.(name));
    od;
    WriteAll(stream, "}");
  else
    ErrorNoReturn("The mod-3 certificate contains a non-JSON GAP object.");
  fi;
end;;

CVWriteJson := function(path, value)
  local stream, temporary, renamed;
  # Checkpoints are replaced atomically.  A process timeout may interrupt the
  # temporary write, but it cannot truncate the last scientifically valid JSON.
  temporary := Concatenation(path, ".tmp");
  stream := OutputTextFile(temporary, false);
  if stream = fail then return false; fi;
  SetPrintFormattingStatus(stream, false);
  CVGapToJson(stream, value);
  WriteLine(stream, "");
  CloseStream(stream);
  if not CV_IO_AVAILABLE then return false; fi;
  renamed := IO_rename(temporary, path);
  return renamed = true;
end;;

CVPackageVersion := function(name)
  local info;
  info := PackageInfo(name);
  if info = fail or Length(info) = 0 or not IsBound(info[1]!.Version) then
    return "unavailable";
  fi;
  return info[1]!.Version;
end;;

CVTools := function()
  return rec(
    gap := GAPInfo.Version,
    packages := rec(
      classicalMaximals := CVPackageVersion("ClassicalMaximals"),
      forms := CVPackageVersion("Forms"),
      genss := CVPackageVersion("genss"),
      orb := CVPackageVersion("orb"),
      recog := CVPackageVersion("recog")
    )
  );
end;;

CVUnknown := function(reason)
  return rec(status := "unknown", reason := reason);
end;;

CVFailed := function(reason)
  return rec(status := "failed", reason := reason);
end;;

CVMatrixRows := function(matrix)
  return List([1..NrRows(matrix)], row ->
    List([1..NrCols(matrix)], column -> Int(matrix[row][column])));
end;;

CVMatrixListRows := function(matrices)
  return List(matrices, CVMatrixRows);
end;;

CVRowsToMatrix := function(rows, field)
  return ImmutableMatrix(field,
    List(rows, row -> List(row, entry -> (entry mod Size(field)) * One(field))));
end;;

CVRowsToMatrices := function(rows, field)
  return List(rows, matrix -> CVRowsToMatrix(matrix, field));
end;;

CVIsInStandardOmega := function(matrix)
  return DeterminantMat(matrix) = One(DefaultFieldOfMatrix(matrix))
    and CallFuncList(ValueGlobal("CM_InOmega"), [matrix, 10, 3, 1]);
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
    certificateKind := CVMod3CertificateId,
    certificateVersion := CVMod3CertificateVersion,
    status := "unknown",
    reason := "generation-not-complete",
    provenance := input.provenance,
    coxeterMatrix := input.coxeterMatrix,
    representation := rec(
      characteristic := 3,
      dimension := input.dimension,
      matrixGeneratorRows := input.matrixGeneratorRows,
      preservedFormRows := input.preservedFormRows,
      status := "unknown"
    ),
    structuralIdentification := rec(
      preservedSplitForm := CVUnknown("not checked"),
      standardFormConjugacy := CVUnknown("not checked"),
      omegaDerivedSubgroup := CVUnknown("not checked"),
      indexTwoExtension := CVUnknown("not checked")
    ),
    degreeSieve := rec(
      status := "unknown",
      reason := "not run",
      degreeLedger := CVInitialDegreeLedger(input, "Index screening has not run."),
      unresolvedFrontier := [rec(index := 1, reason := "index screening has not run")]
    ),
    tools := CVTools()
  );
end;;

CVCheckpoint := function(artifact)
  return CVWriteJson(MOD3_OUTPUT, artifact);
end;;

CVValidateGenerateInput := function(input)
  local rank, i, j;
  if not IsRecord(input) or not IsBound(input.schemaVersion)
      or input.schemaVersion <> 1 then
    ErrorNoReturn("Unsupported mod-3 certificate input.");
  fi;
  if input.certificateKind <> CVMod3CertificateId
      or input.characteristic <> 3 or input.dimension <> 10 then
    ErrorNoReturn("This driver accepts only the compact-cube GF(3) model.");
  fi;
  rank := Length(input.coxeterMatrix);
  if rank <> 10 or Length(input.matrixGeneratorRows) <> rank
      or Length(input.preservedFormRows) <> rank then
    ErrorNoReturn("The exact rank-ten matrix transfer is incomplete.");
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
      ErrorNoReturn("An exact GF(3) generator is not an involution.");
    fi;
    Add(checks, rec(kind := "involution", generator := i - 1, passed := true));
  od;
  for i in [1..Length(matrices) - 1] do
    for j in [i + 1..Length(matrices)] do
      m := coxeterMatrix[i][j];
      if m <> 0 then
        if (matrices[i] * matrices[j])^m <> identity then
          ErrorNoReturn("An exact GF(3) Coxeter relation failed.");
        fi;
        Add(checks, rec(
          kind := "coxeter", generatorA := i - 1,
          generatorB := j - 1, exponent := m, passed := true));
      fi;
    od;
  od;
  return checks;
end;;

CVRecognitionTreeStats := function(root)
  local queue, depths, node, depth, nodes, leaves, maximum;
  queue := [root];
  depths := [0];
  nodes := 0;
  leaves := 0;
  maximum := 0;
  while Length(queue) > 0 do
    node := Remove(queue, 1);
    depth := Remove(depths, 1);
    nodes := nodes + 1;
    maximum := Maximum(maximum, depth);
    if IsLeaf(node) then leaves := leaves + 1; fi;
    if HasImageRecogNode(node) then
      Add(queue, ImageRecogNode(node)); Add(depths, depth + 1);
    fi;
    if HasKernelRecogNode(node) then
      Add(queue, KernelRecogNode(node)); Add(depths, depth + 1);
    fi;
  od;
  return rec(nodeCount := nodes, leafCount := leaves, maximumDepth := maximum);
end;;

CVRecordSlp := function(slp, inputCount, targetIndex, target)
  return rec(
    inputCount := inputCount,
    lines := LinesOfStraightLineProgram(slp),
    targetIndex := targetIndex,
    targetRows := CVMatrixRows(target)
  );
end;;

CVEvaluateExtRep := function(extrep, generators, dimension, field)
  local evaluated, position, generatorIndex, exponent;
  if not IsList(extrep) or Length(extrep) mod 2 <> 0 then return fail; fi;
  evaluated := IdentityMat(dimension, field);
  for position in [1,3..Length(extrep) - 1] do
    generatorIndex := extrep[position];
    exponent := extrep[position + 1];
    if not IsInt(generatorIndex) or generatorIndex < 1
        or generatorIndex > Length(generators) or not IsInt(exponent) then
      return fail;
    fi;
    evaluated := evaluated * generators[generatorIndex]^exponent;
  od;
  return evaluated;
end;;

CVRecognizeOmegaByGenSS := function(evenGenerators, standardOmega)
  local omegaOrder, allEvenInside, memoryGenerators, memoryGroup,
    chainCaught, chain, strongGenerators, strongToInput, standardGenerators,
    entries, targetIndex, target, siftCaught, sift, toInput, evaluated;
  if LoadPackage("genss", false) <> true
      or LoadPackage("ClassicalMaximals", false) <> true then
    return CVUnknown("GenSS or ClassicalMaximals is unavailable.");
  fi;
  omegaOrder := CallFuncList(ValueGlobal("SizeOmega"), [1, 10, 3]);
  allEvenInside := ForAll(evenGenerators, CVIsInStandardOmega);
  if not allEvenInside then
    return CVFailed("An even source generator failed exact Omega membership.");
  fi;
  memoryGenerators := GeneratorsWithMemory(evenGenerators);
  memoryGroup := Group(memoryGenerators);
  chainCaught := CALL_WITH_CATCH(StabilizerChain, [memoryGroup, rec(
    Size := omegaOrder,
    OrbitLengthLimit := 60000,
    FailInsteadOfError := true,
    ErrorBound := 1 / 1048576
  )]);
  if chainCaught[1] <> true or Length(chainCaught) < 2
      or chainCaught[2] = fail then
    return CVUnknown("GenSS did not construct the prescribed stabilizer chain.");
  fi;
  chain := chainCaught[2];
  if not IsProved(chain) then
    return CVUnknown("The GenSS stabilizer chain is not proved.");
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
      return CVUnknown("GenSS could not sift a standard Omega generator.");
    fi;
    sift := siftCaught[2];
    toInput := CompositionOfStraightLinePrograms(sift.slp, strongToInput);
    evaluated := ResultOfStraightLineProgram(toInput, evenGenerators);
    if evaluated <> target then
      return CVFailed("A GenSS standard-generator SLP failed exact replay.");
    fi;
    Add(entries, CVRecordSlp(
      toInput, Length(evenGenerators), targetIndex - 1, target));
  od;
  return rec(
    status := "verified",
    identifiedAs := "Omega+(10,3)",
    equalityMethod :=
      "CM_InOmega containment and proved GenSS chain of prescribed exact order",
    evenGeneratorRows := CVMatrixListRows(evenGenerators),
    standardOmegaGeneratorRows := CVMatrixListRows(standardGenerators),
    order := omegaOrder,
    exactContainment := rec(
      status := "verified", determinantOne := true,
      cmInOmega := true, checkedGeneratorCount := Length(evenGenerators)),
    stabilizerChain := rec(
      status := "verified", isProved := true,
      prescribedOrder := omegaOrder, orbitLengthLimit := 60000,
      failInsteadOfError := true, errorBoundNumerator := 1,
      errorBoundDenominator := 1048576,
      strongGeneratorCount := Length(strongGenerators),
      package := "GenSS", packageVersion := CVPackageVersion("genss")),
    faithfulOrbit := CVUnknown(
      "Not run; the proved GenSS chain supplied the primary equality proof."),
    recognitionTree := CVUnknown(
      "Generic recog was not needed; GenSS evidence is primary."),
    standardGeneratorSlps := rec(
      status := "verified",
      evidenceFormat := "genss-composed-straight-line-program",
      entries := entries,
      strongGeneratorsComposedToEvenGenerators := true)
  );
end;;

CVRecognizeOmegaByFaithfulOrbit := function(evenGroup, evenGenerators,
    standardOmega)
  local field, dimension, allEvenInside, omegaOrder, seedIndex, seed,
    orbitCaught, orbit, spanRank, homCaught, actionHom, permutationGroup,
    actionOrder, permutationGenerators, freeGroup, freeGenerators,
    epimorphism, standardGenerators, entries, targetIndex, target,
    targetPermutation, preimageCaught, preimage, extrep, evaluated,
    perfectCaught;
  field := DefaultFieldOfMatrix(evenGenerators[1]);
  dimension := NrRows(evenGenerators[1]);
  allEvenInside := ForAll(evenGenerators,
    generator -> generator in standardOmega);
  if not allEvenInside then
    return CVFailed("An even source generator lies outside standard Omega.");
  fi;
  omegaOrder := Size(standardOmega);
  for seedIndex in [1..dimension] do
    seed := ListWithIdenticalEntries(dimension, Zero(field));
    seed[seedIndex] := One(field);
    orbitCaught := CALL_WITH_CATCH(Orbit, [evenGroup, seed, OnRight]);
    if orbitCaught[1] <> true or Length(orbitCaught) < 2
        or not IsList(orbitCaught[2]) then
      continue;
    fi;
    orbit := orbitCaught[2];
    spanRank := RankMat(orbit);
    if spanRank <> dimension then continue; fi;
    homCaught := CALL_WITH_CATCH(ActionHomomorphism,
      [evenGroup, orbit, OnRight]);
    if homCaught[1] <> true or Length(homCaught) < 2
        or homCaught[2] = fail then
      continue;
    fi;
    actionHom := homCaught[2];
    permutationGroup := Image(actionHom);
    actionOrder := Size(permutationGroup);
    if actionOrder <> omegaOrder then
      return CVFailed(
        "The faithful spanning-orbit action has the wrong exact order.");
    fi;
    permutationGenerators := List(evenGenerators,
      generator -> Image(actionHom, generator));
    freeGroup := FreeGroup(Length(evenGenerators));
    freeGenerators := GeneratorsOfGroup(freeGroup);
    epimorphism := GroupHomomorphismByImages(freeGroup, permutationGroup,
      freeGenerators, permutationGenerators);
    if epimorphism = fail or not IsSurjective(epimorphism) then
      return CVUnknown(
        "The faithful action was verified, but its free-group epimorphism failed.");
    fi;
    standardGenerators := GeneratorsOfGroup(standardOmega);
    entries := [];
    for targetIndex in [1..Length(standardGenerators)] do
      target := standardGenerators[targetIndex];
      targetPermutation := Permutation(target, orbit, OnRight);
      preimageCaught := CALL_WITH_CATCH(PreImagesRepresentative,
        [epimorphism, targetPermutation]);
      if preimageCaught[1] <> true or Length(preimageCaught) < 2
          or preimageCaught[2] = fail then
        return CVUnknown(
          "The faithful action was verified, but a standard generator has no word.");
      fi;
      preimage := preimageCaught[2];
      extrep := ExtRepOfObj(preimage);
      evaluated := CVEvaluateExtRep(extrep, evenGenerators, dimension, field);
      if evaluated = fail or evaluated <> target then
        return CVFailed("A standard-generator signed word failed exact replay.");
      fi;
      Add(entries, rec(
        inputCount := Length(evenGenerators),
        targetIndex := targetIndex - 1,
        targetRows := CVMatrixRows(target),
        wordFormat := "free-group-extrep",
        extRep := extrep
      ));
    od;
    perfectCaught := CALL_WITH_CATCH(IsPerfectGroup, [standardOmega]);
    return rec(
      status := "verified",
      identifiedAs := "Omega+(10,3)",
      equalityMethod :=
        "faithful spanning orbit, exact BSGS order, and signed generator words",
      evenGeneratorRows := CVMatrixListRows(evenGenerators),
      standardOmegaGeneratorRows := CVMatrixListRows(standardGenerators),
      order := omegaOrder,
      perfect := rec(
        status := (function()
          if perfectCaught[1] = true and Length(perfectCaught) >= 2
              and perfectCaught[2] = true then return "verified"; fi;
          return "unknown";
        end)(),
        value := (function()
          return perfectCaught[1] = true and Length(perfectCaught) >= 2
            and perfectCaught[2] = true;
        end)()
      ),
      faithfulOrbit := rec(
        status := "verified",
        action := "row vectors acted on by the transformed even subgroup",
        seedBasisIndex := seedIndex - 1,
        seedRows := [List(seed, Int)],
        orbitSize := Length(orbit),
        spanRank := spanRank,
        moduleDimension := dimension,
        kernelTrivialBySpanningOrbit := true,
        permutationActionOrder := actionOrder,
        standardOmegaOrder := omegaOrder,
        orderEquality := true
      ),
      recognitionTree := CVUnknown(
        "Generic recog was not needed; faithful-orbit evidence is primary."),
      standardGeneratorSlps := rec(
        status := "verified",
        evidenceFormat := "free-group-extrep-signed-words",
        entries := entries,
        permutationPreimagesReplayedInMatrices := true
      )
    );
  od;
  return CVUnknown("No tested basis-vector orbit spanned the natural module.");
end;;

CVRecognizeOmegaWithRecog := function(evenGroup, evenGenerators, standardOmega)
  local caught, node, correct, nodeSize, omegaOrder, omegaGenerators,
    niceToInput, entries, index, target, toNice, toInput, evaluated,
    allEvenInside, perfectCaught;
  if LoadPackage("recog", false) <> true then
    return CVUnknown("The recog package is unavailable.");
  fi;
  caught := CALL_WITH_CATCH(RecogniseMatrixGroup, [evenGroup]);
  if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
    return CVUnknown("RecogniseMatrixGroup did not return a tree for the even subgroup.");
  fi;
  node := caught[2];
  if not IsReady(node) then
    return CVUnknown("The recognition tree for the even subgroup is not ready.");
  fi;
  caught := CALL_WITH_CATCH(IsCorrect, [node]);
  correct := caught[1] = true and Length(caught) >= 2 and caught[2] = true;
  if not correct then
    if caught[1] = true and Length(caught) >= 2 and caught[2] = false then
      return CVFailed("IsCorrect proved the even-subgroup recognition tree incorrect.");
    fi;
    return CVUnknown("The even-subgroup recognition tree could not be verified by IsCorrect.");
  fi;
  caught := CALL_WITH_CATCH(Size, [node]);
  if caught[1] <> true or Length(caught) < 2 or not IsInt(caught[2]) then
    return CVUnknown("The verified recognition tree did not provide an exact order.");
  fi;
  nodeSize := caught[2];
  omegaOrder := Size(standardOmega);
  allEvenInside := ForAll(evenGenerators, generator -> generator in standardOmega);
  if not allEvenInside or nodeSize <> omegaOrder then
    return CVFailed("The even subgroup is not the full standard Omega group.");
  fi;

  omegaGenerators := GeneratorsOfGroup(standardOmega);
  niceToInput := SLPforNiceGens(node);
  entries := [];
  for index in [1..Length(omegaGenerators)] do
    target := omegaGenerators[index];
    caught := CALL_WITH_CATCH(SLPforElement, [node, target]);
    if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
      return rec(
        status := "unknown",
        reason := "Recognition was verified, but a standard Omega generator has no SLP.",
        recognitionTree := rec(
          status := "verified", isCorrect := true, isReady := true,
          order := nodeSize, metadata := CVRecognitionTreeStats(node)
        ),
        standardGeneratorSlps := CVUnknown("SLPforElement returned no complete evidence.")
      );
    fi;
    toNice := caught[2];
    toInput := CompositionOfStraightLinePrograms(toNice, niceToInput);
    evaluated := ResultOfStraightLineProgram(toInput, evenGenerators);
    if evaluated <> target then
      return CVFailed("A composed standard-generator SLP failed evaluation.");
    fi;
    Add(entries, CVRecordSlp(toInput, Length(evenGenerators), index - 1, target));
  od;
  perfectCaught := CALL_WITH_CATCH(IsPerfectGroup, [standardOmega]);
  if perfectCaught[1] <> true or Length(perfectCaught) < 2
      or perfectCaught[2] <> true then
    return CVUnknown("GAP did not verify that the standard Omega group is perfect.");
  fi;
  return rec(
    status := "verified",
    identifiedAs := "Omega+(10,3)",
    equalityMethod := "mutual containment via standard-generator SLPs",
    evenGeneratorRows := CVMatrixListRows(evenGenerators),
    standardOmegaGeneratorRows := CVMatrixListRows(omegaGenerators),
    order := omegaOrder,
    perfect := true,
    recognitionTree := rec(
      status := "verified", isCorrect := true, isReady := true,
      order := nodeSize, packageVersion := CVPackageVersion("recog"),
      metadata := CVRecognitionTreeStats(node)
    ),
    standardGeneratorSlps := rec(
      status := "verified", entries := entries,
      niceGeneratorsComposedToEvenGenerators := true
    )
  );
end;;

CVRecognizeOmega := function(evenGroup, evenGenerators, standardOmega)
  local genssEvidence, orbitEvidence, fallback;
  genssEvidence := CVRecognizeOmegaByGenSS(evenGenerators, standardOmega);
  if genssEvidence.status <> "unknown" then return genssEvidence; fi;
  orbitEvidence := CVRecognizeOmegaByFaithfulOrbit(
    evenGroup, evenGenerators, standardOmega);
  if orbitEvidence.status <> "unknown" then return orbitEvidence; fi;
  if not IsBound(MOD3_INPUT.runGenericRecogDiagnostic)
      or MOD3_INPUT.runGenericRecogDiagnostic <> true then
    return rec(
      status := "unknown",
      reason := "GenSS and faithful-orbit evidence were inconclusive; generic recog was not requested.",
      genssAttempt := genssEvidence,
      faithfulOrbitAttempt := orbitEvidence,
      recognitionTreeAttempt := CVUnknown("Optional diagnostic not run."));
  fi;
  fallback := CVRecognizeOmegaWithRecog(
    evenGroup, evenGenerators, standardOmega);
  if fallback.status = "verified" then
    fallback.primaryGenSSAttempt := genssEvidence;
    fallback.primaryFaithfulOrbitAttempt := orbitEvidence;
    return fallback;
  fi;
  return rec(
    status := (function()
      if fallback.status = "failed" then return "failed"; fi;
      return "unknown";
    end)(),
    reason := "GenSS, faithful-orbit, and optional generic-recog evidence did not complete.",
    genssAttempt := genssEvidence,
    faithfulOrbitAttempt := orbitEvidence,
    recognitionTreeAttempt := fallback
  );
end;;

CVVerifyOuterRepresentative := function(transformed, original, standardForm,
    standardOmega, omegaRecord)
  local field, outer, identity, cosetChecks, index, quotientElement,
    normalizes, determinant;
  if omegaRecord.status <> "verified" then
    return CVUnknown("Omega equality must be verified before the outer coset.");
  fi;
  field := DefaultFieldOfMatrix(transformed[1]);
  identity := IdentityMat(Length(transformed[1]), field);
  outer := transformed[1];
  determinant := Int(DeterminantMat(outer));
  if outer^2 <> identity or determinant = 1
      or TransposedMat(outer) * standardForm * outer <> standardForm
      or CVIsInStandardOmega(outer) then
    return CVFailed("The selected source reflection is not a verified outer representative.");
  fi;
  cosetChecks := [];
  for index in [1..Length(transformed)] do
    quotientElement := transformed[index] * outer^-1;
    if not CVIsInStandardOmega(quotientElement) then
      return CVFailed("A source generator does not lie in Omega times the outer representative.");
    fi;
    Add(cosetChecks, rec(generator := index - 1, omegaCosetMembership := true));
  od;
  normalizes := ForAll(GeneratorsOfGroup(standardOmega),
    generator -> CVIsInStandardOmega(generator^outer));
  if not normalizes then
    return CVFailed("The outer representative does not normalize standard Omega.");
  fi;
  return rec(
    status := "verified",
    quotient := "C2",
    quotientIndex := 2,
    sourceGeneratorIndex := 0,
    determinant := determinant,
    involution := true,
    preservesStandardForm := true,
    outsideOmega := true,
    normalizesOmega := true,
    sourceBasisRows := CVMatrixRows(original[1]),
    standardBasisRows := CVMatrixRows(outer),
    sourceGeneratorCosetChecks := cosetChecks
  );
end;;

CVFindRecord := function(records, index)
  local item;
  for item in records do
    if item.index = index then return item; fi;
  od;
  return fail;
end;;

CVAddFoundSubgroup := function(records, index, subgroup, path)
  local item;
  item := CVFindRecord(records, index);
  if item = fail then
    item := rec(index := index, groups := [], paths := []);
    Add(records, item);
  fi;
  Add(item.groups, subgroup);
  Add(item.paths, path);
end;;

CVFrontierAffects := function(frontier, target)
  return ForAny(frontier, item -> target mod item.index = 0);
end;;

CVClassifyOmegaIndices := function(omega, outer, input)
  local targets, desired, rootCaught, rootMaximals, omegaOrder, rootIndices,
    queue, found, frontier, nodes, maximumNodes, subgroup, index, path,
    descendants, caught, maximals, child, ratio, childIndex, childPath,
    desiredIndex, item, rows, target, containedIndex, containedFound,
    containedComplete, outerFound, outerComplete, liftVerified, liftUnknown,
    conjugatorCaught, conjugator, lifted, candidate, outcome, reason,
    complete, status;

  targets := CVTargetDegrees(input.lowerBound, input.maxIndex);
  desired := Set(Concatenation(targets,
    List(Filtered(targets, IsEvenInt), degree -> degree / 2)));
  omegaOrder := Size(omega);
  maximumNodes := input.maxSubgroupNodes;
  rootCaught := CALL_WITH_CATCH(ValueGlobal("ClassicalMaximalsGeneric"),
    ["O+", 10, 3]);
  if rootCaught[1] <> true or Length(rootCaught) < 2
      or not IsList(rootCaught[2]) then
    return rec(
      status := "unknown",
      reason := "ClassicalMaximalsGeneric did not return the complete root catalogue.",
      maximalCatalogue := CVUnknown("root catalogue unavailable"),
      degreeLedger := List(targets, degree -> rec(
        degree := degree, outcome := "unresolved",
        classificationComplete := false,
        reason := "The complete Omega maximal catalogue is unavailable.")),
      unresolvedFrontier := [rec(index := 1, reason := "root catalogue unavailable")]
    );
  fi;
  rootMaximals := rootCaught[2];
  rootIndices := SortedList(Set(List(rootMaximals,
    subgroup -> omegaOrder / Size(subgroup))));
  queue := [];
  found := [];
  frontier := [];
  CVAddFoundSubgroup(found, 1, omega, []);
  for subgroup in rootMaximals do
    index := omegaOrder / Size(subgroup);
    if ForAny(desired, target -> target mod index = 0) then
      Add(queue, rec(group := subgroup, index := index, path := [index]));
    fi;
  od;
  nodes := 0;
  while Length(queue) > 0 do
    item := Remove(queue, 1);
    subgroup := item.group;
    index := item.index;
    path := item.path;
    nodes := nodes + 1;
    CVAddFoundSubgroup(found, index, subgroup, path);
    descendants := Filtered(desired,
      target -> target > index and target mod index = 0);
    if Length(descendants) = 0 then continue; fi;
    if nodes >= maximumNodes then
      Add(frontier, rec(
        index := index, reason := "configured subgroup-node cap",
        affectedDesiredIndices := descendants));
      continue;
    fi;
    caught := CALL_WITH_CATCH(MaximalSubgroupClassReps, [subgroup]);
    if caught[1] <> true or Length(caught) < 2 or not IsList(caught[2]) then
      Add(frontier, rec(
        index := index, reason := "MaximalSubgroupClassReps unavailable for branch",
        affectedDesiredIndices := descendants));
      continue;
    fi;
    maximals := caught[2];
    for child in maximals do
      if Size(subgroup) mod Size(child) <> 0 then
        Add(frontier, rec(
          index := index, reason := "nonintegral child index",
          affectedDesiredIndices := descendants));
        continue;
      fi;
      ratio := Size(subgroup) / Size(child);
      childIndex := index * ratio;
      if childIndex > 1 and ForAny(desired,
          target -> target mod childIndex = 0) then
        childPath := Concatenation(path, [ratio]);
        Add(queue, rec(group := child, index := childIndex, path := childPath));
      fi;
    od;
  od;

  rows := [];
  for target in targets do
    containedIndex := target / 2;
    containedFound := false;
    containedComplete := true;
    if IsEvenInt(target) then
      containedFound := CVFindRecord(found, containedIndex) <> fail;
      containedComplete := not CVFrontierAffects(frontier, containedIndex);
    fi;
    outerFound := CVFindRecord(found, target);
    outerComplete := not CVFrontierAffects(frontier, target);
    liftVerified := false;
    liftUnknown := false;
    if outerFound <> fail then
      for subgroup in outerFound.groups do
        conjugatorCaught := CALL_WITH_CATCH(RepresentativeAction,
          [omega, subgroup^outer, subgroup, OnPoints]);
        if conjugatorCaught[1] <> true or Length(conjugatorCaught) < 2 then
          liftUnknown := true;
        elif conjugatorCaught[2] <> fail then
          conjugator := conjugatorCaught[2];
          candidate := outer * conjugator;
          if subgroup^candidate = subgroup and candidate^2 in subgroup then
            liftVerified := true;
          else
            # A different normalizer coset may still solve x^2 in K.
            liftUnknown := true;
          fi;
        fi;
      od;
    fi;
    if liftUnknown then outerComplete := false; fi;

    if containedFound or liftVerified then
      outcome := "admissible";
      complete := true;
      if containedFound then
        reason := "A contained subgroup of Omega gives an exact subgroup of the index-two extension.";
      else
        reason := "An outer-coset lift was explicitly verified.";
      fi;
    elif containedComplete and outerComplete then
      outcome := "impossible";
      complete := true;
      reason := "Complete compatible branches contain neither a contained subgroup nor an outer lift.";
    else
      outcome := "unresolved";
      complete := false;
      reason := "At least one compatible recursive or index-two lift branch is unresolved.";
    fi;
    Add(rows, rec(
      degree := target,
      outcome := outcome,
      classificationComplete := complete,
      containedCase := rec(
        omegaIndex := containedIndex,
        subgroupFound := containedFound,
        classificationComplete := containedComplete),
      outerSurjectiveCase := rec(
        omegaIndex := target,
        subgroupClassCount := (function()
          if outerFound = fail then return 0; fi;
          return Length(outerFound.groups);
        end)(),
        liftVerified := liftVerified,
        classificationComplete := outerComplete),
      reason := reason
    ));
  od;
  complete := ForAll(rows, row -> row.classificationComplete = true);
  if complete then status := "verified"; else status := "unknown"; fi;
  return rec(
    status := status,
    reason := (function()
      if complete then return "Every requested degree has a complete exact index decision."; fi;
      return "The complete root sieve ran, but some compatible recursive branches remain unresolved.";
    end)(),
    maximalCatalogue := rec(
      status := "verified",
      source := "ClassicalMaximalsGeneric(\"O+\",10,3)",
      completeByPackageRange := true,
      packageVersion := CVPackageVersion("ClassicalMaximals"),
      maximalClassCount := Length(rootMaximals),
      maximalIndices := rootIndices
    ),
    targetLowerBound := input.lowerBound,
    targetMaximum := input.maxIndex,
    targetCount := Length(targets),
    recursiveNodesExamined := nodes,
    configuredNodeCap := maximumNodes,
    degreeLedger := rows,
    unresolvedFrontier := frontier
  );
end;;

CVGenerate := function(input)
  local artifact, field, matrices, form, relationChecks, group, oldForm,
    standardOmega, standardForm, newForm, rowChange, candidates,
    candidateMethods, candidatePosition, change, transformed,
    evenGenerators, evenGroup, omegaRecord, outerRecord, sieve;
  CVValidateGenerateInput(input);
  artifact := CVBaseArtifact(input);
  CVCheckpoint(artifact);
  if LoadPackage("Forms", false) <> true
      or LoadPackage("ClassicalMaximals", false) <> true then
    artifact.reason := "Required Forms or ClassicalMaximals package unavailable.";
    CVCheckpoint(artifact);
    return artifact;
  fi;
  field := GF(3);
  matrices := CVRowsToMatrices(input.matrixGeneratorRows, field);
  form := CVRowsToMatrix(input.preservedFormRows, field);
  relationChecks := CVCheckRelations(matrices, input.coxeterMatrix);
  if form <> TransposedMat(form) or DeterminantMat(form) = Zero(field)
      or not ForAll(matrices,
        generator -> TransposedMat(generator) * form * generator = form) then
    artifact.status := "failed";
    artifact.reason := "The transferred symmetric form failed exact preservation.";
    artifact.structuralIdentification.preservedSplitForm :=
      CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  oldForm := BilinearFormByMatrix(form, field);
  if WittIndex(oldForm) <> 5 then
    artifact.status := "failed";
    artifact.reason := "The preserved form is not split of Witt index five.";
    artifact.structuralIdentification.preservedSplitForm :=
      CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  artifact.representation.status := "verified";
  artifact.representation.relationChecks := relationChecks;
  artifact.structuralIdentification.preservedSplitForm := rec(
    status := "verified", characteristic := 3, dimension := 10,
    symmetric := true, nonsingular := true, wittIndex := 5,
    orthogonalType := "plus", rows := input.preservedFormRows,
    everyGeneratorPreservesForm := true);
  CVCheckpoint(artifact);

  standardOmega := Omega(1, 10, 3);
  standardForm := InvariantBilinearForm(standardOmega).matrix;
  newForm := BilinearFormByMatrix(standardForm, field);
  # ClassicalMaximals' form helper uses row-action conventions, whereas the
  # stored Tits matrices act on columns.  Select the corresponding transpose /
  # inverse variant by the exact equation C^T F_old C = F_standard.
  rowChange := BaseChangeToCanonical(oldForm)^-1
    * BaseChangeToCanonical(newForm);
  candidates := [
    rowChange,
    TransposedMat(rowChange),
    rowChange^-1,
    TransposedMat(rowChange)^-1
  ];
  candidateMethods := [
    "row-change",
    "transpose(row-change)",
    "inverse(row-change)",
    "inverse(transpose(row-change))"
  ];
  candidatePosition := PositionProperty(candidates,
    candidate -> TransposedMat(candidate) * form * candidate = standardForm);
  if candidatePosition = fail then
    artifact.status := "failed";
    artifact.reason := "No exact column-action change of basis reaches the standard form.";
    artifact.structuralIdentification.standardFormConjugacy :=
      CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  change := candidates[candidatePosition];
  transformed := List(matrices, generator -> generator^change);
  if DeterminantMat(change) = Zero(field)
      or not ForAll(transformed,
        generator -> TransposedMat(generator) * standardForm * generator
          = standardForm) then
    artifact.status := "failed";
    artifact.reason := "The exact standard-form change of basis failed replay checks.";
    artifact.structuralIdentification.standardFormConjugacy :=
      CVFailed(artifact.reason);
    CVCheckpoint(artifact);
    return artifact;
  fi;
  artifact.structuralIdentification.standardFormConjugacy := rec(
    status := "verified",
    method := Concatenation(
      "column-action variant: ", candidateMethods[candidatePosition],
      " of BaseChangeToCanonical(old)^-1 * BaseChangeToCanonical(standard)"),
    standardFormSource := "InvariantBilinearForm(Omega(1,10,3))",
    standardFormRows := CVMatrixRows(standardForm),
    changeOfBasisRows := CVMatrixRows(change),
    transformedGeneratorRows := CVMatrixListRows(transformed),
    everyTransformedGeneratorPreservesStandardForm := true);
  CVCheckpoint(artifact);

  evenGenerators := List([2..Length(transformed)],
    index -> transformed[index] * transformed[1]^-1);
  evenGroup := Group(evenGenerators);
  omegaRecord := CVRecognizeOmega(evenGroup, evenGenerators, standardOmega);
  artifact.structuralIdentification.omegaDerivedSubgroup := omegaRecord;
  CVCheckpoint(artifact);
  outerRecord := CVVerifyOuterRepresentative(
    transformed, matrices, standardForm, standardOmega, omegaRecord);
  artifact.structuralIdentification.indexTwoExtension := outerRecord;
  CVCheckpoint(artifact);

  if omegaRecord.status = "verified" and outerRecord.status = "verified" then
    sieve := CVClassifyOmegaIndices(standardOmega,
      CVRowsToMatrix(outerRecord.standardBasisRows, field), input);
    artifact.degreeSieve := sieve;
  else
    artifact.degreeSieve := CVUnknown(
      "Index screening requires verified Omega equality and the outer representative.");
    artifact.degreeSieve.degreeLedger := CVInitialDegreeLedger(input,
      "Structural identification is incomplete.");
    artifact.degreeSieve.unresolvedFrontier := [rec(
      index := 1, reason := "structural identification incomplete")];
  fi;
  if omegaRecord.status = "failed" or outerRecord.status = "failed" then
    artifact.status := "failed";
    artifact.reason := "A structural identity check failed.";
  elif omegaRecord.status = "verified" and outerRecord.status = "verified"
      and artifact.degreeSieve.status = "verified" then
    artifact.status := "verified";
    artifact.reason := "Structural identification and every bounded index row are verified.";
  else
    artifact.status := "unknown";
    artifact.reason := "Verified fields are retained; at least one scientific frontier remains unknown.";
  fi;
  CVCheckpoint(artifact);
  return artifact;
end;;

CVReplay := function(input)
  local field, matrices, form, standardForm, change, transformed, expected,
    evenGenerators, standardGenerators, slpRecord, entries, entry, slp,
    evaluated, outer, identity, checks, standardOmega, evenGroup,
    quotientElement, sieve, storedSieve, targetIndices, genssReplay,
    storedChain;
  if LoadPackage("ClassicalMaximals", false) <> true
      or LoadPackage("genss", false) <> true then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown", reason := "GenSS or ClassicalMaximals is unavailable.",
      provenance := input.provenance, tools := CVTools());
  fi;
  field := GF(3);
  matrices := CVRowsToMatrices(input.matrixGeneratorRows, field);
  form := CVRowsToMatrix(input.preservedFormRows, field);
  standardForm := CVRowsToMatrix(input.standardFormRows, field);
  change := CVRowsToMatrix(input.changeOfBasisRows, field);
  transformed := List(matrices, generator -> generator^change);
  expected := CVRowsToMatrices(input.transformedGeneratorRows, field);
  if transformed <> expected
      or not ForAll(matrices,
        generator -> TransposedMat(generator) * form * generator = form)
      or not ForAll(transformed,
        generator -> TransposedMat(generator) * standardForm * generator
          = standardForm) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed", reason := "Stored matrices or change of basis failed replay.",
      provenance := input.provenance, tools := CVTools());
  fi;
  checks := CVCheckRelations(matrices, input.coxeterMatrix);
  evenGenerators := List([2..Length(transformed)],
    index -> transformed[index] * transformed[1]^-1);
  if CVMatrixListRows(evenGenerators) <> input.evenGeneratorRows then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed", reason := "Stored even generators failed replay.",
      provenance := input.provenance, tools := CVTools());
  fi;
  standardOmega := Omega(1, 10, 3);
  standardGenerators := CVRowsToMatrices(input.standardOmegaGeneratorRows, field);
  if standardGenerators <> GeneratorsOfGroup(standardOmega) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed",
      reason := "Stored standard generators are not the canonical Omega generators.",
      provenance := input.provenance, tools := CVTools());
  fi;
  # This is H <= Omega.  The stored SLPs below prove the reverse inclusion.
  if not ForAll(evenGenerators, CVIsInStandardOmega) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed",
      reason := "An even source generator lies outside standard Omega.",
      provenance := input.provenance, tools := CVTools());
  fi;
  evenGroup := Group(evenGenerators);
  if not IsBound(input.stabilizerChain)
      or not IsRecord(input.stabilizerChain) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown",
      reason := "No proved GenSS stabilizer-chain evidence was stored.",
      provenance := input.provenance, tools := CVTools());
  fi;
  storedChain := input.stabilizerChain;
  if storedChain.status <> "verified" or storedChain.isProved <> true
      or storedChain.prescribedOrder <>
        CallFuncList(ValueGlobal("SizeOmega"), [1, 10, 3])
      or storedChain.orbitLengthLimit <> 60000
      or storedChain.errorBoundNumerator <> 1
      or storedChain.errorBoundDenominator <> 1048576 then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed", reason := "The stored GenSS chain contract is malformed.",
      provenance := input.provenance, tools := CVTools());
  fi;
  genssReplay := CVRecognizeOmegaByGenSS(evenGenerators, standardOmega);
  if genssReplay.status = "failed" then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed",
      reason := "The exact GenSS equality proof failed during replay.",
      provenance := input.provenance, tools := CVTools());
  fi;
  if genssReplay.status <> "verified"
      or genssReplay.order <> storedChain.prescribedOrder
      or genssReplay.stabilizerChain.isProved <> true then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown",
      reason := "The exact GenSS equality proof was inconclusive during replay.",
      provenance := input.provenance, tools := CVTools());
  fi;
  slpRecord := input.standardGeneratorSlps;
  if not IsRecord(slpRecord) or not IsBound(slpRecord.status)
      or slpRecord.status <> "verified"
      or slpRecord.evidenceFormat <>
        "genss-composed-straight-line-program" then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown", reason := "No verified GenSS standard-generator SLPs were stored.",
      provenance := input.provenance, tools := CVTools());
  fi;
  entries := slpRecord.entries;
  if Length(entries) <> Length(standardGenerators) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed", reason := "The standard-generator SLP list is incomplete.",
      provenance := input.provenance, tools := CVTools());
  fi;
  targetIndices := SortedList(List(entries, entry -> entry.targetIndex));
  if targetIndices <> [0..Length(standardGenerators) - 1] then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed", reason := "The signed-word target indices are incomplete or duplicated.",
      provenance := input.provenance, tools := CVTools());
  fi;
  for entry in entries do
    if not IsBound(entry.targetIndex) or entry.targetIndex < 0
        or entry.targetIndex >= Length(standardGenerators)
        or entry.inputCount <> Length(evenGenerators)
        or not IsBound(entry.lines) then
      return rec(
        schemaVersion := 1, certificateKind := CVMod3CertificateId,
        status := "failed", reason := "A stored SLP has invalid dimensions or target.",
        provenance := input.provenance, tools := CVTools());
    fi;
    slp := StraightLineProgram(entry.lines, entry.inputCount);
    evaluated := ResultOfStraightLineProgram(slp, evenGenerators);
    if evaluated <> standardGenerators[entry.targetIndex + 1]
        or CVMatrixRows(evaluated) <> entry.targetRows then
      return rec(
        schemaVersion := 1, certificateKind := CVMod3CertificateId,
        status := "failed", reason := "A standard-generator SLP failed replay.",
      provenance := input.provenance, tools := CVTools());
    fi;
  od;
  # The replayed words are direct matrix identities, so they establish
  # Omega <= H without invoking a second generic matrix-group membership test.
  outer := CVRowsToMatrix(input.outerRepresentative.standardBasisRows, field);
  identity := IdentityMat(10, field);
  if outer <> transformed[1] or outer^2 <> identity
      or DeterminantMat(outer) = One(field)
      or TransposedMat(outer) * standardForm * outer <> standardForm
      or CVIsInStandardOmega(outer)
      or not ForAll(GeneratorsOfGroup(standardOmega),
        generator -> CVIsInStandardOmega(generator^outer)) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed", reason := "The index-two outer representative failed replay.",
      provenance := input.provenance, tools := CVTools());
  fi;
  for quotientElement in transformed do
    if not CVIsInStandardOmega(quotientElement * outer^-1) then
      return rec(
        schemaVersion := 1, certificateKind := CVMod3CertificateId,
        status := "failed",
        reason := "A transformed source generator is not in Omega times the outer representative.",
        provenance := input.provenance, tools := CVTools());
    fi;
  od;

  if not IsBound(input.storedDegreeSieve)
      or not IsRecord(input.storedDegreeSieve) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown", reason := "No stored degree sieve was supplied for replay.",
      provenance := input.provenance, tools := CVTools());
  fi;
  storedSieve := input.storedDegreeSieve;
  sieve := CVClassifyOmegaIndices(standardOmega, outer, input);
  if not IsBound(sieve.maximalCatalogue)
      or sieve.maximalCatalogue.status <> "verified" then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown",
      reason := "The complete ClassicalMaximals root catalogue was unavailable during replay.",
      provenance := input.provenance, tools := CVTools());
  fi;
  if not IsBound(storedSieve.maximalCatalogue)
      or sieve.maximalCatalogue <> storedSieve.maximalCatalogue
      or sieve.degreeLedger <> storedSieve.degreeLedger
      or sieve.unresolvedFrontier <> storedSieve.unresolvedFrontier
      or sieve.targetLowerBound <> storedSieve.targetLowerBound
      or sieve.targetMaximum <> storedSieve.targetMaximum
      or sieve.targetCount <> storedSieve.targetCount
      or sieve.configuredNodeCap <> storedSieve.configuredNodeCap then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed",
      reason := "Recomputed ClassicalMaximals evidence differs from the stored ledger.",
      provenance := input.provenance, tools := CVTools());
  fi;
  if sieve.status <> "verified" or storedSieve.status <> "verified" then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown",
      reason := "The exact replay matches, but at least one degree remains unresolved.",
      replayedDegreeRows := Length(sieve.degreeLedger),
      provenance := input.provenance, tools := CVTools());
  fi;
  return rec(
    schemaVersion := 1, certificateKind := CVMod3CertificateId,
    status := "verified",
    reason := "Mutual Omega containment, the outer coset, and all stored index rows replayed exactly.",
    replayedRelationChecks := Length(checks),
    replayedStandardGeneratorSlps := Length(entries),
    genssChainReproved := true,
    genssPrescribedOrder := genssReplay.order,
    evenSubgroupContainedInOmega := true,
    omegaContainedInEvenSubgroup := true,
    outerRepresentativeOutsideOmega := true,
    outerRepresentativeNormalizesOmega := true,
    sourceGeneratorsInOuterCoset := true,
    replayedDegreeRows := Length(sieve.degreeLedger),
    degreeLedgerMatches := true,
    provenance := input.provenance, tools := CVTools());
end;;

CVAuxiliaryRecognition := function(input)
  local field, evenGenerators, group, seed, orbit, action, caught, node,
    correctCaught;
  if LoadPackage("recog", false) <> true then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown", reason := "The optional recog package is unavailable.",
      provenance := input.provenance, tools := CVTools());
  fi;
  field := GF(3);
  evenGenerators := CVRowsToMatrices(input.evenGeneratorRows, field);
  group := Group(evenGenerators);
  seed := Concatenation([One(field)],
    ListWithIdenticalEntries(9, Zero(field)));
  orbit := Orbit(group, seed, OnRight);
  if RankMat(orbit) <> 10 then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed",
      reason := "The auxiliary permutation action is not certified faithful.",
      provenance := input.provenance, tools := CVTools());
  fi;
  action := Action(group, orbit, OnRight);
  caught := CALL_WITH_CATCH(RecogniseGroup, [action]);
  if caught[1] <> true or Length(caught) < 2 or caught[2] = fail then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown", reason := "Auxiliary permutation recog returned no tree.",
      faithfulPermutationDegree := Length(orbit),
      provenance := input.provenance, tools := CVTools());
  fi;
  node := caught[2];
  if not IsReady(node) then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown", reason := "Auxiliary recog tree is not ready.",
      faithfulPermutationDegree := Length(orbit),
      provenance := input.provenance, tools := CVTools());
  fi;
  correctCaught := CALL_WITH_CATCH(IsCorrect, [node]);
  if correctCaught[1] <> true or Length(correctCaught) < 2 then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "unknown", reason := "Auxiliary IsCorrect did not return a result.",
      faithfulPermutationDegree := Length(orbit),
      provenance := input.provenance, tools := CVTools());
  fi;
  if correctCaught[2] <> true then
    return rec(
      schemaVersion := 1, certificateKind := CVMod3CertificateId,
      status := "failed", reason := "Auxiliary IsCorrect rejected the recog tree.",
      faithfulPermutationDegree := Length(orbit),
      provenance := input.provenance, tools := CVTools());
  fi;
  return rec(
    schemaVersion := 1, certificateKind := CVMod3CertificateId,
    status := "verified",
    reason := "Auxiliary recog tree on the faithful permutation image passed IsCorrect.",
    role := "optional non-promotion diagnostic",
    faithfulPermutationDegree := Length(orbit),
    faithfulPermutationOrder := Size(action),
    recognitionTree := rec(
      status := "verified", isReady := true, isCorrect := true,
      packageVersion := CVPackageVersion("recog"),
      metadata := CVRecognitionTreeStats(node)),
    provenance := input.provenance, tools := CVTools());
end;;

if not IsBound(MOD3_OUTPUT) or not IsString(MOD3_OUTPUT) then
  Print("MOD3_OUTPUT is required.\n");
  QUIT_GAP(1);
fi;
if not IsBound(MOD3_INPUT) or not IsRecord(MOD3_INPUT) then
  CVWriteJson(MOD3_OUTPUT, rec(
    schemaVersion := 1, certificateKind := CVMod3CertificateId,
    status := "failed", reason := "MOD3_INPUT is required.", tools := CVTools()));
  QUIT_GAP(1);
fi;

if IsBound(MOD3_INPUT.mode) and MOD3_INPUT.mode = "replay" then
  CV_RESULT := CALL_WITH_CATCH(CVReplay, [MOD3_INPUT]);;
elif IsBound(MOD3_INPUT.mode) and MOD3_INPUT.mode = "auxiliary-recog" then
  CV_RESULT := CALL_WITH_CATCH(CVAuxiliaryRecognition, [MOD3_INPUT]);;
else
  CV_RESULT := CALL_WITH_CATCH(CVGenerate, [MOD3_INPUT]);;
fi;
if CV_RESULT[1] = true and Length(CV_RESULT) >= 2 then
  CVWriteJson(MOD3_OUTPUT, CV_RESULT[2]);
  if CV_RESULT[2].status = "failed" then QUIT_GAP(1); fi;
  QUIT_GAP(0);
fi;
CVWriteJson(MOD3_OUTPUT, rec(
  schemaVersion := 1, certificateKind := CVMod3CertificateId,
  status := "failed", reason := "GAP raised an exception.", tools := CVTools()));
QUIT_GAP(1);
