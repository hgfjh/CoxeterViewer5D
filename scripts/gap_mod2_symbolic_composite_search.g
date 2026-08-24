# Symbolic diagonal-orbit search in the certified 122-point mod-2 image.
#
# The Python driver first reads the function-only prefix of
# gap_finite_image_recognition.g.  This file then reconstructs each compact
# stabilizer, recomputes its exact witness marks, and searches the requested
# diagonal-orbit degrees.  Large coset rows are built only for a witness-free
# stabilizer.

CoxeterMod2SymbolicCompositeId := "gap-mod2-symbolic-composite-search";;
CoxeterMod2SymbolicCompositeVersion := "1.0.0";;
CV_SC_AMBIENT_GROUP := fail;;

CVSCPublicExactCandidate := function(candidate)
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
  public.compactSubgroupMaterialization := CVCompactSubgroupMaterialization(
    COXETER_INPUT, CV_SC_AMBIENT_GROUP, candidate.subgroup);
  return public;
end;;

# Recognition calls this hook while producing its exact class ledger.
CVPublicExactCandidate := CVSCPublicExactCandidate;;

CVSCWordElement := function(generators, word)
  local element, letter;
  element := One(Group(generators));
  for letter in word do
    CVRequire(IsInt(letter) and letter >= 0
        and letter < Length(generators),
      "invalid-witness-word", "A witness uses an unknown generator index.");
    element := element * generators[letter + 1];
  od;
  return element;
end;;

CVSCWitnessClasses := function(group, generators, witnesses)
  local representatives, positions, centralizerSizes, witness, element,
    position;
  representatives := [];
  positions := [];
  for witness in witnesses do
    element := CVSCWordElement(generators, witness.word);
    CVRequire(Order(element) = witness.primeOrder,
      "witness-order-mismatch",
      "A transferred torsion witness has the wrong image order.");
    position := PositionProperty(representatives,
      representative -> IsConjugate(group, representative, element));
    if position = fail then
      Add(representatives, element);
      position := Length(representatives);
    fi;
    Add(positions, position);
  od;
  centralizerSizes := List(representatives,
    representative -> Size(Centralizer(group, representative)));
  return rec(
    centralizerSizes := centralizerSizes,
    representatives := representatives,
    witnessClassPositions := positions
  );
end;;

CVSCFixedCountForClass := function(group, subgroup, subgroupClasses,
    representative, centralizerSize, degree)
  local intersectionSize, subgroupClass, numerator, fixed;
  intersectionSize := 0;
  for subgroupClass in subgroupClasses do
    if IsConjugate(group, representative, Representative(subgroupClass)) then
      intersectionSize := intersectionSize + Size(subgroupClass);
    fi;
  od;
  numerator := centralizerSize * intersectionSize;
  CVRequire(numerator mod Size(subgroup) = 0,
    "nonintegral-fixed-point-count",
    "The exact fixed-coset formula was not integral.");
  fixed := numerator / Size(subgroup);
  CVRequire(IsInt(fixed) and fixed >= 0 and fixed <= degree,
    "invalid-fixed-point-count",
    "An exact fixed-coset count lies outside the action degree.");
  return fixed;
end;;

CVSCFixedPointVector := function(group, subgroup, witnessClasses, degree)
  local subgroupClasses, uniqueCounts;
  subgroupClasses := ConjugacyClasses(subgroup);
  uniqueCounts := List([1..Length(witnessClasses.representatives)], position ->
    CVSCFixedCountForClass(
      group,
      subgroup,
      subgroupClasses,
      witnessClasses.representatives[position],
      witnessClasses.centralizerSizes[position],
      degree));
  return List(witnessClasses.witnessClassPositions,
    position -> uniqueCounts[position]);
end;;

