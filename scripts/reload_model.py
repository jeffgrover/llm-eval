"""One-off: unload then reload qwen3.8-27b via LM Studio REST for a clean KV cache."""
import json
import time
import urllib.error
import urllib.request

BASE = "http://localhost:1234/api/v1"
MODEL = "qwen3.8-27b"


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        print(f"{path}: HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}")
        raise


print("unloading...")
print(post("/models/unload", {"instance_id": MODEL}))
time.sleep(3)

print("loading...")
print(post("/models/load", {"model": MODEL}))

# Poll until the model answers /v1/models with a loaded instance
for i in range(60):
    time.sleep(5)
    try:
        with urllib.request.urlopen(
            urllib.request.Request(
                BASE.replace("/api/v1", "/v1") + "/models",
                headers={"Authorization": "Bearer lm-studio"},
            ),
            timeout=10,
        ) as resp:
            ids = [m.get("id") for m in json.load(resp).get("data", [])]
        if MODEL in ids:
            print(f"READY after ~{(i + 1) * 5}s; /v1/models lists: {ids[:4]}...")
            break
    except Exception as exc:
        print(f"  poll {i}: {exc}")
else:
    print("TIMEOUT waiting for model to become ready")
