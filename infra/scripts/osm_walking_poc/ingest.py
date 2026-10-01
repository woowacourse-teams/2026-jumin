"""Stream a full OSM snapshot into validated walking-network CSVs."""

import csv
import hashlib
import json
import math
import sqlite3
import sys
import time
import tempfile
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .barriers import BarrierIndex
from .policy import POLICY_VERSION, Verdict, node_verdict, way_verdict


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(path):
    sha = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    value = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371008.8 * 2 * math.asin(min(1.0, math.sqrt(value)))


def export_network(input_path, output, source_url=None):
    """Stream a full snapshot into importer CSVs using a file-backed location cache.

    Only barrier/access evidence stays in Python memory. Road nodes are deduplicated
    on disk; national roads are never collected in a dict.
    """
    import importlib.metadata
    import osmium

    input_path = Path(input_path).resolve(strict=True)
    source_stat = input_path.stat()
    started = time.perf_counter()
    node_tags, barrier_nodes, barrier_ways, quarantined = {}, {}, {}, set()
    counts, reasons, skips = Counter(), Counter(), Counter()
    with osmium.io.Reader(str(input_path)) as reader:
        header = reader.header()
        if header.has_multiple_object_versions:
            raise ValueError("history inputs are unsupported; use a snapshot")
        source_header = {key: header.get(key) for key in ("generator", "osmosis_replication_timestamp", "osmosis_replication_sequence_number", "osmosis_replication_base_url") if header.get(key)}

    with tempfile.TemporaryDirectory(prefix=".working-", dir=str(output)) as working:
        location_map = osmium.index.create_map("sparse_file_array," + str(Path(working) / "locations.idx"))
        locations = osmium.NodeLocationsForWays(location_map)

        class Evidence(osmium.SimpleHandler):
            def node(self, node):
                counts["input_nodes"] += 1
                if not len(node.tags):
                    return
                if any(k in node.tags for k in ("foot", "access", "barrier", "locked")) or any(t.k.endswith(":conditional") and t.k.startswith(("foot:", "access:")) for t in node.tags):
                    node_tags[node.id] = dict(node.tags)

            def way(self, way):
                if "barrier" not in way.tags or way.tags["barrier"] == "no":
                    return
                refs = []
                for node in way.nodes:
                    if not node.location.valid():
                        raise ValueError("missing barrier node location: {}".format(node.ref))
                    refs.append(node.ref)
                    barrier_nodes[node.ref] = {"lon": node.location.lon, "lat": node.location.lat, "tags": node_tags.get(node.ref, {})}
                barrier_ways[way.id] = {"refs": refs, "tags": dict(way.tags)}

            def relation(self, relation):
                tags = dict(relation.tags)
                if tags.get("type") == "restriction:foot" or (tags.get("type") == "restriction" and any(k.startswith("restriction:foot") for k in tags)):
                    quarantined.update(m.ref for m in relation.members if m.type == "w")

        print("pass 1/2: node locations, access and barriers", file=sys.stderr, flush=True)
        with osmium.io.Reader(str(input_path)) as reader:
            osmium.apply(reader, locations, Evidence())
        node_permissions = {key: node_verdict(tags) for key, tags in node_tags.items()}
        barrier_permissions = {key: node_verdict(n["tags"]) for key, n in barrier_nodes.items()}
        connection = sqlite3.connect(str(Path(working) / "nodes.sqlite"))
        try:
            connection.execute("PRAGMA journal_mode=OFF")
            connection.execute("CREATE TABLE used_nodes (id INTEGER PRIMARY KEY, lon REAL NOT NULL, lat REAL NOT NULL)")
            barriers = BarrierIndex(connection, barrier_ways, barrier_nodes, barrier_permissions)
            edge_path, audit_path = output / "edges.csv", output / "excluded-ways.ndjson"
            with edge_path.open("w", encoding="utf-8", newline="") as edge_stream, audit_path.open("w", encoding="utf-8") as audit:
                writer = csv.writer(edge_stream)
                writer.writerow(("id", "source", "target", "cost", "reverse_cost", "way_id", "segment_index", "geometry_wkt"))

                class Roads(osmium.SimpleHandler):
                    def way(self, way):
                        if "highway" not in way.tags:
                            return
                        counts["input_highway_ways"] += 1
                        tags = dict(way.tags)
                        points = []
                        for node in way.nodes:
                            if not node.location.valid():
                                raise ValueError("missing highway node location: {}".format(node.ref))
                            points.append((node.ref, node.location.lon, node.location.lat))
                        counts["selected_highway_ways"] += 1
                        verdict = Verdict("review", "unsupported_foot_turn_restriction") if way.id in quarantined else way_verdict(tags)
                        reasons[verdict.reason] += 1
                        if verdict.status != "public":
                            audit.write(encoded({"way_id": way.id, "tags": tags, "status": verdict.status, "reason": verdict.reason}) + "\n")
                            return
                        for index, (start, end) in enumerate(zip(points, points[1:])):
                            a, b = start[0], end[0]
                            if any(n in node_permissions and node_permissions[n].status != "public" for n in (a, b)):
                                skips["blocked_node"] += 1
                                audit.write(encoded({"way_id": way.id, "segment_index": index, "tags": tags, "reason": "blocked_node", "nodes": [n for n in (a, b) if n in node_permissions and node_permissions[n].status != "public"]}) + "\n")
                                continue
                            length = distance(start[1:], end[1:])
                            if a == b or length <= 0:
                                skips["zero_length"] += 1
                                continue
                            blocked = barriers.blocking_segment(a, b, start[1:], end[1:], tags)
                            if blocked:
                                skips["linear_barrier"] += 1
                                audit.write(encoded({"way_id": way.id, "segment_index": index, "tags": tags, "reason": "linear_barrier", "barrier_way_ids": blocked}) + "\n")
                                continue
                            connection.executemany("INSERT OR IGNORE INTO used_nodes VALUES(?,?,?)", (start, end))
                            if not verdict.forward:
                                a, b, start, end = b, a, end, start
                            reverse = length if verdict.forward and verdict.backward else -1
                            counts["edges"] += 1
                            writer.writerow((counts["edges"], a, b, length, reverse, way.id, index, "LINESTRING({} {},{} {})".format(*start[1:], *end[1:])))
                        if counts["selected_highway_ways"] % 10000 == 0:
                            connection.commit()

                print("pass 2/2: export walking network", file=sys.stderr, flush=True)
                with osmium.io.Reader(str(input_path), osmium.osm.WAY) as reader:
                    osmium.apply(reader, locations, Roads())
            connection.commit()
            node_count = connection.execute("SELECT COUNT(*) FROM used_nodes").fetchone()[0]
            if node_count == 0 or counts["edges"] == 0:
                raise ValueError("no routable edges in this snapshot")
            node_path = output / "nodes.csv"
            with node_path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.writer(stream)
                writer.writerow(("id", "lon", "lat"))
                writer.writerows(connection.execute("SELECT id,lon,lat FROM used_nodes ORDER BY id"))
        finally:
            connection.close()
        del locations, location_map

    source_sha = digest(input_path)
    if (input_path.stat().st_size, input_path.stat().st_mtime_ns) != (source_stat.st_size, source_stat.st_mtime_ns):
        raise ValueError("source file changed while exporting")
    report = {
        "format": "osm-walking-csv-v1", "scope": "full",
        "source": {"path": str(input_path), "url": source_url, "sha256": source_sha, "size_bytes": source_stat.st_size, "header": source_header},
        "policy_version": POLICY_VERSION, "osmium_version": importlib.metadata.version("osmium"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "node_count": node_count, "edge_count": counts["edges"], "counts": dict(counts),
        "way_reason_counts": dict(sorted(reasons.items())), "segment_skip_counts": dict(sorted(skips.items())),
        "files": {name: {"sha256": digest(output / name)} for name in ("nodes.csv", "edges.csv", "excluded-ways.ndjson")},
        "export_seconds": round(time.perf_counter() - started, 3),
        "attribution": "© OpenStreetMap contributors; ODbL 1.0",
        "license_url": "https://www.openstreetmap.org/copyright",
        "limitations": ["Unverified destination/customers and unsupported pedestrian conditions are excluded.", "No facility identity or coordinate snapping is inferred by this exporter."],
    }
    (output / "summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def validate_export(directory):
    """Validate importer inputs without loading national CSVs into memory."""
    directory = Path(directory)
    report = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    if report.get("format") != "osm-walking-csv-v1":
        raise ValueError("use the export command to generate database importer CSVs")
    if report.get("scope") != "full":
        raise ValueError("only full-snapshot graphs can be imported")
    number = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
    line = re.compile(r"LINESTRING\((" + number + r") (" + number + r"),(" + number + r") (" + number + r")\)")
    headers = {"nodes.csv": ["id", "lon", "lat"], "edges.csv": ["id", "source", "target", "cost", "reverse_cost", "way_id", "segment_index", "geometry_wkt"]}
    for filename, expected in headers.items():
        if report.get("files", {}).get(filename, {}).get("sha256") != digest(directory / filename):
            raise ValueError("CSV checksum mismatch: " + filename)
        rows = 0
        with (directory / filename).open(encoding="utf-8", newline="") as stream:
            reader = csv.reader(stream)
            if next(reader, None) != expected:
                raise ValueError("invalid CSV header: " + filename)
            for row in reader:
                if len(row) != len(expected):
                    raise ValueError("invalid CSV row: " + filename)
                if filename == "nodes.csv":
                    ids, values = [int(row[0])], [float(row[1]), float(row[2])]
                    if not (-180 <= values[0] <= 180 and -90 <= values[1] <= 90):
                        raise ValueError("invalid node coordinate")
                else:
                    ids = [int(row[i]) for i in (0, 1, 2, 5)]
                    cost, reverse, segment = float(row[3]), float(row[4]), int(row[6])
                    if not (cost > 0 and (reverse > 0 or reverse == -1) and segment >= 0 and ids[1] != ids[2]):
                        raise ValueError("invalid edge cost/direction")
                    match = line.fullmatch(row[7])
                    if match is None:
                        raise ValueError("invalid edge geometry")
                    values = [cost, reverse] + [float(v) for v in match.groups()]
                    if not (-180 <= values[2] <= 180 and -90 <= values[3] <= 90 and -180 <= values[4] <= 180 and -90 <= values[5] <= 90):
                        raise ValueError("invalid edge coordinate")
                if any(value <= 0 or value > 9223372036854775807 for value in ids) or not all(math.isfinite(v) for v in values):
                    raise ValueError("invalid ID or nonfinite value")
                rows += 1
        expected_count = report.get("node_count" if filename == "nodes.csv" else "edge_count")
        if isinstance(expected_count, bool) or not isinstance(expected_count, int) or expected_count <= 0 or expected_count != rows:
            raise ValueError("CSV row count mismatch: " + filename)
    return report
