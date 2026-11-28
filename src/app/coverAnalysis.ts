/**
 * The cover chain behind the cover, wall and fibering views, as plain
 * functions of their inputs.  useCoverAnalysis runs them inline for small
 * covers and in coverAnalysisWorker.ts for large ones, so both paths compute
 * exactly the same objects.
 */
import { buildCoverCompression } from "../compression/construction";
import type { CoverCompressionResult } from "../compression/types";
import {
  buildVirtualAlgebraicFiberingCertificate,
  type VirtualAlgebraicFiberingCertificate,
} from "../fibering/certificate";
import {
  buildSchreierPresentationFromQuotient,
  type SchreierPresentation,
} from "../fibering/schreierPresentation";
import type { QuotientComplex } from "../quotient";
import { createWallCoorientation } from "../walls/coorientation";
import { evaluateLawfulSubcomplex } from "../walls/lawfulness";
import { deriveMorseLinks } from "../walls/morseLinks";
import type {
  LawfulSubcomplexEvaluation,
  MorseLinksResult,
  WallCoorientation,
  WallSystem,
} from "../walls/types";
import { findWallSystem } from "../walls/wallSystem";
import { measure } from "./perfMarks";

export type WallSigns = Record<string, 1 | -1>;

/** Everything that depends only on the imported quotient. */
export interface CoverAnalysis {
  cover?: CoverCompressionResult;
  coverError?: string;
  wallSystem?: WallSystem;
  schreierPresentation?: SchreierPresentation;
}

/** Everything that also depends on the wall signs. */
export interface CoorientationAnalysis {
  lawfulSubcomplex: LawfulSubcomplexEvaluation;
  morseLinks: MorseLinksResult;
}

/**
 * Directed lift edges (vertices x rank) above which the chain runs in a
 * worker.  Below it the round trip costs more than the work, and keeping the
 * small catalogue covers synchronous keeps their flips instantaneous.
 */
export const COVER_WORKER_MIN_LIFT_EDGES = 20_000;

export function coverWorkSize(quotient: QuotientComplex): number {
  return quotient.vertices.length * (quotient.sourceSystem?.rank ?? 0);
}

export function analyzeCover(quotient: QuotientComplex): CoverAnalysis {
  let cover: CoverCompressionResult;
  try {
    cover = measure("cover-compression", () => buildCoverCompression(quotient));
  } catch (error) {
    return {
      coverError: error instanceof Error ? error.message : String(error),
    };
  }
  const wallSystem = measure("wall-system", () => findWallSystem(cover.barX));
  let schreierPresentation: SchreierPresentation | undefined;
  try {
    schreierPresentation = measure("schreier-presentation", () =>
      buildSchreierPresentationFromQuotient(quotient),
    );
  } catch {
    // The certificate builder records the full presentation error. Keeping
    // this optional lets malformed imports reach that diagnostic path.
    schreierPresentation = undefined;
  }
  return { cover, wallSystem, schreierPresentation };
}

export function wallCoorientation(
  wallSystem: WallSystem,
  wallSigns: WallSigns,
): WallCoorientation {
  return measure("wall-coorientation", () =>
    createWallCoorientation(wallSystem, wallSigns),
  );
}

export function analyzeCoorientation(
  cover: CoverCompressionResult,
  coorientation: WallCoorientation,
): CoorientationAnalysis {
  const lawfulSubcomplex = measure("lawful-subcomplex", () =>
    evaluateLawfulSubcomplex(cover.barX, coorientation),
  );
  const morseLinks = measure("morse-links", () =>
    deriveMorseLinks(cover.barX, coorientation, lawfulSubcomplex),
  );
  return { lawfulSubcomplex, morseLinks };
}

export function fiberingCertificate(input: {
  quotient: QuotientComplex;
  analysis: CoverAnalysis;
  coorientation: WallCoorientation;
  coorientationAnalysis: CoorientationAnalysis;
}): VirtualAlgebraicFiberingCertificate | undefined {
  const { cover, wallSystem, schreierPresentation } = input.analysis;
  if (!cover || !wallSystem) return undefined;
  return measure("virtual-fibering-certificate", () =>
    buildVirtualAlgebraicFiberingCertificate({
      quotient: input.quotient,
      cover,
      wallSystem,
      coorientation: input.coorientation,
      lawfulSubcomplex: input.coorientationAnalysis.lawfulSubcomplex,
      morseLinks: input.coorientationAnalysis.morseLinks,
      schreierPresentation,
    }),
  );
}
