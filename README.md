# SuperDoc Citations Demo

This demo showcases citation support in SuperDoc using a polyfill approach until native citation rendering is available.

## Installation

```bash
npm install superdoc@1.32.0-pr.3259.1778797810 @superdoc-dev/react
```

## Citation Polyfill

The `CitationPolyfill` class provides plug-and-play citation styling and interaction until SuperDoc ships full native support for citation click handling and visual rendering.

### What it does

- **Automatic numbering**: Converts citation nodes to numbered format (1., 2., etc.)
- **Pill styling**: Applies visual styling to citation spans in the rendered document
- **Click handling**: Detects clicks on citations and returns citation data
- **Selection tracking**: Tracks cursor position relative to citations
- **Auto-refresh**: Re-applies styles when the document updates

### Usage

```tsx
import { CitationPolyfill } from './citation-polyfill';

// In your onReady callback:
const handleReady = ({ superdoc }) => {
  const container = document.getElementById('your-editor-container');

  const polyfill = new CitationPolyfill(superdoc, container);

  polyfill
    .onCitationClick((citation) => {
      console.log('Clicked citation:', citation);
      // citation = { sourceIds, resolvedText, instruction, position }
    })
    .onSelectionChange((citation, pos) => {
      console.log('Selection at:', pos, citation);
    });

  // Insert a citation at cursor position
  polyfill.insertCitation(cursorPos, 'source-tag');

  // Get label for source IDs
  const label = polyfill.getLabel(['source-1', 'source-2']); // "1,2."

  // Clean up when done
  polyfill.destroy();
};
```

### Using the Document API

The polyfill works alongside SuperDoc's citation document API:

```tsx
const doc = superdoc.activeEditor.doc;

// List sources in the document
const sources = doc.citations.sources.list();

// List inline citations
const citations = doc.citations.list();

// Insert a new source
doc.citations.sources.insert({
  type: 'journalArticle',
  fields: {
    title: 'My Article',
    authors: [{ first: 'John', last: 'Smith' }],
    year: '2024',
  },
});
```

## What's Coming

This polyfill is a temporary solution. The upcoming SuperDoc release will include:

- Native citation click events
- Built-in citation pill rendering
- Configurable citation styles

At that point, you can remove the polyfill and use the native APIs directly.

## Running the Demo

```bash
pnpm install
pnpm dev
```
