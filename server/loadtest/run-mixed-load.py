#!/usr/bin/env python3
"""Run both API arrival-rate scenarios concurrently on the isolated local stack."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import zipfile


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("individual_load", HERE / "run-individual-load.py")
shared = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(shared)


def monitor(backend_id):
    exposition = shared.command(["docker", "exec", backend_id, "curl", "-fsS", "--max-time", "10",
                                  "http://127.0.0.1:8080/actuator/prometheus"], timeout=15)
    hikari = [line for line in exposition.splitlines() if line.startswith("hikaricp_")]
    activity = shared.command(shared.COMPOSE + [
        "exec", "-T", "postgres", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
        "-U", "loadtest", "-d", "jumin_loadtest", "-c", """
        SELECT json_build_object(
          'sampled_at', clock_timestamp(), 'connections', count(*),
          'active', count(*) FILTER (WHERE state='active'),
          'idle', count(*) FILTER (WHERE state='idle'),
          'idle_in_transaction', count(*) FILTER (WHERE state='idle in transaction'),
          'lock_waiting', count(*) FILTER (WHERE wait_event_type='Lock'),
          'active_waiting', count(*) FILTER (WHERE state='active' AND wait_event IS NOT NULL))
        FROM pg_stat_activity
        WHERE datname=current_database() AND application_name='PostgreSQL JDBC Driver'
          AND backend_type='client backend' AND pid <> pg_backend_pid();
        """], timeout=15)
    return {"hikari_metrics": hikari, "db_activity": json.loads(activity)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    parser.add_argument("--variant", required=True, choices=["before", "after"])
    parser.add_argument("--image-manifest", required=True, type=Path)
    parser.add_argument("--entry-at", required=True)
    parser.add_argument("--exit-at", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]*", args.label):
        parser.error("Invalid results label")
    manifest = json.loads(args.image_manifest.read_text())
    folder = shared.RESULTS / args.label
    folder.mkdir(parents=True, exist_ok=False)
    phase = folder / "mixed"
    phase.mkdir()
    target_image = manifest["base_image_id" if args.variant == "before" else "image_id"]
    expected = manifest[f"{args.variant}_entry_sha256"]
    original_image = shared.command(["docker", "inspect", shared.container_id("backend"), "--format", "{{.Image}}"])
    backup_tag = f"jumin-backend:loadtest-backup-{args.label}"
    shared.command(["docker", "image", "tag", original_image, backup_tag])
    scripts = ["parking-api-load.js", "parking-apis.js", "api-baseline.js", "run-individual-load.py", "run-mixed-load.py"]
    metadata = {
        "started_at_kst": shared.now(), "variant": args.variant, "scenario": "concurrent-mixed",
        "backend_image_id": target_image, "code_ref": manifest["code_ref"],
        "image_manifest_sha256": hashlib.sha256(args.image_manifest.read_bytes()).hexdigest(),
        "duration": "10m", "warmup_requests_per_api": 10, "warmup_order": ["viewport", "recommendation"],
        "warmup_think_time_seconds": 2, "preallocated_vus_per_api": 5, "max_vus_per_api": 8,
        "request_timeout_seconds": 60, "graceful_stop_seconds": 65,
        "inputs": {"latitude": 37.49795, "longitude": 127.02756,
                   "bbox": [127.0200, 37.4920, 127.0350, 37.5040],
                   "entry_at": args.entry_at, "exit_at": args.exit_at},
        "load_rps": {"viewport": 0.70, "recommendation": 0.05},
        "provisional_thresholds": {"viewport_p95_ms": 300, "recommendation_p95_ms": 2000,
                                   "observed_failure_rate_less_than": 0.01, "dropped_iterations": 0},
        "memory_guard": "working_set=current-inactive_file; stop at >=90% for 3 five-second samples or new OOM kill",
        "cache_preparation": "Restart PostgreSQL; recreate Backend and Nginx; 10 viewport then 10 recommendation warmup requests; OS page cache retained.",
        "monitoring": "Every 5s: Docker/cgroup/host load, direct Backend Prometheus scrape filtered to Hikari, one pg_stat_activity query. Same observer on both versions; observer CPU included; monitoring HTTP excluded from k6 and business SQL counts. Sampled gauges can miss short waits.",
        "db_schema_note": "Same V1-V10 and existing mapping retained; query-only variants do not change write hooks.",
        "restore_image_id": original_image, "restore_image_tag": backup_tag,
        "script_sha256": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in scripts},
    }
    def save(name, value):
        (folder / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    save("metadata.json", metadata)
    shutil.copyfile(args.image_manifest, folder / "image-manifest.json")
    (folder / "scripts").mkdir()
    for name in scripts:
        shutil.copyfile(HERE / name, folder / "scripts" / name)
    (folder / "host-start.txt").write_text(shared.command(["uptime"]) + "\n" + shared.command(["memory_pressure", "-Q"]) + "\n")
    original_sample = shared.sample
    def observed_sample(stage, elapsed, backend_id, postgres_id):
        value = original_sample(stage, elapsed, backend_id, postgres_id)
        try:
            value["connection_monitor"] = monitor(backend_id)
        except Exception as error:
            value["connection_monitor_error"] = str(error)
        return value
    shared.sample = observed_sample
    env = dict(os.environ, LOADTEST_APP_COMMIT_SHA=f"mixed-{args.variant}-{manifest['code_ref'][:16]}")
    try:
        print(f"[{shared.now()}] Preparing concurrent mixed {args.variant}", flush=True)
        shared.command(["docker", "image", "tag", target_image, "jumin-backend:loadtest"])
        shared.command(shared.COMPOSE + ["stop", "nginx", "backend"], env=env)
        shared.command(shared.COMPOSE + ["restart", "postgres"], env=env)
        shared.command(shared.COMPOSE + ["up", "-d", "--no-build", "--force-recreate", "--wait", "backend", "nginx"], env=env)
        backend_id, postgres_id = shared.container_id("backend"), shared.container_id("postgres")
        if shared.command(["docker", "inspect", backend_id, "--format", "{{.Image}}"] ) != target_image:
            raise RuntimeError("Wrong running image")
        with tempfile.TemporaryDirectory(prefix="jumin-mixed-verify-") as temporary:
            jar = Path(temporary) / "app.jar"
            shared.command(["docker", "cp", f"{backend_id}:/app/app.jar", str(jar)])
            with zipfile.ZipFile(jar) as archive:
                actual = {info.filename: hashlib.sha256(archive.read(info)).hexdigest() for info in archive.infolist()}
            if actual != expected:
                raise RuntimeError("Running JAR entries differ from the experiment manifest")
            save("verified-jar-entries.json", actual)
        (folder / "db-config.csv").write_text(shared.sql(
            "SELECT name,setting,unit FROM pg_settings WHERE name IN "
            "('jit','shared_buffers','work_mem','effective_cache_size','max_connections','track_io_timing','statement_timeout');"
            "SELECT version(); SELECT extname,extversion FROM pg_extension ORDER BY extname;"
            "SELECT installed_rank,version,description,success FROM flyway_schema_history ORDER BY installed_rank;"
            "SELECT row_to_json(walking_network_metadata) FROM walking_network_metadata; SELECT count(*) AS parking_lots FROM parking_lots;") + "\n")
        common = ["--env", "LOADTEST_ENV=local", "--env", "LOADTEST_BASE_URL=http://nginx",
                  "--env", "DESTINATION_LATITUDE=37.49795", "--env", "DESTINATION_LONGITUDE=127.02756",
                  "--env", f"ENTRY_AT={args.entry_at}", "--env", f"EXIT_AT={args.exit_at}"]
        for endpoint, api in [("viewport", "parking_viewport"), ("recommendation", "parking_search")]:
            warmup = folder / f"warmup-{endpoint}"
            warmup.mkdir()
            name = f"jumin-loadtest-{args.label}-{endpoint}-warmup"
            result = shared.run_k6(warmup, "warmup", name, shared.COMPOSE + [
                "run", "--rm", "--no-deps", "--name", name, "k6", "run"] + common + [
                "--env", f"API_NAME={api}", "--env", "BASELINE_MODE=warmup", "--env", "BASELINE_ITERATIONS=10",
                "--env", "THINK_TIME_SECONDS=2", f"--summary-export=/results/{args.label}/warmup-{endpoint}/summary.json",
                "/scripts/api-baseline.js"], backend_id, postgres_id)
            if result["exit_code"] != 0 or result["safety_stop_reason"]:
                raise RuntimeError(f"Warmup failed: {endpoint}")
        shared.sql("SELECT pg_stat_statements_reset();")
        shared.snapshot(phase, "before")
        save("connections-before.json", monitor(backend_id))
        name = f"jumin-loadtest-{args.label}-mixed-measure"
        result = shared.run_k6(phase, "measure", name, shared.COMPOSE + [
            "run", "--rm", "--no-deps", "--name", name, "-v",
            f"{HERE / 'parking-api-load.js'}:/scripts/parking-api-load.js:ro", "k6", "run"] + common + [
            "--env", "LOAD_PROFILE=both", "--env", "VIEWPORT_RPS=0.7", "--env", "RECOMMENDATION_RPS=0.05",
            "--env", "DURATION=10m", "--env", "PRE_ALLOCATED_VUS=5", "--env", "MAX_VUS=8",
            "--env", "VIEWPORT_PATTERN=fixed", "--env", "VIEWPORT_P95_MS=300",
            "--env", "RECOMMENDATION_P95_MS=2000", "--env", "FAILURE_RATE_LIMIT=0.01",
            f"--summary-export=/results/{args.label}/mixed/summary.json",
            f"--out=json=/results/{args.label}/mixed/requests.jsonl", "/scripts/parking-api-load.js"], backend_id, postgres_id)
        metadata["measurement"] = result
        shared.snapshot(phase, "after")
        save("connections-after.json", monitor(backend_id))
        full = shared.command(shared.COMPOSE + ["exec", "-T", "postgres", "psql", "-X", "-qAt", "-U", "loadtest", "-d", "jumin_loadtest", "-c",
            "SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM (SELECT * FROM pg_stat_statements WHERE query NOT ILIKE '%pg_stat_statements%' ORDER BY total_exec_time DESC) s;"])
        (phase / "after.statements.full.json").write_text(full + "\n")
        (phase / "backend.log").write_text(shared.command(shared.COMPOSE + ["logs", "--no-color", "backend"]))
        (phase / "postgres.log").write_text(shared.command(shared.COMPOSE + ["logs", "--no-color", "--tail", "100", "postgres"]))
        print(f"[{shared.now()}] Completed mixed {args.variant}: {json.dumps(result)}", flush=True)
        if result["exit_code"] in (0, 99) and not result["safety_stop_reason"]:
            for endpoint in ["viewport", "recommendation"]:
                (folder / endpoint).mkdir()
            shared.capture_viewport_accuracy(folder / "viewport")
            shared.capture_accuracy(folder / "recommendation", args.entry_at, args.exit_at)
    finally:
        print(f"[{shared.now()}] Restoring original local Backend", flush=True)
        shared.command(["docker", "image", "tag", original_image, "jumin-backend:loadtest"])
        restore_env = dict(os.environ)
        restore_env.pop("LOADTEST_APP_COMMIT_SHA", None)
        shared.command(shared.COMPOSE + ["up", "-d", "--no-build", "--force-recreate", "--wait", "backend", "nginx"], env=restore_env)
        metadata["ended_at_kst"] = shared.now()
        metadata["restored_backend_image_id"] = shared.command(["docker", "inspect", shared.container_id("backend"), "--format", "{{.Image}}"])
        save("metadata.json", metadata)
        (folder / "host-end.txt").write_text(shared.command(["uptime"]) + "\n" + shared.command(["memory_pressure", "-Q"]) + "\n")
    print(f"[{shared.now()}] Results saved to {folder}", flush=True)


if __name__ == "__main__":
    main()
