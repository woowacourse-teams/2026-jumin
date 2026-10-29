#!/usr/bin/env python3
"""Provision viewport DB roles for the DB configured in the running backend.

Run as root with --env dev|prod --phase identities|grants|verify.
Credentials never appear in command arguments or normal/error output.
"""

import base64
import fcntl
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlsplit


ROLE_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}\Z")
DATABASE_PATTERN = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}\Z")
PASSWORD_PATTERN = re.compile(rb"[0-9a-f]{64}\Z")
HOST_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9.-]*\Z")
APP_GID = 10001
TIMEOUT = 15
SAFE_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_READ_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC


class Failure(Exception):
    """A static error code safe to show without leaking subprocess output."""


def identifier(value):
    if not ROLE_PATTERN.fullmatch(value):
        raise Failure("INVALID_IDENTIFIER")
    return '"' + value + '"'


def db_identifier(value):
    if not DATABASE_PATTERN.fullmatch(value):
        raise Failure("INVALID_DATABASE")
    return '"' + value + '"'


def literal(value):
    if not isinstance(value, str) or "\x00" in value:
        raise Failure("INVALID_LITERAL")
    return "'" + value.replace("'", "''") + "'"


def arguments(argv):
    if len(argv) != 4 or set(argv[::2]) != {"--env", "--phase"}:
        raise Failure("ARGUMENTS")
    values = dict(zip(argv[::2], argv[1::2]))
    if values["--env"] not in ("dev", "prod") or values["--phase"] not in (
            "identities", "grants", "verify"):
        raise Failure("ARGUMENTS")
    return values["--env"], values["--phase"]


def secure_environment():
    return {"PATH": SAFE_PATH, "LC_ALL": "C", "LANG": "C"}


def backend_settings(environment):
    container = "jumin-backend-" + environment
    try:
        result = subprocess.run(
            ["docker", "inspect", "--format", "{{json .Config.Env}}", container],
            env=secure_environment(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, timeout=TIMEOUT, check=False,
        )
        if result.returncode != 0:
            raise Failure("BACKEND_INSPECT")
        values = json.loads(result.stdout)
        if not isinstance(values, list):
            raise Failure("BACKEND_INSPECT")
        wanted = {"DB_URL", "DB_USERNAME", "DB_PASSWORD", "PGSSLMODE", "PGSSLROOTCERT"}
        captured = {}
        for entry in values:
            if not isinstance(entry, str) or "=" not in entry:
                continue
            name, value = entry.split("=", 1)
            if name in wanted:
                if name in captured:
                    raise Failure("DUPLICATE_DB_SETTING")
                captured[name] = value
        if any(not captured.get(key) for key in ("DB_URL", "DB_USERNAME", "DB_PASSWORD")):
            raise Failure("DB_SETTING_MISSING")
        if not ROLE_PATTERN.fullmatch(captured["DB_USERNAME"]):
            raise Failure("INVALID_WRITER")
        return captured
    except (OSError, ValueError, subprocess.SubprocessError):
        raise Failure("BACKEND_INSPECT") from None


@dataclass(frozen=True)
class Database:
    host: str
    port: int
    name: str
    writer: str
    password: str
    sslmode: str
    sslrootcert: str | None


def parse_database(settings):
    raw = settings["DB_URL"]
    if not raw.startswith("jdbc:postgresql://"):
        raise Failure("DB_URL")
    try:
        parsed = urlsplit(raw[5:])
        host = parsed.hostname
        port = parsed.port if parsed.port is not None else 5432
        name = parsed.path[1:] if parsed.path.startswith("/") else ""
        if (parsed.scheme != "postgresql" or not host or parsed.username is not None
                or parsed.password is not None or parsed.fragment or "," in parsed.netloc
                or not 1 <= port <= 65535 or not DATABASE_PATTERN.fullmatch(name)):
            raise Failure("DB_URL")
        if not HOST_PATTERN.fullmatch(host):
            try:
                ipaddress.IPv6Address(host)
            except ValueError:
                raise Failure("DB_URL") from None
        params = {}
        if parsed.query:
            for key, value in parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True):
                if key not in ("sslmode", "ssl", "sslrootcert") or key in params or not value:
                    raise Failure("DB_URL_OPTIONS")
                params[key] = value
        levels = {"disable": 0, "allow": 0, "prefer": 0, "require": 1, "verify-ca": 2, "verify-full": 3}
        modes = ["require"]
        for mode in (params.get("sslmode"), settings.get("PGSSLMODE"), os.environ.get("PGSSLMODE")):
            if mode:
                if mode not in levels:
                    raise Failure("DB_TLS_MODE")
                modes.append(mode)
        if "ssl" in params:
            if params["ssl"].lower() not in ("true", "false"):
                raise Failure("DB_TLS_MODE")
            if params["ssl"].lower() == "true":
                modes.append("verify-full")
        mode = max(modes, key=lambda item: levels[item])
        rootcerts = {item for item in (params.get("sslrootcert"), settings.get("PGSSLROOTCERT"),
                                      os.environ.get("PGSSLROOTCERT")) if item}
        if len(rootcerts) > 1:
            raise Failure("DB_TLS_ROOT_CONFLICT")
        rootcert = next(iter(rootcerts), None)
        if rootcert and (not os.path.isabs(rootcert) or not os.path.isfile(rootcert)
                         or not os.access(rootcert, os.R_OK)):
            raise Failure("DB_TLS_ROOT_UNAVAILABLE")
        return Database(host, port, name, settings["DB_USERNAME"], settings["DB_PASSWORD"], mode, rootcert)
    except (ValueError, KeyError):
        raise Failure("DB_URL") from None


