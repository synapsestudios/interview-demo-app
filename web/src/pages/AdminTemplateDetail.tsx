import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';
import { StatusBadge, BandChip } from '../components/Badge';
import { PageHead } from '../components/PageHead';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function AdminTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: t, loading } = useAsync(() => api.getTemplate(id!), [id]);

  if (loading || !t) return <div className="loading">Retrieving instrument…</div>;

  const totalQuestions = t.sections.reduce((n, s) => n + s.questions.length, 0);
  const totalConds = t.sections.reduce(
    (n, s) => n + s.questions.reduce((m, q) => m + q.conditionals.length, 0),
    0,
  );

  return (
    <div className="stagger">
      <PageHead
        eyebrow={
          <>
            <Link to="/admin/templates" style={{ color: 'var(--ink-3)' }}>
              Instruments
            </Link>{' '}
            / {t.status.toUpperCase()}
          </>
        }
        title={t.name}
        dek={t.description ?? undefined}
        note={`v${t.version} · ${t.sections.length} sections · ${totalQuestions} questions · ${totalConds} conditional${totalConds === 1 ? '' : 's'}`}
        actions={<StatusBadge status={t.status} />}
      />

      {t.status !== 'draft' && (
        <div className="banner locked">
          <div className="hdr">Instrument locked</div>
          This instrument is {t.status}. To revise, fork it from the instruments list — v{t.version + 1} will be created as an independent draft. In-flight casefiles continue to use their captured snapshot.
        </div>
      )}

      <div className="paper">
        <div className="paper-title">
          <span className="eyebrow">
            <span className="num">§</span> Scoring bands
          </span>
        </div>
        <table className="ledger">
          <thead>
            <tr>
              <th>Band</th>
              <th>Range</th>
              <th>Swatch</th>
            </tr>
          </thead>
          <tbody>
            {t.bands.map((b) => (
              <tr key={b.id} onClick={(e) => e.preventDefault()}>
                <td>
                  <BandChip label={b.label} color={b.color} />
                </td>
                <td className="num">
                  {b.minScore.toFixed(b.minScore % 1 === 0 ? 0 : 2)} —{' '}
                  {b.maxScore.toFixed(b.maxScore % 1 === 0 ? 0 : 2)}
                </td>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 40,
                      height: 10,
                      background: b.color,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {t.sections
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s, i) => (
          <section key={s.id}>
            <div className="section-head">
              <span className="numeral">§&nbsp;{ROMAN[i + 1]}</span>
              <h2>{s.title}</h2>
              <span className="weight-note">weight × {s.weight}</span>
            </div>
            {s.questions
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((q) => (
                <div className="question" key={q.id}>
                  <div className="prompt">{q.prompt}</div>
                  <div className="meta">
                    <span>{q.type}</span>
                    <span>weight × {q.weight}</span>
                    {q.required && <span className="required-flag">required</span>}
                    {q.conditionals.length > 0 && (
                      <span className="cond-flag">conditional</span>
                    )}
                  </div>
                  {q.type !== 'likert' && (
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '12px 0 0',
                        display: 'grid',
                        gap: 4,
                        maxWidth: 520,
                      }}
                    >
                      {q.options.map((o) => (
                        <li
                          key={o.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            alignItems: 'baseline',
                            borderBottom: '1px dashed var(--rule-hair)',
                            padding: '6px 0',
                            fontSize: 14,
                          }}
                        >
                          <span>{o.label}</span>
                          <span
                            style={{
                              fontFamily: 'var(--mono)',
                              fontSize: 11.5,
                              color: 'var(--ink-3)',
                            }}
                          >
                            + {o.score}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.type === 'likert' && (
                    <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)' }}>
                      1 — {q.options[0]?.label} · 5 — {q.options[4]?.label}
                    </div>
                  )}
                </div>
              ))}
          </section>
        ))}
    </div>
  );
}
