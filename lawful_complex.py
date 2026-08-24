"""
lawful_subcomplex.py

Given a 2-complex + its abstract walls (from your wall-finder script),
this assigns an orientation to each wall, propagates it to a direction
on every edge, and extracts the lawful subcomplex Y (Jankiewicz-Wise,
Sec 2.5): the subcomplex obtained by discarding every 2-cell whose
attaching map cannot be written as a concatenation alpha*beta^-1 of
two positively-directed edge-paths.

It also checks the Bestvina-Brady hypothesis used in the paper's main
theorem (Thm 2.1 / Sec 3.3): ascending and descending links must be
nonempty and connected at every 0-cell. Since a single random
orientation only satisfies this with some probability, `search_orientation`
retries with fresh random orientations until it finds one that works
(or returns the best one found after max_trials).

------------------------------------------------------------------
INPUT FORMAT (adapt your wall-finder's output to this)
------------------------------------------------------------------
vertices : set of hashable ids
edges    : dict  edge_id -> (v0, v1)              # base/reference direction
cells    : dict  cell_id -> [(edge_id, sign), ...] # cyclic boundary word,
                                                    # sign=+1 if the cell
                                                    # traverses edge_id
                                                    # v0->v1, -1 if v1->v0.
                                                    # Must have EVEN length
                                                    # (each 2-cell has an
                                                    # even number of sides).
walls    : dict  wall_id -> [edge_id, ...]          # abstract wall = the
                                                    # edges in one
                                                    # parallelism class

Parallel pairs (needed to propagate a consistent orientation across a
wall) are derived directly from cells: in a 2n-gon boundary word,
position i and position i+n are parallel (dual to the same wall arc).
"""

import random
from collections import defaultdict, deque


def infer_traversal_signs(edges, polygon):
    """
    wall_finder.py's polygons are plain cyclic edge-ID lists with no
    traversal sign. Reconstruct the sign (+1 = traversed v0->v1,
    -1 = traversed v1->v0) by walking the polygon and matching shared
    endpoints between consecutive edges. Tries both starting directions
    of the first edge; raises if neither closes up.
    """
    for s0 in (1, -1):
        v0, v1 = edges[polygon[0]]
        start = v0 if s0 == 1 else v1
        cur_end = v1 if s0 == 1 else v0
        signs = [s0]
        ok = True
        for e in polygon[1:]:
            ev0, ev1 = edges[e]
            if ev0 == cur_end:
                signs.append(1)
                cur_end = ev1
            elif ev1 == cur_end:
                signs.append(-1)
                cur_end = ev0
            else:
                ok = False
                break
        if ok and cur_end == start:
            return signs
    raise ValueError(
        f"polygon {polygon} is not a closed edge-path consistent with "
        "the given edge endpoints"
    )


def from_wall_finder_format(edges, polygons, walls):
    """
    Build a TwoComplex directly from wall_finder.py's inputs/outputs.

    edges    : dict edge_id -> (initial_vertex, terminal_vertex)   [same format]
    polygons : list of cyclic edge-ID lists (wall_finder.py's `polygons`)
    walls    : list of lists of edge IDs (wall_finder.py's `compute_abstract_walls` output)
    """
    cells = {}
    for i, polygon in enumerate(polygons):
        signs = infer_traversal_signs(edges, polygon)
        cells[f"P{i}"] = list(zip(polygon, signs))

    wall_dict = {f"W{i}": list(w) for i, w in enumerate(walls)}

    return TwoComplex(edges, cells, wall_dict)


