FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

ARG PNPM_VERSION=11.3.0

ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    graphviz \
    python3 \
    python3-pip \
    wget \
  && rm -rf /var/lib/apt/lists/*

# Optional exact-tool paths are documented in docs/tooling.md.
# SageMath, GAP/KBMAG, and CoxIter are deliberately not installed here:
# they are large, platform-specific research runtimes rather than app
# dependencies.
