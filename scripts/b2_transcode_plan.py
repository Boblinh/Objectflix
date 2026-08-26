"""Scan the Objectflix B2 bucket and emit a transcode matrix.

A file needs transcoding when it is a video whose H.264 twin
(<name>.avc.mp4) does not exist yet. Originals are never modified.
"""

import json
import os

from b2sdk.v2 import B2Api, InMemoryAccountInfo

VIDEO_SUFFIXES = (".mp4", ".mkv", ".webm", ".mov", ".m4v")
TWIN_SUFFIX = ".avc.mp4"


def main() -> None:
    info = InMemoryAccountInfo()
    api = B2Api(info)
    api.authorize_account(
        "production",
        os.environ["B2_APPLICATION_KEY_ID"],
        os.environ["B2_APPLICATION_KEY"],
    )
    bucket = api.get_bucket_by_name(os.environ["B2_BUCKET"])

    single_key = os.environ.get("SINGLE_KEY", "").strip()

    names = set()
    for version, _folder in bucket.ls("", recursive=True):
        names.add(version.file_name)

    if single_key:
        todo = [single_key] if single_key in names else []
    else:
        todo = []
        for name in sorted(names):
            lower = name.lower()
            if not lower.endswith(VIDEO_SUFFIXES):
                continue
            if lower.endswith(TWIN_SUFFIX):
                continue
            stem = name[: -len(name.split(".")[-1]) - 1]
            if (stem + TWIN_SUFFIX) in names:
                continue
            todo.append(name)

    chunk_size = max(1, int(os.environ.get("CHUNK_SIZE", "3")))
    chunks = [todo[i : i + chunk_size] for i in range(0, len(todo), chunk_size)]
    matrix = json.dumps({"include": [{"keys": chunk} for chunk in chunks]}, separators=(",", ":"))

    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        out.write(f"matrix={matrix}\n")
        out.write(f"count={len(todo)}\n")

    print(f"{len(todo)} file(s) need an H.264 twin ({len(chunks)} chunk(s))")
    for name in todo:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
