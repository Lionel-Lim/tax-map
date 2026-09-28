"""Run with `python -m pipeline`; all build operations are offline."""

import argparse
import json
from pathlib import Path

from . import RELEASE_IDS
from .archive import load_sources, preserve_sources, verify_archive
from .build import build, verify_release


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "archive", "verify-archive", "verify-release"))
    parser.add_argument("--archive-dir", type=Path, default=root / "data/archive")
    parser.add_argument("--output-dir", type=Path, default=root / "static/data")
    parser.add_argument("--scope", choices=tuple(RELEASE_IDS), default="sample",
                        help="Preserve the five-authority sample, or prepare the complete England inventory")
    parser.add_argument("--release-id", default=None)
    args = parser.parse_args()
    release_id = args.release_id or RELEASE_IDS[args.scope]
    try:
        if args.command == "build":
            build(root, args.archive_dir.resolve(), args.output_dir.resolve(), release_id, scope=args.scope)
        elif args.command == "archive":
            print(json.dumps(preserve_sources(root, args.archive_dir.resolve(), load_sources(root)), indent=2))
        elif args.command == "verify-archive":
            print(json.dumps(verify_archive(args.archive_dir.resolve()), indent=2))
        else:
            print(json.dumps(verify_release(args.output_dir.resolve() / release_id), indent=2))
    except (ValueError, FileNotFoundError, KeyError) as error:
        parser.exit(1, f"Pipeline validation failed: {error}\n")


if __name__ == "__main__":
    main()
