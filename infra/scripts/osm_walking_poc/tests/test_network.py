"""Functional export checks and end-to-end import checks in a disposable DB."""

import csv
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
import xml.etree.ElementTree as ET

SCRIPTS = Path(__file__).resolve().parents[2]
REPO = SCRIPTS.parents[1]
sys.path.insert(0, str(SCRIPTS))
from osm_walking_poc.ingest import digest, validate_export
from osm_walking_poc.policy import node_verdict, way_verdict


def snapshot(path):
    root = ET.Element('osm', version='0.6', generator='test')
    for i in range(1, 13):
        node = ET.SubElement(root, 'node', id=str(i), lon=str(127 + (i - 1) * .001), lat='37')
        if i == 10:
            ET.SubElement(node, 'tag', k='barrier', v='gate')
            ET.SubElement(node, 'tag', k='locked', v='yes')
    roads = [
        (101, [1, 2, 3], {'highway': 'residential'}),
        (102, [3, 4], {'highway': 'steps', 'foot': 'designated', 'wheelchair': 'no', 'smoothness': 'impassable', 'oneway:bicycle:conditional': 'yes @ (Mo-Fr)'}),
        (103, [4, 5], {'highway': 'service', 'access': 'private'}),
        (104, [5, 6], {'highway': 'service', 'access': 'customers'}),
        (105, [7, 8], {'highway': 'footway', 'oneway:foot': '-1'}),
        (106, [9, 10, 11], {'highway': 'footway'}),
        (107, [11, 12], {'highway': 'trunk'}),
    ]
    for way_id, refs, tags in roads:
        way = ET.SubElement(root, 'way', id=str(way_id))
        for ref in refs:
            ET.SubElement(way, 'nd', ref=str(ref))
        for key, value in tags.items():
            ET.SubElement(way, 'tag', k=key, v=value)
    ET.ElementTree(root).write(path, encoding='utf-8', xml_declaration=True)


def export(path, output, *extra):
    return subprocess.run([sys.executable, str(SCRIPTS / 'build-osm-walking-poc.py'),
                           'export', '--input', str(path), '--output', str(output), *extra],
                          capture_output=True, text=True)


class ExportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.input = self.directory / 'test.osm'
        self.output = self.directory / 'graph'
        snapshot(self.input)

    def test_full_export_access_and_direction(self):
        result = export(self.input, self.output)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = validate_export(self.output)
        self.assertEqual((report['scope'], report['node_count'], report['edge_count']), ('full', 6, 4))
        with (self.output / 'edges.csv').open() as stream:
            edges = list(csv.DictReader(stream))
        self.assertEqual([int(e['way_id']) for e in edges], [101, 101, 102, 105])
        self.assertEqual((edges[-1]['source'], edges[-1]['target'], edges[-1]['reverse_cost']), ('8', '7', '-1'))
        self.assertEqual(report['segment_skip_counts']['blocked_node'], 2)

    def test_regional_manifest_is_rejected(self):
        result = export(self.input, self.output)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest_path = self.output / 'summary.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['scope'] = 'regional'
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'full-snapshot'):
            validate_export(self.output)

    def test_checksum_rejects_modified_csv(self):
        self.assertEqual(export(self.input, self.output).returncode, 0)
        with (self.output / 'nodes.csv').open('a') as stream:
            stream.write('999,127,37\n')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            validate_export(self.output)

    def test_missing_references_clean_up_owned_output(self):
        self.input.write_text('<osm version="0.6"><way id="1"><nd ref="999"/><nd ref="998"/><tag k="highway" v="footway"/></way></osm>')
        self.assertNotEqual(export(self.input, self.output).returncode, 0)
        self.assertFalse(self.output.exists())

    def test_existing_output_is_preserved(self):
        self.output.mkdir()
        sentinel = self.output / 'keep'
        sentinel.write_text('keep')
        self.assertNotEqual(export(self.input, self.output).returncode, 0)
        self.assertEqual(sentinel.read_text(), 'keep')

    def test_linear_barriers_layers_and_shared_public_gate(self):
        for mode, expected_edges in [('wall', 3), ('different_layer', 4), ('shared_gate', 4)]:
            with self.subTest(mode=mode):
                snapshot(self.input)
                tree = ET.parse(self.input)
                root = tree.getroot()
                lon = '127.001' if mode == 'shared_gate' else '127.0005'
                for index, lat in [(13, '36.999'), (14, '37.001')]:
                    root.insert(12, ET.Element('node', id=str(index), lon=lon, lat=lat))
                if mode == 'different_layer':
                    ET.SubElement(root.find("way[@id='101']"), 'tag', k='layer', v='1')
                if mode == 'shared_gate':
                    node = root.find("node[@id='2']")
                    ET.SubElement(node, 'tag', k='barrier', v='gate')
                    ET.SubElement(node, 'tag', k='foot', v='yes')
                barrier = ET.SubElement(root, 'way', id='200')
                for ref in ([13, 2, 14] if mode == 'shared_gate' else [13, 14]):
                    ET.SubElement(barrier, 'nd', ref=str(ref))
                ET.SubElement(barrier, 'tag', k='barrier', v='fence')
                tree.write(self.input, encoding='utf-8')
                output = self.directory / mode
                result = export(self.input, output)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(validate_export(output)['edge_count'], expected_edges)

    def test_pedestrian_turn_restriction_quarantines_member_way(self):
        tree = ET.parse(self.input)
        relation = ET.SubElement(tree.getroot(), 'relation', id='201')
        ET.SubElement(relation, 'member', type='way', ref='101', role='from')
        ET.SubElement(relation, 'tag', k='type', v='restriction:foot')
        ET.SubElement(relation, 'tag', k='restriction', v='no_left_turn')
        tree.write(self.input, encoding='utf-8')
        result = export(self.input, self.output)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(validate_export(self.output)['edge_count'], 2)

    def test_kerb_nodes_preserve_crossings_and_explicit_restrictions(self):
        cases = [
            ({'kerb': 'flush'}, 4),
            ({'kerb': 'lowered'}, 4),
            ({'kerb': 'raised', 'wheelchair': 'no'}, 4),
            ({'access': 'private', 'foot': 'yes'}, 4),
            ({'foot': 'no'}, 2),
            ({'access': 'private'}, 2),
            ({'locked': 'yes', 'foot': 'yes'}, 2),
            ({'foot:conditional': 'no @ (night)'}, 2),
        ]
        for index, (tags, expected_edges) in enumerate(cases):
            with self.subTest(tags=tags):
                snapshot(self.input)
                tree = ET.parse(self.input)
                crossing = tree.getroot().find("way[@id='101']")
                crossing.find("tag[@k='highway']").set('v', 'footway')
                ET.SubElement(crossing, 'tag', k='foot', v='yes')
                ET.SubElement(crossing, 'tag', k='footway', v='crossing')
                node = tree.getroot().find("node[@id='2']")
                for key, value in dict(tags, barrier='kerb').items():
                    ET.SubElement(node, 'tag', k=key, v=value)
                tree.write(self.input, encoding='utf-8')
                output = self.directory / ('kerb-node-' + str(index))
                result = export(self.input, output)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(validate_export(output)['edge_count'], expected_edges)

    def test_linear_kerbs_preserve_walkways_and_explicit_restrictions(self):
        cases = [
            ({}, 4),
            ({'kerb': 'raised', 'wheelchair': 'no'}, 4),
            ({'access': 'private', 'foot': 'yes'}, 4),
            ({'foot': 'no'}, 3),
            ({'access': 'private'}, 3),
            ({'locked': 'yes', 'foot': 'yes'}, 3),
            ({'access:conditional': 'no @ (night)'}, 3),
        ]
        for index, (tags, expected_edges) in enumerate(cases):
            with self.subTest(tags=tags):
                snapshot(self.input)
                tree = ET.parse(self.input)
                root = tree.getroot()
                for node_id, lat in [(13, '36.999'), (14, '37.001')]:
                    root.insert(12, ET.Element('node', id=str(node_id), lon='127.0005', lat=lat))
                kerb = ET.SubElement(root, 'way', id='200')
                for ref in [13, 14]:
                    ET.SubElement(kerb, 'nd', ref=str(ref))
                for key, value in dict(tags, barrier='kerb').items():
                    ET.SubElement(kerb, 'tag', k=key, v=value)
                tree.write(self.input, encoding='utf-8')
                output = self.directory / ('kerb-way-' + str(index))
                result = export(self.input, output)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(validate_export(output)['edge_count'], expected_edges)

    def test_policy_for_ordinary_pedestrians(self):
        cases = [
            ({'highway': 'steps', 'wheelchair': 'no'}, 'public'),
            ({'highway': 'steps', 'foot': 'designated', 'smoothness': 'impassable', 'wheelchair': 'no'}, 'public'),
            ({'highway': 'path', 'foot': 'designated', 'smoothness': 'impassable'}, 'public'),
            ({'highway': 'track', 'smoothness': 'impassable'}, 'public'),
            ({'highway': 'path', 'smoothness': 'impassable', 'foot': 'no'}, 'excluded'),
            ({'highway': 'path', 'smoothness': 'impassable', 'status': 'impassable'}, 'excluded'),
            ({'highway': 'residential', 'access': 'private', 'foot': 'yes'}, 'public'),
            ({'highway': 'path', 'foot:conditional': 'no @ (night)'}, 'review'),
            ({'highway': 'motorway', 'foot': 'yes'}, 'review'),
            ({'highway': 'path', 'sac_scale': 'mountain_hiking'}, 'excluded'),
            ({'highway': 'service', 'access': 'customers'}, 'restricted'),
        ]
        for tags, status in cases:
            with self.subTest(tags=tags):
                self.assertEqual(way_verdict(tags).status, status)
        self.assertEqual(node_verdict({'barrier': 'gate', 'locked': 'yes', 'foot': 'yes'}).status, 'excluded')


