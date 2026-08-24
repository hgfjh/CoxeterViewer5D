# Automatic low-index torsion-free subgroup discovery for Coxeter groups.
#
# The Python launcher validates the Coxeter matrix and supplies the maximal
# spherical subsets. GAP then enumerates prime-order conjugacy-class witnesses
# inside those finite special subgroups, passes the witnesses to the low-index
# iterator, and independently checks the resulting coset action. The line
# protocol is deliberately small; JSON serialization stays in Python.

CoxeterViewerBackendId := "gap-low-index-torsion-free";;
CoxeterViewerBackendVersion := "1.1.0";;

CoxeterViewerArgValue := function(name)
  local position;
  position := Position(ARGV, name);
  if position = fail or position = Length(ARGV) then
    return fail;
  fi;
  return ARGV[position + 1];
end;;

CoxeterViewerJoinIntegers := function(values)
  local text, index;
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

CoxeterViewerWriteLine := function(path, fields)
  AppendTo(path, JoinStringsWithSeparator(List(fields, String), "|"), "\n");
end;;

CoxeterViewerWriteStatus := function(path, status, code, message)
  CoxeterViewerWriteLine(path, ["STATUS", status, code, message]);
end;;

CoxeterViewerWordFromIndices := function(indices, generators, group)
  local result, index;
  result := One(group);
  for index in indices do
    result := result * generators[index];
  od;
  return result;
end;;

# Underlying free words use generator/exponent pairs. Coxeter generators are
# involutions, so a negative syllable has the same image as its positive one.
CoxeterViewerExpandedWord := function(word)
  local external, result, position, generator, exponent, count;
  external := ExtRepOfObj(word);
  result := [];
  if Length(external) = 0 then
    return result;
  fi;
  for position in [1,3..Length(external) - 1] do
    generator := external[position];
    exponent := external[position + 1];
    for count in [1..AbsInt(exponent)] do
      Add(result, generator);
    od;
  od;
  return result;
end;;

CoxeterViewerCoxeterPresentation := function(rank, matrix, prefix)
  local freeGroup, freeGenerators, relators, i, j, m, fpGroup;
  freeGroup := FreeGroup(rank, prefix);
  freeGenerators := GeneratorsOfGroup(freeGroup);
  relators := [];
  for i in [1..rank] do
    Add(relators, freeGenerators[i]^2);
  od;
  if rank > 1 then
    for i in [1..rank - 1] do
      for j in [i + 1..rank] do
        m := matrix[i][j];
        if m <> 0 then
          Add(relators, (freeGenerators[i] * freeGenerators[j])^m);
        fi;
      od;
    od;
  fi;
  fpGroup := freeGroup / relators;
  return rec(
    freeGroup := freeGroup,
    freeGenerators := freeGenerators,
    fpGroup := fpGroup,
    fpGenerators := GeneratorsOfGroup(fpGroup)
  );
end;;

CoxeterViewerSubmatrix := function(matrix, subset)
  return List(subset, i -> List(subset, j -> matrix[i][j]));
end;;

