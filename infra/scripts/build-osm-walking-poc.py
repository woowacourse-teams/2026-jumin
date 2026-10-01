#!/usr/bin/env python3
"""Export and validate full OSM snapshots for the walking-network importer."""

import argparse
import json
from pathlib import Path
import shutil
import sqlite3
import sys

from osm_walking_poc.ingest import export_network, validate_export


def main(argv=None):
    parser = argparse.ArgumentParser(description="OSM walking CSV exporter")
    commands = parser.add_subparsers(dest="command", required=True)
    export_parser = commands.add_parser("export", help="convert a full OSM snapshot to CSV")
    export_parser.add_argument("--input", type=Path, required=True)
    export_parser.add_argument("--output", type=Path, required=True, help="new output directory")
    export_parser.add_argument("--source-url", help="source information; no HTTP requests")
    validate_parser = commands.add_parser("validate", help="validate CSV files and manifest")
    validate_parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "export":
            if not args.input.is_file():
                raise ValueError("input file does not exist")
            output = args.output.absolute()
            output.parent.mkdir(parents=True, exist_ok=True)
            output.mkdir()  # Only clean up the directory owned by this invocation.
            try:
                report = export_network(args.input, output, args.source_url)
            except BaseException:
                shutil.rmtree(output)
                raise
            print(json.dumps(dict(output=str(output), **{key: report[key] for key in ("scope", "node_count", "edge_count")}), ensure_ascii=False, indent=2))
        else:
            print(json.dumps(validate_export(args.directory), ensure_ascii=False))
        return 0
    except (OSError, ValueError, RuntimeError, sqlite3.Error, ImportError) as error:
        print("OSM walking graph failed: {}".format(error), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
