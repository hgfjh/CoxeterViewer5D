# Independent replay of the GF(5), GF(7), and GF(11) structural evidence.
# Replay uses stored SLPs or a seeded, one-sided RecogniseClassical containment
# check. It never calls generic RecogniseMatrixGroup or reruns GenSS.

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
  elif IsString(value) then AppendTo(stream, "\"", CVJsonEscape(value), "\"");
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
  else ErrorNoReturn("Replay encountered a non-JSON GAP object.");
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
    classicalMaximals := CVPackageVersion("ClassicalMaximals"),
    recog := CVPackageVersion("recog")
  );
end;;

CVUnknown := reason -> rec(status := "unknown", reason := reason);;

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

CVCheckRelations := function(matrices, coxeterMatrix)
  local identity, checks, i, j, m;
  identity := IdentityMat(Length(matrices), DefaultFieldOfMatrix(matrices[1]));
  checks := [];
  for i in [1..Length(matrices)] do
    if matrices[i]^2 <> identity then return fail; fi;
    Add(checks, rec(kind := "involution", generator := i - 1, passed := true));
  od;
  for i in [1..Length(matrices) - 1] do
    for j in [i + 1..Length(matrices)] do
      m := coxeterMatrix[i][j];
      if m <> 0 then
        if (matrices[i] * matrices[j])^m <> identity then return fail; fi;
        Add(checks, rec(kind := "coxeter", generatorA := i - 1,
          generatorB := j - 1, exponent := m, passed := true));
      fi;
    od;
  od;
  return checks;
end;;

CVCheckSphericalRestrictions := function(matrices, catalogue)
  local checks, item, subgroup, actual;
  checks := [];
  for item in catalogue do
    subgroup := Group(List(item.subset, index -> matrices[index + 1]));
    actual := Size(subgroup);
    if actual <> item.expectedOrder then return fail; fi;
    Add(checks, rec(id := item.id, subset := item.subset, type := item.type,
      expectedOrder := item.expectedOrder, actualOrder := actual,
      injective := true));
  od;
  return checks;
end;;

CVIsInStandardOmega := function(matrix, p)
  return DeterminantMat(matrix) = One(DefaultFieldOfMatrix(matrix))
    and CallFuncList(ValueGlobal("CM_InOmega"), [matrix, 10, p, 1]);
end;;

CVReplayClassicalContainment := function(evenGenerators, stored)
  local caught, result;
  if not IsRecord(stored) or stored.status <> "verified"
      or stored.algorithm <> "RecogniseClassical"
      or stored.case <> "orthogonalplus"
      or stored.isOmegaContained <> true
      or stored.oneSidedPositiveIsConclusive <> true
      or stored.recognitionOutputTrustedForContainment <> true
      or stored.recognitionOutputTrustedForOrder <> false
      or not IsInt(stored.randomSeed) or stored.randomSeed <= 0
      or not IsInt(stored.requestedRandomElements)
      or stored.requestedRandomElements <= 0 then
    return CVUnknown("The stored classical-containment contract is incomplete.");
  fi;
  if LoadPackage("recog", false) <> true then
    return CVUnknown("recog is unavailable for classical-containment replay.");
  fi;
  Reset(GlobalMersenneTwister, stored.randomSeed);
  Reset(GlobalRandomSource, stored.randomSeed);
  caught := CALL_WITH_CATCH(RecogniseClassical, [Group(evenGenerators), rec(
    case := "orthogonalplus",
    nrrandels := stored.requestedRandomElements,
    infoLevel := 0
  )]);
  if caught[1] <> true or Length(caught) < 2 or not IsRecord(caught[2]) then
    return CVUnknown("Specialized classical-containment replay raised an error.");
  fi;
  result := caught[2];
  if not IsBound(result.isOmegaContained)
      or result.isOmegaContained <> true then
    return CVUnknown("Seeded replay did not recover the conclusive containment result.");
  fi;
  return rec(
    status := "verified",
    algorithm := "RecogniseClassical",
    isOmegaContained := true,
    oneSidedPositiveIsConclusive := true,
    randomSeed := stored.randomSeed,
    requestedRandomElements := stored.requestedRandomElements
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
  local p, omegaOrder, targets, classNumber, caught, subgroup, subgroupOrder,
    index, rootRows, rootIndices, classRecords, classComplete,
    compatibleTargets, lift, target, containedIndex, containedRows, outerRows,
    containedExact, outerExactLift, containedOutcome, outerOutcome,
    outcome, complete, rows, allRowsComplete, unresolved;
  p := input.characteristic;
  omegaOrder := CallFuncList(ValueGlobal("SizeOmega"), [1, 10, p]);
  targets := CVTargetDegrees(input.lowerBound, input.maxIndex);
  rootRows := [];
  classRecords := [];
  classComplete := true;
  for classNumber in [1..9] do
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
            status := "verified", subgroupOrder := subgroupOrder,
            index := index, compatibleTargetDegrees := compatibleTargets,
            outerLift := lift));
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
      containedOutcome := "unresolved"; outerOutcome := "unresolved";
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
    else outcome := "unresolved"; complete := false;
    fi;
    Add(rows, rec(
      degree := target, outcome := outcome,
      classificationComplete := complete,
      containedCase := rec(omegaIndex := containedIndex,
        outcome := containedOutcome,
        compatibleMaximalIndices := SortedList(Set(List(containedRows,
          row -> row.index)))),
      outerSurjectiveCase := rec(omegaIndex := target,
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
      end)()));
  od;
  allRowsComplete := classComplete and ForAll(rows,
    row -> row.classificationComplete = true);
  unresolved := Filtered(rows, row -> row.classificationComplete <> true);
  return rec(
    status := (function()
      if allRowsComplete then return "verified"; fi; return "unknown";
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
        if classComplete then return "verified"; fi; return "unknown";
      end)(),
      source := Concatenation("ClassicalMaximalsGeneric(\"O+\",10,",
        String(p), ",[1..9])"),
      completeByPackageRange := classComplete,
      packageVersion := CVPackageVersion("ClassicalMaximals"),
      aschbacherClasses := classRecords,
      maximalClassCount := Length(Filtered(rootRows, row -> IsBound(row.index))),
      maximalIndices := rootIndices,
      representatives := rootRows),
    extensionLogic := rec(
      containedCase := "[G:L]=2[Omega:L] when L is contained in Omega",
      outerSurjectiveCase := "[G:L]=[Omega:L intersect Omega] with an outer-coset lift",
      rootDivisibilityCompleteForRejection := true),
    targetLowerBound := input.lowerBound,
    targetMaximum := input.maxIndex,
    targetCount := Length(targets),
    degreeLedger := rows,
    unresolvedFrontier := List(unresolved, row -> rec(index := row.degree,
      reason := "compatible maximal class requires descendant analysis")));