class TwoComplex:
    def __init__(self, edges, cells, walls):
        self.edges = edges          # edge_id -> (v0, v1)
        self.cells = cells          # cell_id -> [(edge_id, sign), ...] cyclic, even length
        self.walls = walls          # wall_id -> [edge_id, ...]
        self.vertices = set()
        for v0, v1 in edges.values():
            self.vertices.add(v0)
            self.vertices.add(v1)
        self.edge_to_wall = {}
        for w, es in walls.items():
            for e in es:
                self.edge_to_wall[e] = w
        for cid, word in cells.items():
            if len(word) % 2 != 0:
                raise ValueError(f"cell {cid} has odd length {len(word)}; every 2-cell needs an even number of sides")

    # ---- parallel pairs within each cell (position i <-> i+n) ----
    def parallel_pairs(self):
        pairs = []
        for word in self.cells.values():
            n = len(word) // 2
            for i in range(n):
                pairs.append((word[i], word[i + n]))
        return pairs  # list of ((e_i,s_i),(e_j,s_j))

    # ---- propagate a consistent reference orientation across each wall ----
    def build_wall_reference(self):
        """
        Returns:
          ref_sign: edge_id -> +1/-1, the direction assigned to that edge
                    when its wall is given orientation +1.
          bad_walls: set of wall_ids that are NOT two-sided/self-consistent
                     (a parity contradiction was found while propagating).
        """
        ref_sign = {}
        bad_walls = set()

        adj = defaultdict(list)  # edge -> [(other_edge, relative_sign)]
        for (e_i, s_i), (e_j, s_j) in self.parallel_pairs():
            r = -s_i * s_j
            adj[e_i].append((e_j, r))
            adj[e_j].append((e_i, r))

        visited = set()
        for w, es in self.walls.items():
            for start in es:
                if start in visited:
                    continue
                ref_sign[start] = 1
                visited.add(start)
                q = deque([start])
                while q:
                    cur = q.popleft()
                    for other, r in adj[cur]:
                        if self.edge_to_wall.get(other) != w:
                            continue  # only propagate within the same wall
                        expected = ref_sign[cur] * r
                        if other in visited:
                            if ref_sign[other] != expected:
                                bad_walls.add(w)
                        else:
                            ref_sign[other] = expected
                            visited.add(other)
                            q.append(other)
        return ref_sign, bad_walls

    # ---- turn a per-wall +1/-1 choice into a per-edge direction ----
    def edge_directions(self, wall_choice, ref_sign):
        return {e: ref_sign[e] * wall_choice[self.edge_to_wall[e]] for e in self.edges}

    def random_wall_choice(self, rng=None):
        rng = rng or random
        return {w: rng.choice((1, -1)) for w in self.walls}

    # ---- lawful subcomplex: keep cells expressible as alpha*beta^-1 ----
    def lawful_cells(self, edge_dir):
        lawful = set()
        for cid, word in self.cells.items():
            steps = [s * edge_dir[e] for e, s in word]  # +1 ascending, -1 descending step
            changes = sum(1 for i in range(len(steps)) if steps[i] != steps[i - 1])
            if changes <= 2:
                lawful.add(cid)
        return lawful

    # ---- ascending/descending link check at every 0-cell (Thm 2.1 hypothesis) ----
    def _end_ascending(self, e, x, d):
        v0, v1 = self.edges[e]
        if x == v0:
            return d == 1
        else:  # x == v1
            return d == -1

    def link_condition_holds(self, edge_dir, lawful_only=False, cell_ids=None):
        """
        Checks: for every 0-cell x, link_up(x) and link_down(x) are both
        nonempty and connected (Bestvina-Brady hypothesis, Sec 2.4/3.3).
        Set lawful_only=True to build links only from the lawful subcomplex.
        Returns (holds: bool, failing_vertices: set).
        """
        cells_to_use = cell_ids if cell_ids is not None else self.cells.keys()
        if lawful_only:
            lawful = self.lawful_cells(edge_dir)
            cells_to_use = [c for c in cells_to_use if c in lawful]

        # link nodes: (edge, vertex) = the end of `edge` touching `vertex`
        up_adj = defaultdict(set)
        down_adj = defaultdict(set)
        up_nodes = defaultdict(set)
        down_nodes = defaultdict(set)

        for cid in cells_to_use:
            word = self.cells[cid]
            n = len(word)
            # vertex touched at the end of each traversed edge
            touch = []
            for e, s in word:
                v0, v1 = self.edges[e]
                touch.append(v1 if s == 1 else v0)
            for i in range(n):
                e_i, s_i = word[i]
                e_j, s_j = word[(i + 1) % n]
                x = touch[i]  # corner vertex shared by edge i (end) and edge i+1 (start)
                asc_i = self._end_ascending(e_i, x, edge_dir[e_i])
                asc_j = self._end_ascending(e_j, x, edge_dir[e_j])
                node_i = (e_i, x)
                node_j = (e_j, x)
                if asc_i:
                    up_nodes[x].add(node_i)
                else:
                    down_nodes[x].add(node_i)
                if asc_j:
                    up_nodes[x].add(node_j)
                else:
                    down_nodes[x].add(node_j)
                if asc_i and asc_j:
                    up_adj[node_i].add(node_j)
                    up_adj[node_j].add(node_i)
                elif (not asc_i) and (not asc_j):
                    down_adj[node_i].add(node_j)
                    down_adj[node_j].add(node_i)

        def nonempty_and_connected(nodes, adj):
            if not nodes:
                return False
            nodes = list(nodes)
            seen = {nodes[0]}
            q = deque([nodes[0]])
            while q:
                cur = q.popleft()
                for nb in adj[cur]:
                    if nb not in seen:
                        seen.add(nb)
                        q.append(nb)
            return seen == set(nodes)

        failing = set()
        for x in self.vertices:
            ok_up = nonempty_and_connected(up_nodes[x], up_adj)
            ok_down = nonempty_and_connected(down_nodes[x], down_adj)
            if not (ok_up and ok_down):
                failing.add(x)
        return (len(failing) == 0), failing


