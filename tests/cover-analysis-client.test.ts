import { describe, expect, it } from "vitest";
import idealCube from "../public/examples/ideal_hyperbolic_3_cube_m3.json";
import {
  analyzeCoorientation,
  analyzeCover,
  fiberingCertificate,
  wallCoorientation,
  type WallSigns,
} from "../src/app/coverAnalysis";
import {
  CoverAnalysisClient,
  CoverAnalysisSupersededError,
} from "../src/app/coverAnalysisClient";
import { createCoverAnalysisHandler } from "../src/app/coverAnalysisWorkerCore";
import type { CoverAnalysisWorkerRequest } from "../src/app/coverAnalysisWorkerTypes";
import { buildIdealHyperbolic3CubeS4Cover } from "../src/torsionFree";
import type { CoxeterSystemInput } from "../src/types";

/** In-process stand-in for the worker: same handler, cloned messages. */
function fakeWorker(): Worker {
  const handle = createCoverAnalysisHandler();
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null,
    postMessage(request: CoverAnalysisWorkerRequest) {
      const cloned = structuredClone(request);
      setTimeout(() => {
        const response = structuredClone(handle(cloned));
        worker.onmessage?.({ data: response } as MessageEvent);
      }, 0);
    },
    terminate() {},
  };
  return worker as unknown as Worker;
}

const quotient = buildIdealHyperbolic3CubeS4Cover(
  idealCube as CoxeterSystemInput,
);

function signsFlipping(count: number): WallSigns {
  const walls = analyzeCover(quotient).wallSystem!.walls;
  return Object.fromEntries(
    walls.map((wall, index) => [wall.id, index < count ? -1 : 1]),
  );
}

describe("cover analysis client", () => {
  it("returns the same analysis and coorientation results as the inline path", async () => {
    const client = new CoverAnalysisClient(fakeWorker);
    const inline = analyzeCover(quotient);
    const analysis = await client.analyze(quotient);
    expect(analysis).toEqual(structuredClone(inline));

    const signs = signsFlipping(1);
    const evaluation = await client.evaluate(signs);
    const coorientation = wallCoorientation(inline.wallSystem!, signs);
    const result = analyzeCoorientation(inline.cover!, coorientation);
    expect(evaluation.result).toEqual(structuredClone(result));
    expect(evaluation.certificate).toEqual(
      structuredClone(
        fiberingCertificate({
          quotient,
          analysis: inline,
          coorientation,
          coorientationAnalysis: result,
        }),
      ),
    );
    client.dispose();
  });

  it("coalesces a burst of wall flips to the latest signs", async () => {
    const client = new CoverAnalysisClient(fakeWorker);
    await client.analyze(quotient);
    const first = client.evaluate(signsFlipping(1));
    const second = client.evaluate(signsFlipping(2));
    const third = client.evaluate(signsFlipping(3));
    await expect(second).rejects.toBeInstanceOf(CoverAnalysisSupersededError);
    expect((await first).wallSigns).toEqual(signsFlipping(1));
    expect((await third).wallSigns).toEqual(signsFlipping(3));
    client.dispose();
  });

  it("supersedes an analysis when a new cover arrives", async () => {
    const client = new CoverAnalysisClient(fakeWorker);
    const stale = client.analyze(quotient);
    const fresh = client.analyze(quotient);
    await expect(stale).rejects.toBeInstanceOf(CoverAnalysisSupersededError);
    expect((await fresh).cover).toBeDefined();
    client.dispose();
  });
});