end;;

CVReplay := function(input)
  local p, field, matrices, form, standardForm, change, formMultiplier,
    transformed, expected,
    relationChecks, sphericalChecks, evenGenerators, standardOmega,
    standardGenerators, slpRecord, entries, entry, slp, evaluated,
    classicalReplay, outer,
    identity, quotientElement, sieve, stored;
  if LoadPackage("Forms", false) <> true
      or LoadPackage("ClassicalMaximals", false) <> true then
    return CVUnknown("Forms or ClassicalMaximals is unavailable.");
  fi;
  p := input.characteristic;
  if not p in [5, 7, 11] then
    return rec(status := "failed", reason := "Unsupported replay characteristic.");
  fi;
  field := GF(p);
  matrices := CVRowsToMatrices(input.matrixGeneratorRows, field);
  form := CVRowsToMatrix(input.preservedFormRows, field);
  standardForm := CVRowsToMatrix(input.standardFormRows, field);
  change := CVRowsToMatrix(input.changeOfBasisRows, field);
  formMultiplier := (input.formSimilitudeMultiplier mod p) * One(field);
  transformed := List(matrices, generator -> generator^change);
  expected := CVRowsToMatrices(input.transformedGeneratorRows, field);
  if transformed <> expected
      or formMultiplier = Zero(field)
      or TransposedMat(change) * form * change <> formMultiplier * standardForm
      or not ForAll(matrices,
        generator -> TransposedMat(generator) * form * generator = form)
      or not ForAll(transformed,
        generator -> TransposedMat(generator) * standardForm * generator = standardForm) then
    return rec(status := "failed",
      reason := "Stored matrices or split-form basis change failed exact replay.");
  fi;
  relationChecks := CVCheckRelations(matrices, input.coxeterMatrix);
  sphericalChecks := CVCheckSphericalRestrictions(
    matrices, input.maximalSphericalSubgroups);
  if relationChecks = fail or sphericalChecks = fail then
    return rec(status := "failed",
      reason := "A Coxeter relation or maximal spherical restriction failed replay.");
  fi;
  standardOmega := Omega(1, 10, p);
  if standardForm <> InvariantBilinearForm(standardOmega).matrix then
    return rec(status := "failed", reason := "The stored standard form is not GAP's standard Omega form.");
  fi;
  evenGenerators := List([2..Length(transformed)],
    index -> transformed[index] * transformed[1]^-1);
  if CVMatrixListRows(evenGenerators) <> input.evenGeneratorRows
      or not ForAll(evenGenerators, generator -> CVIsInStandardOmega(generator, p)) then
    return rec(status := "failed", reason := "Even generators failed CM_InOmega replay.");
  fi;
  standardGenerators := CVRowsToMatrices(input.standardOmegaGeneratorRows, field);
  if standardGenerators <> GeneratorsOfGroup(standardOmega) then
    return rec(status := "failed", reason := "Stored standard Omega generators changed.");
  fi;
  entries := [];
  classicalReplay := CVUnknown("No classical-containment replay was requested.");
  if input.equalityMethod =
      "CM_InOmega containment and conclusive one-sided classical Omega-containment" then
    classicalReplay := CVReplayClassicalContainment(
      evenGenerators, input.classicalContainment);
    if classicalReplay.status <> "verified" then return classicalReplay; fi;
  else
    slpRecord := input.standardGeneratorSlps;
    if not IsRecord(slpRecord) or slpRecord.status <> "verified" then
      return CVUnknown("No verified standard-generator SLPs were stored.");
    fi;
    entries := slpRecord.entries;
    if Length(entries) <> Length(standardGenerators) then
      return rec(status := "failed", reason := "The standard-generator SLP list is incomplete.");
    fi;
    for entry in entries do
      slp := StraightLineProgram(entry.lines, entry.inputCount);
      evaluated := ResultOfStraightLineProgram(slp, evenGenerators);
      if evaluated <> standardGenerators[entry.targetIndex + 1]
          or CVMatrixRows(evaluated) <> entry.targetRows then
        return rec(status := "failed", reason := "A standard-generator SLP failed replay.");
      fi;
    od;
  fi;
  outer := CVRowsToMatrix(input.outerRepresentative.standardBasisRows, field);
  identity := IdentityMat(10, field);
  if outer <> transformed[1] or outer^2 <> identity
      or DeterminantMat(outer) = One(field)
      or TransposedMat(outer) * standardForm * outer <> standardForm
      or CVIsInStandardOmega(outer, p)
      or not ForAll(GeneratorsOfGroup(standardOmega),
        generator -> CVIsInStandardOmega(generator^outer, p)) then
    return rec(status := "failed", reason := "The outer representative failed replay.");
  fi;
  for quotientElement in transformed do
    if not CVIsInStandardOmega(quotientElement * outer^-1, p) then
      return rec(status := "failed", reason := "A source generator left the outer Omega coset.");
    fi;
  od;
  sieve := CVClassicalMaximalLedger(standardOmega, outer, input);
  sieve.appliesToImage := true;
  stored := input.storedDegreeSieve;
  if sieve.status <> stored.status
      or sieve.maximalCatalogue <> stored.maximalCatalogue
      or sieve.degreeLedger <> stored.degreeLedger
      or sieve.unresolvedFrontier <> stored.unresolvedFrontier
      or stored.appliesToImage <> true then
    return rec(status := "failed",
      reason := "The complete maximal-index ledger changed during replay.");
  fi;
  return rec(
    schemaVersion := 1,
    certificateKind := input.certificateKind,
    characteristic := p,
    status := "verified",
    reason := "Matrices, spherical restrictions, Omega containment, outer coset, and bounded index ledger replayed.",
    replayedRelationChecks := Length(relationChecks),
    replayedSphericalRestrictions := Length(sphericalChecks),
    replayedStandardGeneratorSlps := Length(entries),
    classicalContainmentReplay := classicalReplay,
    replayedDegreeRows := Length(sieve.degreeLedger),
    provenance := input.provenance,
    tools := CVTools());
end;;

if not IsBound(ODD_OUTPUT) or not IsString(ODD_OUTPUT) then
  Print("ODD_OUTPUT is required.\n");
  QUIT_GAP(1);
fi;
if not IsBound(ODD_INPUT) or not IsRecord(ODD_INPUT) then
  CVWriteJson(ODD_OUTPUT, rec(status := "failed", reason := "ODD_INPUT is required."));
  QUIT_GAP(1);
fi;

CV_RESULT := CALL_WITH_CATCH(CVReplay, [ODD_INPUT]);;
if CV_RESULT[1] = true and Length(CV_RESULT) >= 2 then
  CVWriteJson(ODD_OUTPUT, CV_RESULT[2]);
else
  CVWriteJson(ODD_OUTPUT, rec(
    schemaVersion := 1, certificateKind := ODD_INPUT.certificateKind,
    characteristic := ODD_INPUT.characteristic, status := "unknown",
    reason := "GAP raised an exception during exact replay.",
    provenance := ODD_INPUT.provenance, tools := CVTools()));
fi;
