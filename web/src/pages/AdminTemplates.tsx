import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, TemplateListItem } from '../api';
import { useAsync } from '../hooks/useAsync';
import { StatusBadge } from '../components/Badge';
import { PageHead } from '../components/PageHead';

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminTemplates() {
  const { data, loading, reload } = useAsync(() => api.listTemplates(), []);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const onCreate = async () => {
    setCreating(true);
    try {
      const t = await api.createTemplate({ name: 'Untitled instrument' });
      navigate(`/admin/templates/${t.id}/edit`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="loading">Gathering instruments…</div>;
  if (!data) return <div className="empty">No templates available.</div>;

  const sorted = [...data].sort((a, b) => {
    const order = { published: 0, draft: 1, archived: 2 } as const;
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.version - b.version;
  });

  const onPublish = async (id: string) => {
    await api.publishTemplate(id);
    reload();
  };
  const onFork = async (id: string) => {
    await api.forkTemplate(id);
    reload();
  };
  const onArchive = async (id: string) => {
    if (!confirm('Move this template to the archive?')) return;
    await api.archiveTemplate(id);
    reload();
  };

  return (
    <div className="stagger">
      <PageHead
        eyebrow="§ I · Editorial"
        title="Screening instruments"
        dek="Reusable assessment templates. Publish to release to the field; fork to propose a revision without affecting in-flight casefiles."
        note={`${data.length} instruments on file`}
        actions={
          <button className="btn" onClick={onCreate} disabled={creating}>
            {creating ? 'Creating…' : '+ New instrument'}
          </button>
        }
      />

      <div className="paper">
        <table className="ledger">
          <thead>
            <tr>
              <th style={{ width: '36%' }}>Instrument</th>
              <th>Version</th>
              <th>Status</th>
              <th>Lineage</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <TemplateRow
                key={t.id}
                t={t}
                onPublish={onPublish}
                onFork={onFork}
                onArchive={onArchive}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplateRow({
  t,
  onPublish,
  onFork,
  onArchive,
}: {
  t: TemplateListItem;
  onPublish: (id: string) => void;
  onFork: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <tr onClick={() => (window.location.href = `/admin/templates/${t.id}`)}>
      <td>
        <Link
          to={`/admin/templates/${t.id}`}
          style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--ink-0)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {t.name}
        </Link>
        {t.description && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, maxWidth: '48ch' }}>
            {t.description}
          </div>
        )}
      </td>
      <td className="big-num">v{t.version}</td>
      <td>
        <StatusBadge status={t.status} />
      </td>
      <td className="id">
        {t.parentTemplateId ? t.parentTemplateId.slice(0, 8) : '—'}
      </td>
      <td className="date">{fmtDate(t.updatedAt)}</td>
      <td className="toolbar-end" onClick={(e) => e.stopPropagation()}>
        {t.status === 'draft' && (
          <>
            <Link to={`/admin/templates/${t.id}/edit`} className="btn quiet">
              Edit
            </Link>
            <button className="btn ghost" onClick={() => onPublish(t.id)}>
              Publish
            </button>
          </>
        )}
        {t.status === 'published' && (
          <button className="btn quiet" onClick={() => onFork(t.id)}>
            Fork
          </button>
        )}
        {t.status !== 'archived' && (
          <button className="btn quiet" onClick={() => onArchive(t.id)}>
            Archive
          </button>
        )}
      </td>
    </tr>
  );
}
