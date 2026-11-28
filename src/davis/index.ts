export { computeRankTwoDavisCells } from "./twoCells";
export type { RankTwoDavisCellResult } from "./twoCells";
export {
  checkPositiveDefinite,
  buildLocalLinkFromSphericalSubsets,
  checkSphericalSubset,
  computeLocalLink,
  enumerateSphericalSubsets,
} from "./sphericalSubsets";
export {
  computeSphericalCellProxies,
  type DavisCellProxy,
  type DavisCellProxyResult,
} from "./cellProxies";
export {
  deriveVisibleHigherDavisCells,
  type HigherCellDerivationResult,
} from "./higherCells";
export {
  deriveDavisIncidencePoset,
  localLinkHomology,
  type DavisIncidenceOptions,
} from "./incidence";
// Generalized compression depends on the torsion-free and compression
// layers, so it is imported from "./generalizedCompression" directly rather
// than through this core barrel.
export type {
  LocalLink,
  LocalLinkSimplex,
  LocalLinkVertex,
  PositiveDefiniteCheck,
  SphericalSubset,
  SphericalSubsetCheck,
  SphericalSubsetEnumerationOptions,
  SphericalSubsetEnumerationResult,
} from "./sphericalSubsets";
