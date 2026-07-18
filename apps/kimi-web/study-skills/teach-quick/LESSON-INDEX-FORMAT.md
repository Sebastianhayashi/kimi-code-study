# Lesson Index Format

`lessons/index.json` is the versioned manifest used by Kimi Study to render the lesson tree with one file read. It is course output, not a cache: update it whenever lesson publication state changes.

## Contract

```json
{
  "schemaVersion": 1,
  "contractRevision": "kimi-study-lessons-v1",
  "lessons": [
    {
      "order": 1,
      "path": "lessons/0001-feedback-loops.html",
      "title": "Feedback loops",
      "status": "published"
    },
    {
      "order": 2,
      "path": "lessons/0002-boundaries.html",
      "title": "Boundaries",
      "status": "planned"
    }
  ]
}
```

Rules:

- `order` starts at 1 and is contiguous in array order.
- `path` is unique and matches `lessons/<safe-name>.html`; absolute paths and `..` are forbidden.
- `title` is learner-facing, non-empty, at most 200 characters, and contains no template placeholders.
- `status` is one of `planned`, `published`, or `failed`.
- Every `published` entry has an existing HTML file at its exact path.
- The number of `published` entries equals `generation.publishedLessons` in `source/STUDY-SNAPSHOT.json`.
- Generation status `ready` requires every indexed lesson to be `published`.

## Publication order

For each lesson publication:

1. Write and validate the lesson HTML.
2. Atomically replace `lessons/index.json` with the new manifest.
3. Update `source/STUDY-SNAPSHOT.json` so `publishedLessons` matches the manifest.

Never publish the index before its HTML file exists. If a write fails, retain the last valid index and snapshot rather than exposing a path that cannot be read.

A safe writer follows this shape (pseudocode):

```python
def atomic_json_replace(path, value):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    fsync(tmp)
    replace(tmp, path)  # same-filesystem atomic rename

write_and_validate_lesson_html(lesson_path)
atomic_json_replace(index_path, next_manifest)
atomic_json_replace(snapshot_path, next_snapshot_with_matching_count)
```

If snapshot replacement fails after the index succeeds, retry the snapshot write; the UI cross-checks the published count and falls back to legacy discovery until the pair agrees.
