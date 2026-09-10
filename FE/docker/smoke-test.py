"""Run against a built web image; only creates/removes uniquely named test resources.

Usage: python3 FE/docker/smoke-test.py [ddemachim-web:vm-amd64]
Requires Docker, Python 3, and access to node:24-alpine for the mock API.
"""

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def fetch(path, data=None, headers=None):
    request = urllib.request.Request(base + path, data=data, headers=headers or {})
    try:
        response = urllib.request.urlopen(request, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def wait_for(path, expected):
    for _ in range(40):
        try:
            response = fetch(path)
            if response[0] == expected:
                return response
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.5)
    raise AssertionError(f"{path} did not return {expected}")


image = sys.argv[1] if len(sys.argv) > 1 else "ddemachim-web:vm-amd64"
prefix = "ddemachim-web-test-" + uuid.uuid4().hex[:10]
network, web, backend = prefix, prefix + "-web", prefix + "-api"
base = ""
mock_api = """
require('http').createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    res.writeHead(req.url.startsWith('/api/fail') ? 503 : 200,
      {'Content-Type': 'application/json'});
    res.end(JSON.stringify({url: req.url, method: req.method, headers: req.headers, body}));
  });
}).listen(8080, '0.0.0.0');
"""

try:
    info = json.loads(docker("image", "inspect", image))[0]
    assert (info["Os"], info["Architecture"]) == ("linux", "amd64")
    docker("network", "create", network)
    docker("run", "-d", "--platform", "linux/amd64", "--name", web,
           "--network", network, "-p", "127.0.0.1::80",
           "-e", "BACKEND_UPSTREAM=http://mock-api:8080", image)
    port = docker("port", web, "80/tcp").rsplit(":", 1)[1]
    base = "http://127.0.0.1:" + port
    assert wait_for("/healthz", 200)[2] == b"ok\n"
    status, headers, html = fetch("/")
    assert status == 200 and b'<div id="root"></div>' in html
    assert headers.get("Cache-Control") == "no-cache"
    for path in re.findall(r'(?:src|href)="((?:/machim)?/assets/[^\"]+)"', html.decode()):
        status, headers, content = fetch(path)
        assert status == 200 and content and "text/html" not in headers.get("Content-Type", "")
    assert fetch("/assets/does-not-exist.js")[0] == 404
    assert fetch("/.env")[0] == 404
    assert fetch("/api/probe")[0] == 502  # backend absent; never return the SPA here
    docker("exec", web, "sh", "-c",
           "test ! -e /app/.env && test ! -d /usr/share/nginx/html/src && ! command -v node")
    docker("run", "-d", "--name", backend, "--network", network,
           "--network-alias", "mock-api", "node:24-alpine", "node", "-e", mock_api)
    wait_for("/api/probe", 200)
    status, _, body = fetch("/api/echo?q=a%20b", b'{"message":"hello"}', {
        "Content-Type": "application/json", "Authorization": "Bearer smoke-test",
        "Origin": "https://web.example.test", "X-Forwarded-Proto": "https",
    })
    reply = json.loads(body)
    assert status == 200 and reply["url"] == "/api/echo?q=a%20b"
    assert reply["method"] == "POST" and reply["body"] == '{"message":"hello"}'
    assert reply["headers"]["authorization"] == "Bearer smoke-test"
    assert reply["headers"]["origin"] == "https://web.example.test"
    assert reply["headers"]["x-forwarded-proto"] == "https"
    assert fetch("/api/fail")[0] == 503
    status, _, subpath_html = fetch("/machim/")
    assert status == 200 and subpath_html == html
    paths = re.findall(r'(?:src|href)="(/machim/assets/[^\"]+)"', html.decode())
    assert len(paths) >= 2, "Expected subpath JS and CSS links"
    for path in paths + ["/machim/assets/place-default.svg"]:
        status, headers, content = fetch(path)
        assert status == 200 and content and "text/html" not in headers.get("Content-Type", "")
        if path.endswith(".css"):
            nav_rules = re.findall(r"\.bottom-nav\{([^}]*)\}", content.decode())
            assert any(re.search(r"(?:^|;)backdrop-filter:blur\(18px\)", rule) for rule in nav_rules), \
                "Built CSS must retain the standard bottom navigation backdrop-filter"
    assert fetch("/machim/assets/missing.js")[0] == 404
    assert fetch("/machim/.env")[0] == 404
    status, _, body = fetch("/machim/api/echo?q=a%20b", b'{}', {"Content-Type": "application/json"})
    assert status == 200 and json.loads(body)["url"] == "/api/echo?q=a%20b", (status, body)
    assert json.loads(body)["method"] == "POST"
    assert fetch("/machim/api/fail")[0] == 503
    print("PASS: amd64 image, static assets, config exclusion, backend-independent startup, API proxy")
except Exception:
    print(docker("logs", "--tail", "15", web), file=sys.stderr)
    raise
finally:
    for container in (web, backend):
        subprocess.run(["docker", "rm", "-f", container], capture_output=True)
    subprocess.run(["docker", "network", "rm", network], capture_output=True)
