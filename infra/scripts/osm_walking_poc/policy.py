"""Conservative ordinary-pedestrian rules. OSM tag values are case sensitive."""

from dataclasses import dataclass
from typing import Mapping

POLICY_VERSION = "2026-10-01-v4"
DEFAULT_HIGHWAYS = frozenset({
    "footway", "pedestrian", "path", "steps", "residential", "living_street",
    "unclassified", "service", "track", "primary", "primary_link", "secondary",
    "secondary_link", "tertiary", "tertiary_link",
})
EXPLICIT_HIGHWAYS = frozenset({"trunk", "trunk_link", "cycleway", "bridleway", "road"})
FOOT_ALLOW = frozenset({"yes", "designated", "permissive"})
GENERAL_ALLOW = frozenset({"yes", "permissive"})
QUALIFIED = frozenset({"permit", "delivery", "agricultural", "forestry", "military", "emergency"})
PASSABLE_BARRIERS = frozenset({"bollard", "block", "kerb"})


@dataclass(frozen=True)
class Verdict:
    status: str
    reason: str
    forward: bool = False
    backward: bool = False


def access(tags: Mapping[str, str]) -> Verdict:
    """Resolve specific foot access without falling back from unknown values."""
    key = "foot" if "foot" in tags else "access"
    if key not in tags:
        return Verdict("default", "no_access_tag", True, True)
    value = tags[key]
    if value in (FOOT_ALLOW if key == "foot" else GENERAL_ALLOW):
        return Verdict("public", key + "=" + value, True, True)
    if value in {"no", "private", "use_sidepath"}:
        return Verdict("excluded", key + "=" + value)
    if value in {"destination", "customers"}:
        return Verdict("restricted", "facility_unverified:" + key + "=" + value)
    if value in QUALIFIED:
        return Verdict("excluded", "qualification_unverified:" + key + "=" + value)
    return Verdict("review", "unknown_access:" + key + "=" + value)


def conditional_reason(tags: Mapping[str, str]):
    # A foot tag overrides general access conditions. Directional conditions,
    # when present, are more specific and need an interpreter we do not have.
    for key in sorted(tags):
        if key.endswith(":conditional") and (key.startswith("oneway:foot:") or key.startswith("conveying:") or (tags.get("highway") == "steps" and key == "oneway:conditional")):
            return "unsupported_conditional:" + key
        if key.startswith("foot:") and key.endswith(":conditional"):
            return "unsupported_conditional:" + key
        if key.startswith("access:") and key.endswith(":conditional") and "foot" not in tags:
            return "unsupported_conditional:" + key
    return None


def node_verdict(tags: Mapping[str, str]) -> Verdict:
    if tags.get("locked") == "yes":
        return Verdict("excluded", "locked")
    condition = conditional_reason(tags)
    if condition:
        return Verdict("review", condition)
    permission = access(tags)
    if permission.status not in {"default", "public"}:
        return permission
    barrier = tags.get("barrier")
    if not barrier or barrier == "no":
        return Verdict("public", "no_barrier", True, True)
    if barrier in {"wall", "fence", "yes"}:
        return Verdict("excluded", "physical_barrier:" + barrier)
    if permission.status == "public":
        return Verdict("public", "explicit_barrier_access", True, True)
    if barrier in PASSABLE_BARRIERS:
        return Verdict("public", "barrier_default:" + barrier, True, True)
    return Verdict("review", "unknown_barrier_default:" + barrier)


def way_verdict(tags: Mapping[str, str]) -> Verdict:
    highway = tags.get("highway", "")
    if highway in {"construction", "proposed", "abandoned", "razed", "via_ferrata"}:
        return Verdict("excluded", "unsupported_or_inactive_highway:" + highway)
    if tags.get("area") == "yes":
        return Verdict("excluded", "area_outline")
    if any(tags.get(k) == "yes" for k in ("impassable", "abandoned", "disused", "demolished", "razed")):
        return Verdict("excluded", "inactive_or_impassable")
    # smoothness describes wheeled traffic; even "impassable" may allow walking.
    if tags.get("status") == "impassable":
        return Verdict("excluded", "impassable")
    if highway in {"motorway", "motorway_link"} or tags.get("motorroad") == "yes":
        conflict = tags.get("foot") in FOOT_ALLOW
        return Verdict("review" if conflict else "excluded", "motorroad_access_conflict" if conflict else "motorway_or_motorroad")
    if highway not in DEFAULT_HIGHWAYS | EXPLICIT_HIGHWAYS:
        return Verdict("review", "unknown_highway:" + highway)
    if tags.get("sac_scale", "hiking") not in {"strolling", "hiking"}:
        return Verdict("excluded", "outside_general_walking:sac_scale")
    condition = conditional_reason(tags)
    if condition:
        return Verdict("review", condition)
    if any(k.startswith("access:") and k in {"access:forward", "access:backward"} for k in tags):
        return Verdict("review", "unsupported_directional_access")
    permission = access(tags)
    # Evaluate explicit foot:forward/backward even if foot=no. Each direction
    # is more specific, but restricted/unknown directions cannot enter the graph.
    directions = []
    for direction in ("forward", "backward"):
        key = "foot:" + direction
        directional = dict(tags)
        if key in tags:
            directional["foot"] = tags[key]
        directions.append(access(directional))
    for verdict in directions:
        if verdict.status in {"review", "restricted"}:
            return verdict
    forward, backward = (v.status in {"public", "default"} for v in directions)
    if not forward and not backward:
        return permission if permission.status not in {"public", "default"} else Verdict("excluded", "both_directions_denied")
    explicit_foot = tags.get("foot") in FOOT_ALLOW
    if highway in EXPLICIT_HIGHWAYS and not explicit_foot:
        return Verdict("excluded", "explicit_foot_required:" + highway)
    if not explicit_foot and any(v == "separate" for k, v in tags.items() if k == "sidewalk" or k.startswith("sidewalk:")):
        return Verdict("excluded", "use_separate_sidewalk")
    oneway = tags.get("oneway:foot")
    if oneway is None and highway == "steps":
        oneway = tags.get("oneway")
    conveying = tags.get("conveying")
    if conveying not in {None, "no", "yes", "forward", "backward", "reversible"}:
        return Verdict("review", "unknown_conveying")
    if conveying in {"yes", "reversible"}:
        return Verdict("review", "conveying_direction_unresolved")
    if oneway not in {None, "no", "0", "false", "yes", "1", "true", "-1"}:
        return Verdict("review", "unknown_oneway_foot")
    if oneway in {"no", "0", "false"} and conveying in {"forward", "backward"}:
        return Verdict("review", "conflicting_walking_direction")
    if (tags.get("foot:backward") in FOOT_ALLOW and (oneway in {"yes", "1", "true"} or conveying == "forward")) or (tags.get("foot:forward") in FOOT_ALLOW and (oneway == "-1" or conveying == "backward")):
        return Verdict("review", "conflicting_walking_direction")
    if (oneway in {"yes", "1", "true"} and conveying == "backward") or (oneway == "-1" and conveying == "forward"):
        return Verdict("review", "conflicting_walking_direction")
    if oneway in {"yes", "1", "true"} or conveying == "forward":
        backward = False
    if oneway == "-1" or conveying == "backward":
        forward = False
    if not forward and not backward:
        return Verdict("review", "conflicting_walking_direction")
    return Verdict("public", permission.reason if permission.status == "public" else "highway_default:" + highway, forward, backward)
