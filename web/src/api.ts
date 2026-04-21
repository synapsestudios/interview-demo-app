/* Thin fetch client mirroring the Nest API. */

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  // Some endpoints return text (CSV); callers of those don't use this helper.
  return res.json() as Promise<T>;
}

// ---------- Types (mirror Nest response shapes) ----------

export type Agency = { id: string; name: string; createdAt: string };
export type Client = { id: string; agencyId: string; name: string };

export type TemplateListItem = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  parentTemplateId: string | null;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type AnswerOption = { id: string; label: string; score: number; order: number };
export type Conditional = {
  id: string;
  questionId: string;
  dependsOnQuestionId: string;
  dependsOnAnswerOptionId: string | null;
  dependsOnNumericMin: number | null;
  dependsOnNumericMax: number | null;
  visible: boolean;
};
export type Question = {
  id: string;
  prompt: string;
  type: 'true_false' | 'multiple_choice' | 'likert';
  required: boolean;
  weight: number;
  order: number;
  options: AnswerOption[];
  conditionals: Conditional[];
};
export type Section = {
  id: string;
  title: string;
  order: number;
  weight: number;
  questions: Question[];
};
export type Band = {
  id: string;
  label: string;
  minScore: number;
  maxScore: number;
  color: string;
};
export type Template = TemplateListItem & {
  sections: Section[];
  bands: Band[];
};

/**
 * Payload shape accepted by POST /templates and PATCH /templates/:id.
 *
 * Notes:
 * - `PATCH` does a FULL REPLACE of sections/bands when those keys are provided.
 *   Omit a key to leave that branch untouched.
 * - `id` fields on nested entities are treated as opaque temp-keys that the
 *   API uses to resolve conditional references within the payload. Any unique
 *   string works; existing UUIDs are fine to pass through.
 */
export type TemplateMutationPayload = {
  name?: string;
  description?: string | null;
  sections?: Array<{
    id?: string;
    title: string;
    order: number;
    weight?: number;
    questions: Array<{
      id?: string;
      prompt: string;
      type: 'true_false' | 'multiple_choice' | 'likert';
      required?: boolean;
      weight?: number;
      order: number;
      options: Array<{
        id?: string;
        label: string;
        score: number;
        order: number;
      }>;
      conditionals?: Array<{
        dependsOnQuestionId: string;
        dependsOnAnswerOptionId?: string | null;
        dependsOnNumericMin?: number | null;
        dependsOnNumericMax?: number | null;
        visible?: boolean;
      }>;
    }>;
  }>;
  bands?: Array<{
    id?: string;
    label: string;
    minScore: number;
    maxScore: number;
    color?: string;
  }>;
};

export type ScreeningListItem = {
  id: string;
  agencyId: string;
  clientId: string;
  clientName: string;
  agencyName: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  status: 'draft' | 'in_progress' | 'submitted';
  startedAt: string;
  submittedAt: string | null;
  finalScore: number | null;
  finalBand: string | null;
};

export type ScoringResult = {
  finalScore: number | null;
  band: { id: string; label: string; color: string } | null;
  sectionBreakdown: { sectionId: string; title: string; raw: number; max: number }[];
  answeredVisibleQuestions: number;
  totalVisibleQuestions: number;
};

export type CanSubmit = {
  canSubmit: boolean;
  blockingQuestions: { id: string; prompt: string; reason: string }[];
};

// Note: snapshot.bands uses score fields; reuse Template type.
export type ScreeningSnapshot = {
  templateId: string;
  name: string;
  description: string | null;
  version: number;
  sections: Section[];
  bands: Band[];
};

export type ScreeningDetail = {
  id: string;
  agencyId: string;
  clientId: string;
  clientName: string;
  status: 'draft' | 'in_progress' | 'submitted';
  startedAt: string;
  submittedAt: string | null;
  persistedFinalScore: number | null;
  persistedFinalBand: string | null;
  snapshot: ScreeningSnapshot;
  answers: {
    questionId: string;
    selectedOptionId: string | null;
    numericValue: number | null;
    note: string | null;
    answeredAt: string;
  }[];
  liveScoring: ScoringResult;
  canSubmit: CanSubmit;
};

// ---------- Calls ----------

export const api = {
  listAgencies: () => req<Agency[]>('/agencies'),

  listClients: (agencyId: string) =>
    req<Client[]>(`/clients?agencyId=${encodeURIComponent(agencyId)}`),
  createClient: (agencyId: string, name: string) =>
    req<Client>('/clients', {
      method: 'POST',
      body: JSON.stringify({ agencyId, name }),
    }),

  listTemplates: () => req<TemplateListItem[]>('/templates'),
  getTemplate: (id: string) => req<Template>(`/templates/${id}`),
  createTemplate: (payload: TemplateMutationPayload) =>
    req<Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTemplate: (id: string, payload: TemplateMutationPayload) =>
    req<Template>(`/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  publishTemplate: (id: string) =>
    req<Template>(`/templates/${id}/publish`, { method: 'POST' }),
  archiveTemplate: (id: string) =>
    req<Template>(`/templates/${id}`, { method: 'DELETE' }),
  forkTemplate: (id: string) =>
    req<Template>(`/templates/${id}/fork`, { method: 'POST' }),

  listScreenings: (params: { agencyId?: string; status?: string; templateId?: string }) => {
    const qs = new URLSearchParams();
    if (params.agencyId) qs.set('agencyId', params.agencyId);
    if (params.status) qs.set('status', params.status);
    if (params.templateId) qs.set('templateId', params.templateId);
    return req<ScreeningListItem[]>(`/screenings?${qs.toString()}`);
  },
  getScreening: (id: string) => req<ScreeningDetail>(`/screenings/${id}`),
  createScreening: (agencyId: string, clientId: string, templateId: string) =>
    req<ScreeningDetail>('/screenings', {
      method: 'POST',
      body: JSON.stringify({ agencyId, clientId, templateId }),
    }),
  upsertAnswers: (
    id: string,
    answers: {
      questionId: string;
      selectedOptionId?: string | null;
      numericValue?: number | null;
      note?: string | null;
    }[],
  ) =>
    req<ScreeningDetail>(`/screenings/${id}/answers`, {
      method: 'PUT',
      body: JSON.stringify({ answers }),
    }),
  submitScreening: (id: string) =>
    req<ScreeningDetail>(`/screenings/${id}/submit`, { method: 'POST' }),

  exportCsvUrl: (agencyId?: string, templateId?: string) => {
    const qs = new URLSearchParams();
    if (agencyId) qs.set('agencyId', agencyId);
    if (templateId) qs.set('templateId', templateId);
    return `/api/screenings/export.csv?${qs.toString()}`;
  },

  scoreDistribution: (agencyId: string, templateId: string) =>
    req<{ bucketStart: number; bucketEnd: number; count: number }[]>(
      `/dashboard/score-distribution?agencyId=${agencyId}&templateId=${templateId}`,
    ),
  bandCounts: (agencyId: string, templateId: string) =>
    req<{ month: string; counts: Record<string, number> }[]>(
      `/dashboard/band-counts?agencyId=${agencyId}&templateId=${templateId}`,
    ),
};