CVSCCandidateMatches := function(expected, candidate)
  return expected.degree = candidate.subgroupIndex
    and expected.classOrdinalWithinDegree > 0
    and expected.provenance.b0Family = candidate.b0Family
    and expected.provenance.b0Index = candidate.b0Index
    and expected.provenance.commonQuotientOrder
      = candidate.commonQuotientOrder
    and expected.provenance.s3ClassPosition = candidate.s3ClassPosition
    and expected.provenance.sourceRows = candidate.sourceRows
    and expected.provenance.subgroupIndex = candidate.subgroupIndex
    and expected.provenance.subgroupOrder = candidate.subgroupOrder
    and expected.provenance.tomPosition = candidate.tomPosition;
end;;

CVSCFlattenCandidates := function(recognition, requestedDegrees)
  local report, result, row, candidate, ordinal;
  CVRequire(IsBound(recognition.mod2Certificate)
      and IsBound(recognition.mod2Certificate.finiteIndexClassification)
      and IsBound(
        recognition.mod2Certificate.finiteIndexClassification.report),
    "missing-mod2-classification",
    "Recognition did not return its complete mod-2 class ledger.");
  report := recognition.mod2Certificate.finiteIndexClassification.report;
  result := [];
  for row in report do
    if row.target in requestedDegrees then
      CVRequire(IsBound(row.exactCandidates)
          and Length(row.exactCandidates) = row.exactCandidateCount,
        "missing-exact-candidates",
        "A requested degree omitted exact subgroup classes.");
      ordinal := 0;
      for candidate in row.exactCandidates do
        ordinal := ordinal + 1;
        Add(result, rec(
          candidate := candidate,
          classOrdinalWithinDegree := ordinal,
          degree := row.target
        ));
      od;
    fi;
  od;
  return result;
end;;

CVSCFindCandidate := function(generated, expected)
  return First(generated, item ->
    item.degree = expected.degree
      and item.classOrdinalWithinDegree
        = expected.classOrdinalWithinDegree
      and CVSCCandidateMatches(expected, item.candidate));
end;;

CVSCAllZero := function(values)
  return ForAll(values, value -> value = 0);
end;;

CVSCValidateTargets := function(targets)
  return targets = [5760, 11520, 17280, 23040, 46080, 97920, 195840];
end;;

CVSCMaterializeSurvivor := function(group, generators, subgroup, input,
    fixedCounts, classId)
  local cosets, homomorphism, images, rows, degree, relationFailures, left,
    right, order, product, witnessFixedCounts, witness, image;
  degree := Index(group, subgroup);
  CVRequire(degree <= COXETER_REQUEST.bounds.maximumMaterializedDegree,
    "materialization-degree-bound",
    "A survivor exceeds the declared materialization degree.");
  CVRequire(CVSCAllZero(fixedCounts),
    "premature-materialization",
    "A contaminated stabilizer reached the materialization path.");
  cosets := RightCosets(group, subgroup);
  homomorphism := ActionHomomorphism(group, cosets, OnRight);
  images := List(generators, generator -> Image(homomorphism, generator));
  rows := List(images, generator -> ListPerm(generator, degree));

  relationFailures := [];
  for left in [1..Length(images)] do
    if not IsOne(images[left]^2) then
      Add(relationFailures, rec(generators := [left - 1], relation := "s^2"));
    fi;
    for right in [left + 1..Length(images)] do
      if right <= Length(images) then
        order := input.coxeterMatrix[left][right];
        if order > 0 then
          product := images[left] * images[right];
          if not IsOne(product^order) then
            Add(relationFailures, rec(
              generators := [left - 1, right - 1],
              relationOrder := order));
          fi;
        fi;
      fi;
    od;
  od;
  witnessFixedCounts := [];
  for witness in input.torsionWitnesses do
    image := CVSCWordElement(images, witness.word);
    Add(witnessFixedCounts, degree - NrMovedPoints(image));
  od;
  CVRequire(Length(relationFailures) = 0 and CVSCAllZero(witnessFixedCounts),
    "materialized-survivor-replay-failed",
    "A symbolic survivor failed independent materialized GAP replay.");
  return rec(
    classId := classId,
    degree := degree,
    generatorRows := rows,
    gapIndependentReplay := rec(
      coxeterRelationsPassed := true,
      fixedPointFreeWitnessCount := Length(witnessFixedCounts),
      relationFailures := relationFailures,
      witnessFixedPointCounts := witnessFixedCounts,
      witnessFree := true
    )
  );
