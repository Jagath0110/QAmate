/**
 * The one state that shows nothing else: the database has not been created.
 * Better to say exactly which command is missing than to render an empty
 * dashboard that looks like a bug.
 */
export function SetupNotice() {
  return (
    <main>
      <div className="wrap" style={{ maxWidth: 720, paddingTop: 60 }}>
        <div className="panel" style={{ padding: '28px 30px 32px' }}>
          <span className="eyebrow">Setup</span>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', margin: '8px 0 10px' }}>
            The database has not been created yet
          </h1>
          <p style={{ color: 'var(--ink-2)', margin: '0 0 18px' }}>
            QAmate stores a cached copy of the QA sheet so page loads stay fast and trend charts have
            history. Run this once and reload:
          </p>
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
            }}
          >
            npm run setup
          </pre>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: 0 }}>
            That generates the Prisma client, creates <code>prisma/dev.db</code>, and loads the seeded
            snapshot of the QA workbook — 298 manual cases and 135 automated scenarios. Google Sheets and
            GitHub credentials are optional; add them to <code>.env</code> when you want live data.
          </p>
        </div>
      </div>
    </main>
  );
}
