#!/usr/bin/env python3
"""
Scaffold a new artifact instance from the manifest.

Usage:
  python new_artifact.py <type-key> <slug> [--title "Optional pretty title"]
  python new_artifact.py --list                       # show available types
  python new_artifact.py user-flow run-an-experiment
  python new_artifact.py adr 0001-path-selection --title "Choose Path A vs Path B"

The file is created at <instance_folder>/<slug>.md with required fields
prefilled (as placeholders for you to complete) and the H1 title interpolated.

Refuses to overwrite an existing file unless --force is passed.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _schema import PROJECT_ROOT, c, load_schema, render_instance


def list_types(schema: dict) -> None:
    print(c("Available artifact types:", "bold"))
    rows = []
    for key, spec in schema["artifact_types"].items():
        folder = spec.get("instance_folder") or "(no fixed folder)"
        rows.append((key, spec["name"], folder))
    width = max(len(k) for k, _, _ in rows)
    for k, name, folder in rows:
        print(f"  {k.ljust(width)}  {c(name, 'blue')}  {c(folder, 'dim')}")


def slug_to_display_name(slug: str) -> tuple[str, str]:
    """
    Split a slug into (number_prefix, display_name).

      "run-an-experiment"     -> ("",     "Run an experiment")
      "0001-path-selection"   -> ("0001", "Path selection")
    """
    words = slug.replace("_", "-").split("-")
    if not words:
        return "", slug
    if words[0].isdigit():
        number_prefix = words[0]
        rest = words[1:] or [slug]
        return number_prefix, " ".join(rest).capitalize()
    return "", " ".join(words).capitalize()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("type_key", nargs="?", help="artifact type (e.g. user-flow)")
    parser.add_argument("slug", nargs="?", help="filename slug (no extension)")
    parser.add_argument("--title", help="override the rendered H1 title (default: derived from slug)")
    parser.add_argument("--force", action="store_true", help="overwrite if the file already exists")
    parser.add_argument("--list", action="store_true", help="list available types and exit")
    args = parser.parse_args()

    schema = load_schema()

    if args.list:
        list_types(schema)
        return 0

    if not args.type_key or not args.slug:
        parser.print_help()
        return 2

    if args.type_key not in schema["artifact_types"]:
        print(c(f"error: unknown type '{args.type_key}'", "red"))
        print()
        list_types(schema)
        return 2

    spec = schema["artifact_types"][args.type_key]
    folder = spec.get("instance_folder")
    if not folder:
        print(c(f"error: '{args.type_key}' has no instance_folder declared", "red"))
        print(f"hint: this type isn't saved as a file (e.g. PR checklist is copied into PR descriptions).")
        return 2

    target = PROJECT_ROOT / folder / f"{args.slug}.md"
    if target.exists() and not args.force:
        print(c(f"error: {target.relative_to(PROJECT_ROOT)} already exists", "red"))
        print(f"hint: pass --force to overwrite.")
        return 2

    number_prefix, derived_name = slug_to_display_name(args.slug)
    display_name = args.title or derived_name
    content = render_instance(args.type_key, schema, display_name, number_prefix=number_prefix)

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    print(c("✓ created ", "green") + str(target.relative_to(PROJECT_ROOT)))
    print(f"  type:  {spec['name']} ({args.type_key})")
    print(f"  title: {display_name}")
    print()
    print(c("next steps:", "dim"))
    print(f"  1. Open the file and fill in the bracketed placeholders.")
    print(f"  2. Run python 00_meta/manifest/validate.py --only {args.type_key} to check it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