end;;

CVSCReconstructClasses := function(group, witnessClasses)
  local internals, publics, expected, compact, subgroup, fixedCounts,
    suppliedRows;
  internals := [];
  publics := [];
  for expected in COXETER_REQUEST.classes do
    suppliedRows := expected.compactAmbientSubgroupGeneratorRows;
    CVRequire(suppliedRows <> fail and Length(suppliedRows) > 0,
      "missing-compact-rows",
      "The enriched report must expose compact subgroup generator rows.");
    subgroup := Subgroup(group, List(suppliedRows, PermList));
    compact := CVCompactSubgroupMaterialization(
      COXETER_INPUT, group, subgroup);
    CVRequire(compact.subgroupGeneratorRowsSha256
        = expected.expectedStabilizerFingerprint,
      "stabilizer-fingerprint-mismatch",
      "A supplied compact stabilizer has another digest.");
    CVRequire(suppliedRows = compact.subgroupGeneratorRows,
      "compact-row-canonicalization-mismatch",
      "The supplied compact rows are not the canonical stored rows.");
    CVRequire(Index(group, subgroup) = expected.degree
        and Size(subgroup) = expected.provenance.subgroupOrder,
      "compact-stabilizer-roundtrip-failed",
      "Compact generator rows changed subgroup index or order.");
    fixedCounts := CVSCFixedPointVector(
      group, subgroup, witnessClasses, expected.degree);
    CVRequire(fixedCounts = expected.expectedFixedPointCounts,
      "fixed-point-vector-mismatch",
      "Recomputed exact marks disagree with the symbolic catalogue.");
    Add(internals, rec(
      classId := expected.classId,
      degree := expected.degree,
      fixedPointCounts := fixedCounts,
      subgroup := subgroup
    ));
    Add(publics, rec(
      classId := expected.classId,
      compactAmbientSubgroupGeneratorRows := compact.subgroupGeneratorRows,
      degree := expected.degree,
      fixedPointCounts := fixedCounts,
      stabilizerFingerprint := compact.subgroupGeneratorRowsSha256,
      subgroupOrder := Size(subgroup)
    ));
  od;
  return rec(internals := internals, publics := publics);
end;;

CVSCCoverageUnion := function(classes, witnessCount)
  local covered, item, position, indexes;
  covered := List([1..witnessCount], position -> false);
  for item in classes do
    for position in [1..witnessCount] do
      if item.fixedPointCounts[position] = 0 then covered[position] := true; fi;
    od;
  od;
  indexes := Filtered([1..witnessCount], position -> covered[position]);
  return rec(
    complete := Length(indexes) = witnessCount,
    coveredCount := Length(indexes),
    coveredWitnessIndexes := List(indexes, position -> position - 1),
    missingWitnessIndexes := List(
      Filtered([1..witnessCount], position -> not covered[position]),
      position -> position - 1),
    witnessCount := witnessCount
  );
end;;

CVSCIntersectionClass := function(group, records, subgroup)
  return First(records, item -> IsConjugate(group, item.subgroup, subgroup));
end;;