CoxeterViewerEnumerateWitnesses := function(input, fullFreeGenerators, fullFreeGroup, rawPath)
  local witnesses, spherical, subset, localPresentation, permutationMap,
    permutationGroup, actualOrder, classes, class, representative, primeOrder,
    preimage, localWord, globalWord, witness, existing, witnessIndex;

  witnesses := [];
  for spherical in input.sphericalSubgroups do
    subset := spherical.subset;
    localPresentation := CoxeterViewerCoxeterPresentation(
      Length(subset),
      CoxeterViewerSubmatrix(input.coxeterMatrix, subset),
      "t"
    );
    permutationMap := IsomorphismPermGroup(localPresentation.fpGroup);
    if permutationMap = fail then
      CoxeterViewerWriteStatus(rawPath, "failed", "spherical-permutation-failed",
        Concatenation("GAP could not enumerate spherical subset ", CoxeterViewerJoinIntegers(subset)));
      return fail;
    fi;
    permutationGroup := Image(permutationMap);
    actualOrder := Size(permutationGroup);
    if actualOrder <> spherical.expectedOrder then
      CoxeterViewerWriteStatus(rawPath, "failed", "spherical-order-mismatch",
        Concatenation("Expected order ", String(spherical.expectedOrder), " but GAP found ", String(actualOrder)));
      return fail;
    fi;

    classes := ConjugacyClasses(permutationGroup);
    for class in classes do
      representative := Representative(class);
      primeOrder := Order(representative);
      if primeOrder > 1 and IsPrimeInt(primeOrder) then
        preimage := PreImagesRepresentative(permutationMap, representative);
        localWord := CoxeterViewerExpandedWord(UnderlyingElement(preimage));
        globalWord := List(localWord, index -> subset[index]);
        witness := rec(
          subset := subset,
          typeName := spherical.typeName,
          sphericalOrder := actualOrder,
          primeOrder := primeOrder,
          classSize := Size(class),
          generatorIndices := globalWord,
          freeWord := CoxeterViewerWordFromIndices(globalWord, fullFreeGenerators, fullFreeGroup)
        );

        # Repeated witnesses are harmless but needlessly enlarge the low-index
        # exclusion list. Equality here is equality as free words, so removing a
        # duplicate cannot merge two merely conjectural Coxeter conjugacy classes.
        existing := First(witnesses, item -> item.freeWord = witness.freeWord);
        if existing = fail then
          Add(witnesses, witness);
          if Length(witnesses) > input.maxWitnesses then
            CoxeterViewerWriteStatus(rawPath, "failed", "witness-cap",
              Concatenation("Prime-order witness count exceeded maxWitnesses=", String(input.maxWitnesses)));
            return fail;
          fi;
        fi;
      fi;
    od;
  od;

  for witnessIndex in [1..Length(witnesses)] do
    witness := witnesses[witnessIndex];
    CoxeterViewerWriteLine(rawPath, [
      "WITNESS",
      witnessIndex - 1,
      CoxeterViewerJoinIntegers(List(witness.subset, value -> value - 1)),
      witness.typeName,
      witness.sphericalOrder,
      witness.primeOrder,
      witness.classSize,
      CoxeterViewerJoinIntegers(List(witness.generatorIndices, value -> value - 1))
    ]);
  od;
  return witnesses;
end;;

CoxeterViewerEvaluateWord := function(indices, generators, group)
  return CoxeterViewerWordFromIndices(indices, generators, group);
end;;

CoxeterViewerFixedPoints := function(permutation, degree)
  return Filtered([1..degree], point -> point^permutation = point);
end;;

# Coset enumeration assigns point numbers according to internal traversal
# details. Relabel from every possible root and retain the lexicographically
# least action table so catalogue output is stable across equivalent actions.
CoxeterViewerCanonicalAction := function(actionGenerators, degree)
  local bestEncoding, bestImages, root, oldToNew, newToOld, queuePosition,
    oldPoint, generator, image, canonicalImages, encoding;

  bestEncoding := fail;
  bestImages := fail;
  # The subgroup action has a distinguished base coset. Canonicalizing from
  # that root is linear in the action table. Trying every possible root made
  # catalogue construction quadratic in the degree without strengthening the
  # final torsion certificate.
  for root in [1] do
    oldToNew := List([1..degree], point -> 0);
    newToOld := [root];
    oldToNew[root] := 1;
    queuePosition := 1;
    while queuePosition <= Length(newToOld) do
      oldPoint := newToOld[queuePosition];
      queuePosition := queuePosition + 1;
      for generator in actionGenerators do
        image := oldPoint^generator;
        if oldToNew[image] = 0 then
          Add(newToOld, image);
          oldToNew[image] := Length(newToOld);
        fi;
      od;
    od;
    if Length(newToOld) <> degree then
      return fail;
    fi;

    canonicalImages := List(
      actionGenerators,
      generator -> List(
        [1..degree],
        point -> oldToNew[newToOld[point]^generator]
      )
    );
    encoding := JoinStringsWithSeparator(
      List(canonicalImages, CoxeterViewerJoinIntegers),
      ";"
    );
    if bestEncoding = fail or encoding < bestEncoding then
      bestEncoding := encoding;
      bestImages := canonicalImages;
    fi;
  od;

  return rec(images := bestImages, fingerprint := bestEncoding);
end;;