def pg_environment(database, user, password):
    env = secure_environment()
    env.update({"PGHOST": database.host, "PGPORT": str(database.port), "PGDATABASE": database.name,
                "PGUSER": user, "PGPASSWORD": password, "PGSSLMODE": database.sslmode,
                "PGCONNECT_TIMEOUT": "5", "PGAPPNAME": "jumin-viewport-provision",
                "PGOPTIONS": "-c statement_timeout=10000 -c lock_timeout=5000"})
    if database.sslrootcert:
        env["PGSSLROOTCERT"] = database.sslrootcert
    return env


PSQL = ["psql", "-X", "-w", "-q", "-A", "-t", "--set=ON_ERROR_STOP=1"]


def psql(database, sql, user=None, password=None):
    try:
        result = subprocess.run(
            PSQL, input=sql, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=pg_environment(database, user or database.writer,
                               database.password if password is None else password),
            timeout=TIMEOUT, check=False,
        )
        if result.returncode != 0:
            raise Failure("DB_OPERATION")
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        raise Failure("DB_OPERATION") from None


def check(database, sql, user=None, password=None):
    value = psql(database, sql, user=user, password=password)
    if value not in ("t", "f"):
        raise Failure("DB_RESULT")
    return value == "t"


def scram_verifier(password, salt=None):
    if not PASSWORD_PATTERN.fullmatch(password):
        raise Failure("SECRET_FORMAT")
    salt = secrets.token_bytes(16) if salt is None else salt
    salted = hashlib.pbkdf2_hmac("sha256", password, salt, 4096)
    client = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored = hashlib.sha256(client).digest()
    server = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
    b64 = lambda value: base64.b64encode(value).decode("ascii")
    return "SCRAM-SHA-256$4096:" + b64(salt) + "$" + b64(stored) + ":" + b64(server)


def open_directory(parent, name, *, create, mode=None, gid=0, require_root=True):
    try:
        try:
            fd = os.open(name, DIRECTORY_FLAGS, dir_fd=parent)
        except FileNotFoundError:
            if not create:
                raise Failure("DIRECTORY_MISSING") from None
            os.mkdir(name, mode or 0o755, dir_fd=parent)
            fd = os.open(name, DIRECTORY_FLAGS, dir_fd=parent)
        info = os.fstat(fd)
        if not stat.S_ISDIR(info.st_mode) or (require_root and info.st_uid != 0):
            os.close(fd)
            raise Failure("DIRECTORY_OWNERSHIP")
        if mode is not None:
            if create:
                os.fchown(fd, 0, gid)
                os.fchmod(fd, mode)
            elif info.st_gid != gid or stat.S_IMODE(info.st_mode) != mode:
                os.close(fd)
                raise Failure("DIRECTORY_PERMISSIONS")
        return fd
    except OSError:
        raise Failure("DIRECTORY_ACCESS") from None


