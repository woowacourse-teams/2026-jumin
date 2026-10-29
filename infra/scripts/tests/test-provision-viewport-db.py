#!/usr/bin/env python3
"""Exercise viewport role provisioning against a disposable local PostgreSQL 18.

Requires docker, openssl and a local psql client. Set VIEWPORT_DB_TEST_IMAGE to
an available PostgreSQL 18 image; defaults to postgres:18-alpine. Only a local,
loopback-published test container is used. Nothing connects to an app database.
The test replaces root-only credential-file operations with private temporary
files; production ownership and configtree mounting are separate checks.
"""

import contextlib
import os
from pathlib import Path
import runpy
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "infra/scripts/provision-viewport-db.py"
MIGRATION = ROOT / "server/src/main/resources/db/migration/V15__add_viewport_cache_state.sql"
IMAGE = os.environ.get("VIEWPORT_DB_TEST_IMAGE", "postgres:18-alpine")
SAFE_ENV = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C", "LANG": "C"}


class FixtureError(Exception):
    pass


def command(args, *, environment=None, timeout=30, check=True):
    try:
        result = subprocess.run(args, env=environment or SAFE_ENV, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, timeout=timeout, check=False)
        if check and result.returncode:
            raise FixtureError("COMMAND")
        return result
    except (OSError, subprocess.SubprocessError):
        raise FixtureError("COMMAND") from None


@contextlib.contextmanager
def postgres_fixture():
    with tempfile.TemporaryDirectory(prefix="jumin-pg18-it-") as directory:
        path = Path(directory)
        os.chmod(path, 0o755)
        command(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
                 "-days", "1", "-subj", "/CN=localhost", "-keyout", str(path / "key.pem"),
                 "-out", str(path / "cert.pem")])
        container_name = "jumin-db-it-" + secrets.token_hex(6)
        admin_password = secrets.token_hex(32)
        environment = dict(SAFE_ENV, POSTGRES_PASSWORD=admin_password, POSTGRES_DB="jumin_fixture")
        entrypoint = (
            "cp /fixture/key.pem /tmp/viewport-test.key && "
            "cp /fixture/cert.pem /tmp/viewport-test.crt && "
            "chown postgres:postgres /tmp/viewport-test.key /tmp/viewport-test.crt && "
            "chmod 600 /tmp/viewport-test.key && "
            "exec docker-entrypoint.sh postgres -c ssl=on "
            "-c ssl_cert_file=/tmp/viewport-test.crt -c ssl_key_file=/tmp/viewport-test.key "
            "-c authentication_timeout=5"
        )
        # The name is random and dedicated to this test, including startup failures.
        created = True
        try:
            command(["docker", "run", "-d", "--rm", "--name", container_name,
                     "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB", "-p", "127.0.0.1::5432",
                     "-v", str(path) + ":/fixture:ro", "--entrypoint", "sh", IMAGE, "-c", entrypoint],
                    environment=environment, timeout=120)
            deadline = time.monotonic() + 60
            while True:
                ready = command(["docker", "exec", "-u", "postgres", container_name, "pg_isready",
                                 "-h", "127.0.0.1", "-U", "postgres", "-d", "jumin_fixture"],
                                check=False, timeout=5)
                if ready.returncode == 0:
                    break
                if time.monotonic() >= deadline:
                    raise FixtureError("STARTUP")
                time.sleep(0.5)
            result = command(["docker", "port", container_name, "5432/tcp"])
            line = result.stdout.strip()
            if not line.startswith("127.0.0.1:") or not line[10:].isdigit():
                raise FixtureError("PORT")
            yield path, int(line[10:]), admin_password
        finally:
            if created:
                command(["docker", "rm", "-f", container_name], timeout=30, check=False)


@contextlib.contextmanager
def temporary_state(module, root):
    """Use real temporary files without requiring production root ownership."""
    secret_dir = root / "test-secrets"
    runtime_dir = root / "test-runtime"
    secret_dir.mkdir(mode=0o700)
    runtime_dir.mkdir(mode=0o700)
    state = SimpleNamespace(secrets=os.open(secret_dir, os.O_RDONLY | os.O_DIRECTORY),
                            runtime=os.open(runtime_dir, os.O_RDONLY | os.O_DIRECTORY))
    original_existing, original_put = module["existing_file"], module["put_file"]

    def existing_file(directory, name, *, mode, gid):
        del mode, gid
        try:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        except FileNotFoundError:
            return None
        try:
            return os.read(fd, 4097)
        finally:
            os.close(fd)

    def put_file(directory, name, value, *, mode, gid):
        found = existing_file(directory, name, mode=mode, gid=gid)
        if found is not None:
            if found != value:
                raise module["Failure"]("FILE_CONFLICT")
            return
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     mode, dir_fd=directory)
        try:
            with os.fdopen(fd, "wb") as file:
                file.write(value)
        except BaseException:
            # fdopen owns the descriptor once entered.
            raise

    module["existing_file"], module["put_file"] = existing_file, put_file
    try:
        yield state
    finally:
        module["existing_file"], module["put_file"] = original_existing, original_put
        os.close(state.secrets)
        os.close(state.runtime)


def must_fail(action, failure_class, expected):
    try:
        action()
    except failure_class as error:
        if str(error) != expected:
            raise FixtureError("UNEXPECTED_FAILURE") from None
    else:
        raise FixtureError("EXPECTED_FAILURE_MISSING")


