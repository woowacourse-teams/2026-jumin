import json
import sys
from pathlib import Path


ADMIN_KEYS = (
    "ADMIN_LOGIN_ID",
    "ADMIN_PASSWORD_HASH",
    "ADMIN_TOKEN_SECRET",
    "ADMIN_ENV_LABEL",
)
RUNTIME_KEYS = (
    "DB_URL",
    "DB_USERNAME",
    "DB_PASSWORD",
    "LOCAL_SEARCH_BASE_URL",
    "LOCAL_SEARCH_REST_API_KEY",
    "REVERSE_GEOCODING_BASE_URL",
    "REVERSE_GEOCODING_CLIENT_ID",
    "REVERSE_GEOCODING_CLIENT_SECRET",
    "SEOUL_PARKING_BASE_URL",
    "SEOUL_PARKING_API_KEY",
    "SEOUL_OPEN_DATA_KEY",
    "BUSAN_PARKING_BASE_URL",
    "BUSAN_PARKING_API_KEY",
)


def container_environment(container):
    return dict(entry.split("=", 1) for entry in container["Config"]["Env"])


def runtime_settings(env):
    settings = {key: env.get(key, "") for key in RUNTIME_KEYS}
    settings["PARKING_AVAILABILITY_ENABLED"] = env.get("PARKING_AVAILABILITY_ENABLED") or "false"
    cache_mode = env.get("JUMIN_VIEWPORT_CACHE_ENABLED") or "false"
    settings["JUMIN_VIEWPORT_CACHE_ENABLED"] = cache_mode
    if cache_mode == "true":
        settings.update((key, value) for key, value in env.items() if key.startswith("JUMIN_VIEWPORT_CACHE_"))
    return settings


def redis_ca(container, env):
    destination = env.get("JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE")
    for mount in container.get("Mounts", []):
        if (
            destination
            and mount.get("Destination") == destination
            and mount.get("Type") == "bind"
            and mount.get("RW") is False
        ):
            contents = Path(mount["Source"]).read_bytes()
            if contents:
                return contents
    raise OSError


def main():
    active, retained = json.load(sys.stdin)
    active_env, retained_env = map(container_environment, (active, retained))
    if any(not active_env.get(key) or active_env[key] != retained_env.get(key) for key in ADMIN_KEYS):
        sys.exit(
            "Rollback blocked because administrator credentials differ. "
            "Deploy the previous code with current secrets."
        )
    if runtime_settings(active_env) != runtime_settings(retained_env):
        sys.exit(
            "Rollback blocked because backend runtime settings differ. "
            "Deploy the previous code with current settings."
        )
    if active_env.get("JUMIN_VIEWPORT_CACHE_ENABLED") != "true":
        return
    try:
        same_ca = redis_ca(active, active_env) == redis_ca(retained, retained_env)
    except (OSError, KeyError, TypeError):
        sys.exit(
            "Rollback blocked because it could not verify the Redis CA. "
            "Deploy the previous code with current settings."
        )
    if not same_ca:
        sys.exit(
            "Rollback blocked because the Redis CA differs. "
            "Deploy the previous code with current settings."
        )


if __name__ == "__main__":
    main()
