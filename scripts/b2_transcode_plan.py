"""Scan Objectflix B2 buckets (across multiple B2 accounts) and emit a transcode matrix.

Account 1: secrets B2_APPLICATION_KEY_ID / B2_APPLICATION_KEY,
           buckets from B2_ACCOUNT_1_BUCKETS (comma-separated).
Account 2 (optional): secrets B2_APPLICATION_KEY_ID_2 / B2_APPLICATION_KEY_2,
           buckets from B2_ACCOUNT_2_BUCKETS.

A file needs transcoding when it is a video whose H.264 twin
(<name>.avc.mp4) does not exist yet in the same bucket. Originals are
never modified. Matrix items are tagged with their account so the runner
uses the right credentials.
"""

import json
import os

from b2sdk.v2 import B2Api, InMemoryAccountInfo

VIDEO_SUFFIXES = (".mp4", ".mkv", ".webm", ".mov", ".m4v")
TWIN_SUFFIX = ".avc.mp4"


def scan_account(account_id: str, key_id: str, app_key: str, bucket_filter: str, single_key: str):
    info = InMemoryAccountInfo()
    api = B2Api(info)
    api.authorize_account("production", key_id, app_key)

    wanted = {name.strip() for name in bucket_filter.split(",") if name.strip()}
    buckets = [b for b in api.list_buckets() if not wanted or b.name in wanted]
    missing = wanted - {b.name for b in buckets}
    if missing:
        print(f"::warning::account {account_id}: unreachable bucket(s): {', '.join(sorted(missing))}")

    todo = []
    for bucket in buckets:
        names = set()
        for version, _folder in bucket.ls("", recursive=True):
            names.add(version.file_name)

        candidates = [single_key] if single_key else sorted(names)
        for name in candidates:
            if single_key and name != single_key:
                continue
            lower = name.lower()
            if not lower.endswith(VIDEO_SUFFIXES):
                continue
            if lower.endswith(TWIN_SUFFIX):
                continue
            stem = name[: -len(name.split(".")[-1]) - 1]
            if (stem + TWIN_SUFFIX) in names:
                continue
            todo.append({"account": account_id, "bucket": bucket.name, "key": name})
    return todo


def main() -> None:
    single_key = os.environ.get("SINGLE_KEY", "").strip()

    accounts = []
    if os.environ.get("B2_APPLICATION_KEY_ID") and os.environ.get("B2_APPLICATION_KEY"):
        accounts.append((
            "1",
            os.environ["B2_APPLICATION_KEY_ID"],
            os.environ["B2_APPLICATION_KEY"],
            os.environ.get("B2_ACCOUNT_1_BUCKETS", ""),
        ))
    if os.environ.get("B2_APPLICATION_KEY_ID_2") and os.environ.get("B2_APPLICATION_KEY_2"):
        accounts.append((
            "2",
            os.environ["B2_APPLICATION_KEY_ID_2"],
            os.environ["B2_APPLICATION_KEY_2"],
            os.environ.get("B2_ACCOUNT_2_BUCKETS", ""),
        ))
    if not accounts:
        raise SystemExit("No B2 credentials found in environment.")

    todo = []
    for account_id, key_id, app_key, buckets_env in accounts:
        scanned = scan_account(account_id, key_id, app_key, buckets_env, single_key)
        print(f"account {account_id}: {len(scanned)} file(s) need a twin")
        todo.extend(scanned)

    chunk_size = max(1, int(os.environ.get("CHUNK_SIZE", "3")))
    chunks = [todo[i : i + chunk_size] for i in range(0, len(todo), chunk_size)]
    matrix = json.dumps({"include": [{"items": chunk} for chunk in chunks]}, separators=(",", ":"))

    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        out.write(f"matrix={matrix}\n")
        out.write(f"count={len(todo)}\n")

    print(f"{len(todo)} file(s) total ({len(chunks)} chunk(s))")
    for item in todo:
        print(f"  - acct{item['account']}:{item['bucket']}/{item['key']}")


if __name__ == "__main__":
    main()
