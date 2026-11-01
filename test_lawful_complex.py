"""Tests for lawful_complex.py: link vertices, the lawful subcomplex, one-sided walls.

  python -m pytest test_lawful_complex.py
"""
import lawful_complex
from lawful_complex import TwoComplex, search_orientation


def plus(*edges):
    return [(e, 1) for e in edges]


def test_dangling_edge_end_is_a_link_vertex():
    # Square A has vertex 0 as its minimum (both ends ascending, joined by A's corner);
    # square B has vertex 0 as its maximum (both ends descending, joined by B's corner);
    # edge 8 dangles from 0, going up.  The ascending link of 0 is then A's corner
    # plus an isolated vertex: disconnected, so 0 must fail.
    edges = {0: (0, 1), 1: (1, 2), 2: (2, 3), 3: (3, 0),
             4: (0, 5), 5: (5, 6), 6: (6, 7), 7: (7, 0), 8: (0, 8)}
    cells = {"A": plus(0, 1, 2, 3), "B": plus(4, 5, 6, 7)}
    walls = {"a": [0, 2], "b": [1, 3], "c": [4, 6], "d": [5, 7], "e": [8]}
    complex_ = TwoComplex(edges, cells, walls)
    edge_dir = {0: 1, 1: 1, 2: -1, 3: -1, 4: -1, 5: -1, 6: 1, 7: 1, 8: 1}
    ok, failing = complex_.link_condition_holds(edge_dir)
    assert not ok and 0 in failing


def hexagon_and_square():
    # Hexagon with heights 0,1,0,1,2,1 around it: 4 direction changes, so unlawful;
    # vertex 0 is its minimum, and its corner is what joins 0's two ascending ends.
    # A square with 0 as its maximum supplies a connected descending side.
    edges = {0: (0, 1), 1: (1, 2), 2: (2, 3), 3: (3, 4), 4: (4, 5), 5: (5, 0),
             6: (0, 6), 7: (6, 7), 8: (7, 8), 9: (8, 0)}
    cells = {"H": plus(0, 1, 2, 3, 4, 5), "S": plus(6, 7, 8, 9)}
    walls = {"h0": [0, 3], "h1": [1, 4], "h2": [2, 5], "s0": [6, 8], "s1": [7, 9]}
    edge_dir = {0: 1, 1: -1, 2: 1, 3: 1, 4: -1, 5: -1, 6: -1, 7: -1, 8: 1, 9: 1}
    return TwoComplex(edges, cells, walls), edge_dir


def test_links_are_taken_in_the_lawful_subcomplex():
    complex_, edge_dir = hexagon_and_square()
    assert "H" not in complex_.lawful_cells(edge_dir)
    ok_full, failing_full = complex_.link_condition_holds(edge_dir)
    ok_lawful, failing_lawful = complex_.link_condition_holds(edge_dir, lawful_only=True)
    assert 0 not in failing_full
    assert 0 in failing_lawful


def test_evaluate_uses_the_lawful_subcomplex(monkeypatch):
    seen = {}
    original = TwoComplex.link_condition_holds

    def spy(self, edge_dir, lawful_only=False, cell_ids=None):
        seen["lawful_only"] = lawful_only
        return original(self, edge_dir, lawful_only=lawful_only, cell_ids=cell_ids)

    monkeypatch.setattr(TwoComplex, "link_condition_holds", spy)
    complex_, _ = hexagon_and_square()
    ref_sign, _ = complex_.build_wall_reference()
    lawful_complex._evaluate(complex_, complex_.random_wall_choice(), ref_sign)
    assert seen["lawful_only"] is True


def test_one_sided_wall_never_reports_link_ok():
    # A square whose two opposite sides are the same edge traversed the same way:
    # the wall through that edge is one-sided.
    edges = {0: (0, 1), 1: (1, 0), 2: (1, 0)}
    cells = {"M": [(0, 1), (1, 1), (0, 1), (2, 1)]}
    walls = {"w": [0], "v": [1, 2]}
    complex_ = TwoComplex(edges, cells, walls)
    _, bad = complex_.build_wall_reference()
    assert bad == {"w"}
    result = search_orientation(complex_, seed=0)
    assert result["link_ok"] is False
