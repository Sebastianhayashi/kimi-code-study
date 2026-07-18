/**
 * Hash-based routing for the Kimi Study screens. Pure module so the parsing
 * is unit-testable. Routes:
 *   `#/`                      → home (course list + create)
 *   `#/c/{sessionId}`         → generator (outline + chat)
 *   `#/c/{sessionId}/l/{file}`→ learner (one lesson HTML, file = basename)
 */

export type StudyRoute =
  | { readonly name: 'home' }
  | { readonly name: 'generator'; readonly sessionId: string }
  | { readonly name: 'learner'; readonly sessionId: string; readonly lessonFile: string };

export function parseStudyRoute(hash: string): StudyRoute {
  const raw = hash.replace(/^#/, '');
  const segments = raw.split('/').filter((s) => s.length > 0);
  if (segments[0] === 'c' && segments[1] !== undefined) {
    const sessionId = decodeURIComponent(segments[1]);
    if (segments[2] === 'l' && segments[3] !== undefined) {
      return { name: 'learner', sessionId, lessonFile: decodeURIComponent(segments[3]) };
    }
    return { name: 'generator', sessionId };
  }
  return { name: 'home' };
}

export function formatStudyRoute(route: StudyRoute): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'generator':
      return `#/c/${encodeURIComponent(route.sessionId)}`;
    case 'learner':
      return `#/c/${encodeURIComponent(route.sessionId)}/l/${encodeURIComponent(route.lessonFile)}`;
  }
}
