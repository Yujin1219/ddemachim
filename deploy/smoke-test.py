"""Exercise the deployment Compose stack with disposable data and fake API keys.

Creates a unique Compose project; never loads deploy/.env or the development DB.
Usage from the repository root: python3 deploy/smoke-test.py
"""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid


def compose(*args, bootstrap=False):
    command = ["docker", "compose", "--project-name", project,
               "--env-file", str(env_file), "-f", str(compose_file)]
    if bootstrap:
        command += ["-f", str(override)]
    result = subprocess.run(command + list(args), env=process_env, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:] + result.stdout[-3000:])
    return result.stdout.strip()


def request(path, payload=None, headers=None):
    req = urllib.request.Request(base + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Origin": origin, **(headers or {})})
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def wait_api():
    for _ in range(40):
        try:
            status, _, body = request("/api/places?size=1")
            if status == 200 and json.loads(body).get("isSuccess"):
                return
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise AssertionError("Web-to-backend API did not become ready")


compose_file = Path(__file__).resolve().with_name("compose.yaml")
project = "ddemachim-stack-test-" + uuid.uuid4().hex[:10]
origin = "https://ddemachim.example.test"
base = ""
# Shell environment takes precedence over --env-file in Compose. Remove keys
# used by this stack so a developer's exported production values cannot leak in.
process_env = os.environ.copy()
for key in ("WEB_IMAGE", "BACKEND_IMAGE", "DB_IMAGE", "WEB_BIND_IP", "WEB_PORT", "PUBLIC_ORIGIN",
            "DB_PASSWORD", "JWT_SECRET", "KAKAO_REST_API_KEY", "TMAP_APP_KEY", "ODSAY_API_KEY",
            "AI_GUIDE_ENABLED", "OPENAI_API_KEY", "OPENAI_MODEL", "SEOUL_CITYDATA_ENABLED",
            "SEOUL_CITYDATA_API_KEY", "JAVA_TOOL_OPTIONS"):
    process_env.pop(key, None)

with tempfile.TemporaryDirectory(prefix=project) as directory:
    env_file = Path(directory) / "test.env"
    env_file.write_text("\n".join([
        "WEB_BIND_IP=127.0.0.1", "WEB_PORT=0", "PUBLIC_ORIGIN=" + origin,
        "DB_PASSWORD=isolated-compose-test", "JWT_SECRET=isolated-compose-test-secret-at-least-32-bytes",
        "KAKAO_REST_API_KEY=not-a-real-key", "TMAP_APP_KEY=not-a-real-key",
        "ODSAY_API_KEY=not-a-real-key", "AI_GUIDE_ENABLED=false",
    ]) + "\n")
    env_file.chmod(0o600)
    override = Path(directory) / "bootstrap.yaml"
    override.write_text("services:\n  backend:\n    environment:\n      SPRING_JPA_HIBERNATE_DDL_AUTO: create\n")
    try:
        config = json.loads(compose("config", "--format", "json"))
        assert set(config["services"]) == {"web", "backend", "db", "redis"}
        assert config["services"]["backend"]["environment"]["SPRING_JPA_HIBERNATE_DDL_AUTO"] == "validate"
        for service in ("backend", "db", "redis"):
            assert not config["services"][service].get("ports")
        print("Starting isolated DB/Redis and creating temporary test schema", flush=True)
        compose("up", "-d", "--wait", "--wait-timeout", "180", "db", "redis")
        compose("up", "-d", "--wait", "--wait-timeout", "240", "backend", bootstrap=True)
        # Production config never generates schemas. Recreate the backend with
        # validate before exercising the four-container deployment configuration.
        print("Starting all four services with deployment schema validation", flush=True)
        compose("up", "-d", "--wait", "--wait-timeout", "240")
        base = "http://127.0.0.1:" + compose("port", "web", "80").rsplit(":", 1)[1]
        wait_api()
        status, _, html = request("/")
        assert status == 200 and b'<div id="root"></div>' in html
        credentials = {"email": "compose@example.test", "password": "compose-test-password"}
        status, headers, body = request("/api/v1/auth/signup", {**credentials, "nickname": "compose"})
        assert status == 201 and headers.get("Access-Control-Allow-Origin") == origin
        token = json.loads(body)["result"]["accessToken"]
        status, _, body = request("/api/v1/ai-guide/chats", {"message": "hello"},
                                  {"Authorization": "Bearer " + token})
        assert status == 503 and json.loads(body)["code"] == "AIGUIDE5032"
        status, _, _ = request("/api/v1/auth/login", credentials, {"Origin": "https://untrusted.example"})
        assert status == 403

        compose("exec", "-T", "db", "psql", "-U", "postgres", "-d", "ddemachim", "-v", "ON_ERROR_STOP=1", "-c", """
            INSERT INTO crowding_grid
                (grid_code, grid_x, grid_y, geometry, center_latitude, center_longitude, created_at)
            VALUES ('compose-grid', 1, 1, ST_MakeEnvelope(126.976,37.575,126.977,37.576,4326),
                    37.5755,126.9765,now())
        """)
        path = ("/api/v1/crowding/grids?minLat=37.575&maxLat=37.576&minLng=126.976&maxLng=126.977"
                "&at=2026-09-08T12:00:00%2B09:00")
        status, _, body = request(path)
        score = json.loads(body)["result"][0]["score"]
        key = "crowding:v1:compose-grid:2026-09-08:12:00"
        assert status == 200 and int(compose("exec", "-T", "redis", "redis-cli", "GET", key)) == score
        assert int(compose("exec", "-T", "redis", "redis-cli", "TTL", key)) > 0
        print("Web/API/auth/CORS/Redis passed; recreating stack to verify persistent volumes", flush=True)
        compose("down")  # keep only this test project's data volumes
        compose("up", "-d", "--wait", "--wait-timeout", "240")
        base = "http://127.0.0.1:" + compose("port", "web", "80").rsplit(":", 1)[1]
        wait_api()
        status, _, body = request("/api/v1/auth/login", credentials)
        assert status == 200 and json.loads(body)["isSuccess"]
        assert int(compose("exec", "-T", "redis", "redis-cli", "GET", key)) == score
        print("PASS: four-container Compose, web/API, CORS, auth, Redis, DB/Redis persistence", flush=True)
    except Exception:
        try:
            print(compose("logs", "--tail", "35", "backend", "web"), file=sys.stderr)
        except Exception:
            pass
        raise
    finally:
        compose("down", "--volumes", "--remove-orphans")