CoxeterViewerValidateModuleBounds := function(moduleBounds, rawPath)
  if not IsRecord(moduleBounds)
      or not IsBound(moduleBounds.enabled)
      or not IsBool(moduleBounds.enabled) then
    CoxeterViewerWriteStatus(rawPath, "failed", "invalid-module-bounds",
      "moduleCatalogue.enabled must be true or false");
    return false;
  fi;
  if not moduleBounds.enabled then
    return true;
  fi;
  if not IsBound(moduleBounds.maxIndex)
      or not IsInt(moduleBounds.maxIndex)
      or moduleBounds.maxIndex < 1
      or not IsBound(moduleBounds.maxCandidates)
      or not IsInt(moduleBounds.maxCandidates)
      or moduleBounds.maxCandidates < 1
      or not IsBound(moduleBounds.maxModules)
      or not IsInt(moduleBounds.maxModules)
      or moduleBounds.maxModules < 1 then
    CoxeterViewerWriteStatus(rawPath, "failed", "invalid-module-bounds",
      "Enabled module catalogues require positive maxIndex, maxCandidates, and maxModules bounds");
    return false;
  fi;
  return true;
end;;

# A partial module is useful when at least one supplied torsion witness acts
# without fixed points. A diagonal product can then combine complementary
# coverage sets before the final action is certified independently.
CoxeterViewerBuildModuleCatalogue := function(input, group, groupGenerators,
    witnesses, rawPath)
  local bounds, iterator, candidateCount, subgroup, action, actionGroup,
    actionGenerators, degree, transitive, witnessIndex, witness,
    witnessElement, witnessImage, fixedPoints, fixedPointCounts, coverage,
    canonical, existing, modules, moduleRecord, iteratorComplete, reason,
    uniqueCount, emittedCount, moduleIndex, generatorIndex, point;

  if not IsBound(input.moduleCatalogue) then
    return true;
  fi;
  bounds := input.moduleCatalogue;
  if not CoxeterViewerValidateModuleBounds(bounds, rawPath) then
    return false;
  fi;
  if not bounds.enabled then
    return true;
  fi;

  CoxeterViewerWriteLine(rawPath, [
    "MODULE_BOUNDS", bounds.maxIndex, bounds.maxCandidates, bounds.maxModules
  ]);
  iterator := LowIndexSubgroupsFpGroupIterator(
    group,
    TrivialSubgroup(group),
    bounds.maxIndex,
    []
  );
  candidateCount := 0;
  modules := [];

  while not IsDoneIterator(iterator) and candidateCount < bounds.maxCandidates do
    subgroup := NextIterator(iterator);
    candidateCount := candidateCount + 1;
    degree := IndexInWholeGroup(subgroup);
    action := FactorCosetAction(group, subgroup);
    actionGroup := Image(action);
    actionGenerators := List(groupGenerators, generator -> Image(action, generator));
    transitive := Length(Orbit(actionGroup, 1)) = degree;
    if transitive then
      coverage := [];
      fixedPointCounts := [];
      for witnessIndex in [1..Length(witnesses)] do
        witness := witnesses[witnessIndex];
        witnessElement := witness.groupElement;
        witnessImage := Image(action, witnessElement);
        fixedPoints := CoxeterViewerFixedPoints(witnessImage, degree);
        Add(fixedPointCounts, Length(fixedPoints));
        if Length(fixedPoints) = 0 then
          Add(coverage, witnessIndex - 1);
        fi;
      od;

      # Modules covering no witness cannot contribute to a torsion-free
      # diagonal product, so they consume no catalogue budget.
      if Length(coverage) > 0 then
        canonical := CoxeterViewerCanonicalAction(actionGenerators, degree);
        if canonical <> fail then
          existing := First(
            modules,
            item -> item.fingerprint = canonical.fingerprint
          );
          if existing = fail then
            moduleRecord := rec(
              sourceCandidate := candidateCount,
              degree := degree,
              images := canonical.images,
              fingerprint := canonical.fingerprint,
              coverage := coverage,
              fixedPointCounts := fixedPointCounts
            );
            Add(modules, moduleRecord);
          fi;
        fi;
      fi;
    fi;
  od;

  iteratorComplete := IsDoneIterator(iterator);
  reason := "index-bound-complete";
  if not iteratorComplete then
    reason := "candidate-bound-reached";
  fi;
  Sort(modules, function(left, right)
    if left.degree <> right.degree then
      return left.degree < right.degree;
    fi;
    if Length(left.coverage) <> Length(right.coverage) then
      return Length(left.coverage) > Length(right.coverage);
    fi;
    return left.fingerprint < right.fingerprint;
  end);
  uniqueCount := Length(modules);
  if Length(modules) > bounds.maxModules then
    modules := modules{[1..bounds.maxModules]};
  fi;
  emittedCount := Length(modules);

  for moduleIndex in [1..emittedCount] do
    moduleRecord := modules[moduleIndex];
    CoxeterViewerWriteLine(rawPath, [
      "MODULE",
      moduleIndex - 1,
      moduleRecord.sourceCandidate,
      moduleRecord.degree,
      CoxeterViewerJoinIntegers(moduleRecord.coverage),
      moduleRecord.fingerprint
    ]);
    for generatorIndex in [1..Length(moduleRecord.images)] do
      CoxeterViewerWriteLine(rawPath, [
        "MODULE_ACTION",
        moduleIndex - 1,
        generatorIndex - 1,
        CoxeterViewerJoinIntegers(
          List(moduleRecord.images[generatorIndex], value -> value - 1)
        )
      ]);
    od;
    for witnessIndex in [1..Length(witnesses)] do
      CoxeterViewerWriteLine(rawPath, [
        "MODULE_WITNESS_CHECK",
        moduleIndex - 1,
        witnessIndex - 1,
        CoxeterViewerBoolText(moduleRecord.fixedPointCounts[witnessIndex] = 0),
        moduleRecord.fixedPointCounts[witnessIndex]
      ]);
    od;
  od;
  CoxeterViewerWriteLine(rawPath, [
    "MODULE_CATALOGUE",
    candidateCount,
    bounds.maxIndex,
    bounds.maxCandidates,
    bounds.maxModules,
    CoxeterViewerBoolText(iteratorComplete),
    reason,
    uniqueCount,
    emittedCount
  ]);
  return true;
