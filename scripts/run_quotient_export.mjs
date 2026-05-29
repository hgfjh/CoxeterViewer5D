#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function toolCandidates(backend) {
  return backend === "gap"
    ? [
        { command: "gap", args: ["-q", "-c", "QUIT;"], label: "gap" },
        {
          command: "wsl",
          args: ["gap", "-q", "-c", "QUIT;"],
          label: "wsl gap",
        },
        {
          command: "wsl",
          args: [
            "bash",
            "-lc",
            "/opt/miniforge3/envs/sage/bin/gap -q -c 'Print(GAPInfo.Version); QUIT;'",
          ],
          label: "wsl sage-env gap",
        },
      ]
    : [
        { command: "sage", args: ["--version"], label: "sage" },
        { command: "wsl", args: ["sage", "--version"], label: "wsl sage" },
      ];
}

function windowsPathToWslPath(path) {
  const resolved = resolve(path).replaceAll("\\", "/");
  const drive = resolved.match(/^([A-Za-z]):\/(.*)$/);
  if (!drive) {
    return resolved;
  }
  return `/mnt/${drive[1].toLowerCase()}/${drive[2]}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function externalExportCandidates(backend, inputPath) {
  if (backend === "sage") {
    const nativePython = [
      "import runpy, sys",
      `sys.argv=${JSON.stringify([
        "scripts/sage_quotient_export.py",
        "--input",
        inputPath,
      ])}`,
      "runpy.run_path('scripts/sage_quotient_export.py', run_name='__main__')",
    ].join("; ");
    const wslPython = [
      "import runpy, sys",
      `sys.argv=${JSON.stringify([
        "scripts/sage_quotient_export.py",
        "--input",
        windowsPathToWslPath(inputPath),
      ])}`,
      "runpy.run_path('scripts/sage_quotient_export.py', run_name='__main__')",
    ].join("; ");
    const nativeArgs = ["-c", nativePython];
    const wslCommand = [
      "cd",
      shellQuote(windowsPathToWslPath(process.cwd())),
      "&&",
      "sage",
      "-c",
      shellQuote(wslPython),
    ].join(" ");
    return [
      {
        command: "sage",
        args: nativeArgs,
        label: "sage -c scripts/sage_quotient_export.py",
      },
      {
        command: "wsl",
        args: ["bash", "-lc", wslCommand],
        label: "wsl sage -c scripts/sage_quotient_export.py",
      },
    ];
  }

  if (backend === "gap") {
    return [
      {
        command: "python",
        args: ["scripts/gap_quotient_export.py", "--input", inputPath],
        label: "python scripts/gap_quotient_export.py",
      },
    ];
  }

  return [];
}

function detectExternalTool(backend) {
  for (const candidate of toolCandidates(backend)) {
    const result = spawnSync(candidate.command, candidate.args, {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0) {
      const versionLine = `${result.stdout}${result.stderr}`
        .trim()
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0);
      return {
        status: "available",
        command: candidate.label,
        version: versionLine,
      };
    }
  }

  return {
    status: "skipped",
    command: backend === "gap" ? "gap or wsl gap" : "sage or wsl sage",
    version: undefined,
  };
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]);
      } catch {
        // Keep scanning; some external tools print banners before JSON.
      }
    }
    return undefined;
  }
}

function runNativeExternalExporter(backend, inputPath) {
  const attempts = [];
  for (const candidate of externalExportCandidates(backend, inputPath)) {
    const result = spawnSync(candidate.command, candidate.args, {
      encoding: "utf8",
      windowsHide: true,
    });
    const parsed = result.stdout ? parseJsonOutput(result.stdout) : undefined;
    attempts.push({
      command: candidate.label,
      status: result.status,
      stderr: result.stderr?.trim(),
      parsedStatus:
        parsed && typeof parsed === "object"
          ? (parsed.status ?? parsed.schemaVersion ?? "json")
          : "unparseable",
    });
    if (result.status === 0 && parsed?.schemaVersion === 1) {
      return {
        status: "passed",
        command: candidate.label,
        output: parsed,
        attempts,
      };
    }
    if (result.status === 0 && parsed?.status === "skipped") {
      continue;
    }
  }

  return {
    status: "skipped",
    command:
      backend === "sage" ? "sage quotient exporter" : "gap quotient exporter",
    attempts,
  };
}

function printOrWrite(value, outputPath) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, text, "utf8");
  } else {
    process.stdout.write(text);
  }
}

const backend = arg("--backend", "sage");
const inputPath = arg("--input", undefined);
const outputPath = arg("--output", undefined);

if (!inputPath) {
  printOrWrite(
    {
      ok: true,
      status: "skipped",
      backend,
      warnings: ["Pass --input with a QuotientBuildInput request."],
    },
    outputPath,
  );
  process.exit(0);
}

const inputText = readFileSync(inputPath, "utf8");
const inputHash = sha256Text(inputText);
const externalMode = process.env.COXETER_QUOTIENT_EXTERNAL_MODE ?? "auto";
const forceInRepo = externalMode === "in-repo";
const externalTool = forceInRepo
  ? {
      status: "skipped",
      command: "external quotient exporters disabled by environment",
      version: undefined,
    }
  : detectExternalTool(backend);
const nativeExternal = forceInRepo
  ? {
      status: "skipped",
      command: "external quotient exporters disabled by environment",
      attempts: [],
    }
  : runNativeExternalExporter(backend, inputPath);
if (nativeExternal.status === "passed") {
  const output = nativeExternal.output;
  const nativeWarning = `Native ${backend === "gap" ? "GAP" : "Sage"} quotient exporter produced this artifact from the subgroup/coset request.`;
  output.warnings = [...(output.warnings ?? []), nativeWarning];
  if (output.verifier) {
    output.verifier.diagnostics = {
      ...(output.verifier.diagnostics ?? {}),
      externalToolStatus: {
        ...externalTool,
        exporterCommand: nativeExternal.command,
        attempts: nativeExternal.attempts,
      },
      wrapper: "scripts/run_quotient_export.mjs",
    };
    output.verifier.warnings = [
      ...(output.verifier.warnings ?? []),
      nativeWarning,
    ];
  }
  if (output.subgroup?.certificate) {
    output.subgroup.certificate.diagnostics = {
      ...(output.subgroup.certificate.diagnostics ?? {}),
      externalToolStatus: {
        ...externalTool,
        exporterCommand: nativeExternal.command,
      },
    };
  }
  const hashSource = JSON.stringify({
    ...output,
    verifier: output.verifier
      ? { ...output.verifier, outputHash: undefined }
      : undefined,
  });
  if (output.verifier) {
    output.verifier.outputHash = sha256Text(hashSource);
  }
  if (output.subgroup?.certificate) {
    output.subgroup.certificate.outputHash = output.verifier?.outputHash;
  }
  if (output.game?.cocycles?.[0]?.certificate) {
    output.game.cocycles[0].certificate.outputHash =
      output.verifier?.outputHash;
  }
  printOrWrite(output, outputPath);
  process.exit(0);
}
const delegate = spawnSync(
  process.execPath,
  [
    "scripts/quotient_export_backend.mjs",
    "--backend",
    backend,
    "--input",
    inputPath,
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  },
);

if (delegate.status !== 0) {
  const failed = delegate.stdout
    ? JSON.parse(delegate.stdout)
    : {
        ok: false,
        status: "failed",
        backend,
        inputPath,
        inputHash,
        errors: [delegate.stderr || "quotient export failed"],
      };
  printOrWrite(failed, outputPath);
  process.exit(delegate.status ?? 1);
}

const output = JSON.parse(delegate.stdout);
const toolWarning =
  externalTool.status === "available"
    ? `Detected ${externalTool.command}, but no native quotient artifact was produced for this request; emitted deterministic in-repo finite quotient artifact with external attempts recorded.`
    : `External ${backend === "gap" ? "GAP" : "Sage"} was not callable; emitted deterministic in-repo finite quotient artifact with skipped external-tool status.`;

if (output && typeof output === "object" && output.schemaVersion === 1) {
  output.warnings = [...(output.warnings ?? []), toolWarning];
  if (output.verifier) {
    output.verifier.diagnostics = {
      ...(output.verifier.diagnostics ?? {}),
      externalToolStatus: {
        ...externalTool,
        nativeExporter: nativeExternal,
      },
      wrapper: "scripts/run_quotient_export.mjs",
    };
    output.verifier.warnings = [
      ...(output.verifier.warnings ?? []),
      toolWarning,
    ];
  }
  if (output.subgroup?.certificate) {
    output.subgroup.certificate.diagnostics = {
      ...(output.subgroup.certificate.diagnostics ?? {}),
      externalToolStatus: externalTool,
    };
  }
  const hashSource = JSON.stringify({
    ...output,
    verifier: output.verifier
      ? { ...output.verifier, outputHash: undefined }
      : undefined,
  });
  if (output.verifier) {
    output.verifier.outputHash = sha256Text(hashSource);
  }
  if (output.subgroup?.certificate) {
    output.subgroup.certificate.outputHash = output.verifier?.outputHash;
  }
  if (output.game?.cocycles?.[0]?.certificate) {
    output.game.cocycles[0].certificate.outputHash =
      output.verifier?.outputHash;
  }
}

printOrWrite(output, outputPath);
