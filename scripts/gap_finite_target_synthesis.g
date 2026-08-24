# Bounded involution-tuple search for finite Coxeter targets.
#
# Python supplies a validated Coxeter matrix, exact maximal spherical orders,
# one target, and hard bounds. This script emits a small line protocol. Python
# independently rechecks every emitted permutation tuple before certification.

CoxeterFiniteTargetBackendVersion := "2.5.0";;

CoxeterArgValue := function(name)
  local position;
  position := Position(ARGV, name);
  if position = fail or position = Length(ARGV) then
    return fail;
  fi;
  return ARGV[position + 1];
end;;

CoxeterBoolText := function(value)
  if value then
    return "true";
  fi;
  return "false";
end;;

CoxeterJoinIntegers := function(values)
  if Length(values) = 0 then
    return "";
  fi;
  return JoinStringsWithSeparator(List(values, String), ",");
end;;

CoxeterWrite := function(path, fields)
  AppendTo(CoxeterRawStream,
    JoinStringsWithSeparator(List(fields, String), "|"), "\n");
end;;

CoxeterMatrixForWeyl := function(family, rank)
  local matrix, i, center, arm, previous, length, armLengths;
  matrix := List([1..rank], i -> List([1..rank], j -> 2));
  for i in [1..rank] do
    matrix[i][i] := 1;
  od;
  if family = "A" then
    for i in [1..rank - 1] do
      matrix[i][i + 1] := 3;
      matrix[i + 1][i] := 3;
    od;
  elif family = "B" then
    for i in [1..rank - 1] do
      matrix[i][i + 1] := 3;
      matrix[i + 1][i] := 3;
    od;
    matrix[rank - 1][rank] := 4;
    matrix[rank][rank - 1] := 4;
  elif family = "D" then
    for i in [1..rank - 3] do
      matrix[i][i + 1] := 3;
      matrix[i + 1][i] := 3;
    od;
    center := rank - 2;
    matrix[center][rank - 1] := 3;
    matrix[rank - 1][center] := 3;
    matrix[center][rank] := 3;
    matrix[rank][center] := 3;
  elif family = "F" and rank = 4 then
    matrix[1][2] := 3; matrix[2][1] := 3;
    matrix[2][3] := 4; matrix[3][2] := 4;
    matrix[3][4] := 3; matrix[4][3] := 3;
  elif family = "E" then
    if rank = 6 then armLengths := [1,2,2];
    elif rank = 7 then armLengths := [1,2,3];
    else armLengths := [1,2,4];
    fi;
    center := 1;
    previous := 2;
    for arm in [1..3] do
      previous := center;
      for length in [1..armLengths[arm]] do
        i := 1 + Sum(armLengths{[1..arm - 1]}) + length;
        matrix[previous][i] := 3;
        matrix[i][previous] := 3;
        previous := i;
      od;
    od;
  else
    return fail;
  fi;
  return matrix;
end;;

CoxeterFpPermutationGroup := function(matrix)
  local rank, free, generators, relators, i, j, quotient,
    quotientGenerators, isomorphism, group;
  rank := Length(matrix);
  free := FreeGroup(rank);
  generators := GeneratorsOfGroup(free);
  relators := List(generators, generator -> generator^2);
  for i in [1..rank] do
    for j in [i + 1..rank] do
      if matrix[i][j] > 1 then
        Add(relators, (generators[i] * generators[j])^matrix[i][j]);
      fi;
    od;
  od;
  quotient := free / relators;
  quotientGenerators := GeneratorsOfGroup(quotient);
  isomorphism := IsomorphismPermGroup(quotient);
  if isomorphism = fail then
    return fail;
  fi;
  group := Image(isomorphism);
  return rec(
    group := group,
    simpleGenerators := List(quotientGenerators,
      generator -> Image(isomorphism, generator)),
    simpleMatrix := matrix
  );
end;;

CoxeterBuildClassical := function(target)
  if target.family = "GL" then
    return GL(target.dimension, target.fieldOrder);
  elif target.family = "SL" then
    return SL(target.dimension, target.fieldOrder);
  elif target.family = "PGL" then
    return PGL(target.dimension, target.fieldOrder);
  elif target.family = "PSL" then
    return PSL(target.dimension, target.fieldOrder);
  elif target.family = "Sp" then
    return Sp(target.dimension, target.fieldOrder);
  elif target.family = "GO+" then
    return GO(1, target.dimension, target.fieldOrder);
  elif target.family = "GO-" then
    return GO(-1, target.dimension, target.fieldOrder);
  elif target.family = "SO+" then
    return SO(1, target.dimension, target.fieldOrder);
  elif target.family = "SO-" then
    return SO(-1, target.dimension, target.fieldOrder);
  fi;
  return fail;
end;;

