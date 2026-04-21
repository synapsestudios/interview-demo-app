import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ScreeningDetail, Question, Section } from '../api';
import { PageHead } from '../components/PageHead';
import { StatusBadge } from '../components/Badge';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

type AnswerMap = Map<
  string,
  { selectedOptionId: string | null; numericValue: number | null; note: string | null }
>;

export function AgencyScreeningDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ScreeningDetail | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  const [dirtyQuestionIds, setDirtyQuestionIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getScreening(id).then((d) => {
      setDetail(d);
      const next: AnswerMap = new Map();
      for (const a of d.answers) {
        next.set(a.questionId, {
          selectedOptionId: a.selectedOptionId,
          numericValue: a.numericValue,
          note: a.note,
        });
      }
      setAnswers(next);
    });
  }, [id]);

  const locked = detail?.status === 'submitted';

  const visibleMap = useMemo(() => {
    if (!detail) return new Map<string, boolean>();
    return computeVisibility(detail.snapshot.sections, answers);
  }, [detail, answers]);

  // Debounced autosave: any time the dirty set changes, after 600ms, PUT answers
  useEffect(() => {
    if (!detail || dirtyQuestionIds.size === 0) return;
    if (locked) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const payload = Array.from(dirtyQuestionIds).map((qid) => {
        const a = answers.get(qid);
        return {
          questionId: qid,
          selectedOptionId: a?.selectedOptionId ?? null,
          numericValue: a?.numericValue ?? null,
          note: a?.note ?? null,
        };
      });
      setSaving(true);
      try {
        const updated = await api.upsertAnswers(detail.id, payload);
        setDetail(updated);
        setDirtyQuestionIds(new Set());
      } finally {
        setSaving(false);
      }
    }, 600);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [dirtyQuestionIds, answers, detail, locked]);

  if (!detail) return <div className="loading">Opening casefile…</div>;

  const updateAnswer = (
    qid: string,
    patch: Partial<{
      selectedOptionId: string | null;
      numericValue: number | null;
      note: string | null;
    }>,
  ) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      const curr = next.get(qid) ?? {
        selectedOptionId: null,
        numericValue: null,
        note: null,
      };
      next.set(qid, { ...curr, ...patch });
      return next;
    });
    setDirtyQuestionIds((prev) => {
      const n = new Set(prev);
      n.add(qid);
      return n;
    });
  };

  const onSubmit = async () => {
    if (!detail) return;
    try {
      const d = await api.submitScreening(detail.id);
      setDetail(d);
    } catch (e) {
      alert(`Submit failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Computed values
  const scoring = detail.liveScoring;
  const bandColor = scoring.band?.color ?? 'var(--ink-0)';
  const bandLabel = scoring.band?.label ?? 'Unscored';

  return (
    <div className="stagger">
      <PageHead
        eyebrow={
          <>
            <Link to="/agency/screenings" style={{ color: 'var(--ink-3)' }}>
              Casefiles
            </Link>{' '}
            / {detail.snapshot.name} · v{detail.snapshot.version}
          </>
        }
        title={detail.clientName}
        dek={detail.snapshot.description ?? undefined}
        note={`Casefile ${detail.id.slice(0, 8)} · opened ${new Date(detail.startedAt).toLocaleDateString()}`}
        actions={<StatusBadge status={detail.status} />}
      />

      <ScorePlate
        liveScore={locked ? detail.persistedFinalScore : scoring.finalScore}
        bandLabel={locked ? detail.persistedFinalBand ?? bandLabel : bandLabel}
        bandColor={bandColor}
        answered={scoring.answeredVisibleQuestions}
        total={scoring.totalVisibleQuestions}
        locked={locked ?? false}
        saving={saving}
        sectionBreakdown={scoring.sectionBreakdown}
      />

      {locked ? (
        <div className="banner locked" style={{ marginTop: 22 }}>
          <div className="hdr">Submitted · locked</div>
          Submitted on {new Date(detail.submittedAt!).toLocaleString()}. Final score and band have been persisted. Answers are no longer editable.
        </div>
      ) : detail.canSubmit.canSubmit ? (
        <div className="banner locked" style={{ marginTop: 22 }}>
          <div className="hdr">Ready to submit</div>
          All required questions have been answered. Submission is final and will persist the live score &amp; band below.
        </div>
      ) : detail.canSubmit.blockingQuestions.length > 0 ? (
        <div className="banner" style={{ marginTop: 22 }}>
          <div className="hdr">
            {detail.canSubmit.blockingQuestions.length} required question
            {detail.canSubmit.blockingQuestions.length === 1 ? '' : 's'} remaining
          </div>
          <ul>
            {detail.canSubmit.blockingQuestions.slice(0, 5).map((q) => (
              <li key={q.id}>{q.prompt}</li>
            ))}
            {detail.canSubmit.blockingQuestions.length > 5 && (
              <li style={{ listStyle: 'none', color: 'var(--ink-3)' }}>
                … and {detail.canSubmit.blockingQuestions.length - 5} more
              </li>
            )}
          </ul>
        </div>
      ) : null}

      {detail.snapshot.sections
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((section, i) => {
          const questions = section.questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .filter((q) => visibleMap.get(q.id));
          if (questions.length === 0) return null;
          return (
            <section key={section.id}>
              <div className="section-head">
                <span className="numeral">§&nbsp;{ROMAN[i + 1]}</span>
                <h2>{section.title}</h2>
                <span className="weight-note">weight × {section.weight}</span>
              </div>
              {questions.map((q) => (
                <QuestionView
                  key={q.id}
                  q={q}
                  answer={answers.get(q.id)}
                  locked={locked ?? false}
                  onChange={(patch) => updateAnswer(q.id, patch)}
                />
              ))}
            </section>
          );
        })}

      <div style={{ height: 40 }} />
      <div className="toolbar-end">
        <Link className="btn quiet" to="/agency/screenings">
          Back to casefiles
        </Link>
        <button
          className="btn"
          onClick={onSubmit}
          disabled={locked || !detail.canSubmit.canSubmit}
        >
          {locked ? 'Submitted' : 'Submit casefile'}
        </button>
      </div>
    </div>
  );
}

function ScorePlate({
  liveScore,
  bandLabel,
  bandColor,
  answered,
  total,
  locked,
  saving,
  sectionBreakdown,
}: {
  liveScore: number | null;
  bandLabel: string;
  bandColor: string;
  answered: number;
  total: number;
  locked: boolean;
  saving: boolean;
  sectionBreakdown: { sectionId: string; title: string; raw: number; max: number }[];
}) {
  return (
    <div className="score-plate">
      <span className="rule-label">{locked ? 'Final · persisted' : 'Live score'}</span>
      <div>
        <div className="score-numeral">
          {liveScore !== null ? liveScore.toFixed(1) : '—'}
          {liveScore !== null && <span className="unit"> / 100</span>}
        </div>
      </div>
      <div className="score-meta">
        <span
          className="score-band-chip"
          style={{ color: bandColor }}
        >
          <span className="swatch" />
          {bandLabel}
        </span>
        <div className="counts">
          {answered} of {total} visible questions answered ·{' '}
          {saving ? 'saving…' : locked ? 'locked' : 'autosaved'}
        </div>
        <div className="breakdown">
          {sectionBreakdown.map((s) => {
            const pct = s.max > 0 ? (s.raw / s.max) * 100 : 0;
            return (
              <div className="breakdown-row" key={s.sectionId}>
                <span className="label">{s.title}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="value">
                  {s.raw.toFixed(1)} / {s.max.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuestionView({
  q,
  answer,
  locked,
  onChange,
}: {
  q: Question;
  answer?: { selectedOptionId: string | null; numericValue: number | null; note: string | null };
  locked: boolean;
  onChange: (patch: Partial<{ selectedOptionId: string | null; numericValue: number | null; note: string | null }>) => void;
}) {
  return (
    <div className="question">
      <div className="prompt">{q.prompt}</div>
      <div className="meta">
        <span>{q.type}</span>
        <span>weight × {q.weight}</span>
        {q.required && <span className="required-flag">required</span>}
        {q.conditionals.length > 0 && <span className="cond-flag">conditional</span>}
      </div>

      {q.type === 'likert' ? (
        <div className="likert" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = answer?.numericValue === n;
            const label = q.options.find((o) => o.score === n)?.label ?? `${n}`;
            return (
              <label
                key={n}
                className={`likert-opt ${selected ? 'selected' : ''}`}
                onClick={(e) => {
                  if (locked) {
                    e.preventDefault();
                    return;
                  }
                  onChange({ numericValue: n, selectedOptionId: null });
                }}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={selected}
                  readOnly
                  disabled={locked}
                  style={{ display: 'none' }}
                />
                <span className="n">{n}</span>
                <span className="l">{label}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="opt-list">
          {q.options
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((o) => {
              const selected = answer?.selectedOptionId === o.id;
              return (
                <label
                  key={o.id}
                  className={`opt ${selected ? 'selected' : ''}`}
                  onClick={(e) => {
                    if (locked) {
                      e.preventDefault();
                      return;
                    }
                    onChange({ selectedOptionId: o.id, numericValue: null });
                  }}
                >
                  <span className="radio" />
                  <span>{o.label}</span>
                  <span className="score-cell">+ {o.score}</span>
                  <input
                    type="radio"
                    name={q.id}
                    checked={selected}
                    readOnly
                    disabled={locked}
                  />
                </label>
              );
            })}
        </div>
      )}

      <details className="note-field">
        <summary>Add note</summary>
        <textarea
          className="note-input"
          placeholder="Observations, caveats, follow-up…"
          value={answer?.note ?? ''}
          disabled={locked}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </details>
    </div>
  );
}

// ---- Visibility logic (mirrors API lib/conditional.ts) ----
function computeVisibility(sections: Section[], answers: AnswerMap) {
  const result = new Map<string, boolean>();
  const allQ = sections.flatMap((s) => s.questions);
  const byId = new Map(allQ.map((q) => [q.id, q]));
  for (const q of allQ) {
    if (q.conditionals.length === 0) {
      result.set(q.id, true);
      continue;
    }
    let visible = true;
    for (const c of q.conditionals) {
      const dep = answers.get(c.dependsOnQuestionId);
      const depQ = byId.get(c.dependsOnQuestionId);
      if (!depQ) {
        visible = false;
        break;
      }
      const matches = (() => {
        if (!dep) return false;
        if (c.dependsOnAnswerOptionId) {
          return dep.selectedOptionId === c.dependsOnAnswerOptionId;
        }
        if (c.dependsOnNumericMin !== null || c.dependsOnNumericMax !== null) {
          const v = dep.numericValue;
          if (v === null) return false;
          if (c.dependsOnNumericMin !== null && v < c.dependsOnNumericMin) return false;
          if (c.dependsOnNumericMax !== null && v > c.dependsOnNumericMax) return false;
          return true;
        }
        return false;
      })();
      const passes = c.visible ? matches : !matches;
      if (!passes) {
        visible = false;
        break;
      }
    }
    result.set(q.id, visible);
  }
  return result;
}
