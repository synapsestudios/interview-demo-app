import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Client, ScreeningListItem, TemplateListItem } from '../api';
import { StatusBadge } from '../components/Badge';
import { PageHead } from '../components/PageHead';

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

export function AgencyScreenings({ agencyId }: { agencyId: string }) {
  const [screenings, setScreenings] = useState<ScreeningListItem[] | null>(null);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [status, setStatus] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [newClient, setNewClient] = useState('');
  const [composerClient, setComposerClient] = useState('');
  const [composerTemplate, setComposerTemplate] = useState('');

  const load = async () => {
    if (!agencyId) return;
    const [s, t, c] = await Promise.all([
      api.listScreenings({
        agencyId,
        status: status || undefined,
        templateId: templateId || undefined,
      }),
      api.listTemplates(),
      api.listClients(agencyId),
    ]);
    setScreenings(s);
    setTemplates(t.filter((x) => x.status === 'published'));
    setClients(c);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId, status, templateId]);

  const onAddClient = async () => {
    const trimmed = newClient.trim();
    if (!trimmed) return;
    const created = await api.createClient(agencyId, trimmed);
    setNewClient('');
    setClients((prev) => [...prev, created]);
    setComposerClient(created.id);
  };

  const onStart = async () => {
    if (!composerClient || !composerTemplate) return;
    const s = await api.createScreening(agencyId, composerClient, composerTemplate);
    window.location.href = `/agency/screenings/${s.id}`;
  };

  const bandColorByLabel = useMemo(() => {
    // Use the most recent submitted row we can find for each band label.
    const map = new Map<string, string>();
    (screenings ?? []).forEach((s) => {
      if (s.finalBand && !map.has(s.finalBand)) {
        // We don't have band color on the list response; colors come on the screening detail.
        // Fallback: map by label heuristic.
        map.set(s.finalBand, bandFallback(s.finalBand));
      }
    });
    return map;
  }, [screenings]);

  if (!agencyId) return <div className="loading">Choose an agency from the masthead.</div>;

  return (
    <div className="stagger">
      <PageHead
        eyebrow="§ II · Field"
        title="Casefiles"
        dek="Screenings run against clients. Drafts are private to this agency; submissions are immutable and feed the Compendium."
        note={
          screenings
            ? `${screenings.length} on file — ${screenings.filter((s) => s.status === 'submitted').length} submitted`
            : 'Loading…'
        }
      />

      <div className="composer">
        <div className="f">
          <label>Client</label>
          <select
            className="select"
            value={composerClient}
            onChange={(e) => setComposerClient(e.target.value)}
          >
            <option value="">— choose —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label>Instrument</label>
          <select
            className="select"
            value={composerTemplate}
            onChange={(e) => setComposerTemplate(e.target.value)}
          >
            <option value="">— choose —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · v{t.version}
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label>Or add a new client</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <input
              className="input"
              placeholder="New client name…"
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAddClient();
              }}
              style={{ flex: 1 }}
            />
            <button className="btn quiet" onClick={onAddClient} disabled={!newClient.trim()}>
              Add
            </button>
          </div>
        </div>
        <button
          className="btn"
          onClick={onStart}
          disabled={!composerClient || !composerTemplate}
        >
          Open casefile
        </button>
      </div>

      <div style={{ height: 22 }} />

      <div className="paper">
        <div className="filters">
          <span className="filter-label">Status</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
          </select>
          <span className="filter-label" style={{ marginLeft: 12 }}>
            Instrument
          </span>
          <select
            className="select"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">All</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · v{t.version}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <a
            className="btn quiet"
            href={api.exportCsvUrl(agencyId, templateId || undefined)}
          >
            Export CSV
          </a>
        </div>

        {screenings === null ? (
          <div className="loading">Gathering casefiles…</div>
        ) : screenings.length === 0 ? (
          <div className="empty">
            No casefiles match.
            <span className="sub">Try relaxing the filters above.</span>
          </div>
        ) : (
          <table className="ledger" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ width: '20%' }}>Client</th>
                <th>Instrument</th>
                <th>Status</th>
                <th>Started</th>
                <th>Submitted</th>
                <th style={{ textAlign: 'right' }}>Score</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              {screenings.map((s) => (
                <tr key={s.id} onClick={() => (window.location.href = `/agency/screenings/${s.id}`)}>
                  <td>
                    <Link
                      to={`/agency/screenings/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontFamily: 'var(--serif)', fontSize: 16.5, color: 'var(--ink-0)' }}
                    >
                      {s.clientName}
                    </Link>
                    <div className="id" style={{ fontSize: 10.5, marginTop: 2 }}>
                      {s.id.slice(0, 8)}
                    </div>
                  </td>
                  <td>
                    {s.templateName}{' '}
                    <span className="num" style={{ marginLeft: 4, color: 'var(--ink-3)' }}>
                      v{s.templateVersion}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="date">{fmtDate(s.startedAt)}</td>
                  <td className="date">{fmtDate(s.submittedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {s.finalScore !== null ? (
                      <span className="big-num">{s.finalScore.toFixed(1)}</span>
                    ) : (
                      <span style={{ color: 'var(--ink-3)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {s.finalBand ? (
                      <span
                        className="badge band"
                        style={{ color: bandColorByLabel.get(s.finalBand) ?? bandFallback(s.finalBand) }}
                      >
                        {s.finalBand}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ink-3)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Heuristic to pick a band color from its label when we don't have the hex handy.
// Matches the seeded template's palette; other bands fall back to ink.
function bandFallback(label: string): string {
  const m = label.toLowerCase();
  if (m.includes('low') || m.includes('stable')) return '#3b5d2a';
  if (m.includes('moderate')) return '#a06a14';
  if (m.includes('high') || m.includes('risk') || m.includes('at risk')) return '#9a2420';
  return '#1a140e';
}
