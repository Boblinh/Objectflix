"""Transcode a chunk of B2 video files to H.264/AAC twins.

ITEMS_JSON is a list of {"account", "bucket", "key"} items produced by the
plan job. Account "1" uses B2_APPLICATION_KEY_ID/KEY, account "2" uses
B2_APPLICATION_KEY_ID_2/B2_APPLICATION_KEY_2.

Per item: download original -> ffprobe (skip if already H.264) ->
ffmpeg to <name>.avc.mp4 (yuv420p, faststart, AAC) -> upload twin into
the same bucket. One bad file logs a warning and moves on; originals are
never touched.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

from b2sdk.v2 import B2Api, InMemoryAccountInfo

TWIN_SUFFIX = ".avc.mp4"

MEDIA_BASE = os.environ.get("MEDIA_BASE", "").rstrip("/")
USE_WORKER_DOWNLOAD = os.environ.get("USE_WORKER_DOWNLOAD", "1") != "0"
# Direct B2 downloads count against the account's daily bandwidth cap.
# Keep this off unless you have raised the cap / added a payment method.
ALLOW_DIRECT_DOWNLOAD = os.environ.get("ALLOW_DIRECT_DOWNLOAD", "0") == "1"


def http_download(bucket: str, key: str, dest: str) -> None:
    # Use legacy /media/<key> format — the Worker resolves bucket 1 by
    # default and the explicit-bucket route has an auth routing bug.
    url = f"{MEDIA_BASE}/{key}"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; objectflix-transcoder/1.0)"})
    try:
        with urllib.request.urlopen(request, timeout=300) as response, open(dest, "wb") as out:
            shutil.copyfileobj(response, out)
    except urllib.error.HTTPError as exc:
        body_head = exc.read(300).decode("utf-8", "replace").replace("\n", " ")
        raise RuntimeError(f"{url} -> HTTP {exc.code}: {body_head}") from None


def make_api(account_id: str):
    if account_id == "2":
        key_id = os.environ["B2_APPLICATION_KEY_ID_2"]
        app_key = os.environ["B2_APPLICATION_KEY_2"]
    else:
        key_id = os.environ["B2_APPLICATION_KEY_ID"]
        app_key = os.environ["B2_APPLICATION_KEY"]
    info = InMemoryAccountInfo()
    api = B2Api(info)
    api.authorize_account("production", key_id, app_key)
    return api


def video_codec(path: str) -> str:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name",
            "-of", "csv=p=0",
            path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip().lower()


def transcode(src: str, dst: str) -> None:
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", src,
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "160k",
            "-movflags", "+faststart",
            "-max_muxing_queue_size", "1024",
            dst,
        ],
        check=True,
    )


def main() -> None:
    items = json.loads(os.environ["ITEMS_JSON"])
    apis = {}
    buckets = {}

    def bucket_for(account_id: str, name: str):
        if account_id not in apis:
            apis[account_id] = make_api(account_id)
        if (account_id, name) not in buckets:
            buckets[(account_id, name)] = apis[account_id].get_bucket_by_name(name)
        return buckets[(account_id, name)]

    workdir = tempfile.mkdtemp(prefix="ofx-transcode-")
    ok = failed = skipped = 0

    try:
        for item in items:
            key = item["key"]
            account_id = str(item.get("account", "1"))
            bucket = bucket_for(account_id, item["bucket"])
            stem = key.rsplit(".", 1)[0]
            twin_key = stem + TWIN_SUFFIX
            local_in = os.path.join(workdir, os.path.basename(key))
            local_out = os.path.join(workdir, os.path.basename(twin_key))

            try:
                print(f"::group::{key}")
                downloaded = False
                if USE_WORKER_DOWNLOAD and MEDIA_BASE:
                    try:
                        print("downloading via Cloudflare Worker…")
                        http_download(item["bucket"], key, local_in)
                        downloaded = True
                    except Exception as exc:  # noqa: BLE001
                        print(f"::warning::worker download failed ({exc}); falling back to direct B2")
                if not downloaded:
                    if ALLOW_DIRECT_DOWNLOAD:
                        print("downloading direct from B2…")
                        bucket.download_file_by_name(key).save_to(local_in)
                    else:
                        raise RuntimeError(
                            "worker download failed and direct-B2 fallback is disabled "
                            "(ALLOW_DIRECT_DOWNLOAD != 1) to protect the daily bandwidth cap"
                        )

                codec = video_codec(local_in)
                if codec in ("h264", "avc"):
                    print(f"already H.264 ({codec}) — skipping")
                    skipped += 1
                    continue
                print(f"source codec: {codec} -> transcoding")

                transcode(local_in, local_out)

                print(f"uploading {twin_key}…")
                bucket.upload_local_file(
                    local_file=local_out,
                    file_name=twin_key,
                )
                ok += 1
                print(f"done: {twin_key}")
            except Exception as exc:  # noqa: BLE001 - keep chunk alive
                failed += 1
                message = str(exc)
                print(f"::warning::FAILED {key}: {message}")
                if "cap_exceeded" in message or "download_cap" in message:
                    print(
                        "::error::B2 download cap is exhausted for this account. "
                        "Raise/remove the cap in Backblaze Caps & Alerts or wait for the UTC reset, "
                        "then re-run the workflow. Stopping this chunk early — remaining files would fail identically."
                    )
                    sys.exit(2)
            finally:
                for path in (local_in, local_out):
                    if os.path.exists(path):
                        os.remove(path)
                print("::endgroup::")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    print(f"chunk summary: {ok} transcoded, {skipped} skipped (already H.264), {failed} failed")
    # A fully failed chunk should surface in CI, partial failures stay green.
    sys.exit(1 if ok == 0 and failed > 0 and skipped == 0 else 0)


if __name__ == "__main__":
    main()