def _evaluate(complex_, wall_choice, ref_sign):
    edge_dir = complex_.edge_directions(wall_choice, ref_sign)
    lawful = complex_.lawful_cells(edge_dir)
    link_ok, failing = complex_.link_condition_holds(edge_dir)
    # sort key: prefer link_ok, then more lawful cells, then fewer failing vertices
    score = (link_ok, len(lawful), -len(failing))
    return dict(wall_choice=dict(wall_choice), edge_dir=edge_dir, lawful_cells=lawful,
                link_ok=link_ok, failing_vertices=failing, score=score)


def exhaustive_search(complex_, ref_sign, bad_walls, max_walls=20, stop_early=False):
    """
    Tries EVERY orientation (2^num_walls). Only feasible for small
    complexes; raises if there are too many walls.

    By default (stop_early=False) it scans ALL orientations and returns
    the one that maximizes lawful-cell count among those with link_ok=True
    (falling back to max lawful-cell count if none satisfy link_ok).
    Set stop_early=True to return as soon as any link_ok=True orientation
    is found (faster, not necessarily maximal).
    """
    walls = list(complex_.walls.keys())
    if len(walls) > max_walls:
        raise ValueError(
            f"{len(walls)} walls -> 2^{len(walls)} orientations, too many "
            f"for exhaustive search (limit {max_walls}). Use search_orientation instead."
        )
    best = None
    for bits in range(2 ** len(walls)):
        wall_choice = {w: (1 if (bits >> i) & 1 == 0 else -1) for i, w in enumerate(walls)}
        result = _evaluate(complex_, wall_choice, ref_sign)
        result["bad_walls"] = bad_walls
        if best is None or result["score"] > best["score"]:
            best = result
        if stop_early and result["link_ok"]:
            break
    best["trials_used"] = bits + 1
    best["exhaustive"] = True
    return best


def _local_search(complex_, ref_sign, start_choice, max_steps=200, rng=None, stop_early=False):
    """
    Greedy hill-climbing: flip one wall at a time if it strictly improves
    the score (link_ok, then #lawful cells, then fewer failing vertices).
    By default (stop_early=False) it keeps climbing after link_ok becomes
    True, since further single-wall flips may still raise the lawful-cell
    count without breaking link_ok. Stops when no flip improves the score
    (local optimum) or max_steps is reached.
    """
    rng = rng or random
    current = dict(start_choice)
    best = _evaluate(complex_, current, ref_sign)
    for _ in range(max_steps):
        if stop_early and best["link_ok"]:
            break
        walls = list(complex_.walls.keys())
        rng.shuffle(walls)
        improved = False
        for w in walls:
            trial = dict(current)
            trial[w] *= -1
            result = _evaluate(complex_, trial, ref_sign)
            if result["score"] > best["score"]:
                current, best = trial, result
                improved = True
                break
        if not improved:
            break
    return best