CVSCSearchPairwise195840 := function(group, generators, classes,
    witnessClasses, input)
  local floor, eligibleClasses, exactDegree, pairTypes, explicitPairTypes,
    totalDoubleCosets,
    pairSummaries, exactClasses, largerClasses, largerTruncated, survivor,
    left, right, doubleCosets, pairExactCount, pairFloorCount,
    pairLargerCount, ordinal, representative, intersection, degree,
    existing, fixedCounts, compact, pairRecord, status, reason;
  floor := Minimum(List(classes, item -> item.degree));
  exactDegree := 195840;
  eligibleClasses := Filtered(classes, item -> item.degree <= exactDegree);
  pairTypes := Length(classes) * (Length(classes) + 1) / 2;
  explicitPairTypes :=
    Length(eligibleClasses) * (Length(eligibleClasses) + 1) / 2;
  if COXETER_REQUEST.bounds.maximumPairTypes < pairTypes then
    return rec(
      completeWithinDeclaredTargets := false,
      exactIntersectionClasses := [],
      exactScope := rec(
        exactPairDegree := exactDegree,
        eligibleClassCount := Length(eligibleClasses),
        explicitDoubleCosetPairTypes := explicitPairTypes,
        requiredPairTypes := pairTypes),
      largerFrontier := rec(status := "not-started"),
      pairSummaries := [],
      pairTypesExamined := 0,
      reason := "The declared exact pair-type budget is too small.",
      status := "incomplete-resource-bounded",
      survivor := fail,
      totalDoubleCosetsExamined := 0
    );
  fi;

  totalDoubleCosets := 0;
  pairSummaries := [];
  exactClasses := [];
  largerClasses := [];
  largerTruncated := false;
  survivor := fail;
  for pairRecord in eligibleClasses do
    if pairRecord.degree in COXETER_REQUEST.targetDegrees
        and CVSCAllZero(pairRecord.fixedPointCounts) and survivor = fail then
      survivor := CVSCMaterializeSurvivor(
        group,
        generators,
        pairRecord.subgroup,
        input,
        pairRecord.fixedPointCounts,
        pairRecord.classId);
    fi;
  od;
  for left in [1..Length(eligibleClasses)] do
    for right in [left..Length(eligibleClasses)] do
      doubleCosets := DoubleCosets(
        group, eligibleClasses[left].subgroup, eligibleClasses[right].subgroup);
      totalDoubleCosets := totalDoubleCosets + Length(doubleCosets);
      if totalDoubleCosets
          > COXETER_REQUEST.bounds.maximumExactDoubleCosets then
        return rec(
          completeWithinDeclaredTargets := false,
          exactIntersectionClasses := List(exactClasses, item -> item.public),
          exactScope := rec(
            exactPairDegree := exactDegree,
            eligibleClassCount := Length(eligibleClasses),
            explicitDoubleCosetPairTypes := explicitPairTypes,
            requiredPairTypes := pairTypes),
          largerFrontier := rec(
            retainedIntersectionClassCount := Length(largerClasses),
            status := "bounded-incomplete"),
          pairSummaries := pairSummaries,
          pairTypesExamined := pairTypes - explicitPairTypes
            + Length(pairSummaries),
          reason := "The exact double-coset budget was exhausted.",
          status := "incomplete-resource-bounded",
          survivor := fail,
          totalDoubleCosetsExamined := totalDoubleCosets
        );
      fi;
      pairExactCount := 0;
      pairFloorCount := 0;
      pairLargerCount := 0;
      ordinal := 0;
      for representative in List(doubleCosets, Representative) do
        ordinal := ordinal + 1;
        intersection := Intersection(
          eligibleClasses[left].subgroup,
          eligibleClasses[right].subgroup ^ representative);
        degree := Size(group) / Size(intersection);
        CVRequire(IsInt(degree), "nonintegral-intersection-index",
          "A stabilizer intersection has nonintegral ambient index.");
        if degree = floor then
          pairFloorCount := pairFloorCount + 1;
        elif degree = exactDegree then
          pairExactCount := pairExactCount + 1;
          existing := CVSCIntersectionClass(group, exactClasses, intersection);
          if existing = fail then
            fixedCounts := CVSCFixedPointVector(
              group, intersection, witnessClasses, degree);
            compact := CVCompactSubgroupMaterialization(
              input, group, intersection);
            pairRecord := rec(
              compactAmbientSubgroupGeneratorRows :=
                compact.subgroupGeneratorRows,
              degree := degree,
              firstDoubleCosetOrdinal := ordinal,
              firstLeftClassId := eligibleClasses[left].classId,
              firstRightClassId := eligibleClasses[right].classId,
              fixedPointCounts := fixedCounts,
              occurrenceCount := 1,
              public := rec(
                compactAmbientSubgroupGeneratorRows :=
                  compact.subgroupGeneratorRows,
                degree := degree,
                firstDoubleCosetOrdinal := ordinal,
                firstLeftClassId := eligibleClasses[left].classId,
                firstRightClassId := eligibleClasses[right].classId,
                fixedPointCounts := fixedCounts,
                occurrenceCount := 1,
                stabilizerFingerprint :=
                  compact.subgroupGeneratorRowsSha256,
                subgroupOrder := Size(intersection),
                witnessFree := CVSCAllZero(fixedCounts)
              ),
              subgroup := intersection
            );
            Add(exactClasses, pairRecord);
            if CVSCAllZero(fixedCounts) and survivor = fail then
              survivor := CVSCMaterializeSurvivor(
                group,
                generators,
                intersection,
                input,
                fixedCounts,
                Concatenation("pair-", String(Length(exactClasses))));
            fi;
          else
            existing.occurrenceCount := existing.occurrenceCount + 1;
            existing.public.occurrenceCount := existing.occurrenceCount;
          fi;
        elif degree > exactDegree
            and degree <= COXETER_REQUEST.bounds.boundedLargerDegreeCeiling
            and degree mod 5760 = 0 then
          pairLargerCount := pairLargerCount + 1;
          if Length(largerClasses)
              < COXETER_REQUEST.bounds.maximumLargerIntersectionClasses then
            existing := CVSCIntersectionClass(group, largerClasses, intersection);
            if existing = fail then
              Add(largerClasses, rec(
                degree := degree,
                occurrenceCount := 1,
                subgroup := intersection
              ));
            else
              existing.occurrenceCount := existing.occurrenceCount + 1;
            fi;
          else
            largerTruncated := true;
          fi;
        fi;
      od;
      Add(pairSummaries, rec(
        doubleCosetCount := Length(doubleCosets),
        exactDegreeOrbitCount := pairExactCount,
        floorDegreeOrbitCount := pairFloorCount,
        largerAdmissibleOrbitCount := pairLargerCount,
        leftClassId := eligibleClasses[left].classId,
        rightClassId := eligibleClasses[right].classId
      ));
    od;
  od;

  if survivor <> fail then
    status := "candidate-found";
    reason := "An index-195840 pair intersection passed materialized replay.";
  else
    status := "exact-exhausted";
    reason := Concatenation(
      "All double cosets between the ten index-97920 stabilizer classes ",
      "were enumerated.  Every index-195840 intersection is witness-",
      "contaminated.  Intersections involving an input class of index ",
      "195840 can only remain at that degree by reproducing that class."
    );
  fi;
  return rec(
    completeWithinDeclaredTargets := true,
    exactIntersectionClasses := List(exactClasses, item -> item.public),
    exactScope := rec(
      allIteratedIntersectionsAtExactDegreeCovered := true,
      argument := Concatenation(
        "At twice the minimum index, the first proper cut in any iterated ",
        "intersection is already one of the enumerated pair intersections; ",
        "later factors either preserve it or increase the index."),
      exactPairDegree := exactDegree,
      eligibleClassCount := Length(eligibleClasses),
      explicitDoubleCosetPairTypeCount := explicitPairTypes,
      indexPrunedPairTypeCount := pairTypes - explicitPairTypes,
      pairTypeCount := pairTypes,
      targetDegrees := COXETER_REQUEST.targetDegrees
    ),
    largerFrontier := rec(
      degreeCeiling := COXETER_REQUEST.bounds.boundedLargerDegreeCeiling,
      iteratedIntersectionsSearched := false,
      retainedIntersectionClassCount := Length(largerClasses),
      status := (function()
        if largerTruncated then return "bounded-incomplete"; fi;
        return "pairwise-samples-retained-iterated-not-run";
      end)(),
      truncated := largerTruncated
    ),
    pairSummaries := pairSummaries,
    pairTypesExamined := pairTypes,
    reason := reason,
    status := status,
    survivor := survivor,
    totalDoubleCosetsExamined := totalDoubleCosets
  );
