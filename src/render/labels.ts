export interface LabelEntry {
  id: string;
  selected?: boolean;
  priority?: number;
}

export interface LabelBudgetOptions<T> {
  enabled: boolean;
  maxLabels: number;
  maxCharacters: number;
  getLabel: (item: T) => string | undefined;
  getPriority?: (item: T) => number;
}

export interface PickedLabelEntry<T> {
  item: T;
  label: string;
}

export interface SegmentLabelCandidate {
  id: string;
  segmentKey: string;
  priority: number;
}

/**
 * Shortens long algebraic/word labels without changing their stable identity.
 */
export function compactLabelText(label: string, maxCharacters: number): string {
  if (maxCharacters < 4 || label.length <= maxCharacters) {
    return label;
  }

  const headLength = Math.max(1, Math.ceil((maxCharacters - 3) / 2));
  const tailLength = Math.max(1, Math.floor((maxCharacters - 3) / 2));
  return `${label.slice(0, headLength)}...${label.slice(-tailLength)}`;
}

/**
 * Chooses at most one label for each drawn segment.
 *
 * This matters for Y_Gamma, where several relation boundaries can share the
 * same geometric segment. The highest-priority semantic label wins and the
 * renderer avoids stacking different generator names on one edge.
 */
export function selectSegmentLabelBudget<T extends SegmentLabelCandidate>(
  entries: T[],
  maxLabels: number,
): T[] {
  if (maxLabels <= 0) {
    return [];
  }

  const bestBySegment = new Map<string, T>();
  for (const entry of entries) {
    const previous = bestBySegment.get(entry.segmentKey);
    if (!previous || compareSegmentLabelCandidates(entry, previous) < 0) {
      bestBySegment.set(entry.segmentKey, entry);
    }
  }

  return [...bestBySegment.values()]
    .sort(compareSegmentLabelCandidates)
    .slice(0, maxLabels);
}

/**
 * Stable priority budget for node and edge labels.
 */
export function selectLabelBudget<T extends { id: string }>(
  items: T[],
  options: LabelBudgetOptions<T>,
): Array<PickedLabelEntry<T>> {
  if (!options.enabled || options.maxLabels <= 0) {
    return [];
  }

  const entries = items
    .map((item) => {
      const label = options.getLabel(item);
      return label
        ? {
            item,
            label: compactLabelText(label, options.maxCharacters),
            priority: options.getPriority?.(item) ?? 0,
          }
        : undefined;
    })
    .filter((entry): entry is PickedLabelEntry<T> & { priority: number } =>
      Boolean(entry),
    );

  return entries
    .sort((left, right) => {
      const priorityDifference = right.priority - left.priority;
      return priorityDifference === 0
        ? left.item.id.localeCompare(right.item.id)
        : priorityDifference;
    })
    .slice(0, options.maxLabels)
    .map(({ item, label }) => ({ item, label }));
}

function compareSegmentLabelCandidates<T extends SegmentLabelCandidate>(
  left: T,
  right: T,
): number {
  const priorityDifference = right.priority - left.priority;
  return priorityDifference === 0
    ? left.id.localeCompare(right.id)
    : priorityDifference;
}

export function pickLabelEntries<T extends LabelEntry>(
  entries: T[],
  maxLabels: number,
): T[] {
  if (maxLabels <= 0) {
    return [];
  }

  return [...entries]
    .sort((left, right) => {
      if (Boolean(left.selected) !== Boolean(right.selected)) {
        return left.selected ? -1 : 1;
      }

      const priorityDifference = (left.priority ?? 0) - (right.priority ?? 0);
      return priorityDifference === 0
        ? left.id.localeCompare(right.id)
        : priorityDifference;
    })
    .slice(0, maxLabels);
}
