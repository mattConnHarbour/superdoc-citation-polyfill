import { useState, useEffect, useRef, useCallback } from 'react';
import { SuperDocEditor, type SuperDocRef } from '@superdoc-dev/react';
import '@superdoc-dev/react/style.css';
import { CitationStyler, type CitationData } from './citation-polyfill';

interface Source {
  sourceId: string;
  tag: string;
  type: string;
  fields: Record<string, any>;
}

interface InlineCitation {
  sourceIds: string[];
  displayText: string;
  instruction: string;
}

function App() {
  const editorRef = useRef<SuperDocRef>(null);
  const stylerRef = useRef<CitationStyler | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [inlineCitations, setInlineCitations] = useState<InlineCitation[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationData | null>(null);
  const [numberMap, setNumberMap] = useState<Map<string, number>>(new Map());
  const [bibliographyStyle, setBibliographyStyle] = useState('APA');
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState({ type: 'journalArticle', title: '', author: '', year: '' });

  useEffect(() => {
    loadDefaultDoc();
    return () => {
      stylerRef.current?.destroy();
    };
  }, []);

  const loadDefaultDoc = async () => {
    const response = await fetch('/default.docx');
    if (!response.ok) return;
    const blob = await response.blob();
    setFile(new File([blob], 'default.docx', { type: blob.type }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setIsReady(false);
    }
  };

  const refreshSources = useCallback(() => {
    const superdoc = editorRef.current?.getInstance();
    const doc = superdoc?.activeEditor?.doc;
    if (!doc) return;

    try {
      const result = doc.citations.sources.list();
      setSources(result.items.map((item: any) => ({
        sourceId: item.address.sourceId,
        tag: item.tag,
        type: item.type,
        fields: item.fields,
      })));
    } catch {
      setSources([]);
    }
  }, []);

  const refreshCitations = useCallback(() => {
    const superdoc = editorRef.current?.getInstance();
    const doc = superdoc?.activeEditor?.doc;
    if (!doc) return;

    try {
      const result = doc.citations.list();
      setInlineCitations(result.items.map((item: any) => ({
        sourceIds: item.sourceIds,
        displayText: item.displayText,
        instruction: item.instruction,
      })));
    } catch {
      setInlineCitations([]);
    }
  }, []);

  const handleEditorReady = useCallback(({ superdoc }: { superdoc: any }) => {
    setIsReady(true);

    const container = document.getElementById('superdoc-editor') as HTMLElement;
    if (!superdoc || !container) return;

    // Clean up previous instance
    stylerRef.current?.destroy();

    // Set up new styler with click/selection callbacks
    stylerRef.current = new CitationStyler(superdoc, container);
    stylerRef.current
      .onCitationClick(setSelectedCitation)
      .onSelectionChange(setSelectedCitation);
    setNumberMap(stylerRef.current.getNumberMap());

    // Load sources and citations from document API
    refreshSources();
    refreshCitations();
  }, [refreshSources, refreshCitations]);

  const getSelectedSources = () => {
    if (!selectedCitation?.sourceIds?.length) return [];
    return sources.filter(s =>
      selectedCitation.sourceIds.includes(s.sourceId) ||
      selectedCitation.sourceIds.includes(s.tag)
    );
  };

  const selectSource = (id: string) => {
    setSelectedSourceId(prev => prev === id ? null : id);
  };

  const addSource = () => {
    const superdoc = editorRef.current?.getInstance();
    const doc = superdoc?.activeEditor?.doc;
    if (!doc) return;

    const [last, first] = newSource.author.split(',').map(s => s.trim());

    doc.citations.sources.insert({
      type: newSource.type as any,
      fields: {
        title: newSource.title,
        authors: last ? [{ last, first }] : [],
        year: newSource.year,
      },
    });

    refreshSources();
    setShowAddSource(false);
    setNewSource({ type: 'journalArticle', title: '', author: '', year: '' });
  };

  // Insert citation using SDK with native TextTarget from doc.selection
  const insertCitation = () => {
    const superdoc = editorRef.current?.getInstance();
    const editor = superdoc?.activeEditor;
    const doc = editor?.doc;
    if (!doc || !editor || !selectedSourceId) return;

    const source = sources.find(s => s.sourceId === selectedSourceId);
    if (!source) return;

    editor.focus();

    // Get TextTarget from doc.selection.current()
    const { target } = doc.selection.current();
    if (!target) {
      console.warn('No selection target available');
      return;
    }

    doc.citations.insert({
      at: target,
      sourceIds: [source.tag],
    });

    // Refresh styler to update numbering
    if (stylerRef.current) {
      setNumberMap(stylerRef.current.refresh());
    }
    refreshCitations();
  };

  const exportDocx = () => {
    editorRef.current?.getInstance()?.export({ exportedName: 'citations-export' });
  };

  const copyBibliography = async () => {
    const text = sources.map(s => formatBibEntry(s).replace(/<[^>]*>/g, '')).join('\n\n');
    await navigator.clipboard.writeText(text);
  };

  const getCitationNumbers = (sourceIds: string[] | undefined): string => {
    if (!sourceIds?.length || !stylerRef.current) return '?';
    return stylerRef.current.getLabel(sourceIds);
  };

  const formatAuthors = (authors?: Array<{ first?: string; last: string }>) => {
    if (!authors?.length) return '';
    return authors.map(a => `${a.last}${a.first ? ', ' + a.first : ''}`).join('; ');
  };

  const formatBibEntry = (source: Source): string => {
    const { fields, type } = source;
    const authors = fields.authors || [];
    const year = fields.year || 'n.d.';
    const title = fields.title || 'Untitled';

    const authorStr = authors.length
      ? authors.map((a: any) => `${a.last}, ${a.first?.[0] || ''}.`).join(' ')
      : '';

    if (bibliographyStyle === 'APA') {
      return `${authorStr} (${year}). ${type === 'book' ? `<i>${title}</i>` : title}.`;
    }
    if (bibliographyStyle === 'MLA') {
      return `${authorStr}. "${title}." ${year}.`;
    }
    return `${authorStr}. "${title}." ${year}.`;
  };

  return (
    <div className="app">
      <header className="header">
        <button onClick={loadDefaultDoc} className="btn">Reload Default</button>
        <input type="file" accept=".docx" onChange={handleFileChange} />
        <button onClick={exportDocx} disabled={!isReady} className="btn btn-primary">Export DOCX</button>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-header">
              <h3 className="panel-title">Sources</h3>
              <button onClick={() => setShowAddSource(true)} disabled={!isReady} className="btn btn-small">+ Add</button>
            </div>

            {sources.length === 0 ? (
              <div className="empty-state">No sources yet. Add one to insert citations.</div>
            ) : (
              <div className="source-list">
                {sources.map(source => (
                  <div
                    key={source.sourceId}
                    className={`source-item ${selectedSourceId === source.sourceId ? 'selected' : ''}`}
                    onClick={() => selectSource(source.sourceId)}
                  >
                    <div className="source-type">{source.type}</div>
                    <div className="source-title">{source.fields.title || 'Untitled'}</div>
                    <div className="source-authors">{formatAuthors(source.fields.authors)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="insert-section">
              <button onClick={insertCitation} disabled={!selectedSourceId || !isReady} className="btn btn-full btn-primary">
                Insert Citation
              </button>
              {!selectedSourceId && <p className="insert-hint">Select a source first</p>}
            </div>
          </div>

          <details className="panel-details">
            <summary className="panel-summary">Citations in document ({inlineCitations.length})</summary>
            <div className="panel-content">
              {inlineCitations.length === 0 ? (
                <div className="empty-state">None yet.</div>
              ) : (
                <div className="citation-list">
                  {inlineCitations.map((cit, idx) => {
                    const citSources = cit.sourceIds?.map(sid =>
                      sources.find(s => s.sourceId === sid || s.tag === sid)
                    ).filter(Boolean) || [];
                    return (
                      <div key={idx} className="citation-item">
                        <span className="citation-number">{getCitationNumbers(cit.sourceIds)}</span>
                        <div className="citation-details">
                          {citSources.length > 0 ? (
                            citSources.map((source: any) => (
                              <div key={source.sourceId} className="citation-source-info">
                                <div className="citation-source-title">{source.fields.title || 'Untitled'}</div>
                                <div className="citation-source-meta">
                                  {formatAuthors(source.fields.authors)}
                                  {source.fields.year && ` (${source.fields.year})`}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="citation-source-unknown">Unknown source: {cit.sourceIds?.join(', ')}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </details>

          <details className="panel-details">
            <summary className="panel-summary">Bibliography</summary>
            <div className="panel-content">
              <select value={bibliographyStyle} onChange={e => setBibliographyStyle(e.target.value)} className="select">
                <option value="APA">APA</option>
                <option value="MLA">MLA</option>
                <option value="Chicago">Chicago</option>
              </select>
              {sources.length > 0 && (
                <div className="bibliography-preview">
                  {sources.map(source => (
                    <div key={source.sourceId} className="bibliography-entry" dangerouslySetInnerHTML={{ __html: formatBibEntry(source) }} />
                  ))}
                </div>
              )}
              <button onClick={copyBibliography} disabled={sources.length === 0} className="btn btn-small" style={{ marginTop: '0.5rem' }}>Copy</button>
            </div>
          </details>
        </aside>

        <div className="document-container">
          {file && (
            <SuperDocEditor
              ref={editorRef}
              id="superdoc-editor"
              document={file}
              documentMode="editing"
              onReady={handleEditorReady}
            />
          )}
        </div>

        <aside className="source-panel open">
          <div className="source-viewer-panel">
            <h3 className="panel-title">Selected Citation</h3>

            {!selectedCitation ? (
              <div className="no-selection">
                <div className="no-selection-icon">📍</div>
                <div className="no-selection-text">No citation selected</div>
                <div className="no-selection-hint">Click on a citation in the document to view its source</div>
              </div>
            ) : (
              <>
                {getSelectedSources().length > 0 ? (
                  <div className="source-details">
                    {getSelectedSources().map(source => (
                      <div key={source.sourceId} className="source-detail-item">
                        <div className="source-detail-type">{source.type}</div>
                        <div className="source-detail-title">{source.fields.title || 'Untitled'}</div>
                        <div className="source-detail-meta">
                          {source.fields.authors?.length && <span>{formatAuthors(source.fields.authors)}</span>}
                          {source.fields.year && <span> ({source.fields.year})</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="source-details-empty">
                    <div className="source-ids">Source IDs: {selectedCitation.sourceIds?.join(', ') || 'none'}</div>
                    <div className="source-hint">No matching sources in document metadata</div>
                  </div>
                )}

                <div className="citation-meta">
                  <div className="citation-meta-label">Citation text:</div>
                  <div className="citation-meta-value">{selectedCitation.resolvedText || '[Citation]'}</div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {showAddSource && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddSource(false)}>
          <div className="modal">
            <h3>Add Source</h3>
            <div className="form-group">
              <label>Type</label>
              <select value={newSource.type} onChange={e => setNewSource(prev => ({ ...prev, type: e.target.value }))} className="select">
                <option value="book">Book</option>
                <option value="journalArticle">Journal Article</option>
                <option value="website">Website</option>
                <option value="misc">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Title</label>
              <input value={newSource.title} onChange={e => setNewSource(prev => ({ ...prev, title: e.target.value }))} className="input" placeholder="Enter title" />
            </div>
            <div className="form-group">
              <label>Author (Last, First)</label>
              <input value={newSource.author} onChange={e => setNewSource(prev => ({ ...prev, author: e.target.value }))} className="input" placeholder="Smith, John" />
            </div>
            <div className="form-group">
              <label>Year</label>
              <input value={newSource.year} onChange={e => setNewSource(prev => ({ ...prev, year: e.target.value }))} className="input" placeholder="2024" />
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowAddSource(false)} className="btn">Cancel</button>
              <button onClick={addSource} className="btn btn-primary">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
