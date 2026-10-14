#!/usr/bin/env python3
"""Run selected individual Load tests on the isolated local Compose stack."""

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ["docker", "compose", "--file", str(ROOT / "infra/docker-compose.loadtest.yml")]
KST = ZoneInfo("Asia/Seoul")
RESULTS = ROOT / "server/loadtest/results"


def now():
    return datetime.now(KST).isoformat()


def command(args, *, env=None, timeout=180):
    return subprocess.run(args, cwd=ROOT, env=env, text=True, capture_output=True,
                          check=True, timeout=timeout).stdout.strip()


def sql(query):
    return command(COMPOSE + ["exec", "-T", "postgres", "psql", "-X", "-U", "loadtest",
                              "-d", "jumin_loadtest", "--csv", "-c", query])


def container_id(service):
    return command(COMPOSE + ["ps", "-q", service])


def snapshot(folder, prefix):
    queries = {
        "activity": "SELECT now() AS sampled_at, state, wait_event_type, count(*) "
                    "FROM pg_stat_activity WHERE datname=current_database() "
                    "GROUP BY state,wait_event_type ORDER BY state;",
        "database": "SELECT now() AS sampled_at, datname, xact_commit, blks_read, blks_hit, "
                    "tup_returned, tup_fetched FROM pg_stat_database "
                    "WHERE datname=current_database();",
        "statements": "SELECT now() AS sampled_at, queryid, calls, total_exec_time, "
                      "mean_exec_time, rows, shared_blks_hit, shared_blks_read, query "
                      "FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 50;",
    }
    for name, query in queries.items():
        (folder / f"{prefix}.{name}.csv").write_text(sql(query) + "\n")


def cgroup(cid):
    output = command(["docker", "exec", cid, "cat", "/sys/fs/cgroup/memory.current",
                      "/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory.events",
                      "/sys/fs/cgroup/memory.stat"], timeout=15).splitlines()
    data = {"current_bytes": int(output[0]), "max_bytes": int(output[1])}
    for line in output[2:]:
        key, value = line.split()
        data[key] = int(value)
    data["working_set_bytes"] = data["current_bytes"] - data.get("inactive_file", 0)
    return data


def sample(stage, elapsed, backend_id, postgres_id):
    output = command(["docker", "stats", "--no-stream", "--format", "json",
                      backend_id, postgres_id], timeout=20)
    return {
        "sampled_at_kst": now(), "stage": stage, "elapsed_seconds": round(elapsed, 2),
        "host_load_average": os.getloadavg(),
        "docker": [json.loads(line) for line in output.splitlines() if line],
        "backend_cgroup": cgroup(backend_id), "postgres_cgroup": cgroup(postgres_id),
    }


