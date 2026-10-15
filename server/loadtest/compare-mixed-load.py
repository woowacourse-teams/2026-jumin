#!/usr/bin/env python3
"""Compare saved simultaneous two-API Load runs, connections and responses."""

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import statistics


def read(path):
    return json.loads(path.read_text())


def hikari(lines):
    values = {}
    for line in lines:
        name = line.split("{", 1)[0].split()[0]
        values[name] = values.get(name, 0) + float(line.split()[-1])
    return values


def summarize(root):
    phase = root / "mixed"
    metrics = read(phase / "summary.json")["metrics"]
    samples = [json.loads(line) for line in (phase / "measure.resources.jsonl").read_text().splitlines()]
    statements = read(phase / "after.statements.full.json")
    product_sql = {
        "viewport": max((row for row in statements if row["toplevel"] and "st_makeenvelope" in row["query"].lower()
                         and "from parking_lots" in row["query"].lower()), key=lambda row: row["total_exec_time"]),
        "recommendation": max((row for row in statements if row["toplevel"] and "pgr_dijkstracost" in row["query"].lower()),
                              key=lambda row: row["total_exec_time"]),
    }
    windows = {name: [] for name in product_sql}
    for line in (phase / "requests.jsonl").read_text().splitlines():
        row = json.loads(line)
        if row["type"] == "Point" and row["metric"] == "http_req_duration":
            data = row["data"]
            name = data["tags"]["endpoint"]
            end = datetime.fromisoformat(data["time"].replace("Z", "+00:00")).timestamp()
            windows[name].append([end - data["value"] / 1000, end])
    endpoints = {}
    for name, sql in product_sql.items():
        count = metrics[f"{name}_requests"]["count"]
        failures = metrics.get(f"{name}_failures", {}).get("count", 0)
        jit_total = sum(sql[key] for key in ["jit_generation_time", "jit_inlining_time", "jit_optimization_time", "jit_emission_time"])
        endpoints[name] = {
            "requests": count, "actual_rps": metrics[f"{name}_requests"]["rate"],
            "duration_ms": {key: value for key, value in metrics[f"http_req_duration{{endpoint:{name}}}"].items()
                            if key != "thresholds"},
            "failure_rate": metrics[f"{name}_failure_rate"]["value"], "failures": failures,
            **{kind: metrics.get(f"{name}_{kind}", {}).get("count", 0)
               for kind in ["http_errors", "timeouts", "contract_failures", "over_5s"]},
            "zero_failure_one_sided_95_upper": 1 - 0.05**(1 / count) if failures == 0 else None,
            "request_points": len(windows[name]), "first_start_epoch": min(t[0] for t in windows[name]),
            "last_end_epoch": max(t[1] for t in windows[name]),
            "sql": {"queryid": sql["queryid"], "calls": sql["calls"], "mean_exec_time_ms": sql["mean_exec_time"],
                    "total_exec_time_ms": sql["total_exec_time"], "rows": sql["rows"],
                    "shared_blks_hit": sql["shared_blks_hit"], "shared_blks_read": sql["shared_blks_read"],
                    "temp_blks_read": sql["temp_blks_read"], "temp_blks_written": sql["temp_blks_written"],
                    "jit_functions": sql["jit_functions"], "jit_total_ms": jit_total,
                    "jit_mean_ms": jit_total / sql["calls"]},
        }
    def resources(service):
        cpu = [float(next(row["CPUPerc"] for row in sample["docker"]
                          if row["Name"] == f"jumin-loadtest-{service}-1").removesuffix("%")) for sample in samples]
        memory = [row[f"{service}_cgroup"] for row in samples]
        return {"cpu_mean_percent": statistics.mean(cpu), "cpu_max_percent": max(cpu),
                "working_set_max_mib": max(row["working_set_bytes"] for row in memory) / 2**20,
                "raw_max_mib": max(row["current_bytes"] for row in memory) / 2**20,
                "oom_kill_delta": max(row["oom_kill"] for row in memory) - memory[0]["oom_kill"]}
    successful = [row["connection_monitor"] for row in samples if "connection_monitor" in row]
    connection_samples = [hikari(row["hikari_metrics"]) for row in successful]
    pre = hikari(read(root / "connections-before.json")["hikari_metrics"])
    post = hikari(read(root / "connections-after.json")["hikari_metrics"])
    def delta(name):
        return post[name] - pre[name]
    acquire_count = delta("hikaricp_connections_acquire_seconds_count")
    connections = {
        "monitor_success_samples": len(successful), "monitor_errors": len(samples) - len(successful),
        "pool_max": max(row["hikaricp_connections_max"] for row in connection_samples),
        "active_sample_max": max(row["hikaricp_connections_active"] for row in connection_samples),
        "pending_sample_max": max(row["hikaricp_connections_pending"] for row in connection_samples),
        "timeout_delta": delta("hikaricp_connections_timeout_total"),
        "acquire_count_delta": acquire_count,
        "acquire_mean_ms": delta("hikaricp_connections_acquire_seconds_sum") / acquire_count * 1000,
        "acquire_rolling_max_sample_ms": max(row["hikaricp_connections_acquire_seconds_max"] for row in connection_samples) * 1000,
        "db_connection_sample_max": max(row["db_activity"]["connections"] for row in successful),
        "db_active_sample_max": max(row["db_activity"]["active"] for row in successful),
        "db_lock_waiting_sample_max": max(row["db_activity"]["lock_waiting"] for row in successful),
        "db_idle_in_transaction_sample_max": max(row["db_activity"]["idle_in_transaction"] for row in successful),
    }
    return {"folder": str(root.resolve()), "metadata": read(root / "metadata.json"), "endpoints": endpoints,
            "total_requests": metrics["http_reqs"]["count"], "actual_total_rps": metrics["http_reqs"]["rate"],
            "checks": metrics["checks"], "dropped_iterations": metrics.get("dropped_iterations", {}).get("count", 0),
            "execution": read(phase / "measure.execution.json"), "resource_samples": len(samples),
            "backend": resources("backend"), "postgres": resources("postgres"), "connections": connections,
            "host_load_first": samples[0]["host_load_average"], "host_load_last": samples[-1]["host_load_average"],
            "api_window_overlap_seconds": min(x["last_end_epoch"] for x in endpoints.values())
                                          - max(x["first_start_epoch"] for x in endpoints.values())}


