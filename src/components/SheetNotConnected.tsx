/**
 * Shown when the Google Sheet has never been read successfully — no mock or
 * seed data is substituted. Better to say exactly what's wrong than to
 * render a dashboard full of numbers that aren't real.
 */
export function SheetNotConnected({ error }: { error: string | null }) {
  return (
    <main>
      <div className="wrap" style={{ maxWidth: 720, paddingTop: 60 }}>
        <div className="panel" style={{ padding: '28px 30px 32px' }}>
          <span className="eyebrow">Setup</span>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', margin: '8px 0 10px' }}>
            Not connected to the Google Sheet
          </h1>
          <p style={{ color: 'var(--ink-2)', margin: '0 0 18px' }}>
            QAmate reads the QA workbook directly — there is no sample or seed data. Nothing renders
            until the sheet can be read.
          </p>
          {error ? (
            <pre
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 9,
                padding: '14px 16px',
                fontFamily: 'var(--f-mono)',
                fontSize: 13,
                overflowX: 'auto',
                margin: '0 0 18px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {error}
            </pre>
          ) : null}
          <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '0 0 10px' }}>
            To fix it:
          </p>
          <ol style={{ color: 'var(--ink-2)', fontSize: 14, margin: '0 0 18px', paddingLeft: 20, lineHeight: 1.7 }}>
            <li>
              Set <code>GOOGLE_SERVICE_ACCOUNT_KEY</code> and <code>QA_SHEET_ID</code> in <code>.env</code>{' '}
              (or as Render environment variables).
            </li>
            <li>Share the sheet with the service account&apos;s e-mail as Viewer.</li>
            <li>
              Make sure the sheet has all required tabs — including an <code>Issues</code> tab — with the
              expected column headers. See <code>README.md</code>.
            </li>
            <li>
              Run <code>npm run check:sheet</code> to see exactly which check is failing.
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
