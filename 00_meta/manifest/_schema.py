"""
Shared helpers for the workspace artifact manifest.

The manifest (schema.yaml) declares every artifact type, its fields, its
sections, and the folder where its instances live. This module loads the
manifest and provides the primitives used by:

  - regenerate.py  (writes/refreshes template .md files from the manifest)
  - validate.py    (checks instance .md files against the manifest)
  - new_artifact.py (scaffolds a new instance file)

Conventions:
  - Templates are deterministic from the manifest. Edit the manifest, then run
    regenerate.py. Hand edits to template files will be overwritten.
  - Instance files use the same field/section structure as their template.
    The validator parses them via regex over the markdown.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

THIS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = THIS_DIR.parent.parent
SCHEMA_PATH = THIS_DIR / "schema.yaml"


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def load_schema(path: Path = SCHEMA_PATH) -> dict[str, Any]:
    """Load and lightly validate the manifest."""
    with open(path) as f:
        schema = yaml.safe_load(f)
    if not isinstance(schema, dict) or "artifact_types" not in schema:
        raise ValueError(f"{path} is missing 'artifact_types' at the top level.")
    return schema


# --------------------------------------------------------------------------
# Placeholder detection
# --------------------------------------------------------------------------

# Heuristics for "the field has not actually been filled in" — used so that
# we don't treat template scaffolding as broken references.
_PLACEHOLDER_PATTERNS = [
    re.compile(r"^\s*$"),              # empty
    re.compile(r"^\s*\{[^}]*\}\s*$"),  # entirely {placeholder}
    re.compile(r"^\s*…\s*$"),          # just an ellipsis
    re.compile(r"^\s*\.\.\.\s*$"),     # three dots
    re.compile(r"^\s*TBD\s*$", re.I),
    re.compile(r"^\s*TODO\s*$", re.I),
]


def is_placeholder(value: str) -> bool:
    """True if the value is template scaffolding rather than a real value."""
    if value is None:
        return True
    return any(p.match(value) for p in _PLACEHOLDER_PATTERNS)


# --------------------------------------------------------------------------
# Instance parsing
# --------------------------------------------------------------------------

@dataclass
class ParsedInstance:
    title: str | None
    fields: dict[str, str]
    sections: list[str]


_TITLE_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
_FIELD_RE = re.compile(r"^-\s+\*\*([^*]+?):\*\*\s*(.*?)\s*$", re.MULTILINE)
_SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)


def parse_instance(content_or_path: str | Path) -> ParsedInstance:
    """
    Parse an instance .md file into title, fields, and section names.

    Fields are top-level metadata bullets (- **Label:** value) that live
    BETWEEN the H1 title and the first H2 section heading. Bullets that
    look the same but appear inside a section are not fields — they're
    content. We delimit the field region accordingly.
    """
    if isinstance(content_or_path, Path):
        content = content_or_path.read_text()
    else:
        content = content_or_path

    title_match = _TITLE_RE.search(content)
    title = title_match.group(1).strip() if title_match else None

    # Field region: from start of file (or after title) up to first H2.
    first_section = _SECTION_RE.search(content)
    field_region = content[: first_section.start()] if first_section else content

    fields = {m.group(1).strip(): m.group(2).strip() for m in _FIELD_RE.finditer(field_region)}
    sections = [m.group(1).strip() for m in _SECTION_RE.finditer(content)]
    return ParsedInstance(title=title, fields=fields, sections=sections)


# --------------------------------------------------------------------------
# Reference resolution
# --------------------------------------------------------------------------

# A reference value can look like any of:
#   02_product/personas/pi.md
#   [PI](../personas/pi.md)
#   personas/pi.md, personas/ra.md   (multi-reference, comma-separated)
#   {link to persona}                (placeholder — skipped)

_MD_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
_PATHY_RE = re.compile(r"[\w\-./]+\.md\b|[\w\-]+(?:/[\w\-]+)+/?")


def extract_reference_paths(value: str) -> list[str]:
    """Pull out path-like substrings from a field value."""
    if is_placeholder(value):
        return []
    # First check for markdown link syntax.
    paths = _MD_LINK_RE.findall(value)
    if paths:
        return paths
    # Otherwise grab anything that looks like a path.
    return _PATHY_RE.findall(value)


def index_instances(schema: dict[str, Any], root: Path = PROJECT_ROOT) -> dict[str, set[Path]]:
    """Map artifact-type key → set of instance file paths."""
    index: dict[str, set[Path]] = {}
    for type_key, spec in schema["artifact_types"].items():
        folder = spec.get("instance_folder")
        if not folder:
            index[type_key] = set()
            continue
        full = root / folder
        if not full.exists():
            index[type_key] = set()
            continue
        index[type_key] = {p for p in full.glob("*.md") if not p.name.startswith(".")}
    return index


def resolve_reference(
    value: str,
    target_type: str,
    instance_index: dict[str, set[Path]],
    schema: dict[str, Any],
    root: Path = PROJECT_ROOT,
) -> tuple[bool, list[str]]:
    """
    Try to resolve a reference value against the index.

    Returns (resolved_ok, unresolved_paths). If the value is a placeholder,
    returns (True, []) because we treat unfilled placeholders as "not set."
    """
    if is_placeholder(value):
        return True, []

    paths = extract_reference_paths(value)
    if not paths:
        # Value contains text but no parseable path — treat as unresolved.
        return False, [value]

    target_folder = schema["artifact_types"].get(target_type, {}).get("instance_folder")
    target_index = instance_index.get(target_type, set())
    unresolved: list[str] = []
    for raw in paths:
        # Strip leading ./, leading slashes
        candidate = raw.lstrip("./").lstrip("/")
        resolved = False

        # Try as an absolute project path
        abs_candidate = (root / candidate).resolve()
        if abs_candidate in {p.resolve() for p in target_index}:
            resolved = True
        elif target_folder:
            # Try as a bare filename within the target folder
            bare = (root / target_folder / Path(candidate).name).resolve()
            if bare in {p.resolve() for p in target_index}:
                resolved = True
        if not resolved:
            unresolved.append(raw)

    return (not unresolved), unresolved


# --------------------------------------------------------------------------
# Template / instance rendering
# --------------------------------------------------------------------------

_BARE_SYMBOL_PLACEHOLDERS = {"…", "...", "TBD", "TODO"}


def _render_field_value(field: dict[str, Any], for_instance: bool = False) -> str:
    """Render the value side of a field bullet."""
    ftype = field["type"]
    if ftype == "enum":
        values = field.get("values", [])
        return " | ".join(values)
    if ftype == "reference":
        placeholder = field.get("placeholder") or f"link to {field.get('target', 'artifact')}"
        if placeholder.startswith("{") and placeholder.endswith("}"):
            return placeholder
        if placeholder in _BARE_SYMBOL_PLACEHOLDERS:
            return placeholder
        return "{" + placeholder + "}"
    if ftype == "date":
        return field.get("placeholder", "YYYY-MM-DD")
    # text or unknown
    placeholder = field.get("placeholder", "…")
    if placeholder.startswith("{") and placeholder.endswith("}"):
        return placeholder
    if placeholder in _BARE_SYMBOL_PLACEHOLDERS:
        return placeholder
    return "{" + placeholder + "}"


def render_template(type_key: str, schema: dict[str, Any]) -> str:
    """Render the .md template for an artifact type from the manifest."""
    spec = schema["artifact_types"][type_key]
    out: list[str] = []

    title_pattern = spec.get("title_pattern", spec["name"])
    out.append(f"# {title_pattern}")
    out.append("")

    # Optional intro prose between the title and the fields. This is the place
    # to explain what the artifact is, before showing its structure.
    intro = (spec.get("intro") or "").rstrip()
    if intro:
        out.append(intro)
        out.append("")

    fields = spec.get("fields") or []
    for f in fields:
        label = f["label"]
        value = _render_field_value(f)
        out.append(f"- **{label}:** {value}")

    if fields:
        out.append("")

    sections = spec.get("sections") or []
    for s in sections:
        out.append(f"## {s['name']}")
        out.append("")
        desc = (s.get("description") or "").rstrip()
        if desc:
            out.append(desc)
            out.append("")

    # Ensure trailing newline
    text = "\n".join(out).rstrip() + "\n"
    return text


def render_instance(
    type_key: str,
    schema: dict[str, Any],
    display_name: str,
    number_prefix: str = "",
) -> str:
    """Render a starter instance file with the title filled in."""
    spec = schema["artifact_types"][type_key]
    out: list[str] = []

    title_pattern = spec.get("title_pattern", spec["name"])
    # {NNN+} (one or more N's) gets the numeric prefix from the slug.
    title = re.sub(r"\{N+\}", number_prefix, title_pattern)
    # All other {...} placeholders become the display name.
    title = re.sub(r"\{[^}]*\}", display_name, title)
    out.append(f"# {title}")
    out.append("")

    fields = spec.get("fields") or []
    for f in fields:
        label = f["label"]
        value = _render_field_value(f, for_instance=True)
        out.append(f"- **{label}:** {value}")

    if fields:
        out.append("")

    sections = spec.get("sections") or []
    for s in sections:
        out.append(f"## {s['name']}")
        out.append("")
        desc = (s.get("description") or "").rstrip()
        if desc:
            out.append("> " + desc.replace("\n", "\n> "))
            out.append("")
        out.append("(fill in)")
        out.append("")

    text = "\n".join(out).rstrip() + "\n"
    return text


# --------------------------------------------------------------------------
# Pretty printing
# --------------------------------------------------------------------------

def use_color() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def c(s: str, color: str) -> str:
    if not use_color():
        return s
    codes = {"red": "31", "green": "32", "yellow": "33", "blue": "34", "dim": "2", "bold": "1"}
    code = codes.get(color, "0")
    return f"\x1b[{code}m{s}\x1b[0m"
