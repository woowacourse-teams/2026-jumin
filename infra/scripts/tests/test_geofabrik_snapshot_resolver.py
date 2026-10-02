import importlib.util
import json
from email.message import Message
from pathlib import Path
import unittest
from unittest.mock import call, MagicMock, patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "resolve-geofabrik-osm-snapshot.py"
SPEC = importlib.util.spec_from_file_location("geofabrik_snapshot_resolver", SCRIPT_PATH)
resolver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resolver)


class GeofabrikSnapshotResolverTest(unittest.TestCase):
    def test_parse_snapshot_date_from_dated_pbf_url(self):
        # given
        url = "https://download.geofabrik.de/asia/south-korea-260930.osm.pbf"

        # when
        snapshot_date = resolver.parse_snapshot_date(url)

        # then
        self.assertEqual(snapshot_date, "260930")

    def test_parse_snapshot_date_rejects_latest_alias(self):
        # given
        url = "https://download.geofabrik.de/asia/south-korea-latest.osm.pbf"

        # when & then
        with self.assertRaisesRegex(RuntimeError, "dated snapshot"):
            resolver.parse_snapshot_date(url)

    def test_resolve_from_index_uses_dated_redirect_target(self):
        # given
        latest_url = "https://download.geofabrik.de/asia/south-korea-latest.osm.pbf"
        dated_url = "https://download.geofabrik.de/asia/south-korea-260930.osm.pbf"
        index = {
            "features": [
                {
                    "properties": {
                        "id": "south-korea",
                        "urls": {"pbf": latest_url},
                    }
                }
            ]
        }
        responses = [
            (resolver.INDEX_URL, Message(), json.dumps(index).encode("utf-8")),
            (dated_url, Message(), b""),
        ]

        # when
        with patch.object(resolver, "request_with_retries", side_effect=responses) as request:
            snapshot_date = resolver.resolve_from_machine_readable_index()

        # then
        self.assertEqual(snapshot_date, "260930")
        self.assertEqual(
            request.call_args_list,
            [call(resolver.INDEX_URL), call(latest_url, method="HEAD")],
        )

    def test_request_with_retries_recovers_from_timeout(self):
        # given
        response = MagicMock()
        response.__enter__.return_value = response
        response.geturl.return_value = resolver.INDEX_URL
        response.status = 200
        response.headers = Message()
        response.read.return_value = b"index"

        # when
        with patch.object(
            resolver, "urlopen", side_effect=[TimeoutError("read timed out"), response]
        ) as open_url, patch.object(resolver.time, "sleep") as sleep:
            result = resolver.request_with_retries(resolver.INDEX_URL)

        # then
        self.assertEqual(result[2], b"index")
        self.assertEqual(open_url.call_count, 2)
        sleep.assert_called_once_with(1)

    def test_resolve_falls_back_to_download_page(self):
        # given
        page = b"""<a href='/asia/south-korea-260928.osm.pbf'>older</a>
        <a href='/asia/south-korea-260930.osm.pbf'>latest</a>"""
        headers = Message()

        # when
        with patch.object(
            resolver,
            "resolve_from_machine_readable_index",
            side_effect=RuntimeError("index timed out"),
        ), patch.object(
            resolver,
            "request_with_retries",
            return_value=(resolver.DOWNLOAD_PAGE, headers, page),
        ):
            snapshot_date = resolver.resolve_latest_snapshot_date()

        # then
        self.assertEqual(snapshot_date, "260930")


if __name__ == "__main__":
    unittest.main()