CoxeterBuildAffineClassical := function(target)
  local field, moduleDimension, vectorSpace, points, pointCount, linearGroup,
    blockMatrix, blockRows, copy, row, column, blockRow,
    linearPermutations, basisVectors, translations, affineGroup,
    complement, source, sourceSimple, isomorphism, simple;
  if target.family <> "Sp" or target.fieldOrder <> 2
      or target.dimension mod 2 <> 0 then
    return fail;
  fi;
  field := GF(target.fieldOrder);
  moduleDimension := target.dimension * target.moduleCopies;
  vectorSpace := FullRowSpace(field, moduleDimension);
  points := Elements(vectorSpace);
  pointCount := Length(points);
  linearGroup := Sp(target.dimension, target.fieldOrder);
  linearPermutations := List(GeneratorsOfGroup(linearGroup), function(matrix)
      blockRows := [];
      for copy in [1..target.moduleCopies] do
        for row in [1..target.dimension] do
          blockRow := List([1..moduleDimension], index -> Zero(field));
          for column in [1..target.dimension] do
            blockRow[(copy - 1) * target.dimension + column] :=
              matrix[row][column];
          od;
          Add(blockRows, blockRow);
        od;
      od;
      blockMatrix := Matrix(field, blockRows);
      return PermList(List(points,
        vector -> Position(points, vector * blockMatrix)));
    end);
  basisVectors := BasisVectors(Basis(vectorSpace));
  translations := List(basisVectors, offset ->
    PermList(List(points, vector -> Position(points, vector + offset))));
  complement := Group(linearPermutations);
  affineGroup := Group(Concatenation(linearPermutations, translations));

  simple := fail;
  if target.dimension = 4 then
    # Sp(4,2) is S6. This tuple only gives the catalogue a preferred A5
    # representative; every complement class and labeled normalizer orbit is
    # still enumerated below.
    source := SymmetricGroup(6);
    sourceSimple := List([1..5], index ->
      MappingPermListList([index, index + 1], [index + 1, index]));
    isomorphism := IsomorphismGroups(source, complement);
    if isomorphism <> fail then
      simple := List(sourceSimple, generator -> Image(isomorphism, generator));
    fi;
  fi;
  return rec(
    group := affineGroup,
    simpleGenerators := simple,
    simpleMatrix := CoxeterMatrixForWeyl("A", 5),
    affineComplement := complement,
    affinePointCount := pointCount
  );
end;;

CoxeterIndexTwoKernelOrbitRepresentatives := function(group)
  local automorphisms, remaining, representatives, subgroup, orbit;
  automorphisms := AutomorphismGroup(group);
  remaining := Set(Filtered(NormalSubgroups(group),
    subgroup -> Index(group, subgroup) = 2));
  representatives := [];
  while Length(remaining) > 0 do
    subgroup := remaining[1];
    Add(representatives, subgroup);
    orbit := Set(List(Elements(automorphisms),
      automorphism -> Image(automorphism, subgroup)));
    remaining := Filtered(remaining, candidate -> not candidate in orbit);
  od;
  return representatives;
end;;

CoxeterBuildS6BlockExtension := function(target)
  local source, sourceSimple, automorphisms, inner, innerSimple,
    automorphismIsomorphism, automorphismPermGroup, innerPermGroup,
    innerSimplePerm, outerInvolution, quotient, kernelRepresentatives,
    kernel, quotientIsomorphism, quotientPermGroup, quotientGenerators,
    directProduct, automorphismEmbedding, quotientEmbedding, generators,
    generator, imageGenerator, actionBit, group, distinguishedAnchor;
  if not target.quotientOrder in [8, 16]
      or target.quotientId < 1
      or target.quotientId > NumberSmallGroups(target.quotientOrder) then
    return fail;
  fi;

  source := SymmetricGroup(6);
  sourceSimple := List([1..5], index ->
    MappingPermListList([index, index + 1], [index + 1, index]));
  automorphisms := AutomorphismGroup(source);
  inner := Group(List(GeneratorsOfGroup(source), generator ->
    InnerAutomorphism(source, generator)));
  innerSimple := List(sourceSimple, generator ->
    InnerAutomorphism(source, generator));
  automorphismIsomorphism := IsomorphismPermGroup(automorphisms);
  if automorphismIsomorphism = fail then return fail; fi;
  automorphismPermGroup := Image(automorphismIsomorphism);
  innerPermGroup := Image(automorphismIsomorphism, inner);
  innerSimplePerm := List(innerSimple, generator ->
    Image(automorphismIsomorphism, generator));
  outerInvolution := First(Elements(automorphismPermGroup), generator ->
    not generator in innerPermGroup and Order(generator) = 2);
  if outerInvolution = fail then return fail; fi;

  quotient := SmallGroup(target.quotientOrder, target.quotientId);
  kernelRepresentatives := CoxeterIndexTwoKernelOrbitRepresentatives(quotient);
  if Length(kernelRepresentatives) <> target.expectedOuterKernelOrbitCount then
    return fail;
  fi;
  if target.outerKernelOrbit < 0
      or target.outerKernelOrbit > Length(kernelRepresentatives) then
    return fail;
  fi;
  if target.outerKernelOrbit = 0 then
    kernel := quotient;
  else
    kernel := kernelRepresentatives[target.outerKernelOrbit];
  fi;
  quotientIsomorphism := IsomorphismPermGroup(quotient);
  if quotientIsomorphism = fail then return fail; fi;
  quotientPermGroup := Image(quotientIsomorphism);
  quotientGenerators := GeneratorsOfGroup(quotient);

  directProduct := DirectProduct(automorphismPermGroup, quotientPermGroup);
  automorphismEmbedding := Embedding(directProduct, 1);
  quotientEmbedding := Embedding(directProduct, 2);
  generators := List(GeneratorsOfGroup(innerPermGroup), generator ->
    Image(automorphismEmbedding, generator));
  for generator in quotientGenerators do
    imageGenerator := Image(quotientIsomorphism, generator);
    actionBit := not generator in kernel;
    if actionBit then
      Add(generators,
        Image(automorphismEmbedding, outerInvolution)
        * Image(quotientEmbedding, imageGenerator));
    else
      Add(generators, Image(quotientEmbedding, imageGenerator));
    fi;
  od;
  group := Group(generators);
  distinguishedAnchor := Group(List(innerSimplePerm, generator ->
    Image(automorphismEmbedding, generator)));
  if Size(group) <> 720 * target.quotientOrder
      or Size(distinguishedAnchor) <> 720 then
    return fail;
  fi;
  return rec(
    group := group,
    simpleGenerators := List(innerSimplePerm, generator ->
      Image(automorphismEmbedding, generator)),
    simpleMatrix := CoxeterMatrixForWeyl("A", 5),
    distinguishedAnchor := distinguishedAnchor
  );
