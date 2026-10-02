#!/usr/bin/env python3
"""Resolve the newest dated South Korea PBF listed by Geofabrik."""

from datetime import datetime
from html.parser import HTMLParser
import re
import sys
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


DOWNLOAD_PAGE = "https://download.geofabrik.de/asia/south-korea.html"
DOWNLOAD_HOST = "download.geofabrik.de"
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


def resolve_latest_snapshot_date():
    request = Request(
        DOWNLOAD_PAGE,
        headers={"User-Agent": "2026-jumin-osm-snapshot-resolver/1.0"},
    )
    with urlopen(request, timeout=30) as response:
        final_url = urlsplit(response.geturl())
        if final_url.scheme != "https" or final_url.hostname != DOWNLOAD_HOST:
            raise RuntimeError("Geofabrik redirected the download page to an unexpected host.")
        if response.status != 200:
            raise RuntimeError("Geofabrik download page returned HTTP {}.".format(response.status))
        encoding = response.headers.get_content_charset() or "utf-8"
        page = response.read().decode(encoding)

    links = SnapshotLinks()
    links.feed(page)
    if not links.dates:
        raise RuntimeError("No dated South Korea PBF files were found on the Geofabrik page.")

    return max(links.dates, key=lambda value: (int(value[:2]), value[2:]))


if __name__ == "__main__":
    try:
        print(resolve_latest_snapshot_date())
    except (OSError, UnicodeError, URLError, RuntimeError) as error:
        print("Could not resolve the latest Geofabrik snapshot: {}".format(error), file=sys.stderr)
        raise SystemExit(1)