end;;

CVRunMod2SymbolicComposite := function()
  local started, generators, witnessClasses, rebuilt, coverage,
    search, survivor;
  CVRequire(IsBound(COXETER_INPUT) and IsRecord(COXETER_INPUT),
    "missing-action", "COXETER_INPUT must be the certified 122-point action.");
  CVRequire(IsBound(COXETER_REQUEST) and IsRecord(COXETER_REQUEST),
    "missing-request", "COXETER_REQUEST must be a symbolic search request.");
  CVRequire(COXETER_REQUEST.artifactType
      = "mod2-symbolic-composite-search-request",
    "invalid-request", "The request has the wrong artifact type.");
  CVRequire(CVSCValidateTargets(COXETER_REQUEST.targetDegrees),
    "invalid-targets", "The target degree list is not the declared exact list.");
  CVRequire(COXETER_INPUT.actionSha256
      = COXETER_REQUEST.sourceHashes.ambientActionSha256,
    "stale-action", "The request names another ambient action.");
  CVRequire(COXETER_INPUT.degree = 122
      and Length(COXETER_INPUT.generatorRows) = 10
      and Length(COXETER_INPUT.torsionWitnesses)
        = COXETER_REQUEST.witnessCount,
    "unexpected-action", "The compact mod-2 action has the wrong shape.");

  started := Runtime();
  generators := List(COXETER_INPUT.generatorRows, PermList);
  CV_SC_AMBIENT_GROUP := Group(generators);
  CVRequire(Size(CV_SC_AMBIENT_GROUP) = COXETER_INPUT.expectedOrder,
    "ambient-order-mismatch", "The mod-2 image order changed.");
  witnessClasses := CVSCWitnessClasses(
    CV_SC_AMBIENT_GROUP, generators, COXETER_INPUT.torsionWitnesses);
  rebuilt := CVSCReconstructClasses(CV_SC_AMBIENT_GROUP, witnessClasses);
  coverage := CVSCCoverageUnion(rebuilt.internals, COXETER_REQUEST.witnessCount);
  search := CVSCSearchPairwise195840(
    CV_SC_AMBIENT_GROUP,
    generators,
    rebuilt.internals,
    witnessClasses,
    COXETER_INPUT);
  survivor := search.survivor;
  Unbind(search.survivor);
  return rec(
    artifactType := "mod2-symbolic-composite-search-response",
    claims := (function()
      if search.status = "exact-exhausted" then
        return [
          "exact exhaustion inside the declared target degree list",
          "all compact stabilizers and witness marks reconstructed exactly"
        ];
      elif search.status = "candidate-found" then
        return [
          "materialized survivor passed exact GAP relation and witness replay"
        ];
      fi;
      return ["resource-bounded accounting only"];
    end)(),
    compactSubgroups := rebuilt.publics,
    coverageUnion := coverage,
    elapsedMilliseconds := Runtime() - started,
    nonClaims := [
      "completeness above degree 97920",
      "a Davis quotient or fibering certificate"
    ],
    requestSha256 := COXETER_REQUEST.requestSha256,
    schemaVersion := 1,
    search := search,
    status := search.status,
    survivor := survivor,
    targetDegrees := COXETER_REQUEST.targetDegrees,
    tool := rec(
      gapVersion := GAPInfo.Version,
      id := CoxeterMod2SymbolicCompositeId,
      version := CoxeterMod2SymbolicCompositeVersion
    )
  );
end;;

CV_SC_CAUGHT := CALL_WITH_CATCH(CVRunMod2SymbolicComposite, []);;
if CV_SC_CAUGHT[1] = true and Length(CV_SC_CAUGHT) >= 2 then
  CVWriteArtifact(COXETER_OUTPUT, CV_SC_CAUGHT[2]);
  QUIT_GAP(0);
fi;

CVWriteArtifact(COXETER_OUTPUT, rec(
  artifactType := "mod2-symbolic-composite-search-response",
  error := rec(
    detail := (function()
      if Length(CV_SC_CAUGHT) >= 2 then return String(CV_SC_CAUGHT[2]); fi;
      return "GAP raised an unreported error.";
    end)(),
    stage := CV_STAGE
  ),
  requestSha256 := COXETER_REQUEST.requestSha256,
  schemaVersion := 1,
  status := "failed",
  targetDegrees := COXETER_REQUEST.targetDegrees
));
QUIT_GAP(1);