end;;

CoxeterA6OuterMapOrbitRepresentatives := function(
    blockGroup, pointStabilizer, outerGroup, s6OuterClass)
  local stabilizerGenerator, generators, homomorphisms, automorphisms,
    remaining, representatives, homomorphism, orbitKeys;
  stabilizerGenerator := First(Elements(pointStabilizer),
    element -> element <> One(pointStabilizer));
  if stabilizerGenerator = fail then return []; fi;
  generators := GeneratorsOfGroup(blockGroup);
  homomorphisms := Filtered(AllHomomorphisms(blockGroup, outerGroup),
    homomorphism -> Image(homomorphism, stabilizerGenerator) = s6OuterClass);
  automorphisms := Filtered(Elements(AutomorphismGroup(blockGroup)),
    automorphism -> Image(automorphism, pointStabilizer) = pointStabilizer);
  remaining := ShallowCopy(homomorphisms);
  representatives := [];
  while Length(remaining) > 0 do
    homomorphism := remaining[1];
    Add(representatives, homomorphism);
    orbitKeys := Set(List(automorphisms, automorphism ->
      List(generators, generator ->
        Image(homomorphism, Image(automorphism, generator)))));
    remaining := Filtered(remaining, candidate ->
      not List(generators, generator -> Image(candidate, generator))
        in orbitKeys);
  od;
  return representatives;
end;;

CoxeterBuildA6CoreExtension := function(target)
  local alternating, symmetric, symmetricSimple, automorphisms, inner,
    automorphismIsomorphism, automorphismPermGroup, innerPermGroup,
    outerMap, outerGroup, transpositionAutomorphism, s6OuterClass,
    blockGroup, pointStabilizer, stabilizerGenerator, mapRepresentatives,
    outerAction, directProduct, automorphismEmbedding, blockEmbedding,
    generators, blockGenerator, outerImage, outerLift, group,
    simpleAutomorphisms, simplePermutations, simpleGenerators,
    stabilizerImage, distinguishedAnchor;
  if not target.blockDegree in [8, 16] then return fail; fi;
  blockGroup := TransitiveGroup(target.blockDegree, target.transitiveId);
  if Size(blockGroup) <> 2 * target.blockDegree then return fail; fi;
  pointStabilizer := Stabilizer(blockGroup, 1);
  if Size(pointStabilizer) <> 2 then return fail; fi;

  alternating := AlternatingGroup(6);
  symmetric := SymmetricGroup(6);
  symmetricSimple := List([1..5], index ->
    MappingPermListList([index, index + 1], [index + 1, index]));
  automorphisms := AutomorphismGroup(alternating);
  inner := Group(List(GeneratorsOfGroup(alternating), generator ->
    InnerAutomorphism(alternating, generator)));
  outerMap := NaturalHomomorphismByNormalSubgroup(automorphisms, inner);
  outerGroup := Image(outerMap);
  transpositionAutomorphism := GroupHomomorphismByFunction(
    alternating, alternating, element -> element ^ (1,2));
  s6OuterClass := Image(outerMap, transpositionAutomorphism);
  mapRepresentatives := CoxeterA6OuterMapOrbitRepresentatives(
    blockGroup, pointStabilizer, outerGroup, s6OuterClass);
  if Length(mapRepresentatives) <> target.expectedOuterMapOrbitCount then
    return fail;
  fi;
  if target.outerMapOrbit < 1
      or target.outerMapOrbit > Length(mapRepresentatives) then
    return fail;
  fi;
  outerAction := mapRepresentatives[target.outerMapOrbit];

  automorphismIsomorphism := IsomorphismPermGroup(automorphisms);
  if automorphismIsomorphism = fail then return fail; fi;
  automorphismPermGroup := Image(automorphismIsomorphism);
  innerPermGroup := Image(automorphismIsomorphism, inner);
  directProduct := DirectProduct(automorphismPermGroup, blockGroup);
  automorphismEmbedding := Embedding(directProduct, 1);
  blockEmbedding := Embedding(directProduct, 2);
  generators := List(GeneratorsOfGroup(innerPermGroup), generator ->
    Image(automorphismEmbedding, generator));
  for blockGenerator in GeneratorsOfGroup(blockGroup) do
    outerImage := Image(outerAction, blockGenerator);
    outerLift := PreImagesRepresentative(outerMap, outerImage);
    Add(generators,
      Image(automorphismEmbedding,
        Image(automorphismIsomorphism, outerLift))
      * Image(blockEmbedding, blockGenerator));
  od;
  group := Group(generators);

  stabilizerGenerator := First(Elements(pointStabilizer),
    element -> element <> One(pointStabilizer));
  stabilizerImage := Image(blockEmbedding, stabilizerGenerator);
  simpleAutomorphisms := List(symmetricSimple, permutation ->
    GroupHomomorphismByFunction(alternating, alternating,
      element -> element ^ permutation));
  simplePermutations := List(simpleAutomorphisms, automorphism ->
    Image(automorphismIsomorphism, automorphism));
  simpleGenerators := List(simplePermutations, permutation ->
    Image(automorphismEmbedding, permutation) * stabilizerImage);
  distinguishedAnchor := Group(simpleGenerators);
  if Size(group) <> 360 * Size(blockGroup)
      or Size(distinguishedAnchor) <> 720 then
    return fail;
  fi;
  return rec(
    group := group,
    simpleGenerators := simpleGenerators,
    simpleMatrix := CoxeterMatrixForWeyl("A", 5),
    distinguishedAnchor := distinguishedAnchor
  );
end;;

