import type { ChangeEvent } from "react";
import type { QuotientImportProgressSnapshot } from "./quotientValidationClient";
import type { CoverCompressionResult } from "../compression/types";
import type {
  FullDavisVirtualFiberingCertificate,
  LawfulSubcomplexActionCertificate,
  VirtualAlgebraicFiberingCertificate,
} from "../fibering";
import { Panel } from "../components/Panel";
import { Toggle } from "../components/Toggle";
import type {
  LawfulSubcomplexEvaluation,
  MorseLinksResult,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import { wallColor, wallLabel } from "./wallScene";
import {
  listBarXRelationFamilies,
  type BarXRelationFamilyId,
} from "./barXRelationFamilies";
import type {
  AutomaticCoverSearchOptions,
  AutomaticCoverSearchPlan,
  AutomaticCoverSearchState,
} from "./torsionFreeCoverDiscovery";
import {
  summarizeAutomaticCoverAvailability,
  summarizeAutomaticSymbolicKernel,
} from "./torsionFreeCoverDiscovery";

export interface CoversWallsPanelProps {
  cover?: CoverCompressionResult;
  coverError?: string;
  sourceName?: string;
  wallSystem?: WallSystem;
  coorientation?: WallCoorientation;
  lawfulSubcomplex?: LawfulSubcomplexEvaluation;
  morseLinks?: MorseLinksResult;
  selectedWallId?: string;
  selectedVertexId?: string;
  selectedRelationFamily: BarXRelationFamilyId;
  linkLens: "none" | "ascending" | "descending";
  showWalls: boolean;
  wallDisplayMode: "all" | "selected";
  showInducedDirections: boolean;
  colorEdgesByWall: boolean;
  showCells: boolean;
  showDiscardedCells: boolean;
  searchRunning: boolean;
  searchStatus?: string;
  fiberingSearchRunning: boolean;
  fiberingSearchStatus?: string;
  virtualFiberingCertificate?: VirtualAlgebraicFiberingCertificate;
  lawfulFiberingCertificate?: LawfulSubcomplexActionCertificate;
  fullDavisFiberingCertificate?: FullDavisVirtualFiberingCertificate;
  importProgress: QuotientImportProgressSnapshot;
  discoveryPlan: AutomaticCoverSearchPlan;
  discoveryOptions: AutomaticCoverSearchOptions;
  discoveryState: AutomaticCoverSearchState;
  onDiscoveryOptionsChange: (options: AutomaticCoverSearchOptions) => void;
  onDiscoverCover: () => void;
  onExportDiscoveryRequest: () => void;
  onImportDiscoveryArtifact: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportCover: (event: ChangeEvent<HTMLInputElement>) => void;
  onCancelImport: () => void;
  onSelectWall: (wallId: string) => void;
  onSelectVertex: (vertexId: string) => void;
  onRelationFamilyChange: (familyId: BarXRelationFamilyId) => void;
  onLinkLensChange: (lens: "none" | "ascending" | "descending") => void;
  onFlipWall: () => void;
  onOptimize: () => void;
  onFindVirtualFibering: () => void;
  onFindFullDavisFibering: () => void;
  onExportVirtualFibering: () => void;
  onShowWallsChange: (value: boolean) => void;
  onWallDisplayModeChange: (value: "all" | "selected") => void;
  onShowInducedDirectionsChange: (value: boolean) => void;
  onColorEdgesByWallChange: (value: boolean) => void;
  onShowCellsChange: (value: boolean) => void;
  onShowDiscardedCellsChange: (value: boolean) => void;
}

export function CoversWallsPanel({
  cover,
  coverError,
  sourceName,
  wallSystem,
  coorientation,
  lawfulSubcomplex,
  morseLinks,
  selectedWallId,
  selectedVertexId,
  selectedRelationFamily,
  linkLens,
  showWalls,
  wallDisplayMode,
  showInducedDirections,
  colorEdgesByWall,
  showCells,
  showDiscardedCells,
  searchRunning,
  searchStatus,
  fiberingSearchRunning,
  fiberingSearchStatus,
  virtualFiberingCertificate,
  lawfulFiberingCertificate,
  fullDavisFiberingCertificate,
  importProgress,
  discoveryPlan,
  discoveryOptions,
  discoveryState,
  onDiscoveryOptionsChange,
  onDiscoverCover,
  onExportDiscoveryRequest,
  onImportDiscoveryArtifact,
  onImportCover,
  onCancelImport,
  onSelectWall,
  onSelectVertex,
  onRelationFamilyChange,
  onLinkLensChange,
  onFlipWall,
  onOptimize,
  onFindVirtualFibering,
  onFindFullDavisFibering,
  onExportVirtualFibering,
  onShowWallsChange,
  onWallDisplayModeChange,
  onShowInducedDirectionsChange,
  onColorEdgesByWallChange,
  onShowCellsChange,
  onShowDiscardedCellsChange,
}: CoversWallsPanelProps) {
  const lawfulCount = lawfulSubcomplex?.retainedCellIds.length ?? 0;
  const cellCount = cover?.barX.relationCells.length ?? 0;
  const linkFailures = morseLinks
    ? morseLinks.vertices.filter(
        (entry) =>
          !entry.ascending.nonempty ||
          !entry.descending.nonempty ||
          !entry.ascending.connected ||
          !entry.descending.connected,
      ).length
    : 0;
  const selectedLinks = morseLinks?.vertices.find(
    (entry) => entry.vertexId === selectedVertexId,
  );
  const lawfulTrack = lawfulFiberingCertificate?.lawful;
  const fiberingStatus =
    lawfulFiberingCertificate?.status === "passed"
      ? "passed"
      : (fullDavisFiberingCertificate?.status ??
        lawfulFiberingCertificate?.status ??
        "incomplete");
  const lowerBound = discoveryPlan.indexLowerBound.value;
  const lowerBoundNumber = lowerBound.safeInteger;
  const availableDegreeBound =
    discoveryOptions.backend === "gap"
      ? Math.max(
          discoveryOptions.maxIndex,
          discoveryOptions.maxCongruenceImageOrder,
        )
      : discoveryOptions.backend === "sage"
        ? discoveryOptions.maxCongruenceImageOrder
        : Math.max(
            discoveryOptions.maxIndex,
            discoveryOptions.maxCongruenceImageOrder,
          );
  const searchBelowLowerBound =
    lowerBoundNumber !== undefined && availableDegreeBound < lowerBoundNumber;
  const discoveryRunning = discoveryState.status === "searching";
  const coverAvailability = summarizeAutomaticCoverAvailability(
    discoveryState.artifact,
    cover
      ? {
          index: cover.hatX.vertices.length,
          certified:
            cover.hatX.provenance.torsionFreeEvidence !== "not-supplied",
        }
      : undefined,
  );
  const unmaterializedCertifiedKernel =
    discoveryState.artifact?.kernelCover !== undefined && !cover;
  const symbolicKernel = summarizeAutomaticSymbolicKernel(
    discoveryState.artifact,
    discoveryPlan.sphericalPlan,
  );
  const activeWallId = selectedWallId ?? wallSystem?.walls[0]?.id ?? undefined;
  const activeWall = wallSystem?.walls.find((wall) => wall.id === activeWallId);
  const activeWallName =
    wallSystem && activeWallId
      ? wallLabel(wallSystem, activeWallId)
      : "Selected wall";
  const relationFamilies = cover ? listBarXRelationFamilies(cover) : [];
  const activeRelationFamily = relationFamilies.find(
    (family) => family.id === selectedRelationFamily,
  );
  const relationPolygonKinds = new Set(
    relationFamilies.map((family) => family.polygonName),
  );
  const allRelationPolygonName =
    relationPolygonKinds.size === 1
      ? (relationFamilies[0]?.polygonName ?? "polygons")
      : "polygons";

  return (
    <Panel title="Covers + Walls">
      <p className="field-help">
        Find a finite-index torsion-free subgroup, build
        <strong> hat X</strong>, then compress it to <strong>bar X</strong> for
        the wall workflow. A congruence kernel may certify that a cover exists
        even when its finite action is too large to build here.
      </p>

      <section
        className="cover-discovery-card"
        aria-label="Automatic torsion-free cover discovery"
      >
        <div className="panel-section-heading">
          <strong>Find a torsion-free cover</strong>
          <span className={`status-pill status-${discoveryState.status}`}>
            {discoveryState.status}
          </span>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button primary"
            disabled={
              discoveryRunning ||
              discoveryPlan.sphericalPlan.status !== "complete" ||
              searchBelowLowerBound
            }
            onClick={onDiscoverCover}
          >
            {discoveryRunning
              ? "Searching for a cover..."
              : "Find torsion-free cover"}
          </button>
          {searchBelowLowerBound &&
          lowerBoundNumber !== undefined &&
          lowerBoundNumber <= 100_000 ? (
            <button
              type="button"
              className="button"
              onClick={() =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxIndex: lowerBoundNumber,
                  maxCongruenceImageOrder: Math.max(
                    discoveryOptions.maxCongruenceImageOrder,
                    lowerBoundNumber,
                  ),
                })
              }
            >
              Search from index {lowerBoundNumber}
            </button>
          ) : null}
          {sourceName?.includes("Compact hyperbolic Coxeter 5-cube") &&
          discoveryOptions.maxIndex < 97_920 ? (
            <button
              type="button"
              className="button"
              disabled={discoveryRunning}
              title="Proper subgroups of the certified O8-(2) factor first contribute degrees divisible by 17 x 5,760."
              onClick={() =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxIndex: 576_000,
                  maxModuleCandidates: Math.max(
                    discoveryOptions.maxModuleCandidates,
                    512,
                  ),
                  timeoutSeconds: Math.max(
                    discoveryOptions.timeoutSeconds,
                    1_800,
                  ),
                })
              }
            >
              Search wider mod-2 range
            </button>
          ) : null}
        </div>
        <p className="field-help">
          Automatic mode builds exact finite congruence images first, searches
          their coset actions, combines complementary modules when useful, and
          keeps GAP low-index enumeration as a small-index fallback. Every
          result is checked again before hat X is built.
        </p>
        <div className="compact-grid cover-discovery-summary">
          <StatusDatum
            label="Spherical catalogue"
            value={`${discoveryPlan.sphericalPlan.sphericalSubgroups.length} (${discoveryPlan.sphericalPlan.status})`}
          />
          <StatusDatum
            label="Necessary index divisor"
            value={lowerBound.decimal}
          />
          <StatusDatum
            label="Search through index"
            value={discoveryOptions.maxIndex}
          />
          <StatusDatum
            label="Strategy"
            value={
              discoveryOptions.backend === "auto"
                ? "finite image -> composite -> small GAP fallback"
                : discoveryOptions.backend === "gap"
                  ? "small-index GAP + composite"
                  : "Sage finite-image search"
            }
          />
          <StatusDatum
            label="Torsion-free cover"
            value={
              coverAvailability.torsionFreeCoverCertified
                ? "certified"
                : "not certified"
            }
          />
          <StatusDatum
            label="Exact cover index"
            value={
              coverAvailability.exactIndexCertified
                ? "certified"
                : coverAvailability.torsionFreeCoverCertified
                  ? "not yet known"
                  : "not certified"
            }
          />
          <StatusDatum
            label="Usable finite cover"
            value={
              coverAvailability.manageableCoverMaterialized
                ? `materialized (${cover?.hatX.vertices.length ?? 0})`
                : "not found"
            }
          />
        </div>
        {searchBelowLowerBound ? (
          <p className="warning-inline">
            No permitted search rung can return an action as large as the
            necessary divisor {lowerBound.decimal}.
          </p>
        ) : null}
        <p className="field-help" aria-live="polite">
          {discoveryState.message}
        </p>
        {coverAvailability.torsionFreeCoverCertified ? (
          <p className="success-inline" aria-live="polite">
            {coverAvailability.torsionFreeCoverSummary}
          </p>
        ) : null}
        {unmaterializedCertifiedKernel ? (
          <section
            className="warning-inline"
            aria-label="Certified kernel materialization status"
          >
            <strong>Torsion-free existence is certified.</strong>{" "}
            {coverAvailability.manageableCoverSummary}
            <br />
            {coverAvailability.downstreamReason}
            <div className="button-row">
              <button type="button" className="button" disabled>
                Build quotient and walls
              </button>
              <button type="button" className="button" disabled>
                Run fibering pipeline
              </button>
            </div>
          </section>
        ) : null}
        {symbolicKernel ? (
          <details className="advanced-details compact-details">
            <summary>Exact symbolic regular cover</summary>
            <p className="field-help">
              {symbolicKernel.explanation} The exact vertex count is{" "}
              <strong>{symbolicKernel.vertexCount}</strong>, represented by one
              deck-group orbit rather than a vertex array.
            </p>
            <div className="compact-grid">
              <StatusDatum
                label="Generator transition families"
                value={symbolicKernel.generatorTransitionFamilies}
              />
              {symbolicKernel.cellCountsByRank.map((entry) => (
                <StatusDatum
                  key={entry.rank}
                  label={
                    entry.rank === 0 ? "Vertices" : `Rank-${entry.rank} cells`
                  }
                  value={`${entry.cellCount} across ${entry.sphericalTypeCount} spherical type${entry.sphericalTypeCount === 1 ? "" : "s"}`}
                />
              ))}
            </div>
            <p className="warning-inline">
              Symmetry-restricted wall variables can be studied on this orbit
              model, but they do not certify an unrestricted wall search or a
              virtual fibration. The full promotion gate still requires a
              materialized action and complete quotient-link checks.
            </p>
          </details>
        ) : null}
        {discoveryState.artifactPath ? (
          <p className="field-help">Artifact: {discoveryState.artifactPath}</p>
        ) : null}
        {discoveryState.artifact?.strategyAttempts?.length ? (
          <ol className="compact-status-list" aria-label="Strategy attempts">
            {discoveryState.artifact.strategyAttempts.map((attempt) => (
              <li key={attempt.strategy}>
                <strong>{attempt.strategy}</strong>: {attempt.status}
                {attempt.candidateDegree
                  ? ` (degree ${attempt.candidateDegree})`
                  : ""}
              </li>
            ))}
          </ol>
        ) : null}
        {discoveryState.artifact?.finiteImageReports?.length ? (
          <details className="advanced-details compact-details">
            <summary>Bounded finite-image degree report</summary>
            <p className="field-help">
              Every listed degree is tied to one finite image. An unresolved
              subgroup family stays open even when the necessary index sieve has
              finished.
            </p>
            {discoveryState.artifact.finiteImageReports.map((report) => (
              <section
                className="compact-status-section"
                key={`${report.sourceArtifactHash ?? "finite-image"}:${report.residueSource.candidateId}`}
              >
                <div className="panel-section-heading">
                  <strong>{report.residueSource.candidateId}</strong>
                  <span
                    className={`status-pill status-${report.boundedComplete ? "passed" : "incomplete"}`}
                  >
                    {report.boundedComplete
                      ? "bounded classification complete"
                      : "open families remain"}
                  </span>
                </div>
                {report.residueSource.primeIdeal ? (
                  <p className="field-help">
                    Prime ideal {report.residueSource.primeIdeal}; residue field
                    order {report.residueSource.residueFieldOrder ?? "unknown"}.
                  </p>
                ) : null}
                <ol className="compact-status-list">
                  {report.degreeLedger.map((decision) => (
                    <li key={decision.degree} title={decision.reason}>
                      <strong>{decision.degree.toLocaleString()}</strong>:{" "}
                      {decision.outcome}
                      {!decision.complete ? " (incomplete)" : ""}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </details>
        ) : null}
        <details className="advanced-details compact-details">
          <summary>Search bounds and fallback import</summary>
          <label className="field" htmlFor="cover-search-backend">
            <span>Strategy ladder</span>
            <select
              id="cover-search-backend"
              value={discoveryOptions.backend}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  backend: event.target
                    .value as AutomaticCoverSearchOptions["backend"],
                })
              }
            >
              <option value="auto">Automatic ladder</option>
              <option value="gap">Small-index GAP + composite</option>
              <option value="sage">Sage finite-image search only</option>
            </select>
          </label>
          <label className="field" htmlFor="cover-max-index">
            <span>Maximum subgroup index</span>
            <input
              id="cover-max-index"
              type="number"
              min={1}
              max={2000000}
              step={1}
              value={discoveryOptions.maxIndex}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxIndex: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-max-candidates">
            <span>Maximum candidate actions</span>
            <input
              id="cover-max-candidates"
              type="number"
              min={1}
              max={10000}
              step={1}
              value={discoveryOptions.maxCandidates}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxCandidates: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-search-timeout">
            <span>Time limit (seconds)</span>
            <input
              id="cover-search-timeout"
              type="number"
              min={5}
              max={3600}
              step={5}
              value={discoveryOptions.timeoutSeconds}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  timeoutSeconds: Math.max(5, Number(event.target.value) || 5),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-congruence-prime">
            <span>Largest congruence prime</span>
            <input
              id="cover-congruence-prime"
              type="number"
              min={3}
              max={1009}
              step={2}
              value={discoveryOptions.maxCongruencePrime}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxCongruencePrime: Math.max(
                    3,
                    Number(event.target.value) || 3,
                  ),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-congruence-order">
            <span>Largest materialized action</span>
            <input
              id="cover-congruence-order"
              type="number"
              min={1}
              max={1000000}
              step={100}
              value={discoveryOptions.maxCongruenceImageOrder}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxCongruenceImageOrder: Math.max(
                    1,
                    Number(event.target.value) || 1,
                  ),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-module-candidates">
            <span>Maximum partial modules</span>
            <input
              id="cover-module-candidates"
              type="number"
              min={1}
              max={1000}
              step={1}
              value={discoveryOptions.maxModuleCandidates}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxModuleCandidates: Math.max(
                    1,
                    Number(event.target.value) || 1,
                  ),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-low-index-fallback">
            <span>Largest generic GAP fallback index</span>
            <input
              id="cover-low-index-fallback"
              type="number"
              min={1}
              max={4096}
              step={1}
              value={discoveryOptions.maxLowIndexFallback}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxLowIndexFallback: Math.max(
                    1,
                    Number(event.target.value) || 1,
                  ),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-light-workers">
            <span>Parallel lightweight searches</span>
            <input
              id="cover-light-workers"
              type="number"
              min={1}
              max={12}
              step={1}
              value={discoveryOptions.lightWorkers}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  lightWorkers: Math.max(
                    1,
                    Math.min(12, Number(event.target.value) || 1),
                  ),
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-memory-budget">
            <span>Backend memory budget (GiB)</span>
            <input
              id="cover-memory-budget"
              type="number"
              min={1}
              max={20}
              step={1}
              value={Math.round(discoveryOptions.maxMemoryBytes / 2 ** 30)}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  maxMemoryBytes:
                    Math.max(1, Math.min(20, Number(event.target.value) || 1)) *
                    2 ** 30,
                })
              }
            />
          </label>
          <label className="field" htmlFor="cover-heavy-workers">
            <span>Concurrent memory-heavy searches</span>
            <input
              id="cover-heavy-workers"
              type="number"
              min={1}
              max={2}
              step={1}
              value={discoveryOptions.heavyWorkers}
              disabled={discoveryRunning}
              onChange={(event) =>
                onDiscoveryOptionsChange({
                  ...discoveryOptions,
                  heavyWorkers: Math.max(
                    1,
                    Math.min(2, Number(event.target.value) || 1),
                  ),
                })
              }
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={onExportDiscoveryRequest}
            >
              Export search request
            </button>
            <label className="button file-button">
              Import discovery result
              <input
                className="hidden-input"
                type="file"
                accept="application/json,.json,.coxeter-cover"
                onChange={onImportDiscoveryArtifact}
              />
            </label>
            <label className="button file-button">
              Import an existing finite action
              <input
                className="hidden-input"
                type="file"
                accept="application/json,.json"
                onChange={onImportCover}
              />
            </label>
          </div>
        </details>
      </section>

      <ol className="workflow-list" aria-label="Cover and wall workflow">
        <li data-complete={coverAvailability.torsionFreeCoverCertified}>
          <strong>1. Certify a torsion-free subgroup</strong>
          <span>{coverAvailability.torsionFreeCoverSummary}</span>
        </li>
        <li data-complete={Boolean(cover)}>
          <strong>2. Materialize a manageable finite cover</strong>
          <span>
            {cover
              ? `${sourceName ?? cover.hatX.name}: index ${cover.hatX.vertices.length}`
              : coverAvailability.manageableCoverSummary}
          </span>
        </li>
        <li data-complete={cover?.certificate.status === "passed"}>
          <strong>3. Compress to bar X</strong>
          <span>
            {cover
              ? `${cover.barX.geometricEdges.length} edges, ${cover.barX.relationCells.length} relation cells`
              : "Waiting for a cover"}
          </span>
        </li>
        <li data-complete={Boolean(wallSystem)}>
          <strong>4. Find walls</strong>
          <span>
            {wallSystem
              ? `${wallSystem.walls.length} opposite-edge classes`
              : "Waiting for bar X"}
          </span>
        </li>
        <li data-complete={coorientation?.valid === true}>
          <strong>5. Coorient walls</strong>
          <span>
            {coorientation?.valid ? "Coherent directions" : "Not ready"}
          </span>
        </li>
        <li data-complete={lawfulSubcomplex?.valid === true}>
          <strong>6. Keep lawful cells</strong>
          <span>
            {cover ? `${lawfulCount} of ${cellCount} retained` : "Not ready"}
          </span>
        </li>
        <li
          data-complete={
            virtualFiberingCertificate?.result.virtualAlgebraicFibration ===
            true
          }
        >
          <strong>7. Certify a primitive map to Z</strong>
          <span>
            {virtualFiberingCertificate
              ? virtualFiberingCertificate.result.statement
              : "Waiting for a cover and coorientation"}
          </span>
        </li>
      </ol>

      {cover && relationFamilies.length > 0 ? (
        <section
          className="relation-family-reader-card"
          aria-label="bar X relation reader"
        >
          <div className="panel-section-heading">
            <strong>Spread attached relation cells</strong>
            <span className="status-pill status-passed">
              {activeRelationFamily
                ? `${activeRelationFamily.cellCount} of ${cover.barX.relationCells.length} cells`
                : selectedRelationFamily === "all"
                  ? `${cover.barX.relationCells.length} ${allRelationPolygonName}`
                  : "compact gluing"}
            </span>
          </div>
          <label className="field" htmlFor="bar-x-relation-family">
            <span>Finite edge of Gamma</span>
            <select
              id="bar-x-relation-family"
              aria-label="Relation family in bar X"
              value={selectedRelationFamily}
              onChange={(event) =>
                onRelationFamilyChange(
                  event.target.value as BarXRelationFamilyId,
                )
              }
            >
              <option value="all">
                All families: {cover.barX.relationCells.length} attached{" "}
                {allRelationPolygonName}
              </option>
              {relationFamilies.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.generatorLabels[0]} - {family.generatorLabels[1]}: m=
                  {family.m}, {family.cellCount} {family.polygonName}
                </option>
              ))}
              <option value="shared-complex">
                Compact gluing: no cell spread
              </option>
            </select>
          </label>
          {activeRelationFamily ? (
            <p className="field-help" aria-live="polite">
              The edge {activeRelationFamily.generatorLabels[0]} -{" "}
              {activeRelationFamily.generatorLabels[1]} has m=
              {activeRelationFamily.m}. Its {cover.barX.vertices.length}-sheet
              cover contributes {cover.barX.vertices.length}/(2 x{" "}
              {activeRelationFamily.m}) = {activeRelationFamily.cellCount}{" "}
              {activeRelationFamily.polygonName}. These are the original cells
              on the shared quotient 1-skeleton: the other generator edges stay
              visible as faint gluing context, and no boundary is copied.
            </p>
          ) : selectedRelationFamily === "all" ? (
            <p className="field-help" aria-live="polite">
              All {cover.barX.relationCells.length} exact{" "}
              {allRelationPolygonName} remain attached to the same{" "}
              {cover.barX.vertices.length} vertices and{" "}
              {cover.barX.geometricEdges.length} generator edges. Their
              interiors fan outward in {relationFamilies.length} relation-family{" "}
              {relationFamilies.length === 1 ? "lane" : "lanes"} so each disk
              can be followed back to its attaching cycle; only this interior
              bending is a drawing convention.
            </p>
          ) : (
            <p className="field-help" aria-live="polite">
              This is the same compressed complex with cell interiors left
              compact. Use it for walls; choose a relation family or all
              families to spread the same attached cells for reading.
            </p>
          )}
        </section>
      ) : null}

      {importProgress.stage !== "idle" ? (
        <div className="quotient-import-progress" aria-live="polite">
          <div className="quotient-import-progress-heading">
            <strong>Finite-action import</strong>
            <span>{Math.round(importProgress.progress * 100)}%</span>
          </div>
          <progress max={1} value={importProgress.progress} />
          <span>{importProgress.message}</span>
          {["reading", "parsing", "validating"].includes(
            importProgress.stage,
          ) ? (
            <button type="button" className="button" onClick={onCancelImport}>
              Cancel import
            </button>
          ) : null}
        </div>
      ) : null}
      {coverError ? <p className="warning-inline">{coverError}</p> : null}

      {selectedRelationFamily === "shared-complex" &&
      wallSystem &&
      wallSystem.walls.length > 0 ? (
        <>
          <label className="field" htmlFor="wall-selection">
            <span>Select a wall</span>
            <select
              id="wall-selection"
              value={activeWallId ?? wallSystem.walls[0].id}
              onChange={(event) => onSelectWall(event.target.value)}
            >
              {wallSystem.walls.map((wall) => (
                <option key={wall.id} value={wall.id}>
                  {wallLabel(wallSystem, wall.id)}: {wall.edgeIds.length} edges
                </option>
              ))}
            </select>
          </label>
          <section className="wall-reader-card" aria-label="Wall reader">
            <div className="panel-section-heading">
              <strong>Read walls and induced directions</strong>
              <span className="status-pill status-passed">
                {coorientation?.valid ? "cooriented" : "not ready"}
              </span>
            </div>
            <div className="segmented" role="group" aria-label="Wall display">
              <button
                type="button"
                aria-pressed={wallDisplayMode === "all"}
                onClick={() => onWallDisplayModeChange("all")}
              >
                All walls
              </button>
              <button
                type="button"
                aria-pressed={wallDisplayMode === "selected"}
                onClick={() => onWallDisplayModeChange("selected")}
              >
                Selected wall
              </button>
            </div>
            <Toggle
              checked={showWalls}
              label="Show wall arcs"
              onChange={onShowWallsChange}
            />
            <Toggle
              checked={colorEdgesByWall}
              label="Color dual edges by wall"
              onChange={onColorEdgesByWallChange}
            />
            <Toggle
              checked={showInducedDirections}
              label="Show induced edge arrows"
              onChange={onShowInducedDirectionsChange}
            />
            <ul className="legend-list wall-reader-key">
              <li className="legend-item">
                <span
                  className="swatch"
                  style={{
                    background:
                      wallSystem && activeWallId
                        ? wallColor(wallSystem, activeWallId)
                        : "#0ea5e9",
                  }}
                />
                <span>
                  Wall color marks its arcs and dual edges; edge labels still
                  name Coxeter generators.
                </span>
              </li>
              <li className="legend-item">
                <span className="wall-arrow-key" aria-hidden="true">
                  -&gt;
                </span>
                <span>
                  Arrowheads show the direction induced on dual edges. Wall arcs
                  themselves are not directed.
                </span>
              </li>
            </ul>
            {activeWall && coorientation ? (
              <p className="field-help" aria-live="polite">
                {activeWallName} has sign{" "}
                {coorientation.wallSigns[activeWall.id] === -1 ? "-" : "+"} and
                controls {activeWall.edgeIds.length} dual edge{" "}
                {activeWall.edgeIds.length === 1 ? "arrow" : "arrows"}. Flipping
                it reverses exactly those arrows.
              </p>
            ) : null}
          </section>
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={!coorientation?.valid}
              onClick={onFlipWall}
            >
              Flip selected wall
            </button>
            <button
              type="button"
              className="button primary"
              disabled={searchRunning || !wallSystem.diagnostics.twoSided}
              onClick={onOptimize}
            >
              {searchRunning
                ? "Searching..."
                : "Find largest lawful subcomplex"}
            </button>
          </div>
          {searchStatus ? <p className="field-help">{searchStatus}</p> : null}
        </>
      ) : null}

      {cover &&
      wallSystem &&
      coorientation &&
      lawfulSubcomplex &&
      morseLinks ? (
        <section
          className="virtual-fibering-card"
          aria-label="Virtual algebraic fibering certificate"
        >
          <div className="panel-section-heading">
            <strong>Two-track virtual-fibering certificate</strong>
            <span className={`status-pill status-${fiberingStatus}`}>
              {fiberingStatus === "incomplete" &&
              !lawfulFiberingCertificate &&
              !fullDavisFiberingCertificate
                ? "not checked"
                : fiberingStatus}
            </span>
          </div>
          <p className="field-help">
            First test the smaller lawful 2-complex and its exact metric and
            Morse links. If that does not certify, build every spherical cell of
            H\Sigma and check the complete subdivided Davis quotient.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button primary"
              disabled={
                fiberingSearchRunning || !wallSystem.diagnostics.twoSided
              }
              onClick={onFindVirtualFibering}
            >
              {fiberingSearchRunning
                ? "Checking certification tracks..."
                : "Run lawful-first certification"}
            </button>
            <button
              type="button"
              className="button"
              disabled={fiberingSearchRunning || !cover}
              onClick={onFindFullDavisFibering}
            >
              Check full Davis quotient
            </button>
            <button
              type="button"
              className="button"
              disabled={
                !fullDavisFiberingCertificate &&
                !virtualFiberingCertificate &&
                !lawfulFiberingCertificate
              }
              onClick={onExportVirtualFibering}
            >
              Export fibering certificate
            </button>
          </div>
          {fiberingSearchStatus ? (
            <p className="field-help" aria-live="polite">
              {fiberingSearchStatus}
            </p>
          ) : null}
          {lawfulTrack ? (
            <>
              <h4>Track A: lawful 2-complex</h4>
              <div className="compact-grid wall-diagnostic-grid">
                <StatusDatum
                  label="Lawful relation cells"
                  value={`${lawfulTrack.retainedCellIds.length}/${lawfulTrack.cells.length}`}
                />
                <StatusDatum
                  label="Asphericity"
                  value={
                    lawfulTrack.npcAsphericity.status === "passed"
                      ? "exact metric-link check"
                      : "not established"
                  }
                />
                <StatusDatum
                  label="Primitive character"
                  value={
                    lawfulTrack.conclusion.explicitEpimorphismToZ
                      ? "H -> Z"
                      : "not proved"
                  }
                />
                <StatusDatum
                  label="Kernel transfer"
                  value={
                    lawfulTrack.kernelTransfer.status === "passed"
                      ? "finite generation transferred to H"
                      : "not established"
                  }
                />
              </div>
              <p
                className={
                  lawfulTrack.conclusion.virtualAlgebraicFibrationCertified
                    ? "success-inline"
                    : "warning-inline"
                }
              >
                {lawfulTrack.conclusion.statement}
              </p>
              <details className="advanced-details compact-details">
                <summary>Lawful-track evidence and limits</summary>
                <p className="field-help">
                  This track retains the complete 1-skeleton and exactly the
                  lawful polygons. Its presentation map onto H and the induced
                  kernel surjection are checked explicitly. It does not claim a
                  Morse function on every higher Davis cell.
                </p>
                <p className="field-help">
                  Artifact SHA-256:{" "}
                  {lawfulFiberingCertificate.hashes.artifactSha256}
                </p>
              </details>
            </>
          ) : null}
          {fullDavisFiberingCertificate ? (
            <>
              <h4>Track B: complete Davis quotient</h4>
              <div className="compact-grid wall-diagnostic-grid">
                <StatusDatum
                  label="Subgroup H"
                  value={`index ${fullDavisFiberingCertificate.source.subgroupIndex}`}
                />
                <StatusDatum
                  label="Full quotient cells"
                  value={
                    fullDavisFiberingCertificate.fullCellPoset
                      ? `${fullDavisFiberingCertificate.fullCellPoset.cells.length} through dimension ${fullDavisFiberingCertificate.fullCellPoset.dimension}`
                      : "not built"
                  }
                />
                <StatusDatum
                  label="Primitive character"
                  value={
                    fullDavisFiberingCertificate.result
                      .explicitPrimitiveEpimorphismToZ
                      ? "H -> Z (Bezout verified)"
                      : "not proved"
                  }
                />
                <StatusDatum
                  label="Rank-two sums"
                  value={
                    fullDavisFiberingCertificate.wallHomomorphism
                      ? `${fullDavisFiberingCertificate.wallHomomorphism.cocycle.relationChecks.filter((check) => check.passed).length}/${fullDavisFiberingCertificate.wallHomomorphism.cocycle.relationChecks.length} zero`
                      : "not checked"
                  }
                />
                <StatusDatum
                  label="Full directed links"
                  value={
                    fullDavisFiberingCertificate.result
                      .allAscendingAndDescendingLinksNonemptyConnected
                      ? "all nonempty and connected"
                      : "not all pass"
                  }
                />
                <StatusDatum
                  label="Collapsibility"
                  value={
                    fullDavisFiberingCertificate.result
                      .allDirectedLinksCollapsible
                      ? "all replayable"
                      : "failed or unknown"
                  }
                />
              </div>
              <p
                className={
                  fullDavisFiberingCertificate.result.virtualAlgebraicFibration
                    ? "success-inline"
                    : "warning-inline"
                }
              >
                {fullDavisFiberingCertificate.result.statement}
              </p>
              <details className="advanced-details compact-details">
                <summary>Certificate stages and evidence</summary>
                <h4>Pipeline stages</h4>
                <ul className="compact-status-list">
                  {fullDavisFiberingCertificate.stages.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.label}</strong>: {entry.status}.{" "}
                      {entry.detail}
                    </li>
                  ))}
                </ul>
                <h4>Values of phi on Schreier generators</h4>
                {fullDavisFiberingCertificate.primitiveHomomorphism
                  ?.generatorValues.length ? (
                  <div className="table-scroll">
                    <table className="compact-table">
                      <thead>
                        <tr>
                          <th>Generator</th>
                          <th>Word in S</th>
                          <th>Wall value</th>
                          <th>phi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fullDavisFiberingCertificate.primitiveHomomorphism.generatorValues.map(
                          (entry) => (
                            <tr key={entry.generatorId}>
                              <td>{entry.generatorId}</td>
                              <td>
                                {entry.subgroupWord.length > 0
                                  ? entry.subgroupWord
                                      .map(
                                        (generator) =>
                                          cover.barX.sourceSystem.generators[
                                            generator
                                          ]?.label ?? `s${generator}`,
                                      )
                                      .join(" ")
                                  : "e"}
                              </td>
                              <td>{entry.rawWallValue}</td>
                              <td>{entry.primitiveValue}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="field-help">
                    No Schreier values are available.
                  </p>
                )}
                <h4>Claim boundary</h4>
                <p className="field-help">
                  Connected directed links certify finite generation of
                  ker(phi). Collapsibility is recorded separately. A locally
                  trivial or smooth bundle is not claimed without the additional
                  compact-manifold and smoothing certificates.
                </p>
                <p className="field-help">
                  Artifact SHA-256:{" "}
                  {fullDavisFiberingCertificate.hashes.artifactSha256}
                </p>
              </details>
            </>
          ) : !lawfulFiberingCertificate && virtualFiberingCertificate ? (
            <details className="advanced-details compact-details">
              <summary>Two-dimensional compression diagnostic</summary>
              <p className="field-help">
                {virtualFiberingCertificate.result.statement} This older profile
                checks the current in-memory compression but is not the new
                action-rooted lawful replay or the complete Davis certificate.
              </p>
            </details>
          ) : null}
        </section>
      ) : null}

      <details className="advanced-details compact-details">
        <summary>Drawing options</summary>
        <Toggle
          checked={showCells}
          label="Show relation cells"
          onChange={onShowCellsChange}
        />
        <Toggle
          checked={showDiscardedCells}
          label="Show nonlawful cells as context"
          onChange={onShowDiscardedCellsChange}
        />
      </details>

      {wallSystem ? (
        <div className="compact-grid wall-diagnostic-grid">
          <StatusDatum
            label="Embedded"
            value={wallSystem.diagnostics.embedded ? "yes" : "no"}
          />
          <StatusDatum
            label="Two-sided"
            value={wallSystem.diagnostics.twoSided ? "yes" : "no"}
          />
          <StatusDatum
            label="No self-osculation"
            value={wallSystem.diagnostics.selfOsculationFree ? "yes" : "no"}
          />
          <StatusDatum
            label="Morse-link failures"
            value={morseLinks ? linkFailures : "not checked"}
          />
        </div>
      ) : null}

      {selectedRelationFamily === "shared-complex" && cover && morseLinks ? (
        <details className="advanced-details compact-details">
          <summary>Inspect induced orientation</summary>
          <label className="field" htmlFor="morse-vertex-selection">
            <span>Vertex of bar X</span>
            <select
              id="morse-vertex-selection"
              value={selectedVertexId ?? cover.barX.vertices[0]?.id ?? ""}
              onChange={(event) => onSelectVertex(event.target.value)}
            >
              {cover.barX.vertices.map((vertex, index) => (
                <option key={vertex.id} value={vertex.id}>
                  {vertex.label ?? `v${index}`}
                </option>
              ))}
            </select>
          </label>
          <div
            className="segmented segmented-three"
            role="group"
            aria-label="Local link lens"
          >
            <button
              type="button"
              aria-pressed={linkLens === "none"}
              onClick={() => onLinkLensChange("none")}
            >
              All edges
            </button>
            <button
              type="button"
              aria-pressed={linkLens === "ascending"}
              onClick={() => onLinkLensChange("ascending")}
            >
              Ascending
            </button>
            <button
              type="button"
              aria-pressed={linkLens === "descending"}
              onClick={() => onLinkLensChange("descending")}
            >
              Descending
            </button>
          </div>
          {selectedLinks ? (
            <div className="compact-grid wall-diagnostic-grid">
              <StatusDatum
                label="Ascending link"
                value={`${selectedLinks.ascending.vertices.length} vertices, ${selectedLinks.ascending.components.length} components`}
              />
              <StatusDatum
                label="Descending link"
                value={`${selectedLinks.descending.vertices.length} vertices, ${selectedLinks.descending.components.length} components`}
              />
            </div>
          ) : null}
        </details>
      ) : null}
    </Panel>
  );
}

function StatusDatum({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="status-datum">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
