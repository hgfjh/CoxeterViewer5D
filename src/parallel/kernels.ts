/**
 * Kernels that may run on worker threads.  Each is a pure function of
 * structured-cloneable arguments; action rows travel as Uint32Array views of
 * a SharedArrayBuffer, so a worker reads the same memory instead of a copy.
 * Callers combine results in a fixed order, so certificates do not depend on
 * how many workers ran or which finished first.
 */
import {
  boundaryRows,
  type BoundaryRowInput,
  type BoundaryRowResult,
} from "../fibering/boundaryRowKernel";
import {
  cotreeColumnChunks,
  treeRecordChunks,
  wallVector,
  type CotreeColumnChunkInput,
  type TreeRecordChunkInput,
  type WallVectorInput,
} from "../fibering/h1ChunkKernels";
import {
  indexMaximalCells,
  type MaximalCellIndexInput,
  type MaximalCellIndexResult,
} from "../fibering/orbitIndexKernel";
import {
  pairCellUnions,
  type PairUnionInput,
  type PairUnionResult,
} from "../fibering/wallUnionKernel";
import {
  firstAlternatingRelationFailure,
  isFreeByOrbitTemplate,
} from "../torsionFree/relationCheck";

export interface KernelSignatures {
  alternatingRelation: {
    args: {
      left: Uint32Array;
      right: Uint32Array;
      m: number;
      degree: number;
      involutions: boolean;
    };
    result: { point: number; image: number } | null;
  };
  freeOrbitTemplate: {
    args: { rows: Uint32Array[]; degree: number; order: number };
    result: boolean;
  };
  maximalCellIndex: {
    args: MaximalCellIndexInput;
    result: MaximalCellIndexResult;
  };
  pairCellUnions: {
    args: PairUnionInput;
    result: PairUnionResult;
  };
  boundaryRows: {
    args: BoundaryRowInput;
    result: BoundaryRowResult;
  };
  treeRecordChunks: { args: TreeRecordChunkInput; result: string[] };
  cotreeColumnChunks: { args: CotreeColumnChunkInput; result: string[] };
  wallVector: {
    args: WallVectorInput;
    result: { nonzeroCount: number; vectorDigest: string };
  };
}

export type KernelName = keyof KernelSignatures;
export type KernelArgs<K extends KernelName> = KernelSignatures[K]["args"];
export type KernelResult<K extends KernelName> = KernelSignatures[K]["result"];

export function runKernel<K extends KernelName>(
  name: K,
  args: KernelArgs<K>,
): KernelResult<K> {
  switch (name) {
    case "alternatingRelation": {
      const a = args as KernelArgs<"alternatingRelation">;
      return (firstAlternatingRelationFailure(
        a.left,
        a.right,
        a.m,
        a.degree,
        a.involutions,
      ) ?? null) as KernelResult<K>;
    }
    case "freeOrbitTemplate": {
      const a = args as KernelArgs<"freeOrbitTemplate">;
      return isFreeByOrbitTemplate(
        a.rows,
        a.degree,
        a.order,
      ) as KernelResult<K>;
    }
    case "maximalCellIndex":
      return indexMaximalCells(
        args as KernelArgs<"maximalCellIndex">,
      ) as KernelResult<K>;
    case "pairCellUnions":
      return pairCellUnions(
        args as KernelArgs<"pairCellUnions">,
      ) as KernelResult<K>;
    case "boundaryRows":
      return boundaryRows(
        args as KernelArgs<"boundaryRows">,
      ) as KernelResult<K>;
    case "treeRecordChunks":
      return treeRecordChunks(
        args as KernelArgs<"treeRecordChunks">,
      ) as KernelResult<K>;
    case "cotreeColumnChunks":
      return cotreeColumnChunks(
        args as KernelArgs<"cotreeColumnChunks">,
      ) as KernelResult<K>;
    case "wallVector":
      return wallVector(args as KernelArgs<"wallVector">) as KernelResult<K>;
    default:
      throw new Error(`Unknown kernel ${String(name)}.`);
  }
}

/** Typed arrays in a kernel result that can move back without a copy. */
export function transferablesOf(value: unknown, out: ArrayBuffer[] = []) {
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) out.push(value.buffer);
  } else if (Array.isArray(value)) {
    for (const item of value) transferablesOf(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) transferablesOf(item, out);
  }
  return out;
}