end;;

CoxeterViewerWriteCandidate := function(input, group, groupGenerators, subgroup,
    witnesses, candidateNumber, iteratorDone, rawPath)
  local action, actionGroup, actionGenerators, degree, generatorIndex, images,
    allChecksPassed, relationPassed, i, j, m, witnessIndex, witness,
    witnessElement, witnessImage, fixedPoints, subgroupGenerators,
    subgroupGenerator, subgroupWord, subgroupGeneratorIndex, wordPosition,
    point, transitive, relationRecords, witnessRecords;

  degree := IndexInWholeGroup(subgroup);
  action := FactorCosetAction(group, subgroup);
  actionGroup := Image(action);
  actionGenerators := List(groupGenerators, generator -> Image(action, generator));
  transitive := Length(Orbit(actionGroup, 1)) = degree;
  allChecksPassed := transitive;

  relationRecords := [];
  witnessRecords := [];

  for generatorIndex in [1..Length(actionGenerators)] do
    images := List([1..degree], point -> point^actionGenerators[generatorIndex]);
    relationPassed := actionGenerators[generatorIndex]^2 = One(actionGroup);
    allChecksPassed := allChecksPassed and relationPassed;
    Add(relationRecords, [
      "RELATION_CHECK", "involution", generatorIndex - 1,
      generatorIndex - 1, 2, CoxeterViewerBoolText(relationPassed)
    ]);
  od;

  if input.rank > 1 then
    for i in [1..input.rank - 1] do
      for j in [i + 1..input.rank] do
        m := input.coxeterMatrix[i][j];
        if m <> 0 then
          relationPassed := (actionGenerators[i] * actionGenerators[j])^m = One(actionGroup);
          allChecksPassed := allChecksPassed and relationPassed;
          Add(relationRecords, [
            "RELATION_CHECK", "coxeter", i - 1, j - 1, m,
            CoxeterViewerBoolText(relationPassed)
          ]);
        fi;
      od;
    od;
  fi;

  for witnessIndex in [1..Length(witnesses)] do
    witness := witnesses[witnessIndex];
    witnessElement := witness.groupElement;
    witnessImage := Image(action, witnessElement);
    fixedPoints := CoxeterViewerFixedPoints(witnessImage, degree);
    if Length(fixedPoints) > 0 then
      allChecksPassed := false;
    fi;
    Add(witnessRecords, [
      "WITNESS_CHECK", witnessIndex - 1,
      CoxeterViewerJoinIntegers(List(fixedPoints, point -> point - 1))
    ]);
  od;

  # Rejected candidates contribute only to aggregate search counts. Full
  # permutation rows and Schreier generators are emitted only for a candidate
  # whose independent relation and torsion checks already pass.
  if not allChecksPassed then
    return false;
  fi;

  CoxeterViewerWriteLine(rawPath, [
    "CANDIDATE", candidateNumber, degree,
    CoxeterViewerBoolText(iteratorDone), CoxeterViewerBoolText(transitive)
  ]);
  for generatorIndex in [1..Length(actionGenerators)] do
    images := List([1..degree], point -> point^actionGenerators[generatorIndex]);
    CoxeterViewerWriteLine(rawPath, [
      "ACTION", generatorIndex - 1,
      CoxeterViewerJoinIntegers(List(images, value -> value - 1))
    ]);
  od;
  for relationPassed in relationRecords do
    CoxeterViewerWriteLine(rawPath, relationPassed);
  od;
  for fixedPoints in witnessRecords do
    CoxeterViewerWriteLine(rawPath, fixedPoints);
  od;

  subgroupGenerators := GeneratorsOfGroup(subgroup);
  subgroupGeneratorIndex := 0;
  for subgroupGenerator in subgroupGenerators do
    subgroupWord := CoxeterViewerExpandedWord(UnderlyingElement(subgroupGenerator));
    CoxeterViewerWriteLine(rawPath, [
      "SUBGROUP_GENERATOR", subgroupGeneratorIndex, Length(subgroupWord)
    ]);
    for wordPosition in [1..Length(subgroupWord)] do
      CoxeterViewerWriteLine(rawPath, [
        "SUBGROUP_GENERATOR_LETTER", subgroupGeneratorIndex,
        wordPosition - 1, subgroupWord[wordPosition] - 1
      ]);
    od;
    subgroupGeneratorIndex := subgroupGeneratorIndex + 1;
  od;

  return allChecksPassed;
