import { describe, expect, it } from 'vitest';
import {
  analyzeLessonHtml,
  buildLessonSrcdoc,
  deriveLessonStatus,
  type LessonSource,
} from '../src/study/domain/lessonDocument';

describe('buildLessonSrcdoc', () => {
  it('wraps html in a strict csp srcdoc', () => {
    const srcdoc = buildLessonSrcdoc('<h1>hello</h1>');
    expect(srcdoc).toContain('<!doctype html>');
    expect(srcdoc).toContain('<meta charset="utf-8">');
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).toContain("base-uri 'none'");
    expect(srcdoc).toContain("form-action 'none'");
    expect(srcdoc).toContain("object-src 'none'");
    expect(srcdoc).toContain("frame-src 'none'");
    expect(srcdoc).toContain("navigate-to 'none'");
    expect(srcdoc).toContain("img-src data: blob:");
    expect(srcdoc).toContain("style-src 'unsafe-inline'");
    expect(srcdoc).toContain("font-src data:");
    expect(srcdoc).toContain('<h1>hello</h1>');
  });

  it('does not rely on sandbox tokens or active script tags in generated srcdoc', () => {
    const srcdoc = buildLessonSrcdoc('<p>safe</p>');
    expect(srcdoc).not.toContain('allow-scripts');
    expect(srcdoc).not.toContain('allow-same-origin');
    expect(srcdoc).not.toMatch(/<script[\s>]/i);
    expect(srcdoc).not.toContain('</script>');
  });

  it('escapes script tag delimiters to inert text without malformed raw-text', () => {
    const srcdoc = buildLessonSrcdoc("<script>alert('x')</script>");
    expect(srcdoc).not.toContain('</script>');
    expect(srcdoc).not.toMatch(/<script[\s>]/i);
    expect(srcdoc).toContain('&lt;script>alert');
    expect(srcdoc).toContain('&lt;/script&gt;');
  });

  it('makes uppercase SCRIPT tags inert', () => {
    const srcdoc = buildLessonSrcdoc('<SCRIPT>alert(1)</SCRIPT>');
    expect(srcdoc).not.toMatch(/<script[\s>]/i);
    expect(srcdoc).toContain('&lt;script>alert(1)&lt;/script&gt;');
  });

  it('neutralizes absolute anchor links to #', () => {
    const srcdoc = buildLessonSrcdoc('<a href="https://example.com">link</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.com');
  });

  it('neutralizes relative anchor links to #', () => {
    const srcdoc = buildLessonSrcdoc('<a href="./page.html">link</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('./page.html');
  });

  it('neutralizes protocol-relative anchor links to #', () => {
    const srcdoc = buildLessonSrcdoc('<a href="//example.com">link</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('//example.com');
  });

  it('neutralizes mailto anchor links to #', () => {
    const srcdoc = buildLessonSrcdoc('<a href="mailto:test@example.com">mail</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('mailto:');
  });

  it('neutralizes data anchor links to #', () => {
    const srcdoc = buildLessonSrcdoc('<a href="data:text/html,foo">data</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('data:text/html,foo');
  });

  it('neutralizes entity-obfuscated javascript anchor links to #', () => {
    const srcdoc = buildLessonSrcdoc('<a href="&#x6A;avascript:alert(1)">link</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('javascript:');
  });

  it('retains #fragment anchor links', () => {
    const srcdoc = buildLessonSrcdoc('<a href="#section">link</a>');
    expect(srcdoc).toContain('href="#section"');
  });

  it('retains entity-obfuscated #fragment anchor links', () => {
    const srcdoc = buildLessonSrcdoc('<a href="&#x23;section">link</a>');
    expect(srcdoc).toContain('href="&#x23;section"');
  });

  it('neutralizes unquoted anchor links to #', () => {
    const srcdoc = buildLessonSrcdoc('<a href=https://example.com>link</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.com');
  });

  it('neutralizes meta refresh tags', () => {
    const srcdoc = buildLessonSrcdoc('<meta http-equiv="refresh" content="0;url=https://example.com">');
    expect(srcdoc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(srcdoc).not.toContain('https://example.com');
  });

  it('neutralizes case-insensitive meta refresh tags', () => {
    const srcdoc = buildLessonSrcdoc('<META HTTP-EQUIV="REFRESH" CONTENT="0;url=https://example.com">');
    expect(srcdoc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(srcdoc).not.toContain('https://example.com');
  });

  it('neutralizes anchors with quoted > inside an earlier attribute', () => {
    const srcdoc = buildLessonSrcdoc('<a title="x>y" href="https://example.test">leave</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes anchors with multiple quoted > characters before href', () => {
    const srcdoc = buildLessonSrcdoc('<a title="a>b>c" href="https://example.test">leave</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes area href links', () => {
    const srcdoc = buildLessonSrcdoc('<area shape="rect" href="https://example.test">');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes SVG a href links', () => {
    const srcdoc = buildLessonSrcdoc('<svg><a href="https://example.test">x</a></svg>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes SVG a xlink:href links', () => {
    const srcdoc = buildLessonSrcdoc('<svg><a xlink:href="https://example.test">x</a></svg>');
    expect(srcdoc).toContain('xlink:href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('removes external base tags and keeps fragment anchors local', () => {
    const srcdoc = buildLessonSrcdoc('<base href="https://example.test/"><a href="#section">x</a>');
    expect(srcdoc).not.toContain('<base');
    expect(srcdoc).toContain('href="#section"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('keeps fragment anchors intact when no base tag is present', () => {
    const srcdoc = buildLessonSrcdoc('<a href="#section">x</a>');
    expect(srcdoc).toContain('href="#section"');
  });

  it('does not confuse the scanner with tag-like text inside a quoted attribute', () => {
    const srcdoc = buildLessonSrcdoc('<a title="<script>alert(1)</script>" href="https://example.test">x</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('removes meta refresh when a quoted > appears before http-equiv', () => {
    const srcdoc = buildLessonSrcdoc('<meta content="0> ; url=https://example.test" http-equiv="refresh">');
    expect(srcdoc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('removes meta refresh regardless of attribute order', () => {
    const srcdoc = buildLessonSrcdoc('<meta content="0;url=https://example.test" http-equiv="refresh">');
    expect(srcdoc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('removes meta refresh with entity-encoded refresh value', () => {
    const srcdoc = buildLessonSrcdoc('<meta http-equiv="&#x72;efresh" content="0;url=https://example.test">');
    expect(srcdoc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes solidus-before-attribute href on anchor', () => {
    const srcdoc = buildLessonSrcdoc('<a/href=https://example.test>go</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes multiple solidus-before-attribute href', () => {
    const srcdoc = buildLessonSrcdoc("<a///href='https://example.test'>go</a>");
    expect(srcdoc).toMatch(/href=["']#['"]/);
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes whitespace-then-solidus before attribute href', () => {
    const srcdoc = buildLessonSrcdoc('<a / href=https://example.test>go</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes solidus-before-attribute on area', () => {
    const srcdoc = buildLessonSrcdoc('<area/href=https://example.test>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes solidus-before-attribute on svg a href', () => {
    const srcdoc = buildLessonSrcdoc('<svg><a/href=https://example.test>x</a></svg>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes solidus-before-attribute on svg a xlink:href', () => {
    const srcdoc = buildLessonSrcdoc('<svg><a/xlink:href=https://example.test>x</a></svg>');
    expect(srcdoc).toContain('xlink:href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('removes meta refresh with solidus-before-attribute', () => {
    const srcdoc = buildLessonSrcdoc("<meta/http-equiv='refresh' content='0;url=https://example.test'>");
    expect(srcdoc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('preserves normal self-closing slash', () => {
    const srcdoc = buildLessonSrcdoc('<br/>');
    expect(srcdoc).toContain('<br/>');
  });

  it('preserves unquoted value containing a slash', () => {
    const srcdoc = buildLessonSrcdoc('<a href=https://example.test/path>go</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test/path');
  });

  it('does not truncate attribute names containing a slash', () => {
    const srcdoc = buildLessonSrcdoc('<div data-path=/foo>ok</div>');
    expect(srcdoc).toContain('data-path=/foo');
  });

  it('removes meta refresh with unclosed numeric entity in http-equiv', () => {
    const srcdoc = buildLessonSrcdoc('<meta http-equiv="refres&#x68" content="0;url=https://example.test">');
    expect(srcdoc).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('does not throw on out-of-range numeric entity during neutralization', () => {
    expect(() => buildLessonSrcdoc('<p>&#1114112;</p>')).not.toThrow();
  });

  it('does not throw on surrogate numeric entity during neutralization', () => {
    expect(() => buildLessonSrcdoc('<p>&#xD800;</p>')).not.toThrow();
  });

  it('ignores pseudo-anchor inside an html comment', () => {
    const srcdoc = buildLessonSrcdoc('<!-- <a href="https://example.test"> --> <a href="https://example.test">x</a>');
    expect(srcdoc).toContain('href="#"');
    // The pseudo-anchor inside the comment is left untouched.
    expect(srcdoc).toContain('https://example.test');
  });

  it('ignores pseudo-anchor inside style raw-text', () => {
    const srcdoc = buildLessonSrcdoc('<style><x q="</style><a href="https://example.test">x</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('ignores pseudo-anchor inside script raw-text', () => {
    const srcdoc = buildLessonSrcdoc('<script>"<a href=\\"https://example.test\\">"</script><a href="https://example.test">x</a>');
    expect(srcdoc).toContain('href="#"');
    // The pseudo-anchor inside the script raw-text region is left untouched.
    expect(srcdoc).toContain('https://example.test');
  });

  it('ignores pseudo-anchor inside title rcdata', () => {
    const srcdoc = buildLessonSrcdoc('<title><a href="https://example.test"></title><a href="https://example.test">x</a>');
    expect(srcdoc).toContain('href="#"');
    // The pseudo-anchor inside the title RCDATA region is left untouched.
    expect(srcdoc).toContain('https://example.test');
  });

  it('ignores pseudo-anchor inside svg cdata', () => {
    const srcdoc = buildLessonSrcdoc('<svg><![CDATA[<a href="https://example.test">]]></svg><a href="https://example.test">x</a>');
    expect(srcdoc).toContain('href="#"');
    // The pseudo-anchor inside the SVG CDATA section is left untouched.
    expect(srcdoc).toContain('https://example.test');
  });

  it('neutralizes anchor after raw-text end tag with solidus </style/>', () => {
    const srcdoc = buildLessonSrcdoc('<style>x</style/><a href=https://example.test id=a>x</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes anchor after rcdata end tag with solidus </textarea/>', () => {
    const srcdoc = buildLessonSrcdoc('<textarea>x</textarea/><a href=https://example.test id=a>x</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes anchor after raw-text end tag with solidus </script/>', () => {
    const srcdoc = buildLessonSrcdoc('<script>x</script/><a href=https://example.test id=a>x</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes anchor after comment closing with --!>', () => {
    const srcdoc = buildLessonSrcdoc('<!--x--!><a href=https://example.test id=a>x</a>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes anchor after bogus CDATA in HTML data state', () => {
    const srcdoc = buildLessonSrcdoc('<![CDATA[><a href=https://example.test id=a>x</a>]]>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes real anchor after real SVG CDATA section without touching pseudo-anchor text', () => {
    const srcdoc = buildLessonSrcdoc('<svg><![CDATA[<a href="https://example.test">]]></svg><a href="https://example.test">x</a>');
    expect(srcdoc).toContain('href="#"');
    // The pseudo-anchor text inside the SVG CDATA section is left untouched.
    expect(srcdoc).toContain('https://example.test');
    expect(srcdoc.match(/https:\/\/example\.test/g)!.length).toBe(1);
  });

  it('neutralizes anchor inside foreignObject where CDATA is bogus', () => {
    const srcdoc = buildLessonSrcdoc('<svg><foreignObject><![CDATA[><a href=https://example.test id=a>x</a>]]></foreignObject></svg>');
    expect(srcdoc).toContain('href="#"');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes anchor after script start tag with solidus <script/x>', () => {
    const srcdoc = buildLessonSrcdoc('<script/x>alert(1)</script><a href=https://example.test>x</a>');
    expect(srcdoc).not.toMatch(/<script[\s>]/i);
    expect(srcdoc).not.toContain('</script>');
    expect(srcdoc).toContain('href="#"');
  });

  it('makes self-closing solidus script start tag <script/> inert', () => {
    const srcdoc = buildLessonSrcdoc('<script/>');
    expect(srcdoc).not.toMatch(/<script[\s>]/i);
    expect(srcdoc).not.toContain('</script>');
  });

  it('does not promote pseudo-anchor inside foreignObject bogus CDATA to real anchor', () => {
    const srcdoc = buildLessonSrcdoc(
      '<svg><foreignObject><![CDATA[&lt;a href="https://example.test"&gt;x&lt;/a&gt;]]></foreignObject></svg>',
    );
    expect(srcdoc).not.toContain('href="#"');
    expect(srcdoc).toContain('https://example.test');
  });

  it('neutralizes img srcset with external urls', () => {
    const srcdoc = buildLessonSrcdoc('<img srcset="https://example.test/a.png 1x, https://example.test/b.png 2x">');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes source src', () => {
    const srcdoc = buildLessonSrcdoc('<source src="https://example.test/video.mp4">');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes source srcset', () => {
    const srcdoc = buildLessonSrcdoc('<source srcset="https://example.test/a.png 1x">');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes video src', () => {
    const srcdoc = buildLessonSrcdoc('<video src="https://example.test/video.mp4"></video>');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes video poster', () => {
    const srcdoc = buildLessonSrcdoc('<video poster="https://example.test/poster.jpg"></video>');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes audio src', () => {
    const srcdoc = buildLessonSrcdoc('<audio src="https://example.test/audio.mp3"></audio>');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes track src', () => {
    const srcdoc = buildLessonSrcdoc('<track src="https://example.test/subtitles.vtt">');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes object data', () => {
    const srcdoc = buildLessonSrcdoc('<object data="https://example.test/object.swf"></object>');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes embed src', () => {
    const srcdoc = buildLessonSrcdoc('<embed src="https://example.test/plugin.swf">');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes input type=image src', () => {
    const srcdoc = buildLessonSrcdoc('<input type=image src="https://example.test/submit.png">');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes svg image href', () => {
    const srcdoc = buildLessonSrcdoc('<svg><image href="https://example.test/img.png"/></svg>');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes svg image xlink:href', () => {
    const srcdoc = buildLessonSrcdoc('<svg><image xlink:href="https://example.test/img.png"/></svg>');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes svg use href', () => {
    const srcdoc = buildLessonSrcdoc('<svg><use href="https://example.test/symbol.svg#icon"/></svg>');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes link rel=stylesheet', () => {
    const srcdoc = buildLessonSrcdoc('<link rel="stylesheet" href="https://example.test/style.css">');
    expect(srcdoc).not.toContain('https://example.test');
  });

  it('neutralizes link rel token list containing stylesheet', () => {
    const srcdoc = buildLessonSrcdoc('<link rel="preload stylesheet" href="https://example.test/style.css">');
    expect(srcdoc).not.toContain('https://example.test');
  });
});

describe('analyzeLessonHtml', () => {
  it('reports no issues for plain static html', () => {
    const result = analyzeLessonHtml('<h1>lesson</h1><p>text</p>');
    expect(result.isPartial).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('flags script tags', () => {
    const result = analyzeLessonHtml('<script>alert(1)</script>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('script'));
  });

  it('flags external script sources', () => {
    const result = analyzeLessonHtml('<script src="https://example.com/app.js"></script>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('script'));
  });

  it('flags inline event handlers', () => {
    const result = analyzeLessonHtml('<button onclick="alert(1)">click</button>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('inline'));
  });

  it('flags slash-separated inline handlers', () => {
    const result = analyzeLessonHtml('<svg/onload=alert(1)>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('inline'));
  });

  it('flags external images', () => {
    const result = analyzeLessonHtml('<img src="https://example.com/img.png">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags relative images', () => {
    const result = analyzeLessonHtml('<img src="./assets/diagram.png">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('relative'));
  });

  it('flags external stylesheets', () => {
    const result = analyzeLessonHtml('<link rel="stylesheet" href="https://example.com/style.css">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('stylesheet'));
  });

  it('flags nested iframes', () => {
    const result = analyzeLessonHtml('<iframe src="page.html"></iframe>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('iframe'));
  });

  it('flags javascript urls', () => {
    const result = analyzeLessonHtml('<a href="javascript:alert(1)">link</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('javascript:'));
  });

  it('flags external anchor navigation', () => {
    const result = analyzeLessonHtml('<a href="https://example.com">link</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags relative anchor navigation', () => {
    const result = analyzeLessonHtml('<a href="./page.html">link</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags protocol-relative anchor navigation', () => {
    const result = analyzeLessonHtml('<a href="//example.com">link</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags mailto anchor links', () => {
    const result = analyzeLessonHtml('<a href="mailto:test@example.com">mail</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags data anchor links', () => {
    const result = analyzeLessonHtml('<a href="data:text/html,foo">data</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags entity-obfuscated javascript anchor links', () => {
    const result = analyzeLessonHtml('<a href="&#x6A;avascript:alert(1)">link</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('allows #fragment anchor links', () => {
    const result = analyzeLessonHtml('<a href="#section">link</a>');
    expect(result.isPartial).toBe(false);
  });

  it('flags base tag', () => {
    const result = analyzeLessonHtml('<base href="https://example.com/">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('<base>'));
  });

  it('flags meta refresh', () => {
    const result = analyzeLessonHtml('<meta http-equiv="refresh" content="0;url=https://example.com">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('meta refresh'));
  });

  it('flags case-insensitive meta refresh', () => {
    const result = analyzeLessonHtml('<META HTTP-EQUIV="REFRESH" CONTENT="0;url=https://example.com">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('meta refresh'));
  });

  it('flags meta refresh with quoted > before http-equiv', () => {
    const result = analyzeLessonHtml('<meta content="0> ; url=https://example.test" http-equiv="refresh">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('meta refresh'));
  });

  it('flags meta refresh with entity-encoded refresh', () => {
    const result = analyzeLessonHtml('<meta http-equiv="&#x72;efresh" content="0;url=https://example.test">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('meta refresh'));
  });

  it('flags area href navigation', () => {
    const result = analyzeLessonHtml('<area shape="rect" href="https://example.test">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags SVG a href navigation', () => {
    const result = analyzeLessonHtml('<svg><a href="https://example.test">x</a></svg>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags SVG a xlink:href navigation', () => {
    const result = analyzeLessonHtml('<svg><a xlink:href="https://example.test">x</a></svg>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags anchor navigation when quoted > appears before href', () => {
    const result = analyzeLessonHtml('<a title="x>y" href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags base tag even when a fragment anchor is present', () => {
    const result = analyzeLessonHtml('<base href="https://example.test/"><a href="#section">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('<base>'));
  });

  it('flags forms with actions', () => {
    const result = analyzeLessonHtml('<form action="/submit"><input></form>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('form'));
  });

  it('flags unclosed or truncated tags', () => {
    const result = analyzeLessonHtml('<p>this is incomplete');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('truncated'));
  });

  it('flags html ending mid-tag as truncated', () => {
    const result = analyzeLessonHtml('<p>text</p><img src="');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('truncated'));
  });

  it('allows inline style attributes', () => {
    const result = analyzeLessonHtml('<p style="color:red">styled</p>');
    expect(result.isPartial).toBe(false);
  });

  it('allows data and blob images', () => {
    const result = analyzeLessonHtml('<img src="data:image/png;base64,abc"><img src="blob:xyz">');
    expect(result.isPartial).toBe(false);
  });

  it('returns unique reasons when multiple issues match the same category', () => {
    const result = analyzeLessonHtml('<script>a</script><script>b</script>');
    const scriptReasons = result.reasons.filter((r) => r.includes('script'));
    expect(new Set(scriptReasons).size).toBe(scriptReasons.length);
  });

  it('flags solidus-before-attribute href as partial', () => {
    const result = analyzeLessonHtml('<a/href=https://example.test>go</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags multiple solidus-before-attribute href as partial', () => {
    const result = analyzeLessonHtml("<a///href='https://example.test'>go</a>");
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags whitespace-then-solidus before attribute href as partial', () => {
    const result = analyzeLessonHtml('<a / href=https://example.test>go</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags solidus-before-attribute area href as partial', () => {
    const result = analyzeLessonHtml('<area/href=https://example.test>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags solidus-before-attribute svg a href as partial', () => {
    const result = analyzeLessonHtml('<svg><a/href=https://example.test>x</a></svg>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags solidus-before-attribute svg a xlink:href as partial', () => {
    const result = analyzeLessonHtml('<svg><a/xlink:href=https://example.test>x</a></svg>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags solidus-before-attribute meta refresh as partial', () => {
    const result = analyzeLessonHtml("<meta/http-equiv='refresh' content='0;url=https://example.test'>");
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('meta refresh'));
  });

  it('flags inline event handler with solidus before attribute', () => {
    const result = analyzeLessonHtml('<button/onclick=alert(1)>click</button>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('inline'));
  });

  it('flags inline event handler inside quoted attribute seam', () => {
    const result = analyzeLessonHtml('<svg title="x>y" onload=alert(1)>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('inline'));
  });

  it('flags meta refresh with unclosed numeric entity in http-equiv', () => {
    const result = analyzeLessonHtml('<meta http-equiv="refres&#x68" content="0;url=https://example.test">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('meta refresh'));
  });

  it('does not throw on out-of-range numeric entity during analysis', () => {
    expect(() => analyzeLessonHtml('<p>&#1114112;</p>')).not.toThrow();
  });

  it('does not throw on surrogate numeric entity during analysis', () => {
    expect(() => analyzeLessonHtml('<p>&#xD800;</p>')).not.toThrow();
  });

  it('does not flag pseudo-anchor inside html comment as real anchor', () => {
    const result = analyzeLessonHtml('<!-- <a href="https://example.test"> --> <a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('does not flag pseudo-anchor inside style raw-text as real anchor', () => {
    const result = analyzeLessonHtml('<style><x q="</style><a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('does not flag pseudo-anchor inside script raw-text as real anchor', () => {
    const result = analyzeLessonHtml('<script>"<a href=\\"https://example.test\\">"</script><a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('does not flag pseudo-anchor inside title rcdata as real anchor', () => {
    const result = analyzeLessonHtml('<title><a href="https://example.test"></title><a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('does not flag pseudo-anchor inside textarea rcdata as real anchor', () => {
    const result = analyzeLessonHtml('<textarea><a href="https://example.test"></textarea><a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('does not flag pseudo-anchor inside xmp raw-text as real anchor', () => {
    const result = analyzeLessonHtml('<xmp><a href="https://example.test"></xmp><a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('does not flag pseudo-anchor inside iframe raw-text as real anchor', () => {
    const result = analyzeLessonHtml('<iframe><a href="https://example.test"></iframe><a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('does not flag pseudo-anchor inside svg cdata as real anchor', () => {
    const result = analyzeLessonHtml('<svg><![CDATA[<a href="https://example.test">]]></svg><a href="https://example.test">x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons.filter((r) => r.includes('anchor')).length).toBe(1);
  });

  it('flags anchor after raw-text end tag with solidus </style/>', () => {
    const result = analyzeLessonHtml('<style>x</style/><a href=https://example.test id=a>x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags anchor after rcdata end tag with solidus </textarea/>', () => {
    const result = analyzeLessonHtml('<textarea>x</textarea/><a href=https://example.test id=a>x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags anchor after raw-text end tag with solidus </script/> and reports script reason', () => {
    const result = analyzeLessonHtml('<script>x</script/><a href=https://example.test id=a>x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
    expect(result.reasons).toContainEqual(expect.stringContaining('script'));
  });

  it('flags anchor after comment closing with --!>', () => {
    const result = analyzeLessonHtml('<!--x--!><a href=https://example.test id=a>x</a>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags anchor after bogus CDATA in HTML data state', () => {
    const result = analyzeLessonHtml('<![CDATA[><a href=https://example.test id=a>x</a>]]>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('flags anchor inside foreignObject where CDATA is bogus', () => {
    const result = analyzeLessonHtml(
      '<svg><foreignObject><![CDATA[><a href=https://example.test id=a>x</a>]]></foreignObject></svg>',
    );
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('anchor'));
  });

  it('does not promote entity-encoded pseudo-anchor inside foreignObject bogus CDATA to real anchor', () => {
    const result = analyzeLessonHtml(
      '<svg><foreignObject><![CDATA[&lt;a href="https://example.test"&gt;x&lt;/a&gt;]]></foreignObject></svg>',
    );
    expect(result.isPartial).toBe(false);
  });

  it('flags script start tag with solidus <script/x>', () => {
    const result = analyzeLessonHtml('<script/x>alert(1)</script>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('script'));
  });

  it('flags self-closing solidus script start tag <script/>', () => {
    const result = analyzeLessonHtml('<script/>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('script'));
  });

  it('flags img srcset as partial', () => {
    const result = analyzeLessonHtml('<img srcset="https://example.test/a.png 1x">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags source src as partial', () => {
    const result = analyzeLessonHtml('<source src="https://example.test/video.mp4">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags source srcset as partial', () => {
    const result = analyzeLessonHtml('<source srcset="https://example.test/a.png 1x">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags video src as partial', () => {
    const result = analyzeLessonHtml('<video src="https://example.test/video.mp4"></video>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags video poster as partial', () => {
    const result = analyzeLessonHtml('<video poster="https://example.test/poster.jpg"></video>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags audio src as partial', () => {
    const result = analyzeLessonHtml('<audio src="https://example.test/audio.mp3"></audio>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags track src as partial', () => {
    const result = analyzeLessonHtml('<track src="https://example.test/subtitles.vtt">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags object data as partial', () => {
    const result = analyzeLessonHtml('<object data="https://example.test/object.swf"></object>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags embed src as partial', () => {
    const result = analyzeLessonHtml('<embed src="https://example.test/plugin.swf">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags input type=image src as partial', () => {
    const result = analyzeLessonHtml('<input type=image src="https://example.test/submit.png">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags svg image href as partial', () => {
    const result = analyzeLessonHtml('<svg><image href="https://example.test/img.png"/></svg>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags svg image xlink:href as partial', () => {
    const result = analyzeLessonHtml('<svg><image xlink:href="https://example.test/img.png"/></svg>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags svg use href as partial', () => {
    const result = analyzeLessonHtml('<svg><use href="https://example.test/symbol.svg#icon"/></svg>');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('external'));
  });

  it('flags link rel token list containing stylesheet as partial', () => {
    const result = analyzeLessonHtml('<link rel="preload stylesheet" href="https://example.test/style.css">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('stylesheet'));
  });

  it('flags unknown non-empty img srcset conservatively as partial', () => {
    const result = analyzeLessonHtml('<img srcset="small.png 1x, large.png 2x">');
    expect(result.isPartial).toBe(true);
    expect(result.reasons).toContainEqual(expect.stringContaining('relative'));
  });
});

describe('deriveLessonStatus', () => {
  it('returns ok for clean static html', () => {
    const source: LessonSource = { path: 'lesson.html', title: 'Lesson', html: '<p>ok</p>', state: 'ok' };
    const status = deriveLessonStatus(source);
    expect(status.kind).toBe('ok');
  });

  it('reports partial when analysis finds unsupported content', () => {
    const source: LessonSource = {
      path: 'lesson.html',
      title: 'Lesson',
      html: '<script>x</script><p>ok</p>',
      state: 'ok',
    };
    const status = deriveLessonStatus(source);
    expect(status.kind).toBe('partial');
    expect(status.reasons.length).toBeGreaterThan(0);
  });

  it('reports partial when declared truncated', () => {
    const source: LessonSource = {
      path: 'lesson.html',
      title: 'Lesson',
      html: '<p>ok</p>',
      state: 'truncated',
    };
    const status = deriveLessonStatus(source);
    expect(status.kind).toBe('partial');
    expect(status.reasons).toContainEqual(expect.stringContaining('truncated'));
  });

  it('reports error when declared error', () => {
    const source: LessonSource = {
      path: 'lesson.html',
      title: 'Lesson',
      html: '',
      state: 'error',
      error: 'Read failed',
    };
    const status = deriveLessonStatus(source);
    expect(status.kind).toBe('error');
    expect(status.error).toBe('Read failed');
  });

  it('prefers error over partial when both are present', () => {
    const source: LessonSource = {
      path: 'lesson.html',
      title: 'Lesson',
      html: '<script>x</script>',
      state: 'error',
      error: 'Load failed',
    };
    const status = deriveLessonStatus(source);
    expect(status.kind).toBe('error');
  });
});
