import DOMPurify from 'dompurify'

// Allow common markdown HTML elements, data attributes for our app, and SVG
const ALLOWED_TAGS = [
  // Block elements
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'pre', 'code',
  'blockquote', 'ul', 'ol', 'li', 'hr', 'br', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'figure', 'figcaption', 'details', 'summary',
  // Inline elements
  'a', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup',
  'abbr', 'small', 'img', 'input', 'label',
  // SVG elements (for inline SVGs and KaTeX)
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
  'g', 'text', 'tspan', 'defs', 'use', 'symbol', 'clipPath', 'mask',
  'linearGradient', 'radialGradient', 'stop', 'pattern', 'image',
  'foreignObject', 'marker', 'title', 'desc',
  // KaTeX elements (eq/eqn from markdown-it-texmath)
  'eq', 'eqn', 'section',
  'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
  'msup', 'msub', 'msubsup', 'mfrac', 'mroot', 'msqrt', 'mtable',
  'mtr', 'mtd', 'mover', 'munder', 'munderover', 'menclose',
  'annotation', 'annotation-xml',
  // Mermaid
  'iframe',
]

const ALLOWED_ATTR = [
  // Standard HTML
  'class', 'id', 'style', 'href', 'src', 'alt', 'title', 'width', 'height',
  'type', 'checked', 'disabled', 'name', 'value', 'target', 'rel',
  'colspan', 'rowspan', 'open',
  // Data attributes (used extensively by our app)
  'data-src', 'data-link', 'data-fragment', 'data-note', 'data-embed-type',
  'data-callout-type', 'data-processed', 'data-heading-id', 'data-checkbox-index',
  'data-line', 'data-block-id',
  // SVG attributes
  'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'points', 'transform', 'opacity', 'font-size', 'font-weight', 'font-family',
  'text-anchor', 'dominant-baseline', 'xmlns', 'xmlns:xlink', 'xlink:href',
  'clip-path', 'mask', 'marker-end', 'marker-start', 'marker-mid',
  'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity',
  'patternUnits', 'patternTransform', 'preserveAspectRatio',
  // KaTeX / aria
  'aria-hidden', 'mathvariant', 'encoding', 'stretchy', 'fence', 'separator', 'accent',
  'accentunder', 'columnalign', 'columnlines', 'columnspacing',
  'rowalign', 'rowlines', 'rowspacing', 'displaystyle', 'scriptlevel',
]

/**
 * Sanitize HTML content for safe rendering via dangerouslySetInnerHTML.
 * Strips all scripts, event handlers, and dangerous elements while preserving
 * common markdown HTML, SVG, KaTeX, and our app's data attributes.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ADD_URI_SAFE_ATTR: ['data-src', 'data-link', 'xlink:href'],
  })
}

// Erlaubte Tags/Attribute für die optionale HTML-Ansicht empfangener E-Mails.
// Bewusst OHNE img/iframe/svg/style/script/form: keine Remote-Ressourcen → keine Tracking-Pixel,
// kein Nachladen externer Inhalte. Links bleiben erhalten, werden aber im Renderer abgefangen
// und über open-external im Browser geöffnet (nie In-App-Navigation).
const EMAIL_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'pre', 'code',
  'blockquote', 'ul', 'ol', 'li', 'hr', 'br', 'wbr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'a', 'strong', 'em', 'b', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup',
  'abbr', 'small', 'center', 'font', 'figure', 'figcaption',
]
const EMAIL_ALLOWED_ATTR = [
  'href', 'title', 'target', 'rel', 'class', 'style', 'align', 'valign',
  'width', 'height', 'colspan', 'rowspan', 'bgcolor', 'color', 'face', 'size', 'dir', 'lang',
]

/**
 * Sanitize the HTML body of a received email for the opt-in "HTML view".
 * Strips all remote-loading elements (img/iframe/style/svg) so no tracking pixels or
 * external resources are fetched, and neutralizes url(...) inside inline styles.
 * Links survive but should be opened via open-external on click, never navigated in-app.
 */
export function sanitizeEmailHtml(dirty: string): string {
  const stripUrlInStyle = (node: Element) => {
    const style = node.getAttribute?.('style')
    if (style && /url\s*\(/i.test(style)) {
      node.setAttribute('style', style.replace(/url\s*\([^)]*\)/gi, ''))
    }
  }
  DOMPurify.addHook('afterSanitizeAttributes', stripUrlInStyle)
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
      ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
      FORBID_TAGS: ['img', 'iframe', 'script', 'style', 'link', 'meta', 'object', 'embed', 'video', 'audio', 'source', 'svg', 'form', 'input', 'button', 'textarea', 'select', 'base'],
      ALLOW_DATA_ATTR: false,
    })
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes')
  }
}

/**
 * Sanitize SVG content specifically.
 * More restrictive — strips foreignObject and any non-SVG elements.
 */
export function sanitizeSvg(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['style'],
    ADD_ATTR: ['class', 'id', 'style', 'xmlns', 'xmlns:xlink', 'xlink:href'],
    FORBID_TAGS: ['script', 'foreignObject'],
  })
}

/**
 * Escape a string for safe insertion into HTML.
 * Use this for user-controlled values in template literals.
 */
export function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