end;;

CoxeterViewerDiscover := function(input, rawPath)
  local presentation, witnesses, excludedWords, iterator, candidateCount,
    subgroup, iteratorDone, candidatePassed, searchReason, moduleResult, witness;

  presentation := CoxeterViewerCoxeterPresentation(input.rank, input.coxeterMatrix, "s");
  witnesses := CoxeterViewerEnumerateWitnesses(
    input,
    presentation.freeGenerators,
    presentation.freeGroup,
    rawPath
  );
  if witnesses = fail then
    return rec(ok := false, status := "failed");
  fi;
  if Length(witnesses) = 0 then
    CoxeterViewerWriteStatus(rawPath, "failed", "empty-witness-catalogue",
      "No prime-order torsion witnesses were produced for a nontrivial Coxeter system");
    return rec(ok := false, status := "failed");
  fi;

  excludedWords := List(witnesses, witness -> witness.freeWord);
  for witness in witnesses do
    witness.groupElement := CoxeterViewerEvaluateWord(
      witness.generatorIndices,
      presentation.fpGenerators,
      presentation.fpGroup
    );
  od;
  candidateCount := 0;
  searchReason := "index-bound-complete";

  # Generic low-index enumeration grows too quickly to be a useful large-index
  # engine. The launcher enables this fallback only when its small bound can
  # reach a degree divisible by every maximal spherical subgroup order.
  if IsBound(input.directSearchEnabled) and not input.directSearchEnabled then
    CoxeterViewerWriteLine(rawPath, [
      "SEARCH", 0, input.maxIndex, input.maxCandidates, "true",
      "lower-bound-exceeds-low-index-fallback"
    ]);
    moduleResult := CoxeterViewerBuildModuleCatalogue(
      input,
      presentation.fpGroup,
      presentation.fpGenerators,
      witnesses,
      rawPath
    );
    if not moduleResult then
      return rec(ok := false, status := "failed");
    fi;
    CoxeterViewerWriteStatus(rawPath, "exhausted",
      "lower-bound-exceeds-low-index-fallback",
      "Direct GAP low-index search was skipped; finite-image search owns larger degrees");
    return rec(ok := true, status := "exhausted");
  fi;

  iterator := LowIndexSubgroupsFpGroupIterator(
    presentation.fpGroup,
    TrivialSubgroup(presentation.fpGroup),
    input.maxIndex,
    excludedWords
  );

  while not IsDoneIterator(iterator) and candidateCount < input.maxCandidates do
    subgroup := NextIterator(iterator);
    candidateCount := candidateCount + 1;
    iteratorDone := IsDoneIterator(iterator);
    candidatePassed := CoxeterViewerWriteCandidate(
      input,
      presentation.fpGroup,
      presentation.fpGenerators,
      subgroup,
      witnesses,
      candidateCount,
      iteratorDone,
      rawPath
    );
    if candidatePassed then
      moduleResult := CoxeterViewerBuildModuleCatalogue(
        input,
        presentation.fpGroup,
        presentation.fpGenerators,
        witnesses,
        rawPath
      );
      if not moduleResult then
        return rec(ok := false, status := "failed");
      fi;
      CoxeterViewerWriteLine(rawPath, [
        "SEARCH", candidateCount, input.maxIndex, input.maxCandidates,
        CoxeterViewerBoolText(iteratorDone), "certified-candidate"
      ]);
      CoxeterViewerWriteStatus(rawPath, "passed", "torsion-free-candidate",
        "A finite-index subgroup passed the complete prime-order fixed-point certificate");
      return rec(ok := true, status := "passed");
    fi;
  od;

  if not IsDoneIterator(iterator) then
    searchReason := "candidate-bound-reached";
  fi;
  CoxeterViewerWriteLine(rawPath, [
    "SEARCH", candidateCount, input.maxIndex, input.maxCandidates,
    CoxeterViewerBoolText(IsDoneIterator(iterator)), searchReason
  ]);
  moduleResult := CoxeterViewerBuildModuleCatalogue(
    input,
    presentation.fpGroup,
    presentation.fpGenerators,
    witnesses,
    rawPath
  );
  if not moduleResult then
    return rec(ok := false, status := "failed");
  fi;
  CoxeterViewerWriteStatus(rawPath, "exhausted", searchReason,
    "No independently certified torsion-free subgroup was found within the supplied bounds");
  return rec(ok := true, status := "exhausted");
