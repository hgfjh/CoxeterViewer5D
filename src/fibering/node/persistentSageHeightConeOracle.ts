import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

import {
  replayExactConeOracleCertificate,
  type AsyncExactConeFeasibilityOracle,
  type ExactConeOracleCertificate,
  type ExactConeOracleRequest,
} from "../scalableHeightCone";

interface SageServerSuccess {
  ok: true;
  requestHash: string;
  certificate: ExactConeOracleCertificate;
  cacheSize: number;
}

interface SageServerFailure {
  ok: false;
  line: number;
  errorType: string;
  error: string;
}

type SageServerResponse = SageServerSuccess | SageServerFailure;

interface PendingQuery {
  request: ExactConeOracleRequest;
  resolve(certificate: ExactConeOracleCertificate): void;
  reject(error: Error): void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface PersistentSageHeightConeOracleOptions {
  /** Executable such as `sage`, or `wsl` on a Windows host. */
  command: string;
  /**
   * Arguments ending in `scripts/sage_exact_height_cone.py --server`.
   * A Conda Sage installation can begin with its environment's Python path.
   */
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxPendingQueries?: number;
  queryTimeoutMs?: number;
  stderrTailCharacters?: number;
}

export interface PersistentSageHeightConeOracleStats {
  submitted: number;
  completed: number;
  pending: number;
  backendCacheSize: number;
  stderrTail: string;
}

/**
 * A JSONL client which pays Sage startup once and replays every returned
 * certificate before exposing it to the cone-cover builder.
 */
export class PersistentSageHeightConeOracle implements AsyncExactConeFeasibilityOracle {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending: PendingQuery[] = [];
  private readonly exitPromise: Promise<void>;
  private readonly maxPendingQueries: number;
  private readonly queryTimeoutMs: number | undefined;
  private readonly stderrTailCharacters: number;
  private stderrTail = "";
  private submitted = 0;
  private completed = 0;
  private backendCacheSize = 0;
  private terminalError: Error | undefined;
  private closing = false;

  constructor(options: PersistentSageHeightConeOracleOptions) {
    if (options.command.length === 0 || options.args.length === 0) {
      throw new Error(
        "The persistent Sage command and arguments are required.",
      );
    }
    this.maxPendingQueries = options.maxPendingQueries ?? 256;
    this.queryTimeoutMs = options.queryTimeoutMs;
    this.stderrTailCharacters = options.stderrTailCharacters ?? 16_384;
    if (
      !Number.isInteger(this.maxPendingQueries) ||
      this.maxPendingQueries < 1
    ) {
      throw new Error("maxPendingQueries must be a positive integer.");
    }
    if (
      this.queryTimeoutMs !== undefined &&
      (!Number.isInteger(this.queryTimeoutMs) || this.queryTimeoutMs < 1)
    ) {
      throw new Error(
        "queryTimeoutMs must be a positive integer when supplied.",
      );
    }

    this.child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.exitPromise = new Promise((resolve) => {
      this.child.once("error", (error) => {
        this.fail(
          new Error(`The Sage cone server failed to start: ${error.message}`),
        );
      });
      this.child.once("close", (code, signal) => {
        if (!this.closing || this.pending.length > 0) {
          this.fail(
            new Error(
              `The Sage cone server exited unexpectedly (code ${String(code)}, signal ${String(signal)}).${this.stderrSuffix()}`,
            ),
          );
        }
        resolve();
      });
    });

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(
        -this.stderrTailCharacters,
      );
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => this.acceptLine(line));
    // If the worker exits before or during a query, its stdin closes first.
    // Convert that stream error into the same rejected-query path used for a
    // bad certificate instead of letting Node terminate on an unhandled EPIPE.
    this.child.stdin.on("error", (error) => {
      this.fail(
        new Error(
          `The Sage cone server input stream failed: ${error.message}.${this.stderrSuffix()}`,
        ),
      );
    });
  }

  solve(request: ExactConeOracleRequest): Promise<ExactConeOracleCertificate> {
    if (this.terminalError !== undefined) {
      return Promise.reject(this.terminalError);
    }
    if (this.closing) {
      return Promise.reject(new Error("The Sage cone server is closing."));
    }
    if (this.pending.length >= this.maxPendingQueries) {
      return Promise.reject(
        new Error(
          `The Sage cone server already has ${this.pending.length} pending queries.`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const pending: PendingQuery = { request, resolve, reject };
      if (this.queryTimeoutMs !== undefined) {
        pending.timer = setTimeout(() => {
          this.fail(
            new Error(
              `The Sage cone query ${request.requestHash} exceeded ${this.queryTimeoutMs} ms.`,
            ),
          );
          this.child.kill();
        }, this.queryTimeoutMs);
      }
      this.pending.push(pending);
      this.submitted += 1;
      this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error !== null && error !== undefined) {
          this.fail(
            new Error(
              `Writing to the Sage cone server failed: ${error.message}${this.stderrSuffix()}`,
            ),
          );
        }
      });
    });
  }

  stats(): PersistentSageHeightConeOracleStats {
    return {
      submitted: this.submitted,
      completed: this.completed,
      pending: this.pending.length,
      backendCacheSize: this.backendCacheSize,
      stderrTail: this.stderrTail,
    };
  }

  async close(): Promise<void> {
    if (!this.closing) {
      this.closing = true;
      this.child.stdin.end();
    }
    await this.exitPromise;
    if (this.terminalError !== undefined && this.pending.length > 0) {
      throw this.terminalError;
    }
  }

  private acceptLine(line: string): void {
    const pending = this.pending.shift();
    if (pending === undefined) {
      this.fail(
        new Error(`The Sage cone server emitted an unsolicited line: ${line}`),
      );
      this.child.kill();
      return;
    }
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    try {
      const response = JSON.parse(line) as SageServerResponse;
      if (response.ok !== true) {
        throw new Error(
          `Sage cone server ${response.errorType} on input line ${response.line}: ${response.error}`,
        );
      }
      if (
        response.requestHash !== pending.request.requestHash ||
        !Number.isInteger(response.cacheSize) ||
        response.cacheSize < 1
      ) {
        throw new Error("The Sage cone server response envelope is invalid.");
      }
      const replay = replayExactConeOracleCertificate(
        pending.request,
        response.certificate,
      );
      if (!replay.passed) {
        throw new Error(
          `The Sage cone server returned an invalid certificate: ${replay.errors.join(" ")}`,
        );
      }
      this.backendCacheSize = response.cacheSize;
      this.completed += 1;
      pending.resolve(response.certificate);
    } catch (error) {
      const failure =
        error instanceof Error
          ? error
          : new Error(`Invalid Sage response: ${String(error)}`);
      pending.reject(failure);
      this.fail(failure);
      this.child.kill();
    }
  }

  private fail(error: Error): void {
    this.terminalError ??= error;
    while (this.pending.length > 0) {
      const pending = this.pending.shift()!;
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(this.terminalError);
    }
  }

  private stderrSuffix(): string {
    const trimmed = this.stderrTail.trim();
    return trimmed.length === 0 ? "" : ` Sage stderr: ${trimmed}`;
  }
}
