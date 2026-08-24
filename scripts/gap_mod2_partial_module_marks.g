# Exact fixed-point vectors for the bounded mod-2 subgroup classes.
#
# A generated driver first reads the function-only prefix of
# gap_finite_image_recognition.g, then reads this file.  The 122-point ambient
# action is exact.  Candidate stabilizers are reconstructed in that compact
# action; the large coset actions are never materialized.

CoxeterMod2PartialMarksId := "gap-mod2-partial-module-marks";;
CoxeterMod2PartialMarksVersion := "1.1.0";;

CVMarksPublicExactCandidate := function(candidate)
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
  # These are generators of H inside the 122-point ambient image, not rows of
  # the [G:H]-point coset action.  Only their digest enters the output.
  public.compactSubgroupMaterialization := CVCompactSubgroupMaterialization(
    COXETER_INPUT, CV_MARKS_AMBIENT_GROUP, candidate.subgroup);
  return public;
end;;

CVPublicExactCandidate := CVMarksPublicExactCandidate;;

CVMarksWordElement := function(generators, word)
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

CVMarksWitnessClasses := function(group, generators, witnesses)
  local representatives, witnessClassPositions, witness, element, position,
    centralizerSizes;
  representatives := [];
  witnessClassPositions := [];
  for witness in witnesses do
    element := CVMarksWordElement(generators, witness.word);
    CVRequire(Order(element) = witness.primeOrder,
      "witness-order-mismatch",
      "A transferred torsion witness has the wrong exact image order.");
    position := PositionProperty(representatives,
      representative -> IsConjugate(group, representative, element));
    if position = fail then
      Add(representatives, element);
      position := Length(representatives);
    fi;
    Add(witnessClassPositions, position);
  od;
  centralizerSizes := List(representatives,
    representative -> Size(Centralizer(group, representative)));
  return rec(
    centralizerSizes := centralizerSizes,
    representatives := representatives,
    witnessClassPositions := witnessClassPositions
  );
end;;

CVMarksFixedCountForClass := function(group, subgroup, subgroupClasses,
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
    "nonintegral-fixed-point-formula",
    "The centralizer/intersection fixed-coset formula was not integral.");
  fixed := numerator / Size(subgroup);
  CVRequire(IsInt(fixed) and fixed >= 0 and fixed <= degree,
    "invalid-fixed-point-count",
    "An exact fixed-coset count lies outside the action degree.");
  return fixed;
end;;

CVMarksFixedPointVector := function(group, subgroup, witnessClasses, degree)
  local subgroupClasses, uniqueCounts;
  subgroupClasses := ConjugacyClasses(subgroup);
  uniqueCounts := List([1..Length(witnessClasses.representatives)], position ->
    CVMarksFixedCountForClass(
      group,
      subgroup,
      subgroupClasses,
      witnessClasses.representatives[position],
      witnessClasses.centralizerSizes[position],
      degree));
  return List(witnessClasses.witnessClassPositions,
    position -> uniqueCounts[position]);
end;;

CVMarksCandidateMatches := function(expected, candidate)
  return expected.degree = candidate.subgroupIndex
    and expected.classOrdinalWithinDegree > 0
    and expected.provenance.b0Family = candidate.b0Family
    and expected.provenance.b0Index = candidate.b0Index
    and expected.provenance.commonQuotientOrder
      = candidate.commonQuotientOrder
    and expected.provenance.s3ClassPosition = candidate.s3ClassPosition
    and expected.provenance.s3Order = candidate.s3Order
    and expected.provenance.s3ProjectionIndex
      = candidate.s3ProjectionIndex
    and expected.provenance.sourceRows = candidate.sourceRows
    and expected.provenance.subgroupOrder = candidate.subgroupOrder
    and expected.provenance.tomPosition = candidate.tomPosition;
end;;

