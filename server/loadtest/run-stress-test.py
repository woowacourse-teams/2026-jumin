#!/usr/bin/env python3
"""Explore final two-API capacity, confirm a boundary, and observe recovery locally."""

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
import time
import zipfile

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("mixed_load", HERE / "run-mixed-load.py")
mixed = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mixed)
shared = mixed.shared
SPEC = importlib.util.spec_from_file_location("mixed_comparison", HERE / "compare-mixed-load.py")
comparison = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(comparison)


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def cpu_stat(cid):
    return dict((key, int(value)) for key, value in (
        line.split() for line in shared.command(
            ["docker", "exec", cid, "cat", "/sys/fs/cgroup/cpu.stat"], timeout=15).splitlines()))


def generator_memory(cid):
    lines = shared.command(["docker", "exec", cid, "cat", "/sys/fs/cgroup/memory.current",
                            "/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory.stat"], timeout=15).splitlines()
    values = dict((key, int(value)) for key, value in (line.split() for line in lines[2:]))
    current = int(lines[0])
    return {"current_bytes": current, "max_bytes": None if lines[1] == "max" else int(lines[1]),
            "working_set_bytes": current - values.get("inactive_file", 0)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    parser.add_argument("--image-manifest", type=Path, required=True)
    parser.add_argument("--entry-at", required=True)
    parser.add_argument("--exit-at", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]*", args.label):
        parser.error("Invalid result label")
    manifest = json.loads(args.image_manifest.read_text())
    folder = shared.RESULTS / args.label
    folder.mkdir(parents=True, exist_ok=False)
    target_image = manifest["image_id"]
    original_image = shared.command(["docker", "inspect", shared.container_id("backend"), "--format", "{{.Image}}"])
    backup_tag = f"jumin-backend:loadtest-backup-{args.label}"
    shared.command(["docker", "image", "tag", original_image, backup_tag])
    scripts = ["parking-api-stress.js", "parking-api-load.js", "parking-apis.js", "api-baseline.js",
               "run-stress-test.py", "run-mixed-load.py", "run-individual-load.py", "compare-mixed-load.py"]
    rates = [1.4, 2.8, 5.6, 11.2, 22.4, 44.8, 89.6, 179.2, 324.0]
    metadata = {
        "started_at_kst": shared.now(), "scenario": "final-two-api-stress",
        "backend_image_id": target_image, "code_ref": manifest["code_ref"],
        "image_manifest_sha256": hashlib.sha256(args.image_manifest.read_bytes()).hexdigest(),
        "restore_image_id": original_image,
        "inputs": {"latitude": 37.49795, "longitude": 127.02756,
                   "bbox": [127.0200, 37.4920, 127.0350, 37.5040],
                   "entry_at": args.entry_at, "exit_at": args.exit_at},
        "plan": {
            "load_rps": {"viewport": 0.70, "recommendation": 0.05},
            "exploration_viewport_rps": rates, "intended_viewport_to_recommendation_ratio": 14,
            "effective_rates": "ceil(requested_rps*60)/60, recorded per step",
            "exploration_duration_seconds": 120, "confirmation_duration_seconds": 600,
            "recovery_duration_seconds": 600,
            "reason": "Start at 2x observed-peak Load, double while far from a boundary; cap viewport at the script's existing 324 RPS guard. These are exploratory rates, not demand forecasts.",
            "boundary_rule": "On first valid scout failure, repeat same rate for 10m. Unresolved drops or a safety stop invalidate any stage and cannot confirm a capacity boundary. Continue only if confirmation passes. Confirm the preceding passing rate for 10m after a valid failed boundary confirmation. If ceiling passes, confirm ceiling for 10m. Then baseline Load for 10m without server restart.",
            "worker_rule": "Per API pre=max(8,ceil(rate*max(floor,3*previous p99 seconds))); floor=0.5s viewport,2s recommendation. max=3*pre. Retry dropped iterations once at 2x worker budget (cap 2000 per API); retain both attempts. An unresolved drop invalidates capacity inference.",
            "stage_gaps": "Separate k6 processes; requests drain and DB/connection snapshots are saved between steps. Backend and DB remain running. Gaps recorded; not a continuous ramp or a soak test.",
        },
        "provisional_thresholds": {"viewport_p95_ms": 300, "recommendation_p95_ms": 2000,
                                   "observed_failure_rate_less_than": 0.01, "dropped_iterations": 0},
        "memory_guard": "DB working set >=90% for 3 five-second samples or new Backend/DB OOM kill",
        "monitoring": "5s Docker/cgroup/host, Hikari and JDBC DB activity; cgroup CPU counters and k6 CPU/memory added. Sampled gauges may miss short queues. Observer resource use included.",
        "cache_preparation": "One initial PostgreSQL restart and Backend/Nginx recreation, then viewport10 + recommendation10 warmup with 2s think time and separate pre-Stress response capture (viewport17 + recommendation3); no server restart between stages or before recovery. OS page cache retained.",
        "response_comparison": {"baseline": "response-baseline", "timing": "After warmup, before the first scout, versus after recovery", "included_in_load_metrics": False},
        "db_schema_note": "Same V1-V12, nationwide OSM and all parking CSV rows; no new DDL/data changes. Query-only experimental image; write hooks and boundary contract remain separate regression work.",
        "script_sha256": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in scripts},
    }
    save(folder / "metadata.json", metadata)
    shutil.copyfile(args.image_manifest, folder / "image-manifest.json")
    (folder / "scripts").mkdir()
    for name in scripts:
        shutil.copyfile(HERE / name, folder / "scripts" / name)
    (folder / "host-start.txt").write_text(shared.command(["uptime"]) + "\n" + shared.command(["memory_pressure", "-Q"]) + "\n")
    env = dict(os.environ, LOADTEST_APP_COMMIT_SHA=f"stress-final-{manifest['code_ref'][:16]}")
    stages = []
    active_k6 = None
    initial_sample = shared.sample
    previous_end = None
    budgets = {"viewport": 0.5, "recommendation": 2.0}

    def observed_sample(phase, elapsed, backend_id, postgres_id):
        value = initial_sample(phase, elapsed, backend_id, postgres_id)
        try:
            value["connection_monitor"] = mixed.monitor(backend_id)
            value["cpu_counters"] = {"backend": cpu_stat(backend_id), "postgres": cpu_stat(postgres_id)}
        except Exception as error:
            value["connection_monitor_error"] = str(error)
        if active_k6:
            try:
                value["generator"] = {
                    "stats": json.loads(shared.command(["docker", "stats", "--no-stream", "--format", "json", active_k6], timeout=15)),
                    "cpu": cpu_stat(active_k6), "memory": generator_memory(active_k6),
                }
            except Exception as error:
                value["generator_monitor_error"] = str(error)
        return value
    shared.sample = observed_sample

    common = ["--env", "LOADTEST_ENV=local", "--env", "LOADTEST_BASE_URL=http://nginx",
              "--env", "DESTINATION_LATITUDE=37.49795", "--env", "DESTINATION_LONGITUDE=127.02756",
              "--env", f"ENTRY_AT={args.entry_at}", "--env", f"EXIT_AT={args.exit_at}"]

    def stage(kind, viewport_rps, duration, worker_multiplier=1):
        nonlocal active_k6, previous_end
        index = len(stages) + 1
        label = f"{index:02}-{kind}"
        root = folder / label
        root.mkdir()
        phase = root / "mixed"
        phase.mkdir()
        requested = {"viewport": viewport_rps, "recommendation": viewport_rps / 14}
        effective = {key: math.ceil(value * 60 - 1e-9) / 60 for key, value in requested.items()}
        workers = {key: min(2000, max(8, math.ceil(effective[key] * budgets[key])) * worker_multiplier) for key in requested}
        maximum = {key: min(2000, workers[key] * 3) for key in requested}
        details = {**metadata, "kind": kind, "duration": f"{duration}s", "load_rps": requested,
                   "effective_rps": effective, "preallocated_vus_per_api": workers, "max_vus_per_api": maximum,
                   "request_timeout_seconds": 60, "graceful_stop_seconds": 65,
                   "gap_from_previous_execution_seconds": time.monotonic() - previous_end if previous_end else None}
        save(root / "metadata.json", details)
        shared.sql("SELECT pg_stat_statements_reset();")
        shared.snapshot(phase, "before")
        save(root / "connections-before.json", mixed.monitor(backend_id))
        save(root / "cpu-before.json", {"backend": cpu_stat(backend_id), "postgres": cpu_stat(postgres_id)})
        name = f"jumin-loadtest-{args.label}-{label}"
        active_k6 = name
        details["measurement_started_at_kst"] = shared.now()
        details["gap_from_previous_execution_seconds"] = time.monotonic() - previous_end if previous_end else None
        save(root / "metadata.json", details)
        print(f"[{shared.now()}] START {label}: requested {requested}, effective {effective}, duration={duration}s, pre/max={workers}/{maximum}", flush=True)
        result = shared.run_k6(phase, "measure", name, shared.COMPOSE + [
            "run", "--rm", "--no-deps", "--name", name,
            "-v", f"{HERE / 'parking-api-load.js'}:/scripts/parking-api-load.js:ro",
            "-v", f"{HERE / 'parking-api-stress.js'}:/scripts/parking-api-stress.js:ro", "k6", "run"] + common + [
            "--env", "LOAD_PROFILE=both", "--env", "MAX_TARGET_RPS=324",
            "--env", f"VIEWPORT_RPS={effective['viewport']}", "--env", f"RECOMMENDATION_RPS={effective['recommendation']}",
            "--env", f"DURATION={duration}s", "--env", "VIEWPORT_PATTERN=fixed",
            "--env", "VIEWPORT_P95_MS=300", "--env", "RECOMMENDATION_P95_MS=2000", "--env", "FAILURE_RATE_LIMIT=0.01",
            "--env", f"VIEWPORT_PRE_VUS={workers['viewport']}", "--env", f"VIEWPORT_MAX_VUS={maximum['viewport']}",
            "--env", f"RECOMMENDATION_PRE_VUS={workers['recommendation']}", "--env", f"RECOMMENDATION_MAX_VUS={maximum['recommendation']}",
            f"--summary-export=/results/{args.label}/{label}/mixed/summary.json",
            f"--out=json=/results/{args.label}/{label}/mixed/requests.jsonl", "/scripts/parking-api-stress.js"], backend_id, postgres_id)
        previous_end = time.monotonic()
        active_k6 = None
        shared.snapshot(phase, "after")
        save(root / "connections-after.json", mixed.monitor(backend_id))
        save(root / "cpu-after.json", {"backend": cpu_stat(backend_id), "postgres": cpu_stat(postgres_id)})
        full = shared.command(shared.COMPOSE + ["exec", "-T", "postgres", "psql", "-X", "-qAt", "-U", "loadtest", "-d", "jumin_loadtest", "-c",
            "SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) FROM (SELECT * FROM pg_stat_statements WHERE query NOT ILIKE '%pg_stat_statements%' ORDER BY total_exec_time DESC) s;"])
        (phase / "after.statements.full.json").write_text(full + "\n")
        details["measurement"] = result
        save(root / "metadata.json", details)
        summary = comparison.summarize(root)
        summary["kind"] = kind
        summary["effective_rps"] = effective
        summary["valid_for_capacity_inference"] = not (
            summary["dropped_iterations"] or result["safety_stop_reason"])
        summary["passed"] = result["exit_code"] == 0 and summary["valid_for_capacity_inference"]
        summary["status"] = ("invalid" if not summary["valid_for_capacity_inference"]
                             else "passed" if summary["passed"] else "threshold_failed")
        for key in budgets:
            budgets[key] = max(0.5 if key == "viewport" else 2.0,
                               3 * summary["endpoints"][key]["duration_ms"]["p(99)"] / 1000)
        save(root / "stage-summary.json", summary)
        stages.append(summary)
        save(folder / "stages.json", stages)
        print(f"[{shared.now()}] END {label}: pass={summary['passed']}, p95="
              f"{ {key: round(value['duration_ms']['p(95)'], 2) for key, value in summary['endpoints'].items()} }, "
              f"drops={summary['dropped_iterations']}, stop={result['safety_stop_reason']}", flush=True)
        if result["exit_code"] not in (0, 99) and not result["safety_stop_reason"]:
            raise RuntimeError(f"Unexpected k6 exit: {result}")
        return summary

    def measured(kind, rate, duration):
        result = stage(kind, rate, duration)
        if result["dropped_iterations"] and not result["execution"]["safety_stop_reason"]:
            result = stage(f"{kind}-vu-retry", rate, duration, worker_multiplier=2)
        return result

    try:
        print(f"[{shared.now()}] Preparing final Stress image", flush=True)
        shared.command(["docker", "image", "tag", target_image, "jumin-backend:loadtest"])
        shared.command(shared.COMPOSE + ["stop", "nginx", "backend"], env=env)
        shared.command(shared.COMPOSE + ["restart", "postgres"], env=env)
        shared.command(shared.COMPOSE + ["up", "-d", "--no-build", "--force-recreate", "--wait", "backend", "nginx"], env=env)
        backend_id, postgres_id = shared.container_id("backend"), shared.container_id("postgres")
        assert shared.command(["docker", "inspect", backend_id, "--format", "{{.Image}}"] ) == target_image
        with tempfile.TemporaryDirectory(prefix="jumin-stress-verify-") as temporary:
            jar = Path(temporary) / "app.jar"
            shared.command(["docker", "cp", f"{backend_id}:/app/app.jar", str(jar)])
            with zipfile.ZipFile(jar) as archive:
                actual = {info.filename: hashlib.sha256(archive.read(info)).hexdigest() for info in archive.infolist()}
            assert actual == manifest["after_entry_sha256"], "Runtime JAR does not match manifest"
            save(folder / "verified-jar-entries.json", actual)
        controls = {}
        for service, cid in [("backend", backend_id), ("postgres", postgres_id), ("nginx", shared.container_id("nginx"))]:
            inspection = json.loads(shared.command(["docker", "inspect", cid]))[0]
            controls[service] = {"image": inspection["Image"], "started_at": inspection["State"]["StartedAt"],
                                 "nano_cpus": inspection["HostConfig"]["NanoCpus"], "memory": inspection["HostConfig"]["Memory"]}
        save(folder / "environment-controls.json", controls)
        (folder / "db-config.csv").write_text(shared.sql(
            "SELECT name,setting,unit FROM pg_settings WHERE name IN ('jit','shared_buffers','work_mem','effective_cache_size','max_connections','track_io_timing','statement_timeout');"
            "SELECT version(); SELECT extname,extversion FROM pg_extension ORDER BY extname;"
            "SELECT installed_rank,version,description,success FROM flyway_schema_history ORDER BY installed_rank;"
            "SELECT row_to_json(walking_network_metadata) FROM walking_network_metadata; SELECT count(*) AS parking_lots FROM parking_lots;") + "\n")
        for endpoint, api in [("viewport", "parking_viewport"), ("recommendation", "parking_search")]:
            warmup = folder / f"warmup-{endpoint}"
            warmup.mkdir()
            name = f"jumin-loadtest-{args.label}-{endpoint}-warmup"
            result = shared.run_k6(warmup, "warmup", name, shared.COMPOSE + ["run", "--rm", "--no-deps", "--name", name, "k6", "run"] + common + [
                "--env", f"API_NAME={api}", "--env", "BASELINE_MODE=warmup", "--env", "BASELINE_ITERATIONS=10", "--env", "THINK_TIME_SECONDS=2",
                f"--summary-export=/results/{args.label}/warmup-{endpoint}/summary.json", "/scripts/api-baseline.js"], backend_id, postgres_id)
            if result["exit_code"] != 0 or result["safety_stop_reason"]:
                raise RuntimeError(f"Warmup failed: {endpoint}")
        response_baseline = folder / "response-baseline"
        for endpoint in ["viewport", "recommendation"]:
            (response_baseline / endpoint).mkdir(parents=True)
        shared.capture_viewport_accuracy(response_baseline / "viewport")
        shared.capture_accuracy(response_baseline / "recommendation", args.entry_at, args.exit_at)
        last_pass = None
        for rate in rates:
            scout = measured("scout", rate, 120)
            if not scout["valid_for_capacity_inference"]:
                metadata["escalation_end"] = "scout invalid: safety stop or unresolved iteration drops; capacity not confirmed"
                break
            if not scout["passed"]:
                confirmed = measured("boundary-confirm", rate, 600)
                metadata["boundary_confirmation_status"] = confirmed["status"]
                if not confirmed["valid_for_capacity_inference"]:
                    metadata["escalation_end"] = "boundary confirmation invalid: safety stop or unresolved iteration drops; capacity not confirmed"
                    break
                if not confirmed["passed"]:
                    metadata["first_confirmed_failure_rate"] = confirmed["effective_rps"]
                    metadata["escalation_end"] = "10-minute threshold failure"
                    if last_pass is not None:
                        lower = measured("lower-confirm", last_pass, 600)
                        metadata["lower_confirmation_status"] = lower["status"]
                        metadata["lower_confirmation_passed"] = lower["passed"] if lower["valid_for_capacity_inference"] else None
                        metadata["lower_confirmation_rate"] = lower["effective_rps"]
                    break
                last_pass = rate
            else:
                last_pass = rate
            if rate == rates[-1]:
                ceiling = measured("ceiling-confirm", rate, 600)
                metadata["escalation_end"] = (
                    "configured ceiling reached; not a measured maximum" if ceiling["valid_for_capacity_inference"]
                    else "ceiling confirmation invalid: safety stop or unresolved iteration drops; capacity not confirmed")
                metadata["ceiling_confirmation_status"] = ceiling["status"]
                metadata["ceiling_confirmation_passed"] = ceiling["passed"] if ceiling["valid_for_capacity_inference"] else None
        save(folder / "metadata.json", metadata)
        recovery = measured("recovery", 0.70, 600)
        metadata["recovery_status"] = recovery["status"]
        metadata["recovery_passed"] = recovery["passed"] if recovery["valid_for_capacity_inference"] else None
        save(folder / "pre-restore-state.json", {
            "backend_id": backend_id, "postgres_id": postgres_id,
            "backend_started_at": shared.command(["docker", "inspect", backend_id, "--format", "{{.State.StartedAt}}"]),
            "postgres_started_at": shared.command(["docker", "inspect", postgres_id, "--format", "{{.State.StartedAt}}"]),
            "backend_cgroup": shared.cgroup(backend_id), "postgres_cgroup": shared.cgroup(postgres_id),
            "jit": shared.sql("SHOW jit;"), "connections": mixed.monitor(backend_id),
        })
        for endpoint in ["viewport", "recommendation"]:
            (folder / endpoint).mkdir()
        shared.capture_viewport_accuracy(folder / "viewport")
        shared.capture_accuracy(folder / "recommendation", args.entry_at, args.exit_at)
        save(folder / "response-comparison-before-after-stress.json", comparison.responses(response_baseline, folder))
    except BaseException as error:
        metadata["error"] = repr(error)
        raise
    finally:
        print(f"[{shared.now()}] Restoring original local Backend", flush=True)
        shared.command(["docker", "image", "tag", original_image, "jumin-backend:loadtest"])
        restore_env = dict(os.environ)
        restore_env.pop("LOADTEST_APP_COMMIT_SHA", None)
        shared.command(shared.COMPOSE + ["up", "-d", "--no-build", "--force-recreate", "--wait", "backend", "nginx"], env=restore_env)
        metadata["ended_at_kst"] = shared.now()
        metadata["restored_backend_image_id"] = shared.command(["docker", "inspect", shared.container_id("backend"), "--format", "{{.Image}}"])
        save(folder / "metadata.json", metadata)
        (folder / "host-end.txt").write_text(shared.command(["uptime"]) + "\n" + shared.command(["memory_pressure", "-Q"]) + "\n")
        (folder / "compose-final.txt").write_text(shared.command(shared.COMPOSE + ["ps"]) + "\n")
    print(f"[{shared.now()}] Results saved to {folder}", flush=True)


if __name__ == "__main__":
    main()