class State:
    def __init__(self, environment, create):
        self.fds = []
        try:
            opt = os.open("/opt", DIRECTORY_FLAGS)
            self.fds.append(opt)
            env = open_directory(opt, "jumin-" + environment, create=False, require_root=False)
            self.fds.append(env)
            self.base = open_directory(env, "viewport-cache", create=create, mode=0o755, gid=0)
            self.fds.append(self.base)
            self.secrets = open_directory(self.base, "secrets", create=create, mode=0o700, gid=0)
            self.fds.append(self.secrets)
            self.runtime = open_directory(self.base, "runtime", create=create, mode=0o750, gid=APP_GID)
            self.fds.append(self.runtime)
            lock_flags = os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC | (os.O_CREAT if create else 0)
            self.lock = os.open(".provision-db.lock", lock_flags, 0o600, dir_fd=self.base)
            info = os.fstat(self.lock)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1:
                raise Failure("LOCK_OWNERSHIP")
            if create:
                os.fchmod(self.lock, 0o600)
            elif stat.S_IMODE(info.st_mode) != 0o600:
                raise Failure("LOCK_PERMISSIONS")
            fcntl.flock(self.lock, fcntl.LOCK_EX)
        except (OSError, Failure):
            self.close()
            raise Failure("STATE_ACCESS") from None

    def close(self):
        if hasattr(self, "lock"):
            os.close(self.lock)
            del self.lock
        for fd in reversed(self.fds):
            os.close(fd)
        self.fds.clear()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def existing_file(directory, name, *, mode, gid):
    try:
        try:
            fd = os.open(name, FILE_READ_FLAGS, dir_fd=directory)
        except FileNotFoundError:
            return None
        try:
            info = os.fstat(fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != gid
                    or stat.S_IMODE(info.st_mode) != mode or info.st_nlink != 1):
                raise Failure("FILE_PERMISSIONS")
            chunks = []
            size = 0
            while True:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                size += len(chunk)
                if size > 4096:
                    raise Failure("FILE_SIZE")
                chunks.append(chunk)
            return b"".join(chunks)
        finally:
            os.close(fd)
    except OSError:
        raise Failure("FILE_ACCESS") from None


def put_file(directory, name, value, *, mode, gid):
    existing = existing_file(directory, name, mode=mode, gid=gid)
    if existing is not None:
        if not hmac.compare_digest(existing, value):
            raise Failure("FILE_CONFLICT")
        return
    temp = "." + name + "." + secrets.token_hex(12) + ".tmp"
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=directory)
        try:
            written = 0
            while written < len(value):
                written += os.write(fd, value[written:])
            os.fchown(fd, 0, gid)
            os.fchmod(fd, mode)
            os.fsync(fd)
        finally:
            os.close(fd)
        # Parent is root-owned and only root-writable; the per-helper flock serializes runs.
        os.rename(temp, name, src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)
    except OSError:
        raise Failure("FILE_WRITE") from None
    finally:
        try:
            os.unlink(temp, dir_fd=directory)
        except OSError:
            pass


def read_secret(state, name):
    value = existing_file(state.secrets, name, mode=0o600, gid=0)
    if value is not None and not PASSWORD_PATTERN.fullmatch(value):
        raise Failure("SECRET_FORMAT")
    return value


def roles_for(environment):
    return {"read": "jumin_viewport_" + environment + "_reader",
            "observer": "jumin_viewport_" + environment + "_observer"}