end;;

CoxeterViewerDataPath := CoxeterViewerArgValue("--data");;
CoxeterViewerRawOutputPath := CoxeterViewerArgValue("--raw-output");;

if CoxeterViewerDataPath = fail or CoxeterViewerRawOutputPath = fail then
  Print("{\"ok\":false,\"status\":\"failed\",\"backend\":\"",
    CoxeterViewerBackendId,
    "\",\"message\":\"Use --data and --raw-output through torsion_free_discovery.py.\"}\n");
  QUIT_GAP(4);
fi;

SizeScreen([4096, 24]);
PrintTo(CoxeterViewerRawOutputPath, "");
Read(CoxeterViewerDataPath);
if not IsBound(COXETER_TORSION_FREE_INPUT) then
  CoxeterViewerWriteStatus(CoxeterViewerRawOutputPath, "failed", "invalid-gap-input",
    "Temporary data did not define COXETER_TORSION_FREE_INPUT");
  QUIT_GAP(4);
fi;

CoxeterViewerWriteLine(CoxeterViewerRawOutputPath, ["GAP_VERSION", GAPInfo.Version]);
CoxeterViewerWriteLine(CoxeterViewerRawOutputPath, ["BACKEND_VERSION", CoxeterViewerBackendVersion]);
CoxeterViewerWriteLine(CoxeterViewerRawOutputPath, [
  "BOUNDS",
  COXETER_TORSION_FREE_INPUT.maxIndex,
  COXETER_TORSION_FREE_INPUT.maxCandidates,
  COXETER_TORSION_FREE_INPUT.maxWitnesses
]);

for CoxeterViewerSpherical in COXETER_TORSION_FREE_INPUT.sphericalSubgroups do
  CoxeterViewerWriteLine(CoxeterViewerRawOutputPath, [
    "SPHERICAL",
    CoxeterViewerJoinIntegers(List(CoxeterViewerSpherical.subset, value -> value - 1)),
    CoxeterViewerSpherical.typeName,
    CoxeterViewerSpherical.expectedOrder
  ]);
od;

CoxeterViewerResult := CoxeterViewerDiscover(
  COXETER_TORSION_FREE_INPUT,
  CoxeterViewerRawOutputPath
);;
if CoxeterViewerResult.status = "failed" then
  QUIT_GAP(3);
fi;
Print("{\"ok\":true,\"status\":\"", CoxeterViewerResult.status,
  "\",\"backend\":\"", CoxeterViewerBackendId,
  "\",\"backendVersion\":\"", CoxeterViewerBackendVersion, "\"}\n");
QUIT_GAP(0);
