/**
 * Citation Polyfill (Minimal) - styling and numbering only.
 *
 * For click handling and positioning, use SuperDoc's native Custom UI APIs:
 * - Click detection: editor click events + doc.citations.list()
 * - Positioning: ui.viewport.getRect()
 *
 * This polyfill only provides:
 * - Pill-style CSS for citation markers
 * - Numbered label generation (sourceId -> [1], [2], etc.)
 */

const CITATION_CSS = `
.citation-pill {
  background-color: #e5e7eb !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5em;
  padding: 0.1em 0.4em;
  margin: 0 0.15em;
  border-radius: 9999px;
  font-weight: 500;
  cursor: pointer;
}
.citation-pill:hover {
  background-color: #d1d5db !important;
}
`;

let cssInjected = false;

/**
 * Inject citation pill CSS styles into the document head.
 * Safe to call multiple times - only injects once.
 */
export function injectCitationStyles(): void {
  if (cssInjected) return;
  const style = document.createElement('style');
  style.id = 'citation-polyfill-styles';
  style.textContent = CITATION_CSS;
  document.head.appendChild(style);
  cssInjected = true;
}

/**
 * Apply the citation-pill class to all citation elements in a container.
 * Call this after document updates to ensure new citations are styled.
 */
export function applyCitationStyles(container: HTMLElement): void {
  injectCitationStyles();
  container.querySelectorAll('[data-id="citation"]').forEach(el => {
    if (!el.classList.contains('citation-pill')) {
      el.classList.add('citation-pill');
    }
  });
}

/**
 * Build a map of sourceId -> citation number based on document order.
 * First occurrence of each sourceId gets the next number.
 */
export function buildNumberMap(editor: any): Map<string, number> {
  const numberMap = new Map<string, number>();
  let num = 1;

  editor.state.doc.descendants((node: any) => {
    if (node.type.name === 'citation') {
      for (const sid of node.attrs.sourceIds || []) {
        if (!numberMap.has(sid)) {
          numberMap.set(sid, num++);
        }
      }
    }
  });

  return numberMap;
}

/**
 * Get a formatted citation label for given sourceIds.
 * Example: ['src1', 'src2'] with numberMap {src1: 1, src2: 3} -> "1,3."
 */
export function getCitationLabel(sourceIds: string[], numberMap: Map<string, number>): string {
  const nums = sourceIds
    .map(sid => numberMap.get(sid))
    .filter((n): n is number => n !== undefined);
  return nums.length ? nums.join(',') + '.' : '?.';
}

/**
 * Update all citations in the document to use numbered labels.
 * Mutates the document by setting resolvedText on each citation node.
 */
export function applyNumberedLabels(editor: any): Map<string, number> {
  const numberMap = buildNumberMap(editor);
  const citations: { pos: number; node: any }[] = [];

  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'citation') {
      citations.push({ pos, node });
    }
  });

  if (citations.length === 0) return numberMap;

  // Update labels in reverse order to preserve positions
  let tr = editor.state.tr;
  for (let i = citations.length - 1; i >= 0; i--) {
    const { pos, node } = citations[i];
    const label = getCitationLabel(node.attrs.sourceIds || [], numberMap);
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, resolvedText: label });
  }
  editor.dispatch(tr);

  return numberMap;
}

/**
 * Convenience class that combines all polyfill functionality.
 * Automatically applies styles and updates on document changes.
 */
export class CitationStyler {
  private editor: any;
  private container: HTMLElement;
  private numberMap: Map<string, number> = new Map();
  private unsubscribe: (() => void) | null = null;

  constructor(superdoc: any, container: HTMLElement) {
    this.editor = superdoc?.activeEditor;
    this.container = container;

    if (!this.editor || !this.container) {
      console.warn('[CitationStyler] Missing editor or container');
      return;
    }

    this.init();
  }

  private init() {
    injectCitationStyles();
    this.refresh();

    // Re-apply styles on document updates
    const updateHandler = () => {
      setTimeout(() => applyCitationStyles(this.container), 50);
    };
    this.editor.on('update', updateHandler);
    this.unsubscribe = () => this.editor.off('update', updateHandler);
  }

  /** Refresh numbering and styles */
  refresh(): Map<string, number> {
    this.numberMap = applyNumberedLabels(this.editor);
    setTimeout(() => applyCitationStyles(this.container), 100);
    return this.numberMap;
  }

  /** Get the current number map */
  getNumberMap(): Map<string, number> {
    return this.numberMap;
  }

  /** Get citation label for source IDs */
  getLabel(sourceIds: string[]): string {
    return getCitationLabel(sourceIds, this.numberMap);
  }

  /** Clean up listeners */
  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

// Legacy exports for backwards compatibility
export { CitationStyler as CitationPolyfill };

export interface CitationData {
  sourceIds: string[];
  resolvedText: string;
  instruction: string;
  position: number;
}