def responses(before, after):
    result = {}
    for endpoint in ["viewport", "recommendation"]:
        a_dir, b_dir = before / endpoint / "accuracy", after / endpoint / "accuracy"
        a_inputs = {x["name"]: x["parameters"] for x in read(a_dir / "metadata.json")["requests"]}
        b_inputs = {x["name"]: x["parameters"] for x in read(b_dir / "metadata.json")["requests"]}
        assert a_inputs == b_inputs, "Response inputs differ"
        cases = []
        for name in a_inputs:
            a, b = read(a_dir / f"{name}.json"), read(b_dir / f"{name}.json")
            am, bm = {x["id"]: x for x in a["parkingLots"]}, {x["id"]: x for x in b["parkingLots"]}
            assert len(am) == len(a["parkingLots"]) == a["totalCount"], "Before response count/IDs invalid"
            assert len(bm) == len(b["parkingLots"]) == b["totalCount"], "After response count/IDs invalid"
            canonical_a = {**a, "parkingLots": sorted(a["parkingLots"], key=lambda x: x["id"])}
            canonical_b = {**b, "parkingLots": sorted(b["parkingLots"], key=lambda x: x["id"])}
            cases.append({"name": name, "parameters": a_inputs[name], "before_count": a["totalCount"],
                          "after_count": b["totalCount"], "ids_equal": set(am) == set(bm),
                          "full_response_equal_without_sorting": a == b,
                          "full_response_equal_after_sorting_ids": canonical_a == canonical_b,
                          "distance_count": sum(isinstance(x.get("distanceMeters"), int) for x in am.values())
                                            if endpoint == "recommendation" else None,
                          "distances_equal": (all(am[k]["distanceMeters"] == bm[k]["distanceMeters"] for k in am)
                                              if endpoint == "recommendation" and set(am) == set(bm) else None)})
        result[endpoint] = cases
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    before, after = summarize(args.before), summarize(args.after)
    controlled = ["duration", "warmup_requests_per_api", "warmup_order", "warmup_think_time_seconds",
                  "preallocated_vus_per_api", "max_vus_per_api", "request_timeout_seconds", "graceful_stop_seconds",
                  "inputs", "load_rps", "provisional_thresholds", "memory_guard", "cache_preparation", "monitoring"]
    conditions = {key: before["metadata"][key] == after["metadata"][key] for key in controlled}
    scripts = {name: value == after["metadata"]["script_sha256"][name]
               for name, value in before["metadata"]["script_sha256"].items()}
    def decrease(old, new):
        return (old - new) / old * 100 if old else None
    comparison = {"before": before, "after": after, "controlled_conditions_match": conditions,
                  "all_five_script_hashes_match": scripts,
                  "db_config_snapshots_equal": (args.before / "db-config.csv").read_bytes() == (args.after / "db-config.csv").read_bytes(),
                  "responses": responses(args.before, args.after),
                  "observed_decrease_percent": {name: {
                      **{key: decrease(before["endpoints"][name]["duration_ms"][key], after["endpoints"][name]["duration_ms"][key])
                         for key in ["p(50)", "p(95)", "p(99)", "avg"]},
                      "sql_mean": decrease(before["endpoints"][name]["sql"]["mean_exec_time_ms"], after["endpoints"][name]["sql"]["mean_exec_time_ms"])}
                      for name in ["viewport", "recommendation"]},
                  "limitations": "One run each on shared host. Monitoring overhead included equally; isolated runs had a different observer. Gauges sampled every 5s may miss short waits; Hikari rolling max can include warmup. Viewport boundary semantics differ.",
                  "analyzer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    with args.output.open("x") as target:
        json.dump(comparison, target, ensure_ascii=False, indent=2)
        target.write("\n")
    print(json.dumps({"decrease_percent": comparison["observed_decrease_percent"],
                      "conditions_match": all(conditions.values()) and all(scripts.values()),
                      "connections_before": before["connections"], "connections_after": after["connections"]}, indent=2))


if __name__ == "__main__":
    main()
