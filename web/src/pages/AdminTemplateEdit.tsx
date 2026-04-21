import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, Template, TemplateMutationPayload } from '../api';
import { PageHead } from '../components/PageHead';

/* -------------------------------------------------------------------------- */
/* Local draft shape — mirrors the API types but uses optional ids so newly   */
/* created entities can carry temp keys the API resolves during replace.      */
/* -------------------------------------------------------------------------- */

type DraftOption = { id: string; label: string; score: number; order: number };
type DraftConditional = {
  id: string;
  dependsOnQuestionId: string;
  dependsOnAnswerOptionId: string | null;
};
type DraftQuestion = {
  id: string;
  prompt: string;
  type: 'true_false' | 'multiple_choice' | 'likert';
  required: boolean;
  weight: number;
  order: number;
  options: DraftOption[];
  conditionals: DraftConditional[];
};
type DraftSection = {
  id: string;
  title: string;
  order: number;
  weight: number;
  questions: DraftQuestion[];
};
type DraftBand = {
  id: string;
  label: string;
  minScore: number;
  maxScore: number;
  color: string;
};
type DraftTemplate = {
  id: string;
  name: string;
  description: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  sections: DraftSection[];
  bands: DraftBand[];
};

const tempId = () =>
  `new:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)}`;

function templateToDraft(t: Template): DraftTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    version: t.version,
    status: t.status,
    sections: t.sections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        title: s.title,
        order: s.order,
        weight: s.weight,
        questions: s.questions
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((q) => ({
            id: q.id,
            prompt: q.prompt,
            type: q.type,
            required: q.required,
            weight: q.weight,
            order: q.order,
            options: q.options
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((o) => ({
                id: o.id,
                label: o.label,
                score: o.score,
                order: o.order,
              })),
            conditionals: q.conditionals.map((c) => ({
              id: c.id,
              dependsOnQuestionId: c.dependsOnQuestionId,
              dependsOnAnswerOptionId: c.dependsOnAnswerOptionId,
            })),
          })),
      })),
    bands: t.bands
      .slice()
      .sort((a, b) => a.minScore - b.minScore)
      .map((b) => ({
        id: b.id,
        label: b.label,
        minScore: b.minScore,
        maxScore: b.maxScore,
        color: b.color,
      })),
  };
}

function draftToPayload(d: DraftTemplate): TemplateMutationPayload {
  return {
    name: d.name,
    description: d.description || null,
    sections: d.sections.map((s, si) => ({
      id: s.id,
      title: s.title,
      order: si,
      weight: s.weight,
      questions: s.questions.map((q, qi) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        required: q.required,
        weight: q.weight,
        order: qi,
        options: q.options.map((o, oi) => ({
          id: o.id,
          label: o.label,
          score: o.score,
          order: oi,
        })),
        conditionals: q.conditionals.map((c) => ({
          dependsOnQuestionId: c.dependsOnQuestionId,
          dependsOnAnswerOptionId: c.dependsOnAnswerOptionId,
          visible: true,
        })),
      })),
    })),
    bands: d.bands.map((b) => ({
      id: b.id,
      label: b.label,
      minScore: b.minScore,
      maxScore: b.maxScore,
      color: b.color,
    })),
  };
}