def role_state(database, roles):
    names = ",".join(literal(name) for name in roles.values())
    sql = """
        SELECT json_build_object(
          'user', current_user, 'db', current_database(),
          'creator', (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user),
          'connect_grant', has_database_privilege(current_user, current_database(), 'CONNECT WITH GRANT OPTION'),
          'roles', COALESCE((SELECT json_agg(json_build_object(
             'name', r.rolname, 'login', r.rolcanlogin, 'super', r.rolsuper,
             'createdb', r.rolcreatedb, 'createrole', r.rolcreaterole,
             'replication', r.rolreplication, 'bypassrls', r.rolbypassrls,
             'limit', r.rolconnlimit, 'valid', r.rolvaliduntil IS NULL OR r.rolvaliduntil > now(),
             'memberships', (SELECT count(*) FROM pg_auth_members m WHERE m.member = r.oid)))
             FROM pg_roles r WHERE r.rolname IN (""" + names + """)), '[]'::json))::text;
    """
    try:
        data = json.loads(psql(database, sql))
        if data["user"] != database.writer or data["db"] != database.name:
            raise Failure("DB_IDENTITY")
        entries = {role["name"]: role for role in data["roles"]}
        for kind, name in roles.items():
            if name not in entries:
                continue
            role = entries[name]
            expected_limit = 3 if kind == "read" else 1
            if (not role["login"] or role["super"] or role["createdb"] or role["createrole"]
                    or role["replication"] or role["bypassrls"] or not role["valid"]
                    or role["limit"] != expected_limit or role["memberships"] != 0):
                raise Failure("ROLE_ATTRIBUTES")
        return data, entries
    except (ValueError, KeyError, TypeError):
        raise Failure("DB_RESULT") from None


def login(database, user, password):
    sql = "SELECT current_user = " + literal(user) + " AND current_database() = " + literal(database.name) + ";"
    if not check(database, sql, user=user, password=password.decode("ascii")):
        raise Failure("ROLE_LOGIN")


def install_runtime(state, roles, passwords):
    for kind, role in roles.items():
        for suffix, value in (("username", role.encode("ascii")), ("password", passwords[kind])):
            put_file(state.runtime, "jumin.viewport.cache." + kind + "-" + suffix, value,
                     mode=0o440, gid=APP_GID)


def runtime_matches(state, roles, passwords):
    for kind, role in roles.items():
        for suffix, value in (("username", role.encode("ascii")), ("password", passwords[kind])):
            found = existing_file(state.runtime, "jumin.viewport.cache." + kind + "-" + suffix,
                                  mode=0o440, gid=APP_GID)
            if found is None or not hmac.compare_digest(found, value):
                raise Failure("RUNTIME_MISMATCH")


def identities(database, state, roles):
    info, existing = role_state(database, roles)
    if not info["creator"] or not info["connect_grant"]:
        raise Failure("ROLE_CREATE_PERMISSION")
    names = {"read": "read-password", "observer": "observer-password"}
    passwords = {kind: read_secret(state, names[kind]) for kind in roles}
    # Never adopt or reset a pre-existing role without its local secret and a real login.
    for kind, name in roles.items():
        if name in existing:
            if passwords[kind] is None:
                raise Failure("EXISTING_ROLE_SECRET_MISSING")
            login(database, name, passwords[kind])
    for kind, name in roles.items():
        if passwords[kind] is None:
            passwords[kind] = secrets.token_hex(32).encode("ascii")
            put_file(state.secrets, names[kind], passwords[kind], mode=0o600, gid=0)
    statements = ["BEGIN;"]
    for kind, name in roles.items():
        if name not in existing:
            verifier = scram_verifier(passwords[kind])
            limit = 3 if kind == "read" else 1
            statements.append("CREATE ROLE " + identifier(name)
                              + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
                              + " CONNECTION LIMIT " + str(limit) + " PASSWORD " + literal(verifier) + ";")
    statements.append("GRANT CONNECT ON DATABASE " + db_identifier(database.name) + " TO "
                      + ", ".join(identifier(name) for name in roles.values()) + ";")
    statements.append("COMMIT;")
    psql(database, "\n".join(statements))
    _, after = role_state(database, roles)
    if any(name not in after for name in roles.values()):
        raise Failure("ROLE_CREATE")
    for kind, name in roles.items():
        login(database, name, passwords[kind])
    install_runtime(state, roles, passwords)


def load_existing(database, state, roles):
    _, existing = role_state(database, roles)
    if any(name not in existing for name in roles.values()):
        raise Failure("ROLE_MISSING")
    names = {"read": "read-password", "observer": "observer-password"}
    passwords = {kind: read_secret(state, names[kind]) for kind in roles}
    if any(value is None for value in passwords.values()):
        raise Failure("SECRET_MISSING")
    runtime_matches(state, roles, passwords)
    for kind, name in roles.items():
        login(database, name, passwords[kind])
    return passwords


