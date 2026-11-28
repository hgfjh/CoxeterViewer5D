import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { CoverCompressionResult } from "../compression/types";
import type { VirtualAlgebraicFiberingCertificate } from "../fibering/certificate";
import type { SchreierPresentation } from "../fibering/schreierPresentation";
import type { QuotientComplex } from "../quotient";
import type {
  LawfulSubcomplexEvaluation,
  MorseLinksResult,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import {
  analyzeCoorientation,
  analyzeCover,
  COVER_WORKER_MIN_LIFT_EDGES,
  coverWorkSize,
  fiberingCertificate,
  wallCoorientation,
  type CoverAnalysis,
  type WallSigns,
} from "./coverAnalysis";
import {
  CoverAnalysisSupersededError,
  type CoorientationEvaluation,
  type CoverAnalysisClient,
} from "./coverAnalysisClient";

export interface CoverAnalysisState {
  cover?: CoverCompressionResult;
  coverError?: string;
  wallSystem?: WallSystem;
  schreierPresentation?: SchreierPresentation;
  /** Always matches the current wall signs; cheap, so never deferred. */
  coorientation?: WallCoorientation;
  /**
   * Lawful subcomplex and Morse links.  For covers analysed in the worker
   * these can briefly describe the previous signs; coorientationPending
   * says so.
   */
  lawfulSubcomplex?: LawfulSubcomplexEvaluation;
  morseLinks?: MorseLinksResult;
  virtualFiberingCertificate?: VirtualAlgebraicFiberingCertificate;
  /** The worker is still building the cover, walls and presentation. */
  analysisPending: boolean;
  /** The worker has not yet caught up with the latest wall signs. */
  coorientationPending: boolean;
}

/**
 * `?coverWorker=always` or `?coverWorker=never` in the page URL overrides the
 * size rule, for debugging and for tests that exercise the worker path on
 * small covers.
 */
function coverWorkerMode(): "auto" | "always" | "never" {
  if (typeof location === "undefined") return "auto";
  const value = new URLSearchParams(location.search).get("coverWorker");
  return value === "always" || value === "never" ? value : "auto";
}

/**
 * The cover chain for the imported quotient.  Small covers run inline, as
 * before; covers with at least COVER_WORKER_MIN_LIFT_EDGES lift edges run in
 * the cover-analysis worker so imports and wall flips never block the page.
 */
export function useCoverAnalysis(
  coverSource: QuotientComplex | undefined,
  wallSigns: WallSigns,
  client: CoverAnalysisClient,
): CoverAnalysisState {
  const mode = coverWorkerMode();
  const useWorker =
    coverSource !== undefined &&
    mode !== "never" &&
    (mode === "always" ||
      coverWorkSize(coverSource) >= COVER_WORKER_MIN_LIFT_EDGES);

  // Inline path.
  const inlineAnalysis = useMemo(
    () => (coverSource && !useWorker ? analyzeCover(coverSource) : undefined),
    [coverSource, useWorker],
  );

  // Worker path: one analysis per imported quotient.
  const [workerAnalysis, setWorkerAnalysis] = useState<{
    source: QuotientComplex;
    analysis: CoverAnalysis;
  }>();
  useEffect(() => {
    if (!coverSource || !useWorker) return;
    let active = true;
    client
      .analyze(coverSource)
      .then((analysis) => {
        if (active) setWorkerAnalysis({ source: coverSource, analysis });
      })
      .catch((error) => {
        if (!active || error instanceof CoverAnalysisSupersededError) return;
        setWorkerAnalysis({
          source: coverSource,
          analysis: {
            coverError: error instanceof Error ? error.message : String(error),
          },
        });
      });
    return () => {
      active = false;
    };
  }, [client, coverSource, useWorker]);

  const analysis: CoverAnalysis | undefined = useWorker
    ? workerAnalysis?.source === coverSource
      ? workerAnalysis.analysis
      : undefined
    : inlineAnalysis;

  const coorientation = useMemo(
    () =>
      analysis?.wallSystem
        ? wallCoorientation(analysis.wallSystem, wallSigns)
        : undefined,
    [analysis, wallSigns],
  );

  const inlineCoorientation = useMemo(
    () =>
      !useWorker && analysis?.cover && coorientation
        ? analyzeCoorientation(analysis.cover, coorientation)
        : undefined,
    [analysis, coorientation, useWorker],
  );

  const [workerEvaluation, setWorkerEvaluation] = useState<{
    analysis: CoverAnalysis;
    evaluation: CoorientationEvaluation;
  }>();
  useEffect(() => {
    if (!useWorker || !analysis?.cover || !coorientation) return;
    let active = true;
    client
      .evaluate(wallSigns)
      .then((evaluation) => {
        if (active) setWorkerEvaluation({ analysis, evaluation });
      })
      .catch((error) => {
        if (!active || error instanceof CoverAnalysisSupersededError) return;
        console.error(error);
      });
    return () => {
      active = false;
    };
  }, [analysis, client, coorientation, useWorker, wallSigns]);
  const evaluation =
    workerEvaluation && workerEvaluation.analysis === analysis
      ? workerEvaluation.evaluation
      : undefined;

  // Inline certificate: deferred as one bundle so a flip repaints first and
  // every input comes from the same render.
  const certificateInputs = useMemo(
    () => ({ coverSource, analysis, coorientation, inlineCoorientation }),
    [analysis, coorientation, coverSource, inlineCoorientation],
  );
  const deferred = useDeferredValue(certificateInputs);
  const inlineCertificate = useMemo(
    () =>
      !useWorker &&
      deferred.coverSource &&
      deferred.analysis &&
      deferred.coorientation &&
      deferred.inlineCoorientation
        ? fiberingCertificate({
            quotient: deferred.coverSource,
            analysis: deferred.analysis,
            coorientation: deferred.coorientation,
            coorientationAnalysis: deferred.inlineCoorientation,
          })
        : undefined,
    [deferred, useWorker],
  );

  const coorientationResult = useWorker
    ? evaluation?.result
    : inlineCoorientation;
  return {
    cover: analysis?.cover,
    coverError: analysis?.coverError,
    wallSystem: analysis?.wallSystem,
    schreierPresentation: analysis?.schreierPresentation,
    coorientation,
    lawfulSubcomplex: coorientationResult?.lawfulSubcomplex,
    morseLinks: coorientationResult?.morseLinks,
    virtualFiberingCertificate: useWorker
      ? evaluation?.certificate
      : inlineCertificate,
    analysisPending: useWorker && analysis === undefined,
    coorientationPending:
      useWorker &&
      analysis?.cover !== undefined &&
      evaluation?.wallSigns !== wallSigns,
  };
}
