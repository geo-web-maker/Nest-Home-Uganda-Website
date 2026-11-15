import { useState } from 'react';
import styles from './ContractReader.module.css';

type Mode = 'document' | 'clauses';

type Props = {
  clauses: Record<string, string>;
  /** Fully rendered agreement from the server. When absent, the clauses are laid out as one document here. */
  documentHtml?: string | null;
  reference?: string;
};

const lines = (text: string) => text.split('\n').filter((line) => line.trim());

/** Lets the client read the contract the way they prefer: as one continuous document, or clause by clause. */
export function ContractReader({ clauses, documentHtml, reference }: Props) {
  const [mode, setMode] = useState<Mode>('document');
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(clauses);

  return (
    <div className={styles.reader}>
      <div className={styles.bar}>
        <div className={styles.seg} role="tablist" aria-label="How to read the agreement">
          <button type="button" role="tab" id="read-doc" aria-selected={mode === 'document'} aria-controls="read-panel" onClick={() => setMode('document')}>Full document</button>
          <button type="button" role="tab" id="read-clauses" aria-selected={mode === 'clauses'} aria-controls="read-panel" onClick={() => setMode('clauses')}>Clause by clause</button>
        </div>
        {mode === 'clauses' && entries.length > 0 && (
          <button type="button" className={styles.toggleAll} onClick={() => setExpanded((open) => !open)}>{expanded ? 'Collapse all' : 'Expand all'}</button>
        )}
      </div>

      <div id="read-panel" role="tabpanel" aria-labelledby={mode === 'document' ? 'read-doc' : 'read-clauses'} className={styles.panel}>
        {mode === 'document' ? (
          documentHtml
            ? <iframe className={styles.frame} title="Agreement document" srcDoc={documentHtml} sandbox="" />
            : (
              <article className={styles.paper}>
                <h2>Care agreement</h2>
                {reference && <p className={styles.ref}>Reference {reference}</p>}
                {entries.map(([number, text]) => (
                  <section key={number}>
                    <h3>Clause {number}</h3>
                    {lines(text).map((line, index) => <p key={`${number}-${index}`}>{line}</p>)}
                  </section>
                ))}
              </article>
            )
        ) : (
          <div className={styles.list}>
            {entries.map(([number, text]) => (
              <details key={`${number}-${expanded}`} open={expanded}>
                <summary>Clause {number}</summary>
                <div>{lines(text).map((line, index) => <p key={`${number}-${index}`}>{line}</p>)}</div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
