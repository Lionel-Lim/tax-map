"""Content-addressed source archive independent of the disposable raw cache.

Every copy is byte-verified before use. Builds never contact mutable upstream URLs.
"""

import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from zipfile import ZipFile

from .common import atomic_json, require, safe_path, sha256

MANIFESTS = ("data/source-manifest.json", "data/postcode-source-manifest.json")


def load_sources(root: Path, manifests=MANIFESTS):
    sources = {}
    for relative in manifests:
        manifest = json.loads(safe_path(root, relative).read_text())
        for source in manifest["sources"]:
            key = source["id"]
            require(key not in sources, f"Duplicate source id: {key}")
            require(re.fullmatch(r"[a-f0-9]{64}", source["sha256"]), f"Invalid hash: {key}")
            require(isinstance(source["bytes"], int) and source["bytes"] > 0, f"Invalid size: {key}")
            safe_path(root, source["localPath"])
            sources[key] = source
    return sources


def verify_file(path: Path, source):
    require(path.is_file(), f"Missing source {source['id']}: {path}")
    require(path.stat().st_size == source["bytes"], f"Size mismatch: {source['id']}")
    require(sha256(path) == source["sha256"], f"SHA-256 mismatch: {source['id']}")
    if source.get("members"):
        with ZipFile(path) as archive:
            for member in source["members"]:
                import hashlib
                with archive.open(member["name"]) as stream:
                    actual = hashlib.file_digest(stream, "sha256").hexdigest()
                require(actual == member["sha256"], f"Archive member changed: {member['name']}")


def copy_verified(source_path: Path, target: Path, source):
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as stream:
        temporary = Path(stream.name)
    try:
        shutil.copyfile(source_path, temporary)
        verify_file(temporary, source)
        with temporary.open("rb") as stream:
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def preserve_sources(root: Path, archive_root: Path, sources, manifests=MANIFESTS):
    """Preserve copies, or restore missing cache files; never replace corrupt data."""
    raw_root = (root / "data/raw").resolve()
    require(not archive_root.resolve().is_relative_to(raw_root), "Archive cannot live inside raw cache")
    entries = []
    for key, source in sorted(sources.items()):
        cached = safe_path(root, source["localPath"])
        blob = archive_root / "sha256" / source["sha256"]
        if blob.exists():
            verify_file(blob, source)
        if cached.exists():
            verify_file(cached, source)
        if not blob.exists():
            require(cached.exists(), f"Missing archive and cache for {key}; restore archived source bundle")
            copy_verified(cached, blob, source)
        if not cached.exists():
            copy_verified(blob, cached, source)
        entries.append({"id": key, "sha256": source["sha256"], "bytes": source["bytes"],
                        "blob": "sha256/" + source["sha256"], "restorePath": source["localPath"]})
    snapshots = []
    for relative in manifests:
        source_path = safe_path(root, relative)
        digest = sha256(source_path)
        target = archive_root / "manifests" / (digest + ".json")
        record = {"id": relative, "bytes": source_path.stat().st_size, "sha256": digest}
        if target.exists():
            verify_file(target, record)
        else:
            copy_verified(source_path, target, record)
        snapshots.append({"path": relative, "sha256": digest, "snapshot": "manifests/" + digest + ".json"})
    index = {"schemaVersion": "1.0.0", "sources": entries, "manifests": snapshots}
    # Keep historical catalogues so a later refresh cannot orphan old releases.
    from .common import json_bytes
    import hashlib
    catalogue_hash = hashlib.sha256(json_bytes(index)).hexdigest()
    atomic_json(archive_root / "catalogues" / (catalogue_hash + ".json"), index)
    atomic_json(archive_root / "index.json", index)
    return {"sourceCount": len(entries), "totalBytes": sum(e["bytes"] for e in entries),
            "catalogueSha256": catalogue_hash, "manifests": snapshots}


def verify_archive(archive_root: Path):
    index = json.loads((archive_root / "index.json").read_text())
    for entry in index["sources"]:
        verify_file(safe_path(archive_root, entry["blob"]), entry)
    for entry in index["manifests"]:
        require(sha256(safe_path(archive_root, entry["snapshot"])) == entry["sha256"],
                f"Manifest snapshot changed: {entry['path']}")
    return {"verifiedSources": len(index["sources"]), "verifiedManifests": len(index["manifests"])}