def search_orientation(complex_, max_trials=2000, seed=None, exhaustive_limit=20,
                        restarts=None, local_steps=200, stop_early=False):
    """
    Finds an orientation whose lawful subcomplex satisfies the link
    condition (Thm 2.1), maximizing lawful-cell count among such
    orientations (falls back to maximizing lawful-cell count alone if
    none satisfy the link condition).

    Strategy:
      - If the complex has <= exhaustive_limit walls, try EVERY orientation
        (2^num_walls) and return the true best.
      - Otherwise, do randomized-restart hill-climbing: start from a random
        orientation, greedily flip single walls to improve the score,
        repeat for several restarts, keep the best result found across
        ALL restarts.

    Set stop_early=True to return as soon as a link_ok=True orientation is
    found, trading optimality for speed on large complexes.

    Returns dict with: wall_choice, edge_dir, lawful_cells, link_ok,
      failing_vertices, bad_walls, trials_used, exhaustive (bool).
    """
    rng = random.Random(seed)
    ref_sign, bad_walls = complex_.build_wall_reference()
    if bad_walls:
        print(f"WARNING: {len(bad_walls)} wall(s) are not self-consistently two-sided: {bad_walls}")

    num_walls = len(complex_.walls)
    if num_walls <= exhaustive_limit:
        return exhaustive_search(complex_, ref_sign, bad_walls, max_walls=exhaustive_limit,
                                  stop_early=stop_early)

    if restarts is None:
        restarts = max(1, max_trials // max(1, local_steps))

    best = None
    trials_used = 0
    for r in range(restarts):
        start = complex_.random_wall_choice(rng)
        result = _local_search(complex_, ref_sign, start, max_steps=local_steps, rng=rng,
                                stop_early=stop_early)
        trials_used += 1
        if best is None or result["score"] > best["score"]:
            best = result
        if stop_early and best["link_ok"]:
            break

    best["bad_walls"] = bad_walls
    best["trials_used"] = trials_used
    best["exhaustive"] = False
    return best




def report(result, complex_):
    """Prints a full summary of a search_orientation()/exhaustive_search() result,
    including which cells (if any) are NOT lawful. Returns the list of
    unlawful cell ids (empty if all cells are lawful)."""
    all_cells = list(complex_.cells.keys())
    lawful = result["lawful_cells"]
    unlawful = sorted(set(all_cells) - lawful)

    print("exhaustive search:", result["exhaustive"], "| orientations tried:", result["trials_used"])
    print("bad (non two-sided) walls:", result["bad_walls"])
    print("wall_choice:", result["wall_choice"])
    print(f"lawful cells: {len(lawful)}/{len(all_cells)}")
    if unlawful:
        print(f"  UNLAWFUL cells (discarded): {unlawful}")
    else:
        print("  all cells lawful")
    print("link condition holds everywhere:", result["link_ok"])
    if not result["link_ok"]:
        print("  failing vertices:", sorted(result["failing_vertices"]))
    return unlawful


# ------------------------------------------------------------------
# Full pipeline demo: wall_finder.py -> lawful_subcomplex.py
# Uses wall_finder.py's own example (square + hexagon-ish polygon).
# ------------------------------------------------------------------
if __name__ == "__main__":
    from wall_finder import compute_abstract_walls, print_walls

    edges = {
        0: (0, 1),
        1: (1, 2),
        2: (2, 3),
        3: (3, 0),
        4: (0, 4),
        5: (4, 5),
        6: (5, 6),
        7: (6, 7),
        8: (7, 1),
    }
    polygons = [
        [0, 1, 2, 3],
        [0, 4, 5, 6, 7, 8],
    ]

    walls = compute_abstract_walls(edges, polygons)
    print_walls(walls)
    print()

    complex_ = from_wall_finder_format(edges, polygons, walls)
    result = search_orientation(complex_, max_trials=2000, seed=1)
    report(result, complex_)