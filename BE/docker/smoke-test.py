"""Verify a backend image using disposable PostGIS/Redis containers, never the dev DB.

Usage: python3 BE/docker/smoke-test.py [ddemachim-backend:vm-amd64]
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def request(path, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(base + path, data=data, headers={
        "Content-Type": "application/json", **(headers or {}),
    })
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.loads(response.read())


def start_backend(create_schema=False):
    global base
    args = ["run", "-d", "--platform", "linux/amd64", "--name", backend,
            "--network", network, "-p", "127.0.0.1::8080"]
    environment = {
        "DB_PASSWORD": "isolated-smoke-test",
        "JWT_SECRET": "isolated-smoke-test-secret-at-least-32-bytes-long",
        "KAKAO_REST_API_KEY": "not-a-real-key",
        "TMAP_APP_KEY": "not-a-real-key",
        "ODSAY_API_KEY": "not-a-real-key",
        "AI_GUIDE_ENABLED": "false",
        "JAVA_TOOL_OPTIONS": "-Xmx512m",
    }
    if create_schema:
        # Only this disposable, empty database is allowed to generate a schema.
        environment["SPRING_JPA_HIBERNATE_DDL_AUTO"] = "create"
    for key, value in environment.items():
        args += ["-e", key + "=" + value]
    docker(*args, image)
    base = "http://127.0.0.1:" + docker("port", backend, "8080/tcp").rsplit(":", 1)[1]
    for _ in range(180):
        if docker("inspect", "--format", "{{.State.Running}}", backend) != "true":
            raise AssertionError("Backend exited before readiness")
        try:
            status, body = request("/api/places?size=1")
            if status == 200 and body.get("isSuccess"):
                return
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise AssertionError("Backend did not become ready within 180 seconds")


image = sys.argv[1] if len(sys.argv) > 1 else "ddemachim-backend:vm-amd64"
prefix = "ddemachim-backend-test-" + uuid.uuid4().hex[:10]
network, backend, db, redis = prefix, prefix + "-app", prefix + "-db", prefix + "-redis"
base = ""
try:
    info = json.loads(docker("image", "inspect", image))[0]
    assert (info["Os"], info["Architecture"]) == ("linux", "amd64")
    assert info["Config"]["User"] == "app"
    assert not any(item.startswith(("DB_PASSWORD=", "JWT_SECRET=", "OPENAI_API_KEY="))
                   for item in info["Config"]["Env"])
    docker("network", "create", network)
    docker("run", "-d", "--platform", "linux/amd64", "--name", db,
           "--network", network, "--network-alias", "db",
           "--tmpfs", "/var/lib/postgresql",
           "-e", "POSTGRES_PASSWORD=isolated-smoke-test", "-e", "POSTGRES_DB=ddemachim",
           "postgis/postgis:18-3.6")
    docker("run", "-d", "--platform", "linux/amd64", "--name", redis,
           "--network", network, "--network-alias", "redis", "redis:8.8.0-alpine")
    for _ in range(90):
        result = subprocess.run(["docker", "exec", "-e", "PGPASSWORD=isolated-smoke-test", db, "psql", "-h", "127.0.0.1",
                                 "-U", "postgres", "-d", "ddemachim", "-Atc",
                                 "SELECT extname FROM pg_extension WHERE extname='postgis'"],
                                capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip() == "postgis":
            break
        time.sleep(1)
    else:
        raise AssertionError("PostGIS did not become ready")
    assert docker("exec", redis, "redis-cli", "ping") == "PONG"
    print("Temporary PostGIS/Redis ready; booting amd64 backend", flush=True)
    start_backend(create_schema=True)
    assert "redis_version:8.8.0" in docker("exec", redis, "redis-cli", "INFO", "server")
    docker("exec", db, "psql", "-U", "postgres", "-d", "ddemachim", "-v", "ON_ERROR_STOP=1", "-c", """
        INSERT INTO crowding_grid
            (grid_code, grid_x, grid_y, geometry, center_latitude, center_longitude, created_at)
        VALUES ('smoke-grid', 1, 1,
            ST_MakeEnvelope(126.976, 37.575, 126.977, 37.576, 4326), 37.5755, 126.9765, now())
    """)
    crowding_path = ("/api/v1/crowding/grids?minLat=37.575&maxLat=37.576"
                     "&minLng=126.976&maxLng=126.977&at=2026-09-08T12:00:00%2B09:00")
    status, body = request(crowding_path)
    assert status == 200 and len(body["result"]) == 1
    score = body["result"][0]["score"]
    cache_key = "crowding:v1:smoke-grid:2026-09-08:12:00"
    assert int(docker("exec", redis, "redis-cli", "GET", cache_key)) == score
    assert int(docker("exec", redis, "redis-cli", "TTL", cache_key)) > 0
    # Changing the cached value proves the next API call reads Redis rather than
    # silently using the deterministic fallback when Redis is unreachable.
    cached_score = 1 if score != 1 else 100
    docker("exec", redis, "redis-cli", "SET", cache_key, str(cached_score), "EX", "120")
    status, body = request(crowding_path)
    assert status == 200 and body["result"][0]["score"] == cached_score
    print("Redis 8.8.0 crowding cache write/read/TTL passed", flush=True)
    status, body = request("/api/v1/auth/signup", {
        "email": "smoke@example.test", "password": "smoke-test-password", "nickname": "smoke",
    })
    assert status == 201 and body["isSuccess"]
    token = body["result"]["accessToken"]
    status, body = request("/api/v1/ai-guide/chats", {"message": "hello"},
                           {"Authorization": "Bearer " + token})
    assert status == 503 and body["code"] == "AIGUIDE5032"
    assert docker("exec", backend, "id", "-u") == "10001"
    docker("exec", backend, "sh", "-c", "test ! -e /app/.env && test ! -d /app/src && ! command -v javac")
    print("Signup/disabled AI passed; restarting with default schema validation", flush=True)
    docker("rm", "-f", backend)
    start_backend()
    status, body = request("/api/v1/auth/login", {
        "email": "smoke@example.test", "password": "smoke-test-password",
    })
    assert status == 200 and body["isSuccess"]
    print("PASS: amd64/non-root image, runtime secrets, PostGIS, Redis 8.8.0 cache, disabled AI, validate restart")
except Exception:
    subprocess.run(["docker", "logs", "--tail", "80", backend], check=False)
    raise
finally:
    for name in (backend, db, redis):
        subprocess.run(["docker", "rm", "-fv", name], capture_output=True)
    subprocess.run(["docker", "network", "rm", network], capture_output=True)
