#!/usr/bin/env python3
"""Summarize all saved Stress attempts and monitoring counters without sending load."""

import argparse
import hashlib
import json
from pathlib import Path
import statistics


def read(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    stages = read(root / "stages.json")
    metadata = read(root / "metadata.json")
    verification = {
        "runtime_jar_matches_manifest": read(root / "verified-jar-entries.json") == read(root / "image-manifest.json")["after_entry_sha256"],
        "snapshotted_scripts_match": {name: hashlib.sha256((root / "scripts" / name).read_bytes()).hexdigest() == digest
                                     for name, digest in metadata["script_sha256"].items()},
        "restored_original_image": metadata.get("restored_backend_image_id") == metadata["restore_image_id"],
        "stages": [],
    }
    for stage in stages:
        stage["valid_for_capacity_inference"] = not (
            stage["dropped_iterations"] or stage["execution"]["safety_stop_reason"])
        stage["passed"] = stage["passed"] and stage["valid_for_capacity_inference"]
        stage["status"] = ("invalid" if not stage["valid_for_capacity_inference"]
                           else "passed" if stage["passed"] else "threshold_failed")
        stage_root = Path(stage["folder"])
        samples = [json.loads(line) for line in (stage_root / "mixed/measure.resources.jsonl").open()]
        pre, post = read(stage_root / "cpu-before.json"), read(stage_root / "cpu-after.json")
        window_path = stage_root / "cpu-window.json"
        if not window_path.exists():
            window_path.write_text(json.dumps({
                "before_epoch_seconds": (stage_root / "cpu-before.json").stat().st_mtime,
                "after_epoch_seconds": (stage_root / "cpu-after.json").stat().st_mtime,
                "source": "Original local snapshot file timestamps, frozen before copying/archiving. Includes edge collection overhead.",
            }, indent=2) + "\n")
        cpu_window = read(window_path)
        cpu_window_seconds = cpu_window["after_epoch_seconds"] - cpu_window["before_epoch_seconds"]
        stage["cpu_quota"] = {}
        for service in ["backend", "postgres"]:
            delta = {key: post[service][key] - value for key, value in pre[service].items()}
            stage["cpu_quota"][service] = {
                "delta": delta,
                "throttled_period_percent": 100 * delta["nr_throttled"] / delta["nr_periods"] if delta["nr_periods"] else 0,
                "cpu_time_average_percent": 100 * delta["usage_usec"] / (cpu_window_seconds * 1e6),
                "snapshot_window_seconds": cpu_window_seconds,
                "window_source": "Frozen cpu-window.json from original snapshot file timestamps; includes edge collection overhead.",
            }
        stage["docker_cpu_peak_anomaly"] = {
            name: stage[name]["cpu_max_percent"] > 250 for name in ["backend", "postgres"]
        }
        generator = [sample["generator"] for sample in samples if "generator" in sample]
        cpus = [float(sample["stats"]["CPUPerc"].removesuffix("%")) for sample in generator]
        stage["generator"] = {
            "samples": len(generator), "sample_errors": sum("generator_monitor_error" in sample for sample in samples),
            "cpu_mean_percent": statistics.mean(cpus) if cpus else None, "cpu_max_percent": max(cpus) if cpus else None,
            "working_set_max_mib": max(sample["memory"]["working_set_bytes"] for sample in generator) / 2**20 if generator else None,
            "unbounded_container": all(sample["memory"]["max_bytes"] is None for sample in generator),
        }
        metrics = read(stage_root / "mixed/summary.json")["metrics"]
        statements = read(stage_root / "mixed/after.statements.full.json")
        for name, endpoint in stage["endpoints"].items():
            sql = endpoint["sql"]
            raw = next(row for row in statements if row["toplevel"] and row["queryid"] == sql["queryid"])
            sql["stats_since"] = raw.get("stats_since")
            sql["successful_http_requests"] = endpoint["requests"] - endpoint["http_errors"]
            sql["calls_match_successful_http_requests"] = sql["calls"] == sql["successful_http_requests"]
            sql["coverage_note"] = ("SQL count matches successful HTTP count" if sql["calls_match_successful_http_requests"]
                                    else "SQL counters do not cover successful HTTP requests; do not interpret mean as the entire stage. Inspect stats_since and raw snapshots.")
        stage["vus_observed_max"] = metrics.get("vus", {}).get("max")
        log = (stage_root / "mixed/measure.k6.log").read_text()
        stage["insufficient_vu_warning"] = "Insufficient VUs" in log
        stage["monitoring_intervals_seconds"] = [round(b["elapsed_seconds"] - a["elapsed_seconds"], 2)
                                                 for a, b in zip(samples, samples[1:])]
        stage["host_load_1m_max"] = max(sample["host_load_average"][0] for sample in samples)
        intervals = stage["monitoring_intervals_seconds"]
        stage["monitoring_interval_mean_seconds"] = statistics.mean(intervals) if intervals else None
        stage["monitoring_interval_max_seconds"] = max(intervals) if intervals else None
        verification["stages"].append({
            "name": stage_root.name,
            "request_counter_matches_http_points": {name: item["requests"] == item["request_points"]
                                                      for name, item in stage["endpoints"].items()},
            "same_runtime_image": stage["metadata"]["backend_image_id"] == metadata["backend_image_id"],
            "same_inputs": stage["metadata"]["inputs"] == metadata["inputs"],
            "duration_seconds": int(stage["metadata"]["duration"].removesuffix("s")),
            "dropped_iterations": stage["dropped_iterations"],
            "status": stage["status"],
            "valid_for_capacity_inference": stage["valid_for_capacity_inference"],
        })
    state_path = root / "pre-restore-state.json"
    if state_path.exists():
        state, controls = read(state_path), read(root / "environment-controls.json")
        verification["server_not_restarted_before_recovery"] = (
            state["backend_started_at"] == controls["backend"]["started_at"]
            and state["postgres_started_at"] == controls["postgres"]["started_at"])
        verification["oom_kill_counts_at_end"] = {name: state[f"{name}_cgroup"]["oom_kill"] for name in ["backend", "postgres"]}
    (root / "analysis.json").write_text(json.dumps({"metadata": metadata, "stages": stages}, ensure_ascii=False, indent=2) + "\n")
    (root / "verification.json").write_text(json.dumps(verification, ensure_ascii=False, indent=2) + "\n")
    lines = ["# 최종 Stress Test · raw result index", "", "> All attempts retained; short scouts and 10-minute confirmations are separate.", "",
             "| Stage | Seconds | Target viewport / search RPS | Completed viewport / search | p95 viewport / search ms | Failures | Drops | Result |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"]
    for stage in stages:
        vp, rec = stage["endpoints"]["viewport"], stage["endpoints"]["recommendation"]
        lines.append(f"| [{Path(stage['folder']).name}]({Path(stage['folder']).name}/stage-summary.json) | "
                     f"{stage['metadata']['duration'].removesuffix('s')} | {stage['effective_rps']['viewport']:g} / {stage['effective_rps']['recommendation']:g} | "
                     f"{vp['requests']} / {rec['requests']} | {vp['duration_ms']['p(95)']:.2f} / {rec['duration_ms']['p(95)']:.2f} | "
                     f"{vp['failures']} / {rec['failures']} | {stage['dropped_iterations']} | {stage['status']} |")
    lines += ["", "- [Full analysis](analysis.json) · [Verification](verification.json) · [Plan and metadata](metadata.json)",
              "- Each stage: k6 summary, raw request JSONL, resource JSONL, SQL snapshots, connection/CPU counters and execution log.",
              "- 2-minute scouts do not establish sustained capacity. Local shared host and emulated DB limit inference to this experiment.",
              "- invalid: unresolved dropped iterations or a safety stop; excluded from capacity inference. threshold_failed: a valid execution that missed thresholds.",
              "- Runtime JAR and inputs are verified. Write hooks, viewport boundary contract and CI remain separate work.", ""]
    (root / "README.md").write_text("\n".join(lines))
    for stage in stages:
        vp, rec = (stage["endpoints"][name] for name in ["viewport", "recommendation"])
        print(json.dumps({"stage": Path(stage["folder"]).name, "rps": stage["effective_rps"],
                          "p95_ms": [vp["duration_ms"]["p(95)"], rec["duration_ms"]["p(95)"]],
                          "db_cpu": stage["postgres"]["cpu_mean_percent"],
                          "db_throttle_percent": stage["cpu_quota"]["postgres"]["throttled_period_percent"],
                          "pending_max": stage["connections"]["pending_sample_max"],
                          "generator_cpu": stage["generator"]["cpu_mean_percent"],
                          "passed": stage["passed"], "status": stage["status"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
