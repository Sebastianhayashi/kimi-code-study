# Course home format

Every teaching workspace has one root `index.html`. It is the learner's home for this course, not a cross-course library.

## Generate the page

From the `teach` skill directory, run:

```bash
python3 scripts/build-course-index.py --workspace /absolute/path/to/teaching-workspace
```

The generator scans the workspace and writes a static index. It also installs `assets/course.css` when the workspace does not already have one. It never overwrites an existing course stylesheet.

After changing any indexed artifact, regenerate and verify:

```bash
python3 scripts/build-course-index.py --workspace /absolute/path/to/teaching-workspace --check
```

`--check` exits unsuccessfully when the index is absent or stale, a local link is broken, a lesson or reference does not link home, or adjacent lessons do not link to each other.

## Indexed artifacts

The home page presents:

- the mission and a continue-learning link;
- every numbered lesson in order;
- every HTML reference document;
- learning records as evidence of progress;
- `RESOURCES.md` and `NOTES.md` when present;
- whole-book gate status, coverage, RIA distillation status, overview, verified-method register, curriculum blueprint, and teaching map when present.

Use clear HTML titles because the generator uses `<title>` as the display name. Add a concise description when useful:

```html
<title>Feedback Loops</title>
<meta name="description" content="Recognize and tighten a feedback loop in a real workflow.">
```

## Navigation contract

Every lesson must include visible links to:

- `../index.html` as **Course home**;
- the preceding lesson when one exists;
- the following lesson when one exists.

Reference documents must link back to `../index.html`. Prefer relative links so the entire workspace remains portable.

Open `index.html` when handing a course back to the learner. Do not open an isolated lesson as the default entry point.
