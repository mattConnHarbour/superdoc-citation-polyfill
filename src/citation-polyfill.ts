/**
 * Citation Polyfill - plug and play setup for SuperDoc citations.
 *
 * Usage:
 *   const polyfill = new CitationPolyfill(superdoc, container);
 *   polyfill.onCitationClick((citation) => console.log(citation));
 *   polyfill.onSelectionChange((citation, pos) => console.log(citation, pos));
 *
 *   // Later, to clean up:
 *   polyfill.destroy();
 */

export interface CitationData {
  sourceIds: string[];
  resolvedText: string;
  instruction: string;
  position: number;
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
function injectCSS() {
  if (cssInjected) return;
  const style = document.createElement('style');
  style.textContent = CITATION_CSS;
  document.head.appendChild(style);
  cssInjected = true;
}

export class CitationPolyfill {
  private superdoc: any;
  private editor: any;
  private container: HTMLElement;
  private cleanupFns: (() => void)[] = [];
  private numberMap: Map<string, number> = new Map();
  private clickCallback: ((citation: CitationData | null) => void) | null = null;
  private selectionCallback: ((citation: CitationData | null, pos: number) => void) | null = null;

  constructor(superdoc: any, container: HTMLElement) {
    this.superdoc = superdoc;
    this.editor = superdoc?.activeEditor;
    this.container = container;

    if (!this.editor || !this.container) {
      console.warn('[CitationPolyfill] Missing editor or container');
      return;
    }

    this.init();
  }

  private init() {
    // Inject CSS
    injectCSS();

    // Convert citations to numbered format and apply styles
    this.refresh();

    // Set up click handler
    const clickHandler = (e: MouseEvent) => {
      if (!this.clickCallback) return;
      const pos = this.editor.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
      this.clickCallback(pos ? this.getCitationAt(pos) : null);
    };
    this.container.addEventListener('click', clickHandler);
    this.cleanupFns.push(() => this.container.removeEventListener('click', clickHandler));

    // Set up selection change handler
    const selectionHandler = () => {
      if (!this.selectionCallback) return;
      const pos = this.editor.state.selection.from;
      this.selectionCallback(this.getCitationAt(pos), pos);
    };
    this.editor.on('selectionUpdate', selectionHandler);
    this.cleanupFns.push(() => this.editor.off('selectionUpdate', selectionHandler));

    // Re-apply styles on document updates
    const updateHandler = () => {
      setTimeout(() => this.applyStyles(), 50);
    };
    this.editor.on('update', updateHandler);
    this.cleanupFns.push(() => this.editor.off('update', updateHandler));
  }

  /** Refresh numbering and styles */
  refresh() {
    this.convertToNumbered();
    setTimeout(() => this.applyStyles(), 100);
  }

  /** Set callback for citation clicks */
  onCitationClick(callback: (citation: CitationData | null) => void) {
    this.clickCallback = callback;
    return this;
  }

  /** Set callback for selection changes */
  onSelectionChange(callback: (citation: CitationData | null, pos: number) => void) {
    this.selectionCallback = callback;
    return this;
  }

  /** Get citation at a document position */
  getCitationAt(pos: number): CitationData | null {
    const node = this.editor.state.doc.nodeAt(pos);
    if (node?.type.name !== 'citation') return null;
    return {
      sourceIds: node.attrs.sourceIds || [],
      resolvedText: node.attrs.resolvedText || '',
      instruction: node.attrs.instruction || '',
      position: pos,
    };
  }

  /** Get the current number map (sourceId -> number) */
  getNumberMap(): Map<string, number> {
    return this.numberMap;
  }

  /** Get citation label for source IDs */
  getLabel(sourceIds: string[]): string {
    const nums = sourceIds.map(sid => this.numberMap.get(sid)).filter(Boolean);
    return nums.length ? nums.join(',') + '.' : '?.';
  }

  /** Insert a new citation at position */
  insertCitation(pos: number, sourceTag: string): boolean {
    const citationType = this.editor.state.schema.nodes.citation;
    if (!citationType) return false;

    const node = citationType.create({
      sourceIds: [sourceTag],
      resolvedText: '?.',
      instruction: `CITATION ${sourceTag}`,
    });

    this.editor.dispatch(this.editor.state.tr.insert(pos, node));
    this.refresh();
    return true;
  }

  /** Clean up all listeners */
  destroy() {
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
  }

  private convertToNumbered() {
    const citations: { pos: number; node: any }[] = [];
    this.editor.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'citation') citations.push({ pos, node });
    });

    // Build number map
    this.numberMap = new Map();
    let num = 1;
    this.editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'citation') {
        for (const sid of node.attrs.sourceIds || []) {
          if (!this.numberMap.has(sid)) this.numberMap.set(sid, num++);
        }
      }
    });

    if (!citations.length) return;

    // Update citation labels
    let tr = this.editor.state.tr;
    for (let i = citations.length - 1; i >= 0; i--) {
      const { pos, node } = citations[i];
      const label = this.getLabel(node.attrs.sourceIds || []);
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, resolvedText: label });
    }
    this.editor.dispatch(tr);
  }

  private applyStyles() {
    if (!this.container) return;

    // Get citation positions
    const citationPositions = new Set<number>();
    this.editor.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'citation') citationPositions.add(pos);
    });

    // Apply class to citation spans
    citationPositions.forEach(pos => {
      const span = this.container.querySelector(`[data-pm-start="${pos}"]`);
      if (span && !span.classList.contains('citation-pill')) {
        span.classList.add('citation-pill');
      }
    });
  }
}

// Export a simple setup function as alternative
export function setupCitationPolyfill(
  superdoc: any,
  container: HTMLElement,
  options?: {
    onCitationClick?: (citation: CitationData | null) => void;
    onSelectionChange?: (citation: CitationData | null, pos: number) => void;
  }
): CitationPolyfill {
  const polyfill = new CitationPolyfill(superdoc, container);
  if (options?.onCitationClick) polyfill.onCitationClick(options.onCitationClick);
  if (options?.onSelectionChange) polyfill.onSelectionChange(options.onSelectionChange);
  return polyfill;
}