class ImportE2ETest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        cls.directory = Path(cls.temp.name)
        cls.compose = cls.directory / 'compose.yml'
        cls.project = 'jumin-osm-test-' + uuid.uuid4().hex
        cls.compose.write_text('name: ' + cls.project + '''
services:
  postgres:
    image: pgrouting/pgrouting:18-3.6-3.8
    platform: linux/amd64
    network_mode: none
    environment:
      POSTGRES_USER: osmtest
      POSTGRES_PASSWORD: disposable-test-only
      POSTGRES_DB: osmtest
''')
        cls.docker = ['docker', 'compose', '-p', cls.project, '-f', str(cls.compose)]
        cls.addClassCleanup(lambda: subprocess.run(cls.docker + ['down', '--volumes'], capture_output=True))
        subprocess.run(cls.docker + ['up', '-d'], check=True, capture_output=True)
        for _ in range(60):
            ready = subprocess.run(cls.docker + ['exec', '-T', 'postgres', 'pg_isready', '-h', '127.0.0.1', '-U', 'osmtest'], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('disposable PostgreSQL did not start')
        cls.sql('CREATE EXTENSION IF NOT EXISTS postgis;')
        migrations = REPO / 'server/src/main/resources/db/migration'
        for name in ['V6__create_walking_network_tables.sql', 'V7__enable_pgrouting.sql']:
            cls.sql((migrations / name).read_text())
        cls.sql('CREATE TABLE parking_lots(id BIGINT PRIMARY KEY, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION); INSERT INTO parking_lots VALUES(1,37,127.002),(2,37,127.005),(3,37,127.007),(4,37,127.006);')
        cls.input = cls.directory / 'test.osm'
        cls.graph = cls.directory / 'graph'
        snapshot(cls.input)
        tree = ET.parse(cls.input)
        node = tree.getroot().find("node[@id='2']")
        ET.SubElement(node, 'tag', k='barrier', v='kerb')
        ET.SubElement(node, 'tag', k='kerb', v='flush')
        for node_id, lat in [(13, '36.999'), (14, '37.001')]:
            tree.getroot().insert(12, ET.Element('node', id=str(node_id), lon='127.0005', lat=lat))
        kerb = ET.SubElement(tree.getroot(), 'way', id='200')
        for ref in [13, 14]:
            ET.SubElement(kerb, 'nd', ref=str(ref))
        ET.SubElement(kerb, 'tag', k='barrier', v='kerb')
        tree.write(cls.input, encoding='utf-8')
        result = export(cls.input, cls.graph)
        if result.returncode:
            raise RuntimeError(result.stderr)
        cls.env = dict(os.environ, DB_TARGET='docker', COMPOSE_FILE=str(cls.compose), COMPOSE_PROJECT_NAME=cls.project, DB_SERVICE='postgres', DB_NAME='osmtest', DB_USERNAME='osmtest', OSM_PYTHON=sys.executable, OSM_GRAPH_DIR=str(cls.graph))

    @classmethod
    def sql(cls, query):
        result = subprocess.run(cls.docker + ['exec', '-T', 'postgres', 'psql', '-XAt', '-U', 'osmtest', '-d', 'osmtest', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout.strip()

    def import_graph(self, graph=None):
        env = dict(self.env)
        env['OSM_GRAPH_DIR'] = str(graph or self.graph)
        return subprocess.run(['bash', str(SCRIPTS / 'import-osm-walking-network.sh')], env=env, text=True, capture_output=True)

    def setUp(self):
        result = self.import_graph()
        self.assertEqual(result.returncode, 0, result.stderr)

    def find_distances(self, longitude, parking_ids):
        query = (REPO / 'server/src/main/resources/sql/walking/find-distances.sql').read_text()
        params = {'longitude': str(longitude), 'latitude': '37', 'maxSnapDistanceMeters': '0', 'graphSearchRadiusMeters': '800', 'parkingLotIds': parking_ids}
        for key, value in params.items():
            query = query.replace(':' + key, value)
        return self.sql(query)

    def test_existing_schema_readiness_and_current_distance_query(self):
        self.assertEqual(self.sql("SELECT source,node_count,edge_count FROM walking_network_metadata"), 'OSM|6|4')
        self.assertEqual(self.sql("SELECT COUNT(*) FROM walking_nodes WHERE source = 'OSM'"), '6')
        self.assertEqual(self.sql("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('walking_edges','walking_network_metadata') AND column_name IN ('osm_way_id','osm_segment_index','source_metadata')"), '0')
        sql_dir = REPO / 'server/src/main/resources/sql/walking'
        self.assertEqual(self.sql((sql_dir / 'has-usable-network.sql').read_text()), 't')
        self.assertEqual(self.find_distances(127, '1,2'), '1|178')
        edge_sql = "SELECT id,source,target,cost,reverse_cost FROM walking_edges"
        self.assertEqual(self.sql("SELECT count(*) FROM pgr_dijkstraCost('" + edge_sql + "',8,7,true)"), '1')
        self.assertEqual(self.sql("SELECT count(*) FROM pgr_dijkstraCost('" + edge_sql + "',7,8,true)"), '0')

    def test_one_way_route_from_parking_to_destination(self):
        self.assertEqual(self.find_distances(127.006, '3'), '3|89')
        self.assertEqual(self.find_distances(127.007, '4'), '')
        self.assertEqual(self.find_distances(127.006, '4'), '4|0')

    def test_insert_failure_rolls_back_existing_network(self):
        before = self.sql('SELECT imported_at FROM walking_network_metadata')
        self.sql("CREATE FUNCTION reject_edge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced test failure'; END $$; CREATE TRIGGER reject_edge BEFORE INSERT ON walking_edges FOR EACH ROW EXECUTE FUNCTION reject_edge();")
        try:
            result = self.import_graph()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('forced test failure', result.stderr)
            self.assertEqual(self.sql('SELECT imported_at FROM walking_network_metadata'), before)
            self.assertEqual(self.sql('SELECT count(*) FROM walking_edges'), '4')
        finally:
            self.sql('DROP TRIGGER reject_edge ON walking_edges; DROP FUNCTION reject_edge();')

    def test_invalid_geometry_references_preserve_network(self):
        graph = self.directory / 'bad-geometry'
        shutil.copytree(self.graph, graph)
        edges = graph / 'edges.csv'
        edges.write_text(edges.read_text().replace('LINESTRING(127.0 37.0,127.001 37.0)', 'LINESTRING(126.0 37.0,127.001 37.0)'))
        manifest = json.loads((graph / 'summary.json').read_text())
        manifest['files']['edges.csv']['sha256'] = digest(edges)
        (graph / 'summary.json').write_text(json.dumps(manifest))
        result = self.import_graph(graph)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('Invalid OSM graph references', result.stderr)
        self.assertEqual(self.sql('SELECT count(*) FROM walking_edges'), '4')

    def test_regional_import_is_rejected(self):
        graph = self.directory / 'regional'
        shutil.copytree(self.graph, graph)
        manifest_path = graph / 'summary.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['scope'] = 'regional'
        manifest_path.write_text(json.dumps(manifest))
        self.assertNotEqual(self.import_graph(graph).returncode, 0)
        self.assertEqual(self.sql('SELECT source FROM walking_network_metadata'), 'OSM')
        self.assertEqual(self.sql('SELECT count(*) FROM walking_edges'), '4')


if __name__ == '__main__':
    unittest.main()