def schema_ready(database, roles):
    sql = """
       SELECT to_regclass('public.parking_lots') IS NOT NULL
          AND to_regclass('public.parking_operations') IS NOT NULL
          AND to_regclass('public.parking_viewport_cache_state') IS NOT NULL
          AND EXISTS (SELECT 1 FROM pg_attribute
                      WHERE attrelid = to_regclass('public.parking_lots')
                        AND attname = 'viewport_grid_cell' AND NOT attisdropped)
          AND COALESCE((SELECT p.prosecdef AND p.prorettype = 'boolean'::regtype
                 AND p.proconfig @> ARRAY['search_path=pg_catalog, pg_temp']::text[]
                 AND pg_has_role(p.proowner, (SELECT oid FROM pg_roles WHERE rolname = 'pg_read_all_stats'), 'USAGE')
                 AND NOT EXISTS (
                     SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                     WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee <> p.proowner
                       AND acl.grantee <> COALESCE((SELECT oid FROM pg_roles WHERE rolname = """ + literal(roles["observer"]) + """), 0::oid))
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.oid = to_regprocedure('public.viewport_cache_sessions_pending(name,name)')), false);
    """
    if not check(database, sql):
        raise Failure("MIGRATION_OR_FUNCTION_OWNER")


def no_unintended_data_privileges(database, roles):
    reader, observer, writer = (literal(roles["read"]), literal(roles["observer"]), literal(database.writer))
    sql = """
       SELECT NOT pg_has_role(""" + reader + ", " + writer + """, 'MEMBER')
          AND NOT pg_has_role(""" + observer + ", " + writer + """, 'MEMBER')
          AND NOT has_schema_privilege(""" + reader + """, 'public', 'CREATE')
          AND NOT has_schema_privilege(""" + observer + """, 'public', 'CREATE')
          AND NOT has_function_privilege(""" + reader + """,
              'public.viewport_cache_sessions_pending(name,name)', 'EXECUTE')
          AND NOT EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
                AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                                AND d.objid = c.oid AND d.deptype = 'e')
                AND (has_table_privilege(""" + observer + """, c.oid,
                         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
                  OR has_any_column_privilege(""" + observer + """, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
                  OR has_table_privilege(""" + reader + """, c.oid,
                         'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
                  OR has_any_column_privilege(""" + reader + """, c.oid, 'INSERT,UPDATE,REFERENCES')));
    """
    if not check(database, sql):
        raise Failure("EXCESS_DATA_PRIVILEGES")


def grants(database, state, roles):
    load_existing(database, state, roles)
    schema_ready(database, roles)
    no_unintended_data_privileges(database, roles)
    reader, observer, writer = (identifier(roles["read"]), identifier(roles["observer"]),
                                identifier(database.writer))
    sql = "\n".join([
        "BEGIN;",
        "GRANT USAGE ON SCHEMA public TO " + reader + ", " + observer + ";",
        "GRANT CONNECT ON DATABASE " + db_identifier(database.name) + " TO " + reader + ", " + observer + ";",
        "GRANT SELECT ON TABLE public.parking_lots, public.parking_operations, "
        "public.parking_viewport_cache_state TO " + reader + ";",
        "GRANT EXECUTE ON FUNCTION public.viewport_cache_sessions_pending(name,name) TO " + observer + ";",
        "GRANT SELECT, UPDATE ON TABLE public.parking_viewport_cache_state TO " + writer + ";",
        "GRANT UPDATE (viewport_grid_cell) ON TABLE public.parking_lots TO " + writer + ";",
        "GRANT TEMPORARY ON DATABASE " + db_identifier(database.name) + " TO " + writer + ";",
        "COMMIT;",
    ])
    psql(database, sql)
    no_unintended_data_privileges(database, roles)