def run_k6(folder, phase, name, args, backend_id, postgres_id):
    started = time.monotonic()
    last_progress = -60
    high_memory_samples = 0
    stop_reason = None
    stop_at = None
    with (folder / f"{phase}.k6.log").open("x") as log, \
            (folder / f"{phase}.resources.jsonl").open("x") as resources:
        process = subprocess.Popen(args, cwd=ROOT, text=True, stdout=log, stderr=subprocess.STDOUT)
        initial_db_oom = cgroup(postgres_id).get("oom_kill", 0)
        initial_backend_oom = cgroup(backend_id).get("oom_kill", 0)
        try:
            while process.poll() is None:
                tick = time.monotonic()
                elapsed = tick - started
                resource = sample(phase, elapsed, backend_id, postgres_id)
                resources.write(json.dumps(resource, separators=(",", ":")) + "\n")
                resources.flush()
                db = resource["postgres_cgroup"]
                backend = resource["backend_cgroup"]
                fraction = db["working_set_bytes"] / db["max_bytes"]
                high_memory_samples = high_memory_samples + 1 if fraction >= 0.90 else 0
                if db.get("oom_kill", 0) > initial_db_oom:
                    stop_reason = "postgres_oom_kill"
                elif backend.get("oom_kill", 0) > initial_backend_oom:
                    stop_reason = "backend_oom_kill"
                elif high_memory_samples >= 3:
                    stop_reason = "postgres_working_set_at_least_90_percent_for_3_samples"
                if stop_reason and stop_at is None:
                    stop_at = time.monotonic()
                    print(f"[{now()}] SAFETY STOP {name}: {stop_reason}", flush=True)
                    subprocess.run(["docker", "kill", "--signal", "SIGINT", name],
                                   capture_output=True, text=True, timeout=20)
                if stop_at is not None and time.monotonic() - stop_at > 75:
                    subprocess.run(["docker", "stop", "--time", "5", name],
                                   capture_output=True, text=True, timeout=15)
                    process.terminate()
                if elapsed - last_progress >= 60:
                    print(f"[{now()}] {folder.name}/{phase}: {elapsed:.0f}s, "
                          f"DB working set {db['working_set_bytes']/2**20:.1f} MiB, "
                          f"raw {db['current_bytes']/2**20:.1f} MiB", flush=True)
                    last_progress = elapsed
                time.sleep(max(0, 5 - (time.monotonic() - tick)))
            exit_code = process.wait(timeout=15)
        finally:
            if process.poll() is None:
                subprocess.run(["docker", "kill", "--signal", "SIGINT", name],
                               capture_output=True, timeout=20)
                process.wait(timeout=80)
    result = {"ended_at_kst": now(), "elapsed_seconds": time.monotonic() - started,
              "exit_code": exit_code, "safety_stop_reason": stop_reason}
    (folder / f"{phase}.execution.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def capture_accuracy(folder, entry_at, exit_at):
    accuracy = folder / "accuracy"
    accuracy.mkdir()
    records = []
    for name, latitude, longitude in [
        ("gangnam", 37.49795, 127.02756),
        ("gwanghwamun", 37.5710168, 126.9779848),
        ("seoul-forest", 37.5433175, 127.0332118),
    ]:
        parameters = {"destinationLatitude": latitude, "destinationLongitude": longitude,
                      "entryAt": entry_at, "exitAt": exit_at}
        with urlopen("http://127.0.0.1:8081/api/parking/search?" + urlencode(parameters), timeout=60) as response:
            body = json.loads(response.read())
            status = response.status
        if status != 200 or not isinstance(body.get("parkingLots"), list):
            raise RuntimeError(f"Accuracy request failed: {name}")
        (accuracy / f"{name}.json").write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n")
        records.append({"name": name, "parameters": parameters, "status": status,
                        "total_count": body.get("totalCount"), "captured_at_kst": now()})
    (accuracy / "metadata.json").write_text(json.dumps({
        "included_in_load_metrics": False, "timing": "After measurement and DB snapshots", "requests": records,
    }, ensure_ascii=False, indent=2) + "\n")


def capture_viewport_accuracy(folder):
    accuracy = folder / "accuracy"
    accuracy.mkdir()
    fixed = {"westLongitude": 127.0200, "southLatitude": 37.4920,
             "eastLongitude": 127.0350, "northLatitude": 37.5040}
    cases = [("fixed", fixed)]
    for index in range(16):
        dx = (index % 4 - 1.5) * 0.001
        dy = (index // 4 - 1.5) * 0.001
        cases.append((f"grid-{index:02}", {
            key: value + (dx if "Longitude" in key else dy) for key, value in fixed.items()
        }))
    records = []
    for name, parameters in cases:
        with urlopen("http://127.0.0.1:8081/api/parking/viewport?" + urlencode(parameters), timeout=60) as response:
            body = json.loads(response.read())
            status = response.status
        if status != 200 or not isinstance(body.get("parkingLots"), list):
            raise RuntimeError(f"Viewport response comparison request failed: {name}")
        (accuracy / f"{name}.json").write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n")
        records.append({"name": name, "parameters": parameters, "status": status,
                        "total_count": body.get("totalCount"), "captured_at_kst": now()})
    (accuracy / "metadata.json").write_text(json.dumps({
        "included_in_load_metrics": False, "timing": "After measurement and DB snapshots", "requests": records,
    }, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    parser.add_argument("--backend-image", required=True)
    parser.add_argument("--code-ref", required=True)
    parser.add_argument("--entry-at", required=True)
    parser.add_argument("--exit-at", required=True)
    parser.add_argument("--endpoint", choices=["both", "viewport", "recommendation"], default="both")
    parser.add_argument("--variant", default="pre-improvement")
    parser.add_argument("--walking-sql-file", type=Path,
                        help="Expected SQL resource for a variant built from the code reference")
    parser.add_argument("--viewport-repository-class-file", type=Path,
                        help="Expected viewport Repository class bytes for runtime verification")
    parser.add_argument("--capture-accuracy", action="store_true",
                        help="Save separate selected-endpoint responses after measurement")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]*", args.label):
        parser.error("label must contain only letters, digits, dot, underscore, or hyphen")

    destination = RESULTS / args.label
    destination.mkdir(parents=True, exist_ok=False)
    original_image = command(["docker", "inspect", container_id("backend"), "--format", "{{.Image}}"])
    target_image = command(["docker", "image", "inspect", args.backend_image, "--format", "{{.Id}}"])
    backup_tag = f"jumin-backend:loadtest-backup-{args.label}"
    command(["docker", "image", "tag", original_image, backup_tag])
    full_ref = command(["git", "rev-parse", args.code_ref])
    expected_sql = (args.walking_sql_file.read_bytes() if args.walking_sql_file else
                    subprocess.check_output(["git", "show", f"{full_ref}:server/src/main/resources/sql/walking/find-distances.sql"], cwd=ROOT))
    expected_viewport_class = (args.viewport_repository_class_file.read_bytes()
                               if args.viewport_repository_class_file else None)
    uses_mapping = b"parking_lot_walking_nodes" in expected_sql
    env = dict(os.environ, LOADTEST_APP_COMMIT_SHA=f"{args.variant}-{full_ref[:16]}")
    metadata = {
        "started_at_kst": now(), "backend_image": args.backend_image,
        "backend_image_id": target_image, "code_ref": full_ref,
        "variant": args.variant, "endpoint_selection": args.endpoint,
        "walking_sql_override": str(args.walking_sql_file.resolve()) if args.walking_sql_file else None,
        "expected_walking_sql_sha256": hashlib.sha256(expected_sql).hexdigest(),
        "uses_precomputed_mapping": uses_mapping,
        "expected_viewport_repository_sha256": (hashlib.sha256(expected_viewport_class).hexdigest()
                                                if expected_viewport_class is not None else None),
        "capture_accuracy_after_measurement": args.capture_accuracy,
        "restore_image_id": original_image, "restore_image_tag": backup_tag,
        "duration": "10m", "warmup_requests": 10,
        "warmup_think_time_seconds": 2, "preallocated_vus": 5, "max_vus": 8,
        "request_timeout_seconds": 60, "graceful_stop_seconds": 65,
        "inputs": {"latitude": 37.49795, "longitude": 127.02756,
                   "bbox": [127.0200, 37.4920, 127.0350, 37.5040],
                   "entry_at": args.entry_at, "exit_at": args.exit_at},
        "load_rps": {"viewport": 0.70, "recommendation": 0.05},
        "provisional_thresholds": {"viewport_p95_ms": 300, "recommendation_p95_ms": 2000,
                                   "observed_failure_rate_less_than": 0.01, "dropped_iterations": 0},
        "memory_guard": "working_set=current-inactive_file; stop at >=90% for 3 five-second samples or new OOM kill",
        "db_schema_note": "V1-V12 remain applied. Mapping usage is recorded separately for each SQL variant.",
        "cache_preparation": "Restart PostgreSQL, recreate Backend and Nginx, then 10 endpoint warmup requests. Host OS page cache is not cleared.",
    }
    metadata["script_sha256"] = {
        name: hashlib.sha256((ROOT / "server/loadtest" / name).read_bytes()).hexdigest()
        for name in ["parking-api-load.js", "parking-apis.js", "api-baseline.js", "run-individual-load.py"]
    }
    (destination / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    (destination / "expected-find-distances.sql").write_bytes(expected_sql)
    if expected_viewport_class is not None:
        (destination / "expected-ParkingLotRepository.class").write_bytes(expected_viewport_class)
    scripts = destination / "scripts"
    scripts.mkdir()
    for name in metadata["script_sha256"]:
        shutil.copyfile(ROOT / "server/loadtest" / name, scripts / name)
    (destination / "host-start.txt").write_text(command(["uptime"]) + "\n" + command(["memory_pressure", "-Q"]) + "\n")
    (destination / "db-config.csv").write_text(sql(
        "SELECT name,setting,unit FROM pg_settings WHERE name IN "
        "('jit','shared_buffers','work_mem','effective_cache_size','max_connections','track_io_timing','statement_timeout');"
        " SELECT version(); SELECT extname,extversion FROM pg_extension ORDER BY extname;"
        " SELECT installed_rank,version,description,success FROM flyway_schema_history ORDER BY installed_rank;"
        " SELECT row_to_json(walking_network_metadata) FROM walking_network_metadata;"
        " SELECT COUNT(*) AS parking_lots FROM parking_lots;"
    ) + "\n")
    outcomes = {}
    try:
        command(["docker", "image", "tag", target_image, "jumin-backend:loadtest"])
        for endpoint, api_name in [("viewport", "parking_viewport"), ("recommendation", "parking_search")]:
            if args.endpoint not in ("both", endpoint):
                continue
            folder = destination / endpoint
            folder.mkdir()
            print(f"[{now()}] Preparing {args.variant} {endpoint}", flush=True)
            command(COMPOSE + ["stop", "nginx", "backend"], env=env)
            command(COMPOSE + ["restart", "postgres"], env=env)
            command(COMPOSE + ["up", "-d", "--no-build", "--force-recreate", "--wait", "backend", "nginx"], env=env)
            backend_id, postgres_id = container_id("backend"), container_id("postgres")
            if command(["docker", "inspect", backend_id, "--format", "{{.Image}}"] ) != target_image:
                raise RuntimeError("Running Backend does not match the requested image")
            with tempfile.TemporaryDirectory(prefix="jumin-load-verify-") as temporary:
                jar = Path(temporary) / "app.jar"
                command(["docker", "cp", f"{backend_id}:/app/app.jar", str(jar)])
                with zipfile.ZipFile(jar) as archive:
                    actual_sql = archive.read("BOOT-INF/classes/sql/walking/find-distances.sql")
                    if expected_viewport_class is not None:
                        actual_class = archive.read("BOOT-INF/classes/jumin/domain/parking/repository/ParkingLotRepository.class")
                        if actual_class != expected_viewport_class:
                            raise RuntimeError("Image viewport Repository differs from the expected class")
                        (folder / "verified-viewport-repository.sha256").write_text(
                            hashlib.sha256(actual_class).hexdigest() + "\n")
                if actual_sql != expected_sql:
                    raise RuntimeError("Image walking SQL differs from the expected SQL variant")
                (folder / "verified-walking-sql.sha256").write_text(hashlib.sha256(actual_sql).hexdigest() + "\n")
            common_env = ["--env", "LOADTEST_ENV=local", "--env", "LOADTEST_BASE_URL=http://nginx",
                          "--env", "DESTINATION_LATITUDE=37.49795", "--env", "DESTINATION_LONGITUDE=127.02756",
                          "--env", f"ENTRY_AT={args.entry_at}", "--env", f"EXIT_AT={args.exit_at}"]
            relative = folder.relative_to(RESULTS)
            name = f"jumin-loadtest-{args.label}-{endpoint}-warmup"
            warmup = COMPOSE + ["run", "--rm", "--no-deps", "--name", name, "k6", "run"] + common_env + [
                "--env", f"API_NAME={api_name}", "--env", "BASELINE_MODE=warmup",
                "--env", "BASELINE_ITERATIONS=10", "--env", "THINK_TIME_SECONDS=2",
                f"--summary-export=/results/{relative}/warmup.json", "/scripts/api-baseline.js"]
            result = run_k6(folder, "warmup", name, warmup, backend_id, postgres_id)
            if result["exit_code"] != 0 or result["safety_stop_reason"]:
                outcomes[endpoint] = {"warmup": result, "measurement": "not_started"}
                break
            sql("SELECT pg_stat_statements_reset();")
            snapshot(folder, "before")
            name = f"jumin-loadtest-{args.label}-{endpoint}-measure"
            measure = COMPOSE + ["run", "--rm", "--no-deps", "--name", name,
                "-v", f"{ROOT / 'server/loadtest/parking-api-load.js'}:/scripts/parking-api-load.js:ro",
                "k6", "run"] + common_env + [
                "--env", f"LOAD_PROFILE={endpoint}", "--env", "VIEWPORT_RPS=0.7",
                "--env", "RECOMMENDATION_RPS=0.05", "--env", "DURATION=10m",
                "--env", "PRE_ALLOCATED_VUS=5", "--env", "MAX_VUS=8",
                "--env", "VIEWPORT_PATTERN=fixed", "--env", "VIEWPORT_P95_MS=300",
                "--env", "RECOMMENDATION_P95_MS=2000", "--env", "FAILURE_RATE_LIMIT=0.01",
                f"--summary-export=/results/{relative}/summary.json",
                f"--out=json=/results/{relative}/requests.jsonl", "/scripts/parking-api-load.js"]
            result = run_k6(folder, "measure", name, measure, backend_id, postgres_id)
            snapshot(folder, "after")
            (folder / "after.walking-statements.full.json").write_text(command(COMPOSE + [
                "exec", "-T", "postgres", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                "-U", "loadtest", "-d", "jumin_loadtest", "-c",
                "SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM "
                "(SELECT * FROM pg_stat_statements WHERE query ILIKE '%pgr_dijkstraCost%' "
                "AND query NOT ILIKE '%pg_stat_statements%' ORDER BY total_exec_time DESC) s;"
            ]) + "\n")
            (folder / "backend.log").write_text(command(COMPOSE + ["logs", "--no-color", "backend"]))
            (folder / "postgres.log").write_text(command(COMPOSE + ["logs", "--no-color", "--tail", "100", "postgres"]))
            outcomes[endpoint] = {"measurement": result}
            print(f"[{now()}] Completed {endpoint}: {json.dumps(result)}", flush=True)
            if result["safety_stop_reason"] or result["exit_code"] not in (0, 99):
                break
            if endpoint == "recommendation" and args.capture_accuracy:
                capture_accuracy(folder, args.entry_at, args.exit_at)
            elif endpoint == "viewport" and args.capture_accuracy:
                capture_viewport_accuracy(folder)
    finally:
        print(f"[{now()}] Restoring the original local Backend image", flush=True)
        command(["docker", "image", "tag", original_image, "jumin-backend:loadtest"])
        restore_env = dict(os.environ)
        restore_env.pop("LOADTEST_APP_COMMIT_SHA", None)
        command(COMPOSE + ["up", "-d", "--no-build", "--force-recreate", "--wait", "backend", "nginx"], env=restore_env)
        metadata["ended_at_kst"] = now()
        metadata["outcomes"] = outcomes
        metadata["restored_backend_image_id"] = command(["docker", "inspect", container_id("backend"), "--format", "{{.Image}}"])
        (destination / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
        (destination / "host-end.txt").write_text(command(["uptime"]) + "\n" + command(["memory_pressure", "-Q"]) + "\n")
    print(f"[{now()}] Results saved to {destination}", flush=True)


if __name__ == "__main__":
    main()
