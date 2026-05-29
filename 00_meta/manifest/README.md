# 00_meta/manifest — workspace artifact schema

The manifest is the **single source of truth** for what kinds of artifacts exist in this workspace, what fields they have, what they reference, and where their instances live. The .md template files under `00_meta/templates/` are *derived* from the manifest, not edited by hand. Instance files (a specific persona, a specific user flow, a specific ADR) are validated against the manifest.

## Why

Without a manifest, structural changes had to be propagated by hand across every dependent file. With it: edit the schema once, regenerate templates, run the validator, and every drift is caught automatically.

## Files in this folder

| File             | Role                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `schema.yaml`    | The source of truth. Defines every artifact type.                 |
| `_schema.py`     | Shared helpers — loading, parsing, rendering. Not run directly.   |
| `regenerate.py`  | Writes the .md template files from the manifest.                  |
| `validate.py`    | Checks template drift and validates instance files.               |
| `new_artifact.py`| CLI to scaffold a new instance with required fields prefilled.    |
| `requirements.txt` | Python dependencies (`pip install -r requirements.txt`).        |

## Setup

```bash
pip install -r 00_meta/manifest/requirements.txt --break-system-packages
```

Python 3.10+ recommended.

## Daily workflow

**To change a template's structure** (add a field, rename a section, swap a reference target):

```bash
$EDITOR 00_meta/manifest/schema.yaml
python 00_meta/manifest/regenerate.py --dry-run    # preview the diff
python 00_meta/manifest/regenerate.py              # write the new templates
python 00_meta/manifest/validate.py                # check existing instances still satisfy the schema
```

**To create a new artifact instance** (a persona, a user flow, an ADR):

```bash
python 00_meta/manifest/new_artifact.py --list                    # see types
python 00_meta/manifest/new_artifact.py user-flow run-an-experiment
$EDITOR 02_product/user-flows/run-an-experiment.md
python 00_meta/manifest/validate.py --only user-flow              # check it
```

**Before committing changes:**

```bash
python 00_meta/manifest/regenerate.py --dry-run    # any drift between manifest and templates?
python 00_meta/manifest/validate.py                # any broken references or missing fields?
```

Both should report clean. Add this to a pre-commit hook when the project is under git.

## What the validator checks

For every instance file under a declared `instance_folder`:

1. **Required fields are present** and contain a non-placeholder value (placeholders are `{...}`, `…`, `TBD`, `TODO`, empty).
2. **Enum fields** have a value from the declared `values` list. The template's default (which shows all options separated by `|`) is detected and flagged as still-a-placeholder.
3. **Reference fields** point to files that actually exist in the target type's folder. Both `path/to/file.md` and `[label](path/to/file.md)` syntaxes are recognized.
4. **Required sections** (`## Section name` headings) are present.
5. **Unknown fields** in instances are flagged (caught typos in field labels).

Templates are also checked for drift against the manifest — if someone hand-edits a template, the validator catches it and points at `regenerate.py`.

## Adding a new artifact type

1. Open `schema.yaml`. Copy an existing `artifact_types:` entry as a starting point.
2. Pick a kebab-case `type_key` (the YAML key).
3. Fill in `name`, `title_pattern`, `instance_folder`, `description`. Set `template_file` if this type should have a template (most do).
4. Define `fields` (front-matter at the top of every instance) and `sections` (H2 headings in the body).
5. Run `python regenerate.py` to write the template file.
6. Update `02_product/README.md` (or the relevant phase README) to mention the new type.
7. Update `STATUS.md` and the dashboard.

## What this system deliberately does NOT do

- **No silent cascading edits to instances.** When a field is renamed in the manifest, the validator will flag every instance with the old field name. You decide whether to migrate or leave them — but you'll know.
- **No automatic regeneration on save.** Regeneration is explicit. Drift is caught by `validate.py`, not by a file watcher.
- **No instance generation from a database.** Instances are markdown files you write; the manifest just describes their shape.

## When the manifest is wrong

If reality and the manifest disagree (e.g., a new field has crept into several instance files but the manifest hasn't been updated), update the manifest, run `regenerate.py`, and run `validate.py`. The instances are the lived reality; the manifest should catch up.

If a check is firing falsely (e.g., your reference syntax is valid but the validator can't parse it), open `_schema.py` — the parsing logic is small and well-commented. Fix it, then add a comment in this README so the next person knows.
