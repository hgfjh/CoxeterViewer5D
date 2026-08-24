import { compareIds, multiplySigns, negateSign } from "./internal";
import type { OrientationSign, WallCoorientation, WallSystem } from "./types";

/** Create a coorientation, defaulting each two-sided wall to its + side. */
export function createWallCoorientation(
  wallSystem: WallSystem,
  requestedWallSigns: Partial<Record<string, OrientationSign>> = {},
): WallCoorientation {
  const errors: string[] = [];
  const knownWallIds = new Set(wallSystem.walls.map((wall) => wall.id));
  for (const wallId of Object.keys(requestedWallSigns).sort(compareIds)) {
    if (!knownWallIds.has(wallId)) {
      errors.push(`Unknown wall ${wallId}.`);
    }
  }

  const wallSigns: Record<string, OrientationSign> = {};
  for (const wall of wallSystem.walls) {
    const sign = requestedWallSigns[wall.id] ?? 1;
    if (sign !== 1 && sign !== -1) {
      errors.push(`Wall ${wall.id} has invalid orientation sign ${sign}.`);
      wallSigns[wall.id] = 1;
    } else {
      wallSigns[wall.id] = sign;
    }
    if (!wall.twoSided) {
      errors.push(
        `Wall ${wall.id} is one-sided; a global coorientation does not exist.`,
      );
    }
  }

  const edgeDirections: Record<string, OrientationSign> = {};
  for (const wall of wallSystem.walls) {
    const wallSign = wallSigns[wall.id];
    for (const edgeId of wall.edgeIds) {
      const parity = wall.edgeOrientationParity[edgeId];
      if (parity === undefined) {
        errors.push(
          `Wall ${wall.id} has no orientation parity for edge ${edgeId}.`,
        );
        continue;
      }
      edgeDirections[edgeId] = multiplySigns(wallSign, parity);
    }
  }

  return {
    wallSigns,
    edgeDirections,
    valid: errors.length === 0,
    errors,
  };
}

/** Flip one wall while leaving all other wall choices unchanged. */
export function flipWallCoorientation(
  wallSystem: WallSystem,
  coorientation: WallCoorientation,
  wallId: string,
): WallCoorientation {
  if (!wallSystem.walls.some((wall) => wall.id === wallId)) {
    return {
      ...coorientation,
      wallSigns: { ...coorientation.wallSigns },
      edgeDirections: { ...coorientation.edgeDirections },
      valid: false,
      errors: [...coorientation.errors, `Unknown wall ${wallId}.`],
    };
  }
  return createWallCoorientation(wallSystem, {
    ...coorientation.wallSigns,
    [wallId]: negateSign(coorientation.wallSigns[wallId] ?? 1),
  });
}

export const createCoorientation = createWallCoorientation;
export const flipCoorientation = flipWallCoorientation;

export function propagateCoorientation(
  wallSystem: WallSystem,
  wallSigns: Partial<Record<string, OrientationSign>>,
): WallCoorientation {
  return createWallCoorientation(wallSystem, wallSigns);
}
