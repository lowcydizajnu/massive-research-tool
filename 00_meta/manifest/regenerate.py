#!/usr/bin/env python3
"""
Regenerate the .md template files from the manifest (schema.yaml).

Usage:
  python regenerate.py            # write/refresh all template files
  python regenerate.py --dry-run  # show what would change, don't write

The manifest is the source of truth. Hand edits to template files will be
overwritten the next time this runs. To change a template, edit schema.yaml
and re-run this script.
"""

from __future__ import annotations

import argparse
import difflib
import sys
from pathlib import Path

from _schema import PROJECT_ROOT, c, load_schema, render_template


def diff_lines(old: str, new: str, path: str) -> list[str]:
    return list(
        difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"{path} (current)",
            tofile=f"{path} (manifest)",
            n=2,
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="don't write, just report")
    parser.add_argument("--quiet", action="store_true", help="only print summary")
    args = parser.parse_args()

    schema = load_schema()
    changed: list[str] = []
    unchanged: list[str] = []
    skipped: list[str] = []

    for type_key, spec in schema["artifact_types"].items():
        template_rel = spec.get("template_file")
        if not template_rel:
            skipped.append(f"{type_key} (no template_file declared)")
            continue

        template_path = PROJECT_ROOT / template_rel
        new_content = render_template(type_key, schema)
        old_content = template_path.read_text() if template_path.exists() else ""

        if old_content == new_content:
            unchanged.append(template_rel)
            continue

        changed.append(template_rel)

        if not args.quiet:
            print(c(f"--- {template_rel}", "bold"))
            diff = diff_lines(old_content, new_content, template_rel)
            if diff:
                for line in diff:
                    if line.startswith("+") and not line.startswith("+++"):
                        sys.stdout.write(c(line, "green"))
                    elif line.startswith("-") and not line.startswith("---"):
                        sys.stdout.write(c(line, "red"))
                    elif line.startswith("@@"):
                        sys.stdout.write(c(line, "blue"))
                    else:
                        sys.stdout.write(line)
            print()

        if not args.dry_run:
            template_path.parent.mkdir(parents=True, exist_ok=True)
            template_path.write_text(new_content)

    print()
    if changed:
        verb = "would update" if args.dry_run else "updated"
        print(c(f"{verb} {len(changed)} template(s):", "yellow"))
        for f in changed:
            print(f"  - {f}")
    if unchanged:
        print(c(f"unchanged: {len(unchanged)}", "dim"))
    if skipped:
        print(c(f"skipped: {len(skipped)}", "dim"))
        for s in skipped:
            print(c(f"  - {s}", "dim"))

    return 0


if __name__ == "__main__":
    sys.exit(main())