CoxeterBuildTarget := function(target)
  local group, matrix, isomorphism, degree, simple;
  if target.kind = "symmetric" then
    group := SymmetricGroup(target.degree);
    simple := List([1..target.degree - 1],
      i -> MappingPermListList([i, i + 1], [i + 1, i]));
    return rec(
      group := group,
      simpleGenerators := simple,
      simpleMatrix := CoxeterMatrixForWeyl("A", target.degree - 1)
    );
  elif target.kind = "weyl" then
    matrix := CoxeterMatrixForWeyl(target.family, target.rank);
    if matrix = fail then return fail; fi;
    return CoxeterFpPermutationGroup(matrix);
  elif target.kind = "classical" then
    group := CoxeterBuildClassical(target);
    if group = fail then return fail; fi;
    if IsPermGroup(group) then
      return rec(group := group, simpleGenerators := fail, simpleMatrix := fail);
    fi;
    isomorphism := IsomorphismPermGroup(group);
    if isomorphism = fail then return fail; fi;
    return rec(
      group := Image(isomorphism),
      simpleGenerators := fail,
      simpleMatrix := fail
    );
  elif target.kind = "affine-classical" then
    return CoxeterBuildAffineClassical(target);
  elif target.kind = "s6-block-extension" then
    return CoxeterBuildS6BlockExtension(target);
  elif target.kind = "a6-core-extension" then
    return CoxeterBuildA6CoreExtension(target);
  fi;
  return fail;
end;;

CoxeterChooseVariable := function(assigned, matrix)
  local best, bestAssigned, bestTotal, i, assignedCount, total;
  best := fail;
  bestAssigned := -1;
  bestTotal := -1;
  for i in [1..Length(assigned)] do
    if assigned[i] = fail then
      assignedCount := Number([1..Length(assigned)],
        j -> assigned[j] <> fail and matrix[i][j] <> 0);
      total := Number([1..Length(assigned)], j -> i <> j and matrix[i][j] <> 0);
      if assignedCount > bestAssigned
          or (assignedCount = bestAssigned and total > bestTotal)
          or (assignedCount = bestAssigned and total = bestTotal
              and (best = fail or i < best)) then
        best := i;
        bestAssigned := assignedCount;
        bestTotal := total;
      fi;
    fi;
  od;
  return best;
end;;

CoxeterCompatible := function(index, candidate, assigned, matrix)
  local j, expected;
  for j in [1..Length(assigned)] do
    if assigned[j] <> fail then
      expected := matrix[index][j];
      if expected <> 0 and Order(candidate * assigned[j]) <> expected then
        return false;
      fi;
    fi;
  od;
  return true;
end;;

CoxeterRunContainmentPrecheck := function(
    input, target, involutions, classRepresentatives, precheck, precheckIndex)
  local rank, assigned, nodes, found, limitReached, limitReason, started,
    recurse, status, complete, degree, generatorIndex, row, subgroup;

  rank := Length(precheck.coxeterMatrix);
  assigned := List([1..rank], i -> fail);
  nodes := 0;
  found := fail;
  limitReached := false;
  limitReason := "complete-enumeration";
  started := Runtime();

  # Fixing the first chosen reflection up to conjugacy is exhaustive: any
  # tuple can be simultaneously conjugated so that reflection is one of these
  # class representatives. Remaining reflections range over all involutions.
  recurse := function(depth)
    local index, pool, candidate;
    if found <> fail or limitReached then return; fi;
    if Runtime() - started > input.bounds.precheckTimeoutMilliseconds then
      limitReached := true;
      limitReason := "precheck-time-bound-reached";
      return;
    fi;
    if depth > rank then
      subgroup := Group(assigned);
      if Size(subgroup) = precheck.expectedOrder then
        found := ShallowCopy(assigned);
      fi;
      return;
    fi;
    index := CoxeterChooseVariable(assigned, precheck.coxeterMatrix);
    if depth = 1 then pool := classRepresentatives;
    else pool := involutions;
    fi;
    for candidate in pool do
      if found <> fail or limitReached then return; fi;
      nodes := nodes + 1;
      if nodes mod 1024 = 0
          and Runtime() - started > input.bounds.precheckTimeoutMilliseconds then
        limitReached := true;
        limitReason := "precheck-time-bound-reached";
        return;
      fi;
      if nodes > input.bounds.maxPrecheckNodesPerType then
        limitReached := true;
        limitReason := "precheck-node-bound-reached";
        return;
      fi;
      if CoxeterCompatible(
          index, candidate, assigned, precheck.coxeterMatrix) then
        assigned[index] := candidate;
        recurse(depth + 1);
        assigned[index] := fail;
      fi;
    od;
  end;

  recurse(1);
  degree := LargestMovedPoint(target);
  if found <> fail then
    status := "proved-contained";
    complete := true;
    limitReason := "faithful-simple-reflection-tuple-found";
  elif limitReached then
    status := "incomplete-on-bound";
    complete := false;
  else
    status := "proved-absent";
    complete := true;
    limitReason := "exhaustive-conjugacy-reduced-search-found-no-faithful-tuple";
  fi;
  CoxeterWrite(CoxeterRawPath, ["PRECHECK", input.target.id, precheckIndex,
    precheck.id, precheck.typeName, precheck.expectedOrder, status,
    CoxeterBoolText(complete), nodes, limitReason, degree]);
  if found <> fail then
    for generatorIndex in [1..Length(found)] do
      row := List([1..degree], point -> point^found[generatorIndex]);
      CoxeterWrite(CoxeterRawPath, ["PRECHECK_GENERATOR", input.target.id,
        precheckIndex, generatorIndex - 1, CoxeterJoinIntegers(row)]);
    od;
  fi;
  return rec(status := status, complete := complete);
end;;

CoxeterAssignedElements := function(assigned)
  return Filtered(assigned, element -> element <> fail);
