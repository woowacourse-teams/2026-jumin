#!/usr/bin/env python3
"""Resolve the newest dated South Korea PBF listed by Geofabrik."""

from datetime import datetime
from html.parser import HTMLParser
import json
import re
import sys
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


INDEX_URL = "https://download.geofabrik.de/index-v1-nogeom.json"
DOWNLOAD_PAGE = "https://download.geofabrik.de/asia/south-korea.html"
DOWNLOAD_HOST = "download.geofabrik.de"
REQUEST_TIMEOUT_SECONDS = 30
REQUEST_ATTEMPTS = 3
PBF_FILENAME = re.compile(r"south-korea-(\d{6})\.osm\.pbf")


class SnapshotLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.dates = set()

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return

        href = dict(attrs).get("href", "")
        link = urlsplit(href)
        if link.scheme and link.scheme != "https":
            return
        if link.netloc and link.hostname != DOWNLOAD_HOST:
            return

        match = PBF_FILENAME.fullmatch(link.path.rsplit("/", 1)[-1])
        if not match:
            return

        snapshot_date = match.group(1)
        try:
            datetime.strptime("20" + snapshot_date, "%Y%m%d")
        except ValueError:
            return
        self.dates.add(snapshot_date)


def request_with_retries(url, method="GET"):
    request = Request(
        url,
        method=method,
        headers={"User-Agent": "2026-jumin-osm-snapshot-resolver/1.0"},
    )
    last_error = None
    for attempt in range(1, REQUEST_ATTEMPTS + 1):
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                final_url = urlsplit(response.geturl())
                if final_url.scheme != "https" or final_url.hostname != DOWNLOAD_HOST:
                    raise RuntimeError("Geofabrik redirected the request to an unexpected host.")
                if response.status != 200:
                    raise RuntimeError("Geofabrik returned HTTP {}.".format(response.status))
                return response.geturl(), response.headers, response.read()
        except (OSError, URLError, TimeoutError) as error:
            last_error = error
            if attempt == REQUEST_ATTEMPTS:
                break
            delay_seconds = 2 ** (attempt - 1)
            print(
                "Geofabrik request failed ({}/{}): {}. Retrying in {}s.".format(
                    attempt, REQUEST_ATTEMPTS, error, delay_seconds
                ),
                file=sys.stderr,
            )
            time.sleep(delay_seconds)

    raise RuntimeError(
        "Geofabrik request failed after {} attempts: {}".format(REQUEST_ATTEMPTS, last_error)
    )


def parse_snapshot_date(url):
    parsed_url = urlsplit(url)
    if parsed_url.scheme != "https" or parsed_url.hostname != DOWNLOAD_HOST:
        raise RuntimeError("Geofabrik returned a PBF URL on an unexpected host.")

    match = PBF_FILENAME.fullmatch(parsed_url.path.rsplit("/", 1)[-1])
    if not match:
        raise RuntimeError("Geofabrik did not resolve the latest PBF URL to a dated snapshot.")

    snapshot_date = match.group(1)
    try:
        datetime.strptime("20" + snapshot_date, "%Y%m%d")
    except ValueError as error:
        raise RuntimeError("Geofabrik returned an invalid snapshot date.") from error
    return snapshot_date


def resolve_from_machine_readable_index():
    _, _, body = request_with_retries(INDEX_URL)
    index = json.loads(body)
    south_korea = [
        feature
        for feature in index.get("features", [])
        if feature.get("properties", {}).get("id") == "south-korea"
    ]
    if len(south_korea) != 1:
        raise RuntimeError("Geofabrik index did not contain exactly one South Korea entry.")

    pbf_url = south_korea[0].get("properties", {}).get("urls", {}).get("pbf")
    if not pbf_url:
        raise RuntimeError("Geofabrik index did not provide the South Korea PBF URL.")

    final_url, _, _ = request_with_retries(pbf_url, method="HEAD")
    return parse_snapshot_date(final_url)


def resolve_from_download_page():
    final_url, headers, body = request_with_retries(DOWNLOAD_PAGE)
    page_url = urlsplit(final_url)
    if page_url.scheme != "https" or page_url.hostname != DOWNLOAD_HOST:
        raise RuntimeError("Geofabrik redirected the download page to an unexpected host.")
    encoding = headers.get_content_charset() or "utf-8"
    page = body.decode(encoding)

    links = SnapshotLinks()
    links.feed(page)
    if not links.dates:
        raise RuntimeError("No dated South Korea PBF files were found on the Geofabrik page.")

    return max(links.dates, key=lambda value: (int(value[:2]), value[2:]))


def resolve_latest_snapshot_date():
    index_error = None
    try:
        return resolve_from_machine_readable_index()
    except (OSError, UnicodeError, URLError, RuntimeError, ValueError, KeyError) as error:
        index_error = error
        print(
            "Geofabrik machine-readable index lookup failed: {}. Falling back to the download page.".format(
                index_error
            ),
            file=sys.stderr,
        )

    try:
        return resolve_from_download_page()
    except (OSError, UnicodeError, URLError, RuntimeError, ValueError) as page_error:
        raise RuntimeError(
            "Machine-readable index and download page lookups both failed. Index: {}; page: {}".format(
                index_error, page_error
            )
        ) from page_error


if __name__ == "__main__":
    try:
        print(resolve_latest_snapshot_date())
    except (OSError, UnicodeError, URLError, RuntimeError) as error:
        print("Could not resolve the latest Geofabrik snapshot: {}".format(error), file=sys.stderr)
        raise SystemExit(1)