def exercise(module, directory, port, admin_password):
    Database, psql = module["Database"], module["psql"]
    failure = module["Failure"]
    admin = Database("127.0.0.1", port, "jumin_fixture", "postgres", admin_password, "require", None)
    writer_password = secrets.token_hex(32)
    writer = Database("127.0.0.1", port, "jumin_fixture", "juchabros", writer_password, "require", None)
    roles = module["roles_for"]("dev")
    if psql(admin, "SHOW server_version_num;")[:2] != "18":
        raise FixtureError("PG_VERSION")
    if psql(admin, "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid();") != "t":
        raise FixtureError("TLS")
    psql(admin, "CREATE ROLE juchabros LOGIN CREATEROLE CREATEDB PASSWORD "
         + module["literal"](writer_password) + "; "
         "ALTER DATABASE jumin_fixture OWNER TO juchabros; "
         "GRANT pg_read_all_stats TO juchabros;")
    print("PASS PostgreSQL 18 fixture with TLS")
    with temporary_state(module, directory) as state:
        module["identities"](writer, state, roles)
        first = {kind: module["read_secret"](state, kind + "-password") for kind in roles}
        # Re-run verifies both real logins and must preserve the generated passwords.
        module["identities"](writer, state, roles)
        if first != {kind: module["read_secret"](state, kind + "-password") for kind in roles}:
            raise FixtureError("SECRET_CHANGED")
        for kind, name in roles.items():
            module["login"](writer, name, first[kind])
            must_fail(lambda: module["login"](writer, name, b"0" * 64), failure, "DB_OPERATION")
        reader_secret = directory / "test-secrets/read-password"
        reader_secret.write_bytes(b"0" * 64)
        must_fail(lambda: module["identities"](writer, state, roles), failure, "DB_OPERATION")
        reader_secret.unlink()
        must_fail(lambda: module["identities"](writer, state, roles), failure,
                  "EXISTING_ROLE_SECRET_MISSING")
        reader_secret.write_bytes(first["read"])
        os.chmod(reader_secret, 0o600)
        module["login"](writer, roles["read"], first["read"])
        must_fail(lambda: module["grants"](writer, state, roles), failure, "MIGRATION_OR_FUNCTION_OWNER")
        print("PASS SCRAM role creation, login, rerun and migration gate")
        psql(writer, "CREATE TABLE public.parking_lots "
             "(id bigint PRIMARY KEY, active boolean, location text, address text); "
             "CREATE TABLE public.parking_operations (id bigint PRIMARY KEY);")
        psql(writer, MIGRATION.read_text())
        # Check a public function grant is rejected before granting anything else.
        psql(writer, "GRANT EXECUTE ON FUNCTION public.viewport_cache_sessions_pending(name,name) TO PUBLIC;")
        must_fail(lambda: module["schema_ready"](writer, roles), failure, "MIGRATION_OR_FUNCTION_OWNER")
        psql(writer, "REVOKE ALL ON FUNCTION public.viewport_cache_sessions_pending(name,name) FROM PUBLIC;")
        psql(admin, "CREATE ROLE fixture_unexpected NOLOGIN;")
        psql(writer, "GRANT EXECUTE ON FUNCTION public.viewport_cache_sessions_pending(name,name) "
             "TO fixture_unexpected;")
        must_fail(lambda: module["schema_ready"](writer, roles), failure, "MIGRATION_OR_FUNCTION_OWNER")
        psql(writer, "REVOKE ALL ON FUNCTION public.viewport_cache_sessions_pending(name,name) "
             "FROM fixture_unexpected;")
        psql(admin, "REVOKE pg_read_all_stats FROM juchabros;")
        must_fail(lambda: module["schema_ready"](writer, roles), failure, "MIGRATION_OR_FUNCTION_OWNER")
        psql(admin, "GRANT pg_read_all_stats TO juchabros;")
        module["schema_ready"](writer, roles)
        psql(writer, "GRANT SELECT ON TABLE public.parking_lots TO PUBLIC;")
        must_fail(lambda: module["grants"](writer, state, roles), failure, "EXCESS_DATA_PRIVILEGES")
        psql(writer, "REVOKE SELECT ON TABLE public.parking_lots FROM PUBLIC;")
        module["grants"](writer, state, roles)
        module["grants"](writer, state, roles)
        passwords = {kind: first[kind].decode("ascii") for kind in roles}
        if psql(writer, "SELECT count(*) FROM public.parking_lots;", roles["read"], passwords["read"]) != "0":
            raise FixtureError("READER_SELECT")
        for kind, sql in (("read", "INSERT INTO public.parking_lots (id) VALUES (1);"),
                          ("observer", "SELECT count(*) FROM public.parking_lots;"),
                          ("observer", "INSERT INTO public.parking_lots (id) VALUES (1);")):
            must_fail(lambda: psql(writer, sql, roles[kind], passwords[kind]), failure, "DB_OPERATION")
        print("PASS PUBLIC ACL rejection and effective reader/observer privileges")
        # The production function itself checks idle false, open reader true, then drained false.
        module["verify"](writer, state, roles)
        print("PASS observer idle, reader active and drained")


def main():
    try:
        namespace = runpy.run_path(str(HELPER))
        module = namespace["identities"].__globals__
        # The production host uses /usr/bin/psql; development hosts may use Homebrew.
        psql_binary = shutil.which("psql")
        if psql_binary is None:
            raise FixtureError("PSQL_MISSING")
        module["SAFE_PATH"] = os.path.dirname(psql_binary) + ":" + module["SAFE_PATH"]
        with postgres_fixture() as (directory, port, admin_password):
            exercise(module, directory, port, admin_password)
        return 0
    except FixtureError as error:
        print("FAIL fixture " + str(error), file=sys.stderr)
    except Exception as error:
        # Show only the helper's static error code, never subprocess output or credentials.
        failure = locals().get("module", {}).get("Failure")
        if failure is not None and isinstance(error, failure):
            print("FAIL fixture " + str(error), file=sys.stderr)
        else:
            print("FAIL fixture INTERNAL", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