end;;

CoxeterCompatiblePool := function(index, assigned, matrix, involutions, stats)
  local result, candidate;
  result := [];
  for candidate in involutions do
    stats.compatibilityTests := stats.compatibilityTests + 1;
    if CoxeterCompatible(index, candidate, assigned, matrix) then
      Add(result, candidate);
    fi;
  od;
  return result;
end;;

CoxeterOrbitRepresentatives := function(
    stabilizer, candidates, preferred, stats)
  local orbits, representatives, orbit;
  if Length(candidates) = 0 then return []; fi;
  # The caller maintains the pointwise centralizer of the labeled prefix.
  # Taking one candidate from each orbit is exact canonical augmentation, not
  # a heuristic quotient of the search space.
  stats.centralizerCalls := stats.centralizerCalls + 1;
  stats.candidateCountBeforeOrbitReduction :=
    stats.candidateCountBeforeOrbitReduction + Length(candidates);
  orbits := OrbitsDomain(stabilizer, candidates, OnPoints);
  representatives := [];
  for orbit in orbits do
    if preferred <> fail and preferred in orbit then
      Add(representatives, preferred);
    else
      Add(representatives, orbit[1]);
    fi;
  od;
  if preferred <> fail and preferred in representatives then
    representatives := Concatenation(
      [preferred], Filtered(representatives, item -> item <> preferred));
  fi;
  stats.orbitRepresentativeCount :=
    stats.orbitRepresentativeCount + Length(representatives);
  return representatives;
end;;

CoxeterChooseConstrainedVariable := function(
    assigned, matrix, involutions, allowedIndices, stats)
  local bestIndex, bestPool, index, pool, constrained;
  bestIndex := fail;
  bestPool := fail;
  for index in allowedIndices do
    if assigned[index] = fail then
      pool := CoxeterCompatiblePool(index, assigned, matrix, involutions, stats);
      constrained := Number([1..Length(assigned)],
        other -> assigned[other] <> fail and matrix[index][other] <> 0);
      if bestIndex = fail
          or Length(pool) < Length(bestPool)
          or (Length(pool) = Length(bestPool)
              and constrained > Number([1..Length(assigned)],
                other -> assigned[other] <> fail
                  and matrix[bestIndex][other] <> 0))
          or (Length(pool) = Length(bestPool)
              and constrained = Number([1..Length(assigned)],
                other -> assigned[other] <> fail
                  and matrix[bestIndex][other] <> 0)
              and index < bestIndex) then
        bestIndex := index;
        bestPool := pool;
      fi;
      if Length(bestPool) = 0 then break; fi;
    fi;
  od;
  return rec(index := bestIndex, pool := bestPool);
end;;

CoxeterCompletedSphericalFaithful := function(
    changedIndex, assigned, sphericalChecks, stats)
  local spherical, subgroup;
  for spherical in sphericalChecks do
    if changedIndex in spherical.subset
        and ForAll(spherical.subset, index -> assigned[index] <> fail) then
      subgroup := Group(List(spherical.subset, index -> assigned[index]));
      if Size(subgroup) <> spherical.expectedOrder then
        stats.sphericalPrunes := stats.sphericalPrunes + 1;
        return false;
      fi;
    fi;
  od;
  return true;
end;;

CoxeterDiagramEmbeddings := function(sourceMatrix, targetMatrix)
  local sourceRank, targetRank, assigned, used, result, recurse;
  sourceRank := Length(sourceMatrix);
  targetRank := Length(targetMatrix);
  assigned := List([1..sourceRank], index -> fail);
  used := List([1..targetRank], index -> false);
  result := [];
  recurse := function(index)
    local targetIndex, previous, compatible;
    if index > sourceRank then
      Add(result, ShallowCopy(assigned));
      return;
    fi;
    for targetIndex in [1..targetRank] do
      if not used[targetIndex] then
        compatible := true;
        for previous in [1..index - 1] do
          if sourceMatrix[index][previous]
              <> targetMatrix[targetIndex][assigned[previous]] then
            compatible := false;
            break;
          fi;
        od;
        if compatible then
          assigned[index] := targetIndex;
          used[targetIndex] := true;
          recurse(index + 1);
          used[targetIndex] := false;
          assigned[index] := fail;
        fi;
      fi;
    od;
  end;
  recurse(1);
  return result;
end;;

CoxeterStructuralAnchorSeeds := function(targetModel, anchor)
  local embeddings;
  if targetModel.simpleGenerators = fail or targetModel.simpleMatrix = fail then
    return [];
  fi;
  embeddings := CoxeterDiagramEmbeddings(
    anchor.coxeterMatrix, targetModel.simpleMatrix);
  return List(embeddings, embedding ->
    List(embedding, index -> targetModel.simpleGenerators[index]));
end;;

CoxeterAnchorSubgroupClasses := function(input, target, anchorSource)
  local fitting, representatives, classes, embeddings, method;
  if (input.target.kind = "weyl"
      and input.target.rank = 6
      and input.target.family in ["D", "B"])
      or input.target.kind = "affine-classical" then
    # In W(D6) and W(B6), the Fitting subgroup is the even/full sign-change
    # module. Every embedded S6 complement is returned up to target conjugacy.
    fitting := FittingSubgroup(target);
    representatives := ComplementClassesRepresentatives(target, fitting);
    method := "fitting-complement-classes";
  elif input.target.kind in ["s6-block-extension", "a6-core-extension"] then
    # GAP's IsomorphicSubgroups returns monomorphisms up to target conjugacy.
    # This avoids constructing the full subgroup lattice while retaining every
    # possible labeled A5 anchor in the declared extension target.
    embeddings := IsomorphicSubgroups(target, anchorSource);
    representatives := Set(List(embeddings, embedding -> Image(embedding)));
    method := "all-isomorphic-S6-subgroups-up-to-target-conjugacy";
  else
    # W(E6) is still small enough for GAP's complete subgroup-class lattice.
    classes := ConjugacyClassesSubgroups(target);
    representatives := List(classes, Representative);
    method := "complete-subgroup-conjugacy-classes";
  fi;
  representatives := Filtered(representatives, subgroup ->
    Size(subgroup) = Size(anchorSource)
      and IsomorphismGroups(anchorSource, subgroup) <> fail);
  return rec(representatives := representatives, method := method);
