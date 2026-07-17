#!/usr/bin/env python3
"""Build a static, server-free home page for one teach workspace."""

from __future__ import annotations

import argparse
import html
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit


@dataclass(frozen=True)
class Entry:
    path: str
    title: str
    description: str = ""


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def clean_markdown(text: str) -> str:
    text = re.sub(r"!\[[^]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`>#]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def markdown_title(path: Path) -> str:
    match = re.search(r"^#\s+(.+)$", read_text(path), re.MULTILINE)
    return clean_markdown(match.group(1)) if match else path.stem.replace("-", " ").title()


def html_metadata(path: Path) -> tuple[str, str]:
    source = read_text(path)
    title_match = re.search(r"<title[^>]*>(.*?)</title>", source, re.IGNORECASE | re.DOTALL)
    if not title_match:
        title_match = re.search(r"<h1[^>]*>(.*?)</h1>", source, re.IGNORECASE | re.DOTALL)
    raw_title = re.sub(r"<[^>]+>", "", title_match.group(1)) if title_match else path.stem
    description_match = re.search(
        r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']\s*/?>',
        source,
        re.IGNORECASE | re.DOTALL,
    )
    title = html.unescape(re.sub(r"\s+", " ", raw_title).strip())
    description = html.unescape(re.sub(r"\s+", " ", description_match.group(1)).strip()) if description_match else ""
    return title, description


def section_value(source: str, label: str, default: str) -> str:
    match = re.search(rf"^-\s*{re.escape(label)}:\s*(.+?)\s*$", source, re.MULTILINE | re.IGNORECASE)
    return clean_markdown(match.group(1)) if match else default


def mission_details(workspace: Path) -> tuple[str, str]:
    mission_path = workspace / "MISSION.md"
    if not mission_path.exists():
        return "Your course", "Define MISSION.md to give every lesson a concrete destination."

    source = read_text(mission_path)
    title = markdown_title(mission_path)
    title = re.sub(r"^Mission:\s*", "", title, flags=re.IGNORECASE)
    why = re.search(r"^##\s+Why\s*$\n(.*?)(?=^##\s|\Z)", source, re.MULTILINE | re.DOTALL | re.IGNORECASE)
    summary = clean_markdown(why.group(1)) if why else "A stateful learning path built around your mission."
    return title, summary


def collect_html(directory: Path, workspace: Path) -> list[Entry]:
    if not directory.exists():
        return []
    entries = []
    for path in sorted(directory.glob("*.html")):
        title, description = html_metadata(path)
        entries.append(Entry(path.relative_to(workspace).as_posix(), title, description))
    return entries


def collect_records(workspace: Path) -> list[Entry]:
    directory = workspace / "learning-records"
    if not directory.exists():
        return []
    return [
        Entry(path.relative_to(workspace).as_posix(), markdown_title(path))
        for path in sorted(directory.glob("*.md"))
    ]


def local_targets(path: Path) -> tuple[set[Path], list[str]]:
    targets: set[Path] = set()
    errors: list[str] = []
    for raw_href in re.findall(r'href=["\'](.*?)["\']', read_text(path), re.IGNORECASE):
        href = html.unescape(raw_href)
        parts = urlsplit(href)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        target = (path.parent / unquote(parts.path)).resolve()
        targets.add(target)
        if not target.exists():
            errors.append(f"{path}: broken local link: {href}")
    return targets, errors


def navigation_errors(workspace: Path) -> list[str]:
    errors: list[str] = []
    index_path = (workspace / "index.html").resolve()
    lessons = sorted((workspace / "lessons").glob("*.html")) if (workspace / "lessons").exists() else []

    for position, lesson in enumerate(lessons):
        targets, link_errors = local_targets(lesson)
        errors.extend(link_errors)
        if index_path not in targets:
            errors.append(f"{lesson}: missing Course home link to ../index.html")
        if position > 0 and lessons[position - 1].resolve() not in targets:
            errors.append(f"{lesson}: missing previous-lesson link to {lessons[position - 1].name}")
        if position + 1 < len(lessons) and lessons[position + 1].resolve() not in targets:
            errors.append(f"{lesson}: missing next-lesson link to {lessons[position + 1].name}")

    reference_dir = workspace / "reference"
    references = sorted(reference_dir.glob("*.html")) if reference_dir.exists() else []
    for reference in references:
        targets, link_errors = local_targets(reference)
        errors.extend(link_errors)
        if index_path not in targets:
            errors.append(f"{reference}: missing Course home link to ../index.html")

    return errors


def render_entries(entries: list[Entry], empty_message: str) -> str:
    if not entries:
        return f'<p class="empty">{html.escape(empty_message)}</p>'
    rows = []
    for index, entry in enumerate(entries, start=1):
        description = (
            f'<span class="item-description">{html.escape(entry.description)}</span>'
            if entry.description
            else ""
        )
        rows.append(
            '<li>'
            f'<span class="item-number">{index:02d}</span>'
            '<span>'
            f'<a class="item-title" href="{html.escape(entry.path, quote=True)}">{html.escape(entry.title)}</a>'
            f'{description}'
            '</span>'
            '</li>'
        )
    return f'<ol class="item-list">{"".join(rows)}</ol>'


def count_label(count: int, singular: str) -> str:
    suffix = singular if count == 1 else f"{singular}s"
    return f"{count} {suffix}"


def render_index(workspace: Path) -> str:
    title, mission = mission_details(workspace)
    lessons = collect_html(workspace / "lessons", workspace)
    references = collect_html(workspace / "reference", workspace)
    records = collect_records(workspace)

    continue_entry = lessons[-1] if lessons else None
    continue_html = (
        f'<strong>Continue learning</strong><a href="{html.escape(continue_entry.path, quote=True)}">'
        f'{html.escape(continue_entry.title)} →</a>'
        if continue_entry
        else '<strong>Ready to begin</strong><span>Create the first focused lesson from your mission.</span>'
    )

    state_path = workspace / "source" / "BOOK-READING-STATE.md"
    state = read_text(state_path) if state_path.exists() else ""
    coverage_raw = section_value(state, "Coverage", "0%")
    coverage_match = re.search(r"(\d{1,3})", coverage_raw)
    coverage = min(100, int(coverage_match.group(1))) if coverage_match else 0
    status = section_value(state, "Status", "not started")
    unlocked = section_value(state, "Teaching unlocked", "no")

    book_panel = ""
    if state_path.exists():
        source_links = []
        for relative, label in (
            ("source/BOOK-READING-STATE.md", "Reading ledger"),
            ("source/BOOK-OVERVIEW.md", "Whole-book overview"),
            ("source/RIA-DISTILLATION.md", "Method evidence"),
            ("source/ria/INDEX.md", "Verified methods"),
            ("source/CURRICULUM-BLUEPRINT.md", "Curriculum blueprint"),
            ("source/TEACHING-MAP.md", "Teaching map"),
        ):
            if (workspace / relative).exists():
                source_links.append(f'<a href="{relative}">{label}</a>')
        links = f'<div class="quick-links">{"".join(source_links)}</div>' if source_links else ""
        book_panel = f'''
        <section class="panel">
          <p class="eyebrow">Source preparation</p>
          <h2>Source coverage</h2>
          <div class="book-gate">
            <div class="gate-state"><span>{html.escape(status)}</span><strong>{coverage}%</strong></div>
            <div class="progress-track" aria-label="Book reading coverage: {coverage}%">
              <div class="progress-fill" style="width: {coverage}%"></div>
            </div>
            <p class="panel-note">Teaching unlocked: {html.escape(unlocked)}</p>
            {links}
          </div>
        </section>'''

    quick_links = []
    for filename, label in (("MISSION.md", "Mission"), ("RESOURCES.md", "Resources"), ("NOTES.md", "Notes")):
        if (workspace / filename).exists():
            quick_links.append(f'<a href="{filename}">{label}</a>')
    quick_links_html = "".join(quick_links) or '<span class="empty">Workspace notes will appear here.</span>'

    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Course home for {html.escape(title, quote=True)}">
  <title>{html.escape(title)} · Course Home</title>
  <link rel="stylesheet" href="assets/course.css">
</head>
<body>
  <main class="course-shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">Kimi Study</p>
        <h1>{html.escape(title)}</h1>
        <p class="mission">{html.escape(mission)}</p>
        <div class="stats">
          <span class="stat">{count_label(len(lessons), "lesson")}</span>
          <span class="stat">{count_label(len(references), "reference")}</span>
          <span class="stat">{count_label(len(records), "learning record")}</span>
        </div>
      </div>
      <aside class="continue-card">{continue_html}</aside>
    </header>

    <div class="course-grid">
      <section class="panel panel-wide">
        <p class="eyebrow">Learning path</p>
        <h2>Lessons</h2>
        {render_entries(lessons, "No lessons yet. Start from the mission and the learner's current edge.")}
      </section>

      {book_panel}

      <section class="panel">
        <p class="eyebrow">Course memory</p>
        <h2>Learning records</h2>
        {render_entries(records, "Demonstrated understanding will be recorded here.")}
      </section>

      <section class="panel">
        <p class="eyebrow">Reference shelf</p>
        <h2>Reference documents</h2>
        {render_entries(references, "Reusable reference material will appear here.")}
      </section>

      <section class="panel">
        <p class="eyebrow">Workspace</p>
        <h2>Course files</h2>
        <div class="quick-links">{quick_links_html}</div>
      </section>
    </div>

    <footer>Your course updates as source understanding and lessons progress.</footer>
  </main>
</body>
</html>
'''


def install_style(workspace: Path, source: Path) -> None:
    destination = workspace / "assets" / "course.css"
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd(), help="Teaching workspace directory")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if index.html or the shared stylesheet is missing or stale",
    )
    args = parser.parse_args()

    workspace = args.workspace.expanduser().resolve()
    if not workspace.is_dir():
        parser.error(f"workspace is not a directory: {workspace}")

    style_source = Path(__file__).resolve().parent.parent / "assets" / "course.css"
    style_destination = workspace / "assets" / "course.css"
    rendered = render_index(workspace)
    index_path = workspace / "index.html"

    if args.check:
        if not style_destination.exists():
            print("Course index check failed: assets/course.css is missing.", file=sys.stderr)
            return 1
        if not index_path.exists() or read_text(index_path) != rendered:
            print("Course index check failed: index.html is missing or stale.", file=sys.stderr)
            return 1
        errors = navigation_errors(workspace)
        if errors:
            print("Course index check failed:", file=sys.stderr)
            for error in errors:
                print(f"- {error}", file=sys.stderr)
            return 1
        print("Course index is current.")
        return 0

    install_style(workspace, style_source)
    index_path.write_text(rendered, encoding="utf-8")
    print(f"Wrote {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
