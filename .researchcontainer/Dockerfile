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
    cmake \
    curl \
    gap \
    gap-kbmag \
    git \
    graphviz \
    make \
    python3 \
    python3-pip \
    sagemath \
    wget \
  && rm -rf /var/lib/apt/lists/*

# CoxIter packaging varies across Linux distributions. Keep the path stable
# for automation and let users bind-mount or install the binary here when a
# project needs external diagram checks.
ENV COXITER_EXECUTABLE=/usr/local/bin/coxiter

LABEL org.opencontainers.image.title="CoxeterViewer5D research container"
LABEL org.opencontainers.image.description="Pinned app toolchain with SageMath and GAP/KBMAG for reproducible Coxeter artifacts."