end;;

CoxeterStructuralAnchorCatalogue := function(input, targetModel, anchor)
  local target, sourceModel, source, sourceSimple, subgroupRecord,
    structuralSeeds, representatives, subgroup, isomorphism, base,
    automorphisms, labeledTuples, normalizer, orbits, orbit,
    representative, preferred, catalogue, rawTupleCount, seedsUsed;
  target := targetModel.group;
  sourceModel := CoxeterFpPermutationGroup(anchor.coxeterMatrix);
  if sourceModel = fail or Size(sourceModel.group) <> anchor.expectedOrder then
    return fail;
  fi;
  source := sourceModel.group;
  sourceSimple := sourceModel.simpleGenerators;
  subgroupRecord := CoxeterAnchorSubgroupClasses(input, target, source);
  structuralSeeds := CoxeterStructuralAnchorSeeds(targetModel, anchor);
  representatives := subgroupRecord.representatives;
  catalogue := [];
  rawTupleCount := 0;
  seedsUsed := 0;
  for subgroup in representatives do
    isomorphism := IsomorphismGroups(source, subgroup);
    if isomorphism = fail then
      Error("An A5 anchor subgroup lost its verified isomorphism");
    fi;
    base := List(sourceSimple, generator -> Image(isomorphism, generator));
    automorphisms := AutomorphismGroup(subgroup);
    labeledTuples := Set(List(Elements(automorphisms), automorphism ->
      List(base, generator -> Image(automorphism, generator))));
    rawTupleCount := rawTupleCount + Length(labeledTuples);
    normalizer := Normalizer(target, subgroup);
    orbits := OrbitsDomain(normalizer, labeledTuples, OnTuples);
    for orbit in orbits do
      representative := Minimum(AsList(orbit));
      preferred := First(structuralSeeds, seed ->
        RepresentativeAction(target, representative, seed, OnTuples) <> fail);
      if preferred <> fail then
        representative := preferred;
        seedsUsed := seedsUsed + 1;
      fi;
      Add(catalogue, representative);
    od;
  od;
  return rec(
    tuples := catalogue,
    subgroupClassCount := Length(representatives),
    rawTupleCount := rawTupleCount,
    structuralSeedCount := Length(structuralSeeds),
    structuralSeedsUsed := seedsUsed,
    method := subgroupRecord.method
  );
end;;

CoxeterEmitSolution := function(rawPath, input, targetGroup, assigned, number)
  local image, imageOrder, degree, index, row, spherical, subgroup, actual;
  image := Group(assigned);
  imageOrder := Size(image);
  degree := LargestMovedPoint(targetGroup);
  CoxeterWrite(rawPath, ["SOLUTION", input.target.id, number, imageOrder,
    imageOrder = Size(targetGroup), degree]);
  for index in [1..Length(assigned)] do
    row := List([1..degree], point -> point^assigned[index]);
    CoxeterWrite(rawPath, ["GENERATOR", input.target.id, number, index - 1,
      CoxeterJoinIntegers(row)]);
  od;
  for spherical in input.sphericalSubgroups do
    subgroup := Group(List(spherical.subset, index -> assigned[index]));
    actual := Size(subgroup);
    CoxeterWrite(rawPath, ["SPHERICAL", input.target.id, number,
      CoxeterJoinIntegers(spherical.subset), spherical.expectedOrder, actual,
      CoxeterBoolText(actual = spherical.expectedOrder)]);
  od;
end;;

