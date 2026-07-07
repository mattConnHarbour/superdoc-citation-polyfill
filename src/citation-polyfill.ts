/**
 * Citation Polyfill - styling, numbering, and click handling.
 *
 * Uses SuperDoc's native Custom UI APIs for click detection and selection.
 * ProseMirror is only used for numbering (traversing/updating citation nodes).
 */

import { createSuperDocUI } from 'superdoc/ui';

export interface CitationData {
  sourceIds: string[];
  resolvedText: string;
  instruction: string;
}

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
 * Since SuperDoc renders citations as plain text runs, we need to find them by position.
 */
export function applyCitationStyles(container: HTMLElement, editor?: any): void {
  injectCitationStyles();

  if (!editor) return;

  // Get citation positions from ProseMirror
  const citationPositions: { start: number; end: number }[] = [];
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'citation') {
      citationPositions.push({ start: pos, end: pos + node.nodeSize });
    }
  });

  // Find text runs that match citation positions and style them
  container.querySelectorAll('.superdoc-text-run[data-pm-start]').forEach(el => {
    const pmStart = parseInt(el.getAttribute('data-pm-start') || '', 10);
    const pmEnd = parseInt(el.getAttribute('data-pm-end') || '', 10);

    // Check if this text run overlaps with any citation
    const isCitation = citationPositions.some(
      cit => pmStart >= cit.start && pmEnd <= cit.end
    );

    if (isCitation && !el.classList.contains('citation-pill')) {
      el.classList.add('citation-pill');
    }
  });
}

/**
 * Build a map of sourceId -> citation number based on document order.
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
 */
export function getCitationLabel(sourceIds: string[], numberMap: Map<string, number>): string {
  const nums = sourceIds
    .map(sid => numberMap.get(sid))
    .filter((n): n is number => n !== undefined);
  return nums.length ? nums.join(',') + '.' : '?.';
}

/**
 * Update all citations in the document to use numbered labels.
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
 * Citation Styler - combines styling, numbering, and click handling.
 */
export class CitationStyler {
  private superdoc: any;
  private editor: any;
  private doc: any;
  private container: HTMLElement;
  private ui: ReturnType<typeof createSuperDocUI> | null = null;
  private numberMap: Map<string, number> = new Map();
  private cleanupFns: (() => void)[] = [];
  private clickCallback: ((citation: CitationData | null) => void) | null = null;
  private selectionCallback: ((citation: CitationData | null) => void) | null = null;

  constructor(superdoc: any, container: HTMLElement) {
    this.superdoc = superdoc;
    this.editor = superdoc?.activeEditor;
    this.doc = this.editor?.doc;
    this.container = container;

    if (!this.editor || !this.container || !this.doc) {
      console.warn('[CitationStyler] Missing editor, container, or doc');
      return;
    }

    this.init();
  }

  private init() {
    injectCitationStyles();
    this.refresh();

    // Create SuperDoc UI controller
    this.ui = createSuperDocUI({ superdoc: this.superdoc });

    // Click handling using ui.viewport.positionAt()
    const host = this.ui.viewport.getHost();
    if (host) {
      const clickHandler = (e: MouseEvent) => {
        if (!this.ui) return;
        const hit = this.ui.viewport.positionAt({ x: e.clientX, y: e.clientY });
        const citation = hit?.point ? this.findCitationAtPoint(hit.point) : null;
        if (this.clickCallback) {
          this.clickCallback(citation);
        }
      };
      host.addEventListener('click', clickHandler);
      this.cleanupFns.push(() => host.removeEventListener('click', clickHandler));
    }

    // Selection change handling using ui.selection.subscribe()
    const unsubscribe = this.ui.selection.subscribe(({ snapshot }) => {
      if (!this.selectionCallback) return;
      const firstSegment = snapshot.target?.segments?.[0];
      if (firstSegment) {
        const point = { blockId: firstSegment.blockId, offset: firstSegment.range.start };
        const citation = this.findCitationAtPoint(point);
        this.selectionCallback(citation);
      }
    });
    this.cleanupFns.push(unsubscribe);

    // Re-apply styles on document updates
    const updateHandler = () => {
      setTimeout(() => applyCitationStyles(this.container, this.editor), 50);
    };
    this.editor.on('update', updateHandler);
    this.cleanupFns.push(() => this.editor.off('update', updateHandler));
  }

  /** Find citation at a given point using doc.citations.list() */
  private findCitationAtPoint(point: { blockId: string; offset: number }): CitationData | null {
    try {
      const result = this.doc.citations.list();
      for (const item of result.items) {
        const anchor = item.address?.anchor;
        if (!anchor) continue;

        // Add tolerance since positionAt() may return position just before/after the citation
        const tolerance = 2;
        if (
          anchor.start.blockId === point.blockId &&
          point.offset >= anchor.start.offset - tolerance &&
          point.offset <= anchor.end.offset + tolerance
        ) {
          return {
            sourceIds: item.sourceIds || [],
            resolvedText: item.displayText || '',
            instruction: item.instruction || '',
          };
        }
      }
    } catch {
      // citations.list() may fail
    }
    return null;
  }

  /** Set callback for citation clicks */
  onCitationClick(callback: (citation: CitationData | null) => void): this {
    this.clickCallback = callback;
    return this;
  }

  /** Set callback for selection changes */
  onSelectionChange(callback: (citation: CitationData | null) => void): this {
    this.selectionCallback = callback;
    return this;
  }

  /** Refresh numbering and styles */
  refresh(): Map<string, number> {
    this.numberMap = applyNumberedLabels(this.editor);
    setTimeout(() => applyCitationStyles(this.container, this.editor), 100);
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
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
    this.ui?.destroy();
    this.ui = null;
  }
}

// Legacy export
export { CitationStyler as CitationPolyfill };
