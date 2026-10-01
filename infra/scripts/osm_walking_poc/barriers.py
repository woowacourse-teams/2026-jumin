"""Conservative checks for same-grade crossings of linear OSM barriers."""

from .policy import node_verdict

EPSILON = 1e-10
PASSAGES = frozenset({"gate", "lift_gate", "entrance", "kissing_gate", "stile", "cycle_barrier"})


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def difference(a, b):
    return a[0] - b[0], a[1] - b[1]


def intersection(a, b, c, d):
    """Return (point, overlaps), or None; collinear overlaps are never passages."""
    r, s, offset = difference(b, a), difference(d, c), difference(c, a)
    determinant = cross(r, s)
    if abs(determinant) > EPSILON ** 2:
        t, u = cross(offset, s) / determinant, cross(offset, r) / determinant
        if -EPSILON <= t <= 1 + EPSILON and -EPSILON <= u <= 1 + EPSILON:
            return ((a[0] + t * r[0], a[1] + t * r[1]), False)
        return None
    if abs(cross(offset, r)) > EPSILON ** 2:
        return None
    squared = r[0] ** 2 + r[1] ** 2
    if squared == 0:
        return None
    t0 = (offset[0] * r[0] + offset[1] * r[1]) / squared
    end_offset = difference(d, a)
    t1 = (end_offset[0] * r[0] + end_offset[1] * r[1]) / squared
    left, right = max(0, min(t0, t1)), min(1, max(t0, t1))
    if left > right + EPSILON:
        return None
    return ((a[0] + left * r[0], a[1] + left * r[1]), (right - left) * squared ** 0.5 > EPSILON)


def layer(tags):
    # Indoor floors cannot be safely compared to ground-level linear barriers.
    if "level" in tags:
        return None
    try:
        return int(tags.get("layer", "0"))
    except ValueError:
        return None


class BarrierIndex:
    def __init__(self, connection, ways, nodes, node_verdicts):
        self.connection, self.nodes, self.node_verdicts = connection, nodes, node_verdicts
        self.segments = {}
        connection.execute("CREATE VIRTUAL TABLE barrier_bounds USING rtree(id, min_lon, max_lon, min_lat, max_lat)")
        for way_id, way in sorted(ways.items()):
            barrier = way["tags"].get("barrier")
            if not barrier or barrier in {"no", "bollard", "block"}:
                continue
            # Kerbs allow ordinary walking unless access/closure tags deny it.
            if barrier == "kerb" and node_verdict(way["tags"]).status == "public":
                continue
            for a, b in zip(way["refs"], way["refs"][1:]):
                if a == b:
                    continue
                start, end = self.point(a), self.point(b)
                key = len(self.segments) + 1
                self.segments[key] = (way_id, a, b, layer(way["tags"]))
                connection.execute("INSERT INTO barrier_bounds VALUES(?,?,?,?,?)", (key, min(start[0], end[0]), max(start[0], end[0]), min(start[1], end[1]), max(start[1], end[1])))

    def point(self, node_id):
        return self.nodes[node_id]["lon"], self.nodes[node_id]["lat"]

    def blocking_segment(self, a, b, start, end, tags):
        walking_layer = layer(tags)
        candidates = self.connection.execute("SELECT id FROM barrier_bounds WHERE min_lon <= ? AND max_lon >= ? AND min_lat <= ? AND max_lat >= ?", (max(start[0], end[0]) + EPSILON, min(start[0], end[0]) - EPSILON, max(start[1], end[1]) + EPSILON, min(start[1], end[1]) - EPSILON))
        blocked = set()
        for (key,) in candidates:
            way_id, c, d, barrier_layer = self.segments[key]
            if walking_layer is not None and barrier_layer is not None and walking_layer != barrier_layer:
                continue
            result = intersection(start, end, self.point(c), self.point(d))
            if result is None:
                continue
            point, overlaps = result
            passage = not overlaps and any(
                self.node_verdicts[node_id].status == "public"
                and self.nodes[node_id]["tags"].get("barrier") in PASSAGES
                and abs(self.point(node_id)[0] - point[0]) <= EPSILON
                and abs(self.point(node_id)[1] - point[1]) <= EPSILON
                for node_id in {a, b} & {c, d}
            )
            if not passage:
                blocked.add(way_id)
        return sorted(blocked)