def required_privileges(database, roles):
    reader, observer, writer = (literal(roles["read"]), literal(roles["observer"]), literal(database.writer))
    sql = """
       SELECT has_schema_privilege(""" + reader + """, 'public', 'USAGE')
          AND has_schema_privilege(""" + observer + """, 'public', 'USAGE')
          AND has_database_privilege(""" + reader + """, current_database(), 'CONNECT')
          AND has_database_privilege(""" + observer + """, current_database(), 'CONNECT')
          AND has_table_privilege(""" + reader + """, 'public.parking_lots', 'SELECT')
          AND has_table_privilege(""" + reader + """, 'public.parking_operations', 'SELECT')
          AND has_table_privilege(""" + reader + """, 'public.parking_viewport_cache_state', 'SELECT')
          AND has_function_privilege(""" + observer + """,
              'public.viewport_cache_sessions_pending(name,name)', 'EXECUTE')
          AND has_table_privilege(""" + writer + """, 'public.parking_viewport_cache_state', 'SELECT')
          AND has_table_privilege(""" + writer + """, 'public.parking_viewport_cache_state', 'UPDATE')
          AND has_column_privilege(""" + writer + """, 'public.parking_lots', 'viewport_grid_cell', 'UPDATE')
          AND has_database_privilege(""" + writer + """, current_database(), 'TEMPORARY');
    """
    if not check(database, sql):
        raise Failure("REQUIRED_PRIVILEGES")


def observer_pending(database, roles, password):
    sql = "SELECT public.viewport_cache_sessions_pending(" + literal(roles["read"]) + "::name, " \
          + literal(roles["observer"]) + "::name);"
    return check(database, sql, user=roles["observer"], password=password.decode("ascii"))


def verify_observation(database, roles, passwords):
    if observer_pending(database, roles, passwords["observer"]):
        raise Failure("OBSERVER_NOT_IDLE")
    process = None
    try:
        process = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, text=True,
                                   env=pg_environment(database, roles["read"], passwords["read"].decode("ascii")))
        process.stdin.write("SELECT pg_sleep(4);\n")
        process.stdin.close()
        end = time.monotonic() + 3
        saw_reader = False
        while time.monotonic() < end:
            if process.poll() is not None:
                break
            if observer_pending(database, roles, passwords["observer"]):
                saw_reader = True
                break
            time.sleep(0.15)
        if not saw_reader:
            raise Failure("OBSERVER_READER_NOT_SEEN")
        if process.wait(timeout=7) != 0:
            raise Failure("READER_SESSION")
        end = time.monotonic() + 3
        while observer_pending(database, roles, passwords["observer"]):
            if time.monotonic() >= end:
                raise Failure("OBSERVER_SESSION_NOT_CLEARED")
            time.sleep(0.15)
    except (OSError, subprocess.SubprocessError):
        raise Failure("SESSION_CHECK") from None
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)


def verify(database, state, roles):
    passwords = load_existing(database, state, roles)
    schema_ready(database, roles)
    no_unintended_data_privileges(database, roles)
    required_privileges(database, roles)
    if not check(database, "SELECT current_setting('authentication_timeout')::interval <= interval '5 seconds';"):
        raise Failure("AUTHENTICATION_TIMEOUT")
    verify_observation(database, roles, passwords)


def main(argv):
    phase = "arguments"
    try:
        environment, phase = arguments(argv)
        if os.geteuid() != 0:
            raise Failure("ROOT_REQUIRED")
        os.umask(0o077)
        settings = backend_settings(environment)
        database = parse_database(settings)
        roles = roles_for(environment)
        if database.writer in roles.values():
            raise Failure("WRITER_ROLE_CONFLICT")
        with State(environment, create=(phase == "identities")) as state:
            if phase == "identities":
                identities(database, state, roles)
            elif phase == "grants":
                grants(database, state, roles)
            else:
                verify(database, state, roles)
        print("PASS " + phase)
        return 0
    except Failure as failure:
        print("FAIL " + phase + " " + str(failure), file=sys.stderr)
        return 1
    except (OSError, UnicodeError, ValueError, TypeError, KeyError):
        print("FAIL " + phase + " INTERNAL", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("FAIL " + phase + " INTERRUPTED", file=sys.stderr)
        return 1
    except Exception:
        # Never render exception values: a subprocess or URL error may contain credentials.
        print("FAIL " + phase + " INTERNAL", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