CoxeterRunAnchoredSearch := function(input, targetModel, involutions, rawPath)
  local target, anchor, assigned, allIndices, anchorIndices, catalogue,
    catalogueStarted, catalogueElapsed, stats, anchorNodes, globalNodes,
    anchorClasses, solutions, limitReached, limitReason, globalElapsed,
    anchorBranchesStarted, anchorBranchesCompleted, anchorTuple, localIndex,
    anchorFaithful, stabilizer, branchStarted, branchElapsed,
    globalRecurse, complete, status, anchorStatus;

  target := targetModel.group;
  anchor := input.structuralAnchor;
  assigned := List([1..input.rank], index -> fail);
  allIndices := [1..input.rank];
  anchorIndices := anchor.sourceSubset;

  stats := rec(
    compatibilityTests := 0,
    centralizerCalls := 0,
    candidateCountBeforeOrbitReduction := 0,
    orbitRepresentativeCount := 0,
    sphericalPrunes := 0
  );
  anchorNodes := 0;
  globalNodes := 0;
  anchorClasses := 0;
  solutions := 0;
  limitReached := false;
  limitReason := "complete-structural-catalogue-and-centralizer-extensions";
  globalElapsed := 0;
  anchorBranchesStarted := 0;
  anchorBranchesCompleted := 0;

  globalRecurse := function(stabilizer, branchStarted)
    local choice, index, representatives, candidate, nextStabilizer;
    if limitReached then return; fi;
    if globalElapsed + Runtime() - branchStarted
        > input.bounds.timeoutMilliseconds then
      limitReached := true;
      limitReason := "global-search-time-bound-reached";
      return;
    fi;
    if ForAll(allIndices, index -> assigned[index] <> fail) then
      solutions := solutions + 1;
      CoxeterEmitSolution(rawPath, input, target, assigned, solutions);
      if solutions >= input.bounds.maxSolutions then
        limitReached := true;
        limitReason := "solution-output-bound-reached";
      fi;
      return;
    fi;
    choice := CoxeterChooseConstrainedVariable(
      assigned, input.coxeterMatrix, involutions, allIndices, stats);
    index := choice.index;
    if index = fail or Length(choice.pool) = 0 then return; fi;
    representatives := CoxeterOrbitRepresentatives(
      stabilizer, choice.pool, fail, stats);
    for candidate in representatives do
      if limitReached then return; fi;
      globalNodes := globalNodes + 1;
      if globalNodes > input.bounds.maxSearchNodes then
        limitReached := true;
        limitReason := "global-search-node-bound-reached";
        return;
      fi;
      assigned[index] := candidate;
      nextStabilizer := Centralizer(stabilizer, candidate);
      if CoxeterCompletedSphericalFaithful(
          index, assigned, input.sphericalPruningSubgroups, stats) then
        globalRecurse(nextStabilizer, branchStarted);
      fi;
      assigned[index] := fail;
    od;
  end;

  catalogueStarted := Runtime();
  catalogue := CoxeterStructuralAnchorCatalogue(input, targetModel, anchor);
  catalogueElapsed := Runtime() - catalogueStarted;
  if catalogue = fail then
    limitReached := true;
    limitReason := "structural-anchor-catalogue-construction-failed";
    catalogue := rec(tuples := [], subgroupClassCount := 0,
      rawTupleCount := 0, structuralSeedCount := 0,
      structuralSeedsUsed := 0, method := "failed");
  elif catalogueElapsed > input.bounds.anchorTimeoutMilliseconds then
    limitReached := true;
    limitReason := "anchor-catalogue-time-bound-reached";
  elif catalogue.rawTupleCount > input.bounds.maxAnchorSearchNodes then
    limitReached := true;
    limitReason := "anchor-catalogue-node-bound-reached";
  elif Length(catalogue.tuples) > input.bounds.maxAnchorClasses then
    limitReached := true;
    limitReason := "anchor-class-bound-reached";
  fi;
  anchorNodes := catalogue.rawTupleCount;
  anchorClasses := Length(catalogue.tuples);

  if not limitReached then
    for anchorTuple in catalogue.tuples do
      if limitReached then break; fi;
      for localIndex in [1..Length(anchorIndices)] do
        assigned[anchorIndices[localIndex]] := anchorTuple[localIndex];
      od;
      anchorFaithful := Size(Group(anchorTuple)) = anchor.expectedOrder
        and ForAll(anchorIndices, index -> CoxeterCompletedSphericalFaithful(
          index, assigned, input.sphericalPruningSubgroups, stats));
      if not anchorFaithful then
        Error("A structural anchor failed exact spherical replay");
      fi;
      stabilizer := Centralizer(target, Group(anchorTuple));
      anchorBranchesStarted := anchorBranchesStarted + 1;
      branchStarted := Runtime();
      globalRecurse(stabilizer, branchStarted);
      branchElapsed := Runtime() - branchStarted;
      globalElapsed := globalElapsed + branchElapsed;
      if not limitReached then
        anchorBranchesCompleted := anchorBranchesCompleted + 1;
      fi;
      for localIndex in [1..Length(anchorIndices)] do
        assigned[anchorIndices[localIndex]] := fail;
      od;
    od;
  fi;
  complete := not limitReached;
  if solutions > 0 then
    status := "solutions-found";
    anchorStatus := "candidate-found";
  elif complete then
    status := "exhausted";
    anchorStatus := "complete";
  else
    status := "incomplete";
    anchorStatus := "incomplete-on-bound";
  fi;
  CoxeterWrite(rawPath, ["ANCHOR", input.target.id, anchor.strategy,
    anchor.typeName, anchor.expectedOrder,
    CoxeterJoinIntegers(anchor.sourceSubset), anchorStatus,
    CoxeterBoolText(complete), anchorNodes, anchorClasses,
    catalogue.structuralSeedCount, catalogue.subgroupClassCount,
    catalogue.method, limitReason]);
  CoxeterWrite(rawPath, ["SEARCH_STATS", input.target.id,
    stats.compatibilityTests, stats.centralizerCalls,
    stats.candidateCountBeforeOrbitReduction, stats.orbitRepresentativeCount,
    stats.sphericalPrunes, anchorBranchesCompleted, anchorBranchesStarted]);
  CoxeterWrite(rawPath, ["TARGET", input.target.id, status,
    CoxeterBoolText(complete), limitReason, Size(target),
    LargestMovedPoint(target), anchorNodes + globalNodes, Length(involutions),
    Length(Filtered(ConjugacyClasses(target),
      class -> Order(Representative(class)) = 2)), solutions]);
end;;