/* -------------------------------------------------------------------------- */

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function AdminTemplateEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getTemplate(id).then((t) => {
      setDraft(templateToDraft(t));
      setDirty(false);
    });
  }, [id]);

  if (!draft) return <div className="loading">Opening the instrument…</div>;

  if (draft.status !== 'draft') {
    return (
      <div className="stagger">
        <PageHead
          eyebrow={<Link to="/admin/templates" style={{ color: 'var(--ink-3)' }}>Instruments</Link>}
          title={draft.name}
          dek={`This instrument is ${draft.status} and cannot be edited. Fork it from the instruments list to create an editable draft.`}
          note={`v${draft.version}`}
        />
        <Link to={`/admin/templates/${draft.id}`} className="btn quiet">View preview</Link>
      </div>
    );
  }

  const mutate = (fn: (d: DraftTemplate) => DraftTemplate) => {
    setDraft((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
    setError(null);
  };

  const save = async (publishAfter = false): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateTemplate(draft.id, draftToPayload(draft));
      setDraft(templateToDraft(updated));
      setDirty(false);
      if (publishAfter) {
        await api.publishTemplate(draft.id);
        navigate('/admin/templates');
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // -- section helpers ------------------------------------------------------
  const addSection = () =>
    mutate((d) => ({
      ...d,
      sections: [
        ...d.sections,
        {
          id: tempId(),
          title: 'New section',
          order: d.sections.length,
          weight: 1,
          questions: [],
        },
      ],
    }));
  const updateSection = (idx: number, patch: Partial<DraftSection>) =>
    mutate((d) => {
      const next = [...d.sections];
      next[idx] = { ...next[idx], ...patch };
      return { ...d, sections: next };
    });
  const removeSection = (idx: number) =>
    mutate((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== idx) }));
  const moveSection = (idx: number, dir: -1 | 1) =>
    mutate((d) => {
      const next = [...d.sections];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return d;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...d, sections: next };
    });

  // -- question helpers -----------------------------------------------------
  const addQuestion = (sIdx: number, type: DraftQuestion['type']) =>
    mutate((d) => {
      const section = d.sections[sIdx];
      const defaults: Record<DraftQuestion['type'], DraftOption[]> = {
        true_false: [
          { id: tempId(), label: 'Yes', score: 10, order: 0 },
          { id: tempId(), label: 'No', score: 0, order: 1 },
        ],
        multiple_choice: [
          { id: tempId(), label: 'Option A', score: 5, order: 0 },
          { id: tempId(), label: 'Option B', score: 0, order: 1 },
        ],
        likert: [1, 2, 3, 4, 5].map((n, i) => ({
          id: tempId(),
          label: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'][i],
          score: n,
          order: i,
        })),
      };
      const q: DraftQuestion = {
        id: tempId(),
        prompt: 'New question',
        type,
        required: false,
        weight: 1,
        order: section.questions.length,
        options: defaults[type],
        conditionals: [],
      };
      const sections = [...d.sections];
      sections[sIdx] = { ...section, questions: [...section.questions, q] };
      return { ...d, sections };
    });

  const updateQuestion = (sIdx: number, qIdx: number, patch: Partial<DraftQuestion>) =>
    mutate((d) => {
      const sections = [...d.sections];
      const questions = [...sections[sIdx].questions];
      questions[qIdx] = { ...questions[qIdx], ...patch };
      sections[sIdx] = { ...sections[sIdx], questions };
      return { ...d, sections };
    });

  const removeQuestion = (sIdx: number, qIdx: number) =>
    mutate((d) => {
      const sections = [...d.sections];
      const target = sections[sIdx].questions[qIdx];
      sections[sIdx] = {
        ...sections[sIdx],
        questions: sections[sIdx].questions.filter((_, i) => i !== qIdx),
      };
      // Also strip any conditionals across the whole template that referenced this question or its options.
      const targetOptIds = new Set(target.options.map((o) => o.id));
      return {
        ...d,
        sections: sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) => ({
            ...q,
            conditionals: q.conditionals.filter(
              (c) =>
                c.dependsOnQuestionId !== target.id &&
                (!c.dependsOnAnswerOptionId || !targetOptIds.has(c.dependsOnAnswerOptionId)),
            ),
          })),
        })),
      };
    });

  const moveQuestion = (sIdx: number, qIdx: number, dir: -1 | 1) =>
    mutate((d) => {
      const sections = [...d.sections];
      const questions = [...sections[sIdx].questions];
      const target = qIdx + dir;
      if (target < 0 || target >= questions.length) return d;
      [questions[qIdx], questions[target]] = [questions[target], questions[qIdx]];
      sections[sIdx] = { ...sections[sIdx], questions };
      return { ...d, sections };
    });

  // -- option helpers -------------------------------------------------------
  const addOption = (sIdx: number, qIdx: number) =>
    mutate((d) => {
      const sections = [...d.sections];
      const q = sections[sIdx].questions[qIdx];
      const options = [
        ...q.options,
        { id: tempId(), label: 'New option', score: 0, order: q.options.length },
      ];
      sections[sIdx] = {
        ...sections[sIdx],
        questions: sections[sIdx].questions.map((qq, i) =>
          i === qIdx ? { ...qq, options } : qq,
        ),
      };
      return { ...d, sections };
    });

  const updateOption = (
    sIdx: number,
    qIdx: number,
    oIdx: number,
    patch: Partial<DraftOption>,
  ) =>
    mutate((d) => {
      const sections = [...d.sections];
      const q = sections[sIdx].questions[qIdx];
      const options = [...q.options];
      options[oIdx] = { ...options[oIdx], ...patch };
      sections[sIdx] = {
        ...sections[sIdx],
        questions: sections[sIdx].questions.map((qq, i) =>
          i === qIdx ? { ...qq, options } : qq,
        ),
      };
      return { ...d, sections };
    });

  const removeOption = (sIdx: number, qIdx: number, oIdx: number) =>
    mutate((d) => {
      const sections = [...d.sections];
      const q = sections[sIdx].questions[qIdx];
      const removed = q.options[oIdx];
      const options = q.options.filter((_, i) => i !== oIdx);
      sections[sIdx] = {
        ...sections[sIdx],
        questions: sections[sIdx].questions.map((qq, i) =>
          i === qIdx ? { ...qq, options } : qq,
        ),
      };
      // Clean any conditional references to this option.
      return {
        ...d,
        sections: sections.map((s) => ({
          ...s,
          questions: s.questions.map((qq) => ({
            ...qq,
            conditionals: qq.conditionals.filter(
              (c) => c.dependsOnAnswerOptionId !== removed.id,
            ),
          })),
        })),
      };
    });

  // -- conditional helpers --------------------------------------------------
  const addConditional = (sIdx: number, qIdx: number) =>
    mutate((d) => {
      // Find first other question in the template (conditionals can't target self).
      let target: DraftQuestion | undefined;
      for (const s of d.sections) {
        for (const q of s.questions) {
          if (q.id !== d.sections[sIdx].questions[qIdx].id && q.conditionals.length === 0) {
            target = q;
            break;
          }
        }
        if (target) break;
      }
      if (!target) {
        setError('Conditionals require at least one other non-conditional question.');
        return d;
      }
      const defaultOpt = target.type === 'likert' ? null : target.options[0]?.id ?? null;
      const sections = [...d.sections];
      const q = sections[sIdx].questions[qIdx];
      sections[sIdx] = {
        ...sections[sIdx],
        questions: sections[sIdx].questions.map((qq, i) =>
          i === qIdx
            ? {
                ...qq,
                conditionals: [
                  ...qq.conditionals,
                  {
                    id: tempId(),
                    dependsOnQuestionId: target!.id,
                    dependsOnAnswerOptionId: defaultOpt,
                  },
                ],
              }
            : qq,
        ),
      };
      return { ...d, sections };
    });

  const updateConditional = (
    sIdx: number,
    qIdx: number,
    cIdx: number,
    patch: Partial<DraftConditional>,
  ) =>
    mutate((d) => {
      const sections = [...d.sections];
      const conditionals = [...sections[sIdx].questions[qIdx].conditionals];
      conditionals[cIdx] = { ...conditionals[cIdx], ...patch };
      sections[sIdx] = {
        ...sections[sIdx],
        questions: sections[sIdx].questions.map((qq, i) =>
          i === qIdx ? { ...qq, conditionals } : qq,
        ),
      };
      return { ...d, sections };
    });

  const removeConditional = (sIdx: number, qIdx: number, cIdx: number) =>
    mutate((d) => {
      const sections = [...d.sections];
      const conditionals = sections[sIdx].questions[qIdx].conditionals.filter(
        (_, i) => i !== cIdx,
      );
      sections[sIdx] = {
        ...sections[sIdx],
        questions: sections[sIdx].questions.map((qq, i) =>
          i === qIdx ? { ...qq, conditionals } : qq,
        ),
      };
      return { ...d, sections };
    });

  // -- band helpers ---------------------------------------------------------
  const addBand = () =>
    mutate((d) => ({
      ...d,
      bands: [
        ...d.bands,
        {
          id: tempId(),
          label: 'New band',
          minScore: 0,
          maxScore: 100,
          color: '#1a140e',
        },
      ],
    }));
  const updateBand = (idx: number, patch: Partial<DraftBand>) =>
    mutate((d) => {
      const bands = [...d.bands];
      bands[idx] = { ...bands[idx], ...patch };
      return { ...d, bands };
    });
  const removeBand = (idx: number) =>
    mutate((d) => ({ ...d, bands: d.bands.filter((_, i) => i !== idx) }));

  // ------------------------------------------------------------------------
  return (
    <div className="stagger">
      <PageHead
        eyebrow={
          <>
            <Link to="/admin/templates" style={{ color: 'var(--ink-3)' }}>Instruments</Link> / Editing draft
          </>
        }
        title={draft.name || 'Untitled instrument'}
        dek={`v${draft.version} · ${draft.sections.length} sections · ${draft.sections.reduce((n, s) => n + s.questions.length, 0)} questions`}
        note={dirty ? 'Unsaved changes' : 'Saved'}
        actions={
          <>
            <Link to={`/admin/templates/${draft.id}`} className="btn quiet">
              Preview
            </Link>
            <button
              className="btn quiet"
              onClick={() => save(false)}
              disabled={!dirty || saving}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button className="btn" onClick={() => save(true)} disabled={saving}>
              Save &amp; publish
            </button>
          </>
        }
      />

      {error && (
        <div className="banner alert">
          <div className="hdr">Save failed</div>
          {error}
        </div>
      )}

      <div className="paper">
        <div className="paper-title">
          <span className="eyebrow"><span className="num">§</span> Metadata</span>
        </div>
        <div className="editor-field-row">
          <label className="field-label">Name</label>
          <input
            className="field-input"
            value={draft.name}
            onChange={(e) => mutate((d) => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div className="editor-field-row">
          <label className="field-label">Description</label>
          <textarea
            className="field-input"
            rows={2}
            value={draft.description}
            onChange={(e) => mutate((d) => ({ ...d, description: e.target.value }))}
          />
        </div>
      </div>

      <div className="paper">
        <div className="paper-title">
          <span className="eyebrow"><span className="num">§</span> Scoring bands</span>
          <div style={{ flex: 1 }} />
          <button className="btn quiet" onClick={addBand}>+ Band</button>
        </div>
        {draft.bands.length === 0 && (
          <div className="muted" style={{ padding: '12px 0' }}>No bands yet. Bands classify final scores into named ranges.</div>
        )}
        {draft.bands.map((b, i) => (
          <div key={b.id} className="band-row">
            <input
              className="field-input"
              placeholder="Label"
              value={b.label}
              onChange={(e) => updateBand(i, { label: e.target.value })}
              style={{ flex: 2 }}
            />
            <input
              className="field-input"
              type="number"
              step="0.01"
              value={b.minScore}
              onChange={(e) => updateBand(i, { minScore: Number(e.target.value) })}
              style={{ width: 110 }}
              aria-label="Min score"
            />
            <input
              className="field-input"
              type="number"
              step="0.01"
              value={b.maxScore}
              onChange={(e) => updateBand(i, { maxScore: Number(e.target.value) })}
              style={{ width: 110 }}
              aria-label="Max score"
            />
            <input
              type="color"
              value={b.color}
              onChange={(e) => updateBand(i, { color: e.target.value })}
              style={{ width: 36, height: 36, border: '1px solid var(--rule-hair)' }}
              aria-label="Band color"
            />
            <button className="tool-btn" onClick={() => removeBand(i)} aria-label="Delete band">×</button>
          </div>
        ))}
      </div>

      {draft.sections.map((s, si) => (
        <SectionEditor
          key={s.id}
          section={s}
          index={si}
          totalSections={draft.sections.length}
          allQuestions={allQuestions(draft)}
          onUpdateSection={(patch) => updateSection(si, patch)}
          onRemoveSection={() => removeSection(si)}
          onMoveSection={(dir) => moveSection(si, dir)}
          onAddQuestion={(type) => addQuestion(si, type)}
          onUpdateQuestion={(qIdx, patch) => updateQuestion(si, qIdx, patch)}
          onRemoveQuestion={(qIdx) => removeQuestion(si, qIdx)}
          onMoveQuestion={(qIdx, dir) => moveQuestion(si, qIdx, dir)}
          onAddOption={(qIdx) => addOption(si, qIdx)}
          onUpdateOption={(qIdx, oIdx, patch) => updateOption(si, qIdx, oIdx, patch)}
          onRemoveOption={(qIdx, oIdx) => removeOption(si, qIdx, oIdx)}
          onAddConditional={(qIdx) => addConditional(si, qIdx)}
          onUpdateConditional={(qIdx, cIdx, patch) => updateConditional(si, qIdx, cIdx, patch)}
          onRemoveConditional={(qIdx, cIdx) => removeConditional(si, qIdx, cIdx)}
        />
      ))}

      <div style={{ marginTop: 22 }}>
        <button className="btn quiet add-block" onClick={addSection}>
          + Add section
        </button>
      </div>
    </div>
  );
}

/* ---- Section (with its nested question list) ---- */

function SectionEditor({
  section,
  index,
  totalSections,
  allQuestions,
  onUpdateSection,
  onRemoveSection,
  onMoveSection,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
  onMoveQuestion,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onAddConditional,
  onUpdateConditional,
  onRemoveConditional,
}: {
  section: DraftSection;
  index: number;
  totalSections: number;
  allQuestions: Array<{ id: string; prompt: string; type: DraftQuestion['type']; options: DraftOption[] }>;
  onUpdateSection: (patch: Partial<DraftSection>) => void;
  onRemoveSection: () => void;
  onMoveSection: (dir: -1 | 1) => void;
  onAddQuestion: (type: DraftQuestion['type']) => void;
  onUpdateQuestion: (qIdx: number, patch: Partial<DraftQuestion>) => void;
  onRemoveQuestion: (qIdx: number) => void;
  onMoveQuestion: (qIdx: number, dir: -1 | 1) => void;
  onAddOption: (qIdx: number) => void;
  onUpdateOption: (qIdx: number, oIdx: number, patch: Partial<DraftOption>) => void;
  onRemoveOption: (qIdx: number, oIdx: number) => void;
  onAddConditional: (qIdx: number) => void;
  onUpdateConditional: (qIdx: number, cIdx: number, patch: Partial<DraftConditional>) => void;
  onRemoveConditional: (qIdx: number, cIdx: number) => void;
}) {
  return (
    <div className="paper">
      <div className="section-head" style={{ marginTop: 0 }}>
        <span className="numeral">§&nbsp;{ROMAN[index + 1]}</span>
        <input
          className="field-input"
          value={section.title}
          onChange={(e) => onUpdateSection({ title: e.target.value })}
          style={{ flex: 1, fontFamily: 'var(--serif)', fontSize: 20, padding: '6px 8px' }}
          aria-label="Section title"
        />
        <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          weight ×{' '}
          <input
            type="number"
            step="0.01"
            value={section.weight}
            onChange={(e) => onUpdateSection({ weight: Number(e.target.value) })}
            style={{ width: 60, padding: '3px 4px', border: '1px solid var(--rule-hair)', fontFamily: 'inherit' }}
            aria-label="Section weight"
          />
        </label>
        <button
          className="tool-btn"
          onClick={() => onMoveSection(-1)}
          disabled={index === 0}
          aria-label="Move section up"
        >
          ↑
        </button>
        <button
          className="tool-btn"
          onClick={() => onMoveSection(1)}
          disabled={index === totalSections - 1}
          aria-label="Move section down"
        >
          ↓
        </button>
        <button className="tool-btn danger" onClick={onRemoveSection} aria-label="Delete section">×</button>
      </div>

      {section.questions.map((q, qi) => (
        <QuestionEditor
          key={q.id}
          question={q}
          index={qi}
          totalQuestions={section.questions.length}
          allQuestions={allQuestions.filter((candidate) => candidate.id !== q.id)}
          onUpdate={(patch) => onUpdateQuestion(qi, patch)}
          onRemove={() => onRemoveQuestion(qi)}
          onMove={(dir) => onMoveQuestion(qi, dir)}
          onAddOption={() => onAddOption(qi)}
          onUpdateOption={(oIdx, patch) => onUpdateOption(qi, oIdx, patch)}
          onRemoveOption={(oIdx) => onRemoveOption(qi, oIdx)}
          onAddConditional={() => onAddConditional(qi)}
          onUpdateConditional={(cIdx, patch) => onUpdateConditional(qi, cIdx, patch)}
          onRemoveConditional={(cIdx) => onRemoveConditional(qi, cIdx)}
        />
      ))}

      <div className="add-question-row">
        <span className="eyebrow" style={{ marginRight: 10 }}>Add question</span>
        <button className="btn quiet" onClick={() => onAddQuestion('true_false')}>True / false</button>
        <button className="btn quiet" onClick={() => onAddQuestion('multiple_choice')}>Multiple choice</button>
        <button className="btn quiet" onClick={() => onAddQuestion('likert')}>Likert</button>
      </div>
    </div>
  );
}

/* ---- Question (with options + conditional editor) ---- */

function QuestionEditor({
  question,
  index,
  totalQuestions,
  allQuestions,
  onUpdate,
  onRemove,
  onMove,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onAddConditional,
  onUpdateConditional,
  onRemoveConditional,
}: {
  question: DraftQuestion;
  index: number;
  totalQuestions: number;
  allQuestions: Array<{ id: string; prompt: string; type: DraftQuestion['type']; options: DraftOption[] }>;
  onUpdate: (patch: Partial<DraftQuestion>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onAddOption: () => void;
  onUpdateOption: (oIdx: number, patch: Partial<DraftOption>) => void;
  onRemoveOption: (oIdx: number) => void;
  onAddConditional: () => void;
  onUpdateConditional: (cIdx: number, patch: Partial<DraftConditional>) => void;
  onRemoveConditional: (cIdx: number) => void;
}) {
  return (
    <div className="question-edit">
      <div className="question-edit-head">
        <textarea
          className="field-input"
          rows={1}
          value={question.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          placeholder="Question prompt…"
          style={{ flex: 1, fontFamily: 'var(--serif)', fontSize: 17 }}
          aria-label="Question prompt"
        />
        <button className="tool-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</button>
        <button className="tool-btn" onClick={() => onMove(1)} disabled={index === totalQuestions - 1} aria-label="Move down">↓</button>
        <button className="tool-btn danger" onClick={onRemove} aria-label="Delete question">×</button>
      </div>

      <div className="question-edit-meta">
        <label>
          <span className="field-label">Type</span>
          <span className="mono-val">{question.type}</span>
        </label>
        <label>
          <span className="field-label">Required</span>
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
          />
        </label>
        <label>
          <span className="field-label">Weight</span>
          <input
            type="number"
            step="0.01"
            value={question.weight}
            onChange={(e) => onUpdate({ weight: Number(e.target.value) })}
            className="field-input"
            style={{ width: 80 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          <span className="num">§</span> {question.type === 'likert' ? 'Likert scores (1–5)' : 'Options'}
        </div>
        {question.options.map((o, oi) => (
          <div key={o.id} className="option-row">
            <input
              className="field-input"
              value={o.label}
              onChange={(e) => onUpdateOption(oi, { label: e.target.value })}
              placeholder="Label"
              style={{ flex: 2 }}
              aria-label={`Option ${oi + 1} label`}
            />
            <input
              className="field-input"
              type="number"
              step="0.01"
              value={o.score}
              onChange={(e) => onUpdateOption(oi, { score: Number(e.target.value) })}
              style={{ width: 90 }}
              aria-label={`Option ${oi + 1} score`}
            />
            {question.type !== 'likert' && (
              <button
                className="tool-btn danger"
                onClick={() => onRemoveOption(oi)}
                aria-label="Delete option"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {question.type === 'multiple_choice' && (
          <button className="btn quiet" onClick={onAddOption} style={{ marginTop: 6 }}>
            + Option
          </button>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          <span className="num">§</span> Conditional visibility
        </div>
        {question.conditionals.length === 0 && (
          <button className="btn quiet" onClick={onAddConditional}>+ Show only when…</button>
        )}
        {question.conditionals.map((c, ci) => {
          const depQ = allQuestions.find((q) => q.id === c.dependsOnQuestionId);
          return (
            <div key={c.id} className="conditional-row">
              <span className="muted">Show only when</span>
              <select
                className="select"
                value={c.dependsOnQuestionId}
                onChange={(e) => {
                  const q = allQuestions.find((qq) => qq.id === e.target.value);
                  onUpdateConditional(ci, {
                    dependsOnQuestionId: e.target.value,
                    dependsOnAnswerOptionId: q && q.type !== 'likert' ? q.options[0]?.id ?? null : null,
                  });
                }}
              >
                {allQuestions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.prompt.slice(0, 48) || '(untitled)'}
                  </option>
                ))}
              </select>
              <span className="muted">is answered</span>
              {depQ && depQ.type !== 'likert' ? (
                <select
                  className="select"
                  value={c.dependsOnAnswerOptionId ?? ''}
                  onChange={(e) =>
                    onUpdateConditional(ci, { dependsOnAnswerOptionId: e.target.value || null })
                  }
                >
                  {depQ.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted">(any value)</span>
              )}
              <button
                className="tool-btn danger"
                onClick={() => onRemoveConditional(ci)}
                aria-label="Remove conditional"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function allQuestions(d: DraftTemplate) {
  const all: Array<{ id: string; prompt: string; type: DraftQuestion['type']; options: DraftOption[] }> = [];
  for (const s of d.sections) {
    for (const q of s.questions) {
      all.push({ id: q.id, prompt: q.prompt, type: q.type, options: q.options });
    }
  }
  return all;
}
