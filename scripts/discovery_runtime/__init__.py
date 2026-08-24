"""Runtime primitives for bounded, resumable torsion-free-cover searches.

This package deliberately does not import the current discovery launcher.  A
backend can adopt scratch, process, checkpoint, or packed-action support one
piece at a time without changing the mathematical search strategy.
"""

from .cache import (
    PersistentCacheLocation,
    PersistentCachePolicy,
    create_persistent_cache_location,
)
from .checkpoints import (
    CheckpointEvent,
    CheckpointJournal,
    JournalCorruption,
    JournalIdentityMismatch,
    JournalSummary,
)
from .hashing import (
    CopyDigest,
    atomic_write_json,
    canonical_json_bytes,
    copy_file_streaming,
    sha256_file,
    sha256_json,
    sha256_stream,
)
from .permutations import (
    PackedPermutationSpool,
    PermutationSpoolError,
    PermutationSpoolSummary,
)
from .processes import ManagedProcessError, ManagedProcessRunner, ProcessResult
from .resources import (
    GIB,
    MemoryBudget,
    PortfolioStats,
    ResourceCancelled,
    ResourcePlan,
    ResourcePortfolio,
    ResourceSnapshot,
    ResourceTimeout,
    TaskContext,
    available_memory_bytes,
)
from .session import (
    RUNTIME_API_VERSION,
    CancelFileMonitor,
    DiscoveryRuntimeSession,
    RuntimeCancelled,
    RuntimePaths,
)
from .scratch import (
    ScratchPolicy,
    ScratchWorkspace,
    StagedFile,
    create_scratch_workspace,
)

__all__ = [
    "CheckpointEvent",
    "CheckpointJournal",
    "CancelFileMonitor",
    "CopyDigest",
    "DiscoveryRuntimeSession",
    "GIB",
    "JournalCorruption",
    "JournalIdentityMismatch",
    "JournalSummary",
    "ManagedProcessError",
    "ManagedProcessRunner",
    "MemoryBudget",
    "PackedPermutationSpool",
    "PersistentCacheLocation",
    "PersistentCachePolicy",
    "PermutationSpoolError",
    "PermutationSpoolSummary",
    "PortfolioStats",
    "ProcessResult",
    "ResourceCancelled",
    "ResourcePlan",
    "ResourcePortfolio",
    "ResourceSnapshot",
    "ResourceTimeout",
    "RUNTIME_API_VERSION",
    "RuntimeCancelled",
    "RuntimePaths",
    "ScratchPolicy",
    "ScratchWorkspace",
    "StagedFile",
    "TaskContext",
    "atomic_write_json",
    "available_memory_bytes",
    "canonical_json_bytes",
    "copy_file_streaming",
    "create_persistent_cache_location",
    "create_scratch_workspace",
    "sha256_file",
    "sha256_json",
    "sha256_stream",
]