CoxeterRunSearch := function(input, rawPath)
  local targetModel, target, targetOrder, degree, classes, classRepresentatives, involutions,
    assigned, nodes, solutions, limitReached, limitReason, started,
    recurse, complete, status, reason, precheckIndex, precheckResult,
    precheckAbsent, precheckIncomplete, anchorExpectedOrder;

  if input.structuralAnchor = fail then
    anchorExpectedOrder := 0;
  else
    anchorExpectedOrder := input.structuralAnchor.expectedOrder;
  fi;
  CoxeterWrite(rawPath, ["HEADER", input.target.id, input.protocolVersion,
    CoxeterFiniteTargetBackendVersion, input.target.expectedOrder, input.rank,
    Length(input.sphericalPruningSubgroups), anchorExpectedOrder,
    GAPInfo.Version]);

  targetModel := CoxeterBuildTarget(input.target);
  if targetModel = fail then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "construction-failed",
      "false", "target-construction-failed", 0, 0, 0, 0, 0, 0]);
    return;
  fi;
  target := targetModel.group;
  targetOrder := Size(target);
  degree := LargestMovedPoint(target);
  if targetOrder <> input.target.expectedOrder then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "order-mismatch", "false",
      "constructed-target-order-disagrees-with-declaration", targetOrder, degree,
      0, 0, 0, 0]);
    return;
  fi;
  if targetOrder > input.bounds.maxTargetOrderForEnumeration then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "bounded-out", "false",
      "target-order-exceeds-enumeration-bound", targetOrder, degree, 0, 0, 0, 0]);
    return;
  fi;
  if degree > input.bounds.maxPermutationDegree then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "bounded-out", "false",
      "permutation-degree-exceeds-bound", targetOrder, degree, 0, 0, 0, 0]);
    return;
  fi;

  classes := ConjugacyClasses(target);
  classRepresentatives := Filtered(List(classes, Representative), x -> Order(x) = 2);
  if Length(classRepresentatives) > input.bounds.maxInvolutionClasses then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "bounded-out", "false",
      "involution-class-bound-reached", targetOrder, degree, 0, 0,
      Length(classRepresentatives), 0]);
    return;
  fi;
  involutions := Filtered(Elements(target), x -> Order(x) = 2);
  if Length(involutions) > input.bounds.maxInvolutions then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "bounded-out", "false",
      "involution-count-bound-reached", targetOrder, degree, 0,
      Length(involutions), Length(classRepresentatives), 0]);
    return;
  fi;

  if input.structuralAnchor <> fail then
    CoxeterRunAnchoredSearch(input, targetModel, involutions, rawPath);
    return;
  fi;

  precheckAbsent := false;
  precheckIncomplete := false;
  for precheckIndex in [1..Length(input.sphericalTypePrechecks)] do
    precheckResult := CoxeterRunContainmentPrecheck(
      input, target, involutions, classRepresentatives,
      input.sphericalTypePrechecks[precheckIndex], precheckIndex - 1);
    if precheckResult.status = "proved-absent" then
      precheckAbsent := true;
    elif precheckResult.status = "incomplete-on-bound" then
      precheckIncomplete := true;
    fi;
  od;
  if precheckAbsent then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "precheck-rejected",
      "true", "a-maximal-spherical-type-is-proved-absent", targetOrder,
      degree, 0, Length(involutions), Length(classRepresentatives), 0]);
    return;
  fi;
  if precheckIncomplete then
    CoxeterWrite(rawPath, ["TARGET", input.target.id, "precheck-incomplete",
      "false", "local-type-containment-precheck-hit-a-resource-bound",
      targetOrder, degree, 0, Length(involutions),
      Length(classRepresentatives), 0]);
    return;
  fi;

  assigned := List([1..input.rank], i -> fail);
  nodes := 0;
  solutions := 0;
  limitReached := false;
  limitReason := "complete-enumeration";
  started := Runtime();

  recurse := function(depth)
    local index, pool, candidate, spherical, subgroup, locallyFaithful;
    if limitReached then return; fi;
    if Runtime() - started > input.bounds.timeoutMilliseconds then
      limitReached := true;
      limitReason := "gap-time-bound-reached";
      return;
    fi;
    if depth > input.rank then
      locallyFaithful := true;
      for spherical in input.sphericalSubgroups do
        subgroup := Group(List(spherical.subset, i -> assigned[i]));
        if Size(subgroup) <> spherical.expectedOrder then
          locallyFaithful := false;
          break;
        fi;
      od;
      if locallyFaithful then
        solutions := solutions + 1;
        CoxeterEmitSolution(rawPath, input, target, assigned, solutions);
        if solutions >= input.bounds.maxSolutions then
          limitReached := true;
          limitReason := "solution-output-bound-reached";
        fi;
      fi;
      return;
    fi;
    index := CoxeterChooseVariable(assigned, input.coxeterMatrix);
    if depth = 1 then pool := classRepresentatives;
    else pool := involutions;
    fi;
    for candidate in pool do
      if limitReached then return; fi;
      nodes := nodes + 1;
      if nodes mod 1024 = 0
          and Runtime() - started > input.bounds.timeoutMilliseconds then
        limitReached := true;
        limitReason := "gap-time-bound-reached";
        return;
      fi;
      if nodes > input.bounds.maxSearchNodes then
        limitReached := true;
        limitReason := "search-node-bound-reached";
        return;
      fi;
      if CoxeterCompatible(index, candidate, assigned, input.coxeterMatrix) then
        assigned[index] := candidate;
        recurse(depth + 1);
        assigned[index] := fail;
      fi;
    od;
  end;

  recurse(1);
  complete := not limitReached;
  if solutions > 0 then status := "solutions-found";
  elif complete then status := "exhausted";
  else status := "incomplete";
  fi;
  reason := limitReason;
  CoxeterWrite(rawPath, ["TARGET", input.target.id, status,
    CoxeterBoolText(complete), reason, targetOrder, degree, nodes,
    Length(involutions), Length(classRepresentatives), solutions]);
end;;

CoxeterDataPath := CoxeterArgValue("--data");;
CoxeterRawPath := CoxeterArgValue("--raw-output");;
if CoxeterDataPath = fail or CoxeterRawPath = fail then
  Error("--data and --raw-output are required");
fi;
Read(CoxeterDataPath);;
CoxeterRawStream := OutputTextFile(CoxeterRawPath, false);;
SetPrintFormattingStatus(CoxeterRawStream, false);;
CoxeterRunSearch(COXETER_FINITE_TARGET_INPUT, CoxeterRawPath);;
CloseStream(CoxeterRawStream);;