CVMarksFlattenCandidates := function(recognition, requestedDegrees)
  local report, result, row, candidate, ordinal;
  CVRequire(IsBound(recognition.mod2Certificate)
      and IsBound(recognition.mod2Certificate.finiteIndexClassification)
      and IsBound(
        recognition.mod2Certificate.finiteIndexClassification.report),
    "missing-mod2-ledger", "Recognition did not return its exact mod-2 ledger.");
  report := recognition.mod2Certificate.finiteIndexClassification.report;
  result := [];
  for row in report do
    if row.target in requestedDegrees then
      CVRequire(IsBound(row.exactCandidates)
          and Length(row.exactCandidates) = row.exactCandidateCount,
        "missing-exact-candidates",
        "A requested degree did not return every exact candidate class.");
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

CVRunMod2PartialMarks := function()
  local generators, recognition, requestedDegrees, generated, witnessClasses,
    records, position, expected, generatedRecord, candidate, compact,
    subgroup, fixedCounts, started;
  CVRequire(IsBound(COXETER_INPUT) and IsRecord(COXETER_INPUT),
    "missing-action-transfer", "COXETER_INPUT must be the exact action transfer.");
  CVRequire(IsBound(COXETER_REQUEST) and IsRecord(COXETER_REQUEST),
    "missing-marks-request", "COXETER_REQUEST must be a marks request.");
  CVRequire(COXETER_REQUEST.artifactType
      = "mod2-partial-module-marks-request",
    "invalid-marks-request", "The request has the wrong artifact type.");
  CVRequire(COXETER_INPUT.actionSha256
      = COXETER_REQUEST.sourceHashes.recognitionActionSha256,
    "stale-action-transfer", "The marks request names another action transfer.");
  CVRequire(COXETER_INPUT.degree = 122
      and Length(COXETER_INPUT.generatorRows) = 10,
    "unexpected-ambient-action",
    "The bounded mod-2 rerun requires the certified 122-point action.");
  CVRequire(IsBound(COXETER_INPUT.torsionWitnesses)
      and Length(COXETER_INPUT.torsionWitnesses)
        = COXETER_REQUEST.witnessCount,
    "stale-witness-transfer",
    "The action transfer and marks request have different witness counts.");

  started := Runtime();
  generators := List(COXETER_INPUT.generatorRows, PermList);
  CV_MARKS_AMBIENT_GROUP := Group(generators);
  CVRequire(Size(CV_MARKS_AMBIENT_GROUP) = COXETER_INPUT.expectedOrder,
    "ambient-order-mismatch", "The compact mod-2 image has the wrong order.");

  recognition := CVRunRecognition(COXETER_INPUT);
  CVRequire(recognition.status = "passed",
    "recognition-rerun-failed", "The exact mod-2 recognition rerun did not pass.");
  requestedDegrees := Set(List(COXETER_REQUEST.classes,
    item -> item.degree));
  generated := CVMarksFlattenCandidates(recognition, requestedDegrees);
  CVRequire(Length(generated) = Length(COXETER_REQUEST.classes),
    "class-count-mismatch",
    "The rerun did not reproduce every requested subgroup class.");
  witnessClasses := CVMarksWitnessClasses(
    CV_MARKS_AMBIENT_GROUP, generators, COXETER_INPUT.torsionWitnesses);

  records := [];
  for position in [1..Length(COXETER_REQUEST.classes)] do
    expected := COXETER_REQUEST.classes[position];
    generatedRecord := generated[position];
    candidate := generatedRecord.candidate;
    CVRequire(expected.degree = generatedRecord.degree
        and expected.classOrdinalWithinDegree
          = generatedRecord.classOrdinalWithinDegree
        and CVMarksCandidateMatches(expected, candidate),
      "candidate-provenance-mismatch",
      "A regenerated subgroup class does not match its sealed request record.");
    compact := candidate.compactSubgroupMaterialization;
    subgroup := Subgroup(CV_MARKS_AMBIENT_GROUP,
      List(compact.subgroupGeneratorRows, PermList));
    CVRequire(Index(CV_MARKS_AMBIENT_GROUP, subgroup) = expected.degree
        and Size(subgroup) = expected.provenance.subgroupOrder,
      "stabilizer-roundtrip-failed",
      "A compact stabilizer did not reproduce its exact index and order.");
    fixedCounts := CVMarksFixedPointVector(
      CV_MARKS_AMBIENT_GROUP, subgroup, witnessClasses, expected.degree);
    Add(records, rec(
      classId := expected.classId,
      classOrdinalWithinDegree := expected.classOrdinalWithinDegree,
      compactSubgroupGeneratorRows := compact.subgroupGeneratorRows,
      degree := expected.degree,
      fixedPointCounts := fixedCounts,
      marksEvidence := rec(
        exact := true,
        formula := "|C_G(x)| * |x^G intersect H| / |H|",
        method := "compact-stabilizer conjugacy-class intersection",
        permutationRowsMaterialized := false,
        testedAmbientConjugacyClassCount :=
          Length(witnessClasses.representatives),
        witnessCount := Length(fixedCounts)
      ),
      stabilizerFingerprint := compact.subgroupGeneratorRowsSha256,
      stabilizerProvenance := rec(
        ambientActionDegree := compact.ambientActionDegree,
        ambientActionSha256 := compact.ambientActionSha256,
        b0Family := candidate.b0Family,
        b0Index := candidate.b0Index,
        commonQuotientOrder := candidate.commonQuotientOrder,
        s3ClassPosition := candidate.s3ClassPosition,
        sourceRows := candidate.sourceRows,
        subgroupGeneratorCount := compact.subgroupGeneratorCount,
        subgroupIndex := compact.subgroupIndex,
        subgroupOrder := compact.subgroupOrder,
        tomPosition := candidate.tomPosition
      )
    ));
  od;

  return rec(
    artifactType := "mod2-partial-module-marks-response",
    classCount := Length(records),
    classRecords := records,
    claims := [
      "exact fixed-coset counts for the requested mod-2 subgroup classes"
    ],
    elapsedMilliseconds := Runtime() - started,
    nonClaims := [
      "materialized large coset actions",
      "a torsion-free subgroup",
      "completeness outside the request"
    ],
    requestSha256 := COXETER_REQUEST.requestSha256,
    schemaVersion := 1,
    sourceHashes := COXETER_REQUEST.sourceHashes,
    status := "passed",
    tool := rec(
      gapVersion := GAPInfo.Version,
      id := CoxeterMod2PartialMarksId,
      version := CoxeterMod2PartialMarksVersion
    ),
    witnessCatalogueSha256 := COXETER_REQUEST.witnessCatalogueSha256,
    witnessCount := COXETER_REQUEST.witnessCount
  );
end;;

CV_MARKS_CAUGHT := CALL_WITH_CATCH(CVRunMod2PartialMarks, []);;
if CV_MARKS_CAUGHT[1] = true and Length(CV_MARKS_CAUGHT) >= 2 then
  CVWriteArtifact(COXETER_OUTPUT, CV_MARKS_CAUGHT[2]);
  QUIT_GAP(0);
fi;

CVWriteArtifact(COXETER_OUTPUT, rec(
  artifactType := "mod2-partial-module-marks-response",
  error := rec(
    code := CV_FAILURE_CODE,
    message := CV_FAILURE_MESSAGE,
    stage := CV_STAGE
  ),
  requestSha256 := (function()
    if IsBound(COXETER_REQUEST) and IsBound(COXETER_REQUEST.requestSha256) then
      return COXETER_REQUEST.requestSha256;
    fi;
    return "unavailable";
  end)(),
  schemaVersion := 1,
  status := "failed",
  tool := rec(
    gapVersion := GAPInfo.Version,
    id := CoxeterMod2PartialMarksId,
    version := CoxeterMod2PartialMarksVersion
  )
));
QUIT_GAP(1);
