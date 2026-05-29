#!/usr/bin/env python3
"""
Validate every instance file in the workspace against the manifest.

Checks per instance:
  - All required fields are present and have a non-placeholder value.
  - Enum-typed fields have a value from the declared enum.
  - Reference-typed fields point to files that actually exist in the target
    artifact type's instance folder.
  - All required sections (H2 headings) are present.

Also checks template files against the manifest (drift between schema.yaml
and the rendered .md). Templates themselves are checked even when no
instances exist.

Exit codes:
  0 — clean
  1 — errors found
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from _schema import (
    PROJECT_ROOT,
    c,
    index_instances,
    is_placeholder,
    load_schema,
    parse_instance,
    render_template,
    resolve_reference,
)


def validate_template(type_key: str, schema: dict[str, Any]) -> list[str]:
    """Check that the .md template matches what the manifest would render."""
    spec = schema["artifact_types"][type_key]
    template_rel = spec.get("template_file")
    if not template_rel:
        return []
    template_path = PROJECT_ROOT / template_rel
    if not template_path.exists():
        return [f"template missing: {template_rel} (run regenerate.py)"]
    actual = template_path.read_text()
    expected = render_template(type_key, schema)
    if actual != expected:
        return [f"template drift: {template_rel} differs from schema.yaml (run regenerate.py to view diff)"]
    return []


def validate_instance(
    path: Path,
    type_key: str,
    schema: dict[str, Any],
    instance_index: dict[str, set[Path]],
) -> list[str]:
    """Check one instance file against its declared schema."""
    spec = schema["artifact_types"][type_key]
    errors: list[str] = []
    parsed = parse_instance(path)

    spec_fields_by_label = {f["label"]: f for f in (spec.get("fields") or [])}
    spec_section_names = [s["name"] for s in (spec.get("sections") or [])]

    # Required fields present?
    for label, field in spec_fields_by_label.items():
        present = label in parsed.fields
        value = parsed.fields.get(label, "")

        if field.get("required"):
            if not present:
                errors.append(f"missing required field: '{label}'")
                continue
            if is_placeholder(value):
                errors.append(f"required field '{label}' is still a placeholder: {value!r}")
                continue

        if not present or is_placeholder(value):
            continue

        # Enum check
        if field["type"] == "enum":
            allowed = field.get("values", [])
            # value may be space- or pipe-separated list of choices — pick the first non-trivial token group
            # We accept exact match, or trim of leading "**status**" weirdness
            cleaned = value.strip().rstrip(".")
            # For pipe-separated raw template defaults, treat as still-placeholder
            if "|" in cleaned and all(v in cleaned for v in allowed):
                errors.append(f"field '{label}' looks like the template's enum default (multiple options shown)")
                continue
            if cleaned not in allowed:
                errors.append(f"field '{label}' = {cleaned!r} is not in allowed values {allowed}")

        # Reference check
        if field["type"] == "reference":
            target = field["target"]
            ok, unresolved = resolve_reference(value, target, instance_index, schema)
            if not ok:
                errors.append(
                    f"field '{label}' references {target} but couldn't resolve: {unresolved}"
                )

    # Unknown fields (warn, but don't fail)
    for label in parsed.fields:
        if label not in spec_fields_by_label:
            errors.append(f"unknown field: '{label}' (not in schema for {type_key})")

    # Required sections present?
    parsed_section_set = set(parsed.sections)
    for name in spec_section_names:
        if name not in parsed_section_set:
            errors.append(f"missing required section: '## {name}'")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-templates", action="store_true", help="skip template-drift checks")
    parser.add_argument("--only", help="only validate this artifact type key")
    args = parser.parse_args()

    schema = load_schema()
    instance_index = index_instances(schema)

    total_problems = 0
    types_checked = 0
    instances_checked = 0

    for type_key, spec in schema["artifact_types"].items():
        if args.only and type_key != args.only:
            continue
        types_checked += 1

        # Template drift
        if not args.no_templates:
            for err in validate_template(type_key, schema):
                print(c(f"[{type_key}] ", "yellow") + err)
                total_problems += 1

        # Instance validation
        for inst_path in sorted(instance_index.get(type_key, set())):
            instances_checked += 1
            errors = validate_instance(inst_path, type_key, schema, instance_index)
            if errors:
                rel = inst_path.relative_to(PROJECT_ROOT)
                print(c(f"\n[{type_key}] {rel}", "bold"))
                for e in errors:
                    print("  " + c("✗", "red") + " " + e)
                total_problems += len(errors)

    print()
    summary = f"checked {types_checked} type(s), {instances_checked} instance(s)"
    if total_problems == 0:
        print(c("✓ clean — ", "green") + summary)
        return 0
    print(c(f"✗ {total_problems} problem(s) — ", "red") + summary)
    return 1


if __name__ == "__main__":
    sys.exit(main())
