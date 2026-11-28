/**
 * Graph distance from a selected vertex over scene edges, for the
 * "focus on selection" view.
 *
 * Breadth-first search over the undirected 1-skeleton: in a Cayley ball this
 * is word distance |u^{-1} w| restricted to paths that stay inside the drawn
 * ball, so near the radius cutoff it can exceed the true word distance.
 * Vertices not reachable within `maxDistance` (or at all) are absent from the
 * returned map. The selected id always maps to 0 (callers pass a node id
 * that exists); `undefined` gives an empty map.
 */
export function localGraphDistances(
  selectedId: string | undefined,
  edges: ReadonlyArray<{ source: string; target: string }>,
  maxDistance = Infinity,
): Map<string, number> {
  const distances = new Map<string, number>();
  if (selectedId === undefined) return distances;

  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = neighbours.get(from);
    if (list === undefined) neighbours.set(from, [to]);
    else list.push(to);
  };
  for (const edge of edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  distances.set(selectedId, 0);
  let frontier = [selectedId];
  for (
    let distance = 1;
    distance <= maxDistance && frontier.length > 0;
    distance += 1
  ) {
    const next: string[] = [];
    for (const vertex of frontier) {
      for (const neighbour of neighbours.get(vertex) ?? []) {
        if (distances.has(neighbour)) continue;
        distances.set(neighbour, distance);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return distances;
}
