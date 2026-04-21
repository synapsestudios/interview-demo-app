/**
 * API-level fixture helpers. These hit the live Nest API directly so tests
 * can build isolated state (their own templates, clients, screenings) without
 * stepping on seed data.
 */

const API = 'http://localhost:3001/api';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export type Agency = { id: string; name: string };
export type Client = { id: string; agencyId: string; name: string };
export type Template = { id: string; name: string; version: number; status: string; parentTemplateId: string | null; sections: any[]; bands: any[] };
export type Screening = { id: string; status: string; snapshot: any; canSubmit: any; liveScoring: any; answers: any[] };

export const fx = {
  listAgencies: () => call<Agency[]>('/agencies'),
  getAgencyByName: async (name: string): Promise<Agency> => {
    const all = await fx.listAgencies();
    const a = all.find((x) => x.name === name);
    if (!a) throw new Error(`agency ${name} not found`);
    return a;
  },

  listTemplates: () => call<Template[]>('/templates'),
  getTemplate: (id: string) => call<Template>(`/templates/${id}`),
  getFirstPublishedV1: async (): Promise<Template> => {
    const all = await fx.listTemplates();
    const seeded = all.find((t) => t.status === 'published' && t.version === 1);
    if (!seeded) throw new Error('no published v1 template found');
    return fx.getTemplate(seeded.id);
  },

  createTemplate: (payload: {
    name: string;
    description?: string;
    sections: Array<{
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
        options: Array<{ id?: string; label: string; score: number; order: number }>;
        conditionals?: Array<{
          dependsOnQuestionId: string;
          dependsOnAnswerOptionId?: string | null;
          visible?: boolean;
        }>;
      }>;
    }>;
    bands?: Array<{ label: string; minScore: number; maxScore: number; color?: string }>;
  }) =>
    call<Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  publishTemplate: (id: string) =>
    call<Template>(`/templates/${id}/publish`, { method: 'POST' }),
  forkTemplate: (id: string) =>
    call<Template>(`/templates/${id}/fork`, { method: 'POST' }),
  archiveTemplate: (id: string) =>
    call<Template>(`/templates/${id}`, { method: 'DELETE' }),

  createClient: (agencyId: string, name: string) =>
    call<Client>('/clients', {
      method: 'POST',
      body: JSON.stringify({ agencyId, name }),
    }),

  createScreening: (agencyId: string, clientId: string, templateId: string) =>
    call<Screening>('/screenings', {
      method: 'POST',
      body: JSON.stringify({ agencyId, clientId, templateId }),
    }),

  upsertAnswers: (
    id: string,
    answers: Array<{
      questionId: string;
      selectedOptionId?: string | null;
      numericValue?: number | null;
      note?: string | null;
    }>,
  ) =>
    call<Screening>(`/screenings/${id}/answers`, {
      method: 'PUT',
      body: JSON.stringify({ answers }),
    }),

  submitScreening: (id: string) =>
    call<Screening>(`/screenings/${id}/submit`, { method: 'POST' }),
};

/**
 * Build a minimal but complete template ready for publishing and screening.
 * Three sections exercising all question types + one conditional. Bands span 0-100.
 */
export async function createTestTemplate(nameSuffix = Date.now().toString()): Promise<Template> {
  const tpl = await fx.createTemplate({
    name: `Test Instrument ${nameSuffix}`,
    description: 'Generated for e2e testing.',
    sections: [
      {
        title: 'Baseline',
        order: 0,
        weight: 1,
        questions: [
          {
            id: 'q_tf',
            prompt: 'Are you in stable housing?',
            type: 'true_false',
            required: true,
            weight: 1,
            order: 0,
            options: [
              { id: 'opt_tf_yes', label: 'Yes', score: 10, order: 0 },
              { id: 'opt_tf_no', label: 'No', score: 0, order: 1 },
            ],
          },
          {
            id: 'q_cond',
            prompt: 'How long without stable housing?',
            type: 'multiple_choice',
            required: false,
            weight: 1,
            order: 1,
            options: [
              { label: '< 1 month', score: 7, order: 0 },
              { label: '1-3 months', score: 5, order: 1 },
              { label: '> 3 months', score: 0, order: 2 },
            ],
            // Conditional: only shown if q_tf answered "No"
            conditionals: [
              {
                dependsOnQuestionId: 'q_tf',
                dependsOnAnswerOptionId: 'opt_tf_no',
                visible: true,
              },
            ],
          },
        ],
      },
      {
        title: 'Confidence',
        order: 1,
        weight: 1,
        questions: [
          {
            prompt: 'How confident are you in your finances?',
            type: 'likert',
            required: true,
            weight: 1,
            order: 0,
            options: [
              { label: 'Strongly Disagree', score: 1, order: 0 },
              { label: 'Disagree', score: 2, order: 1 },
              { label: 'Neutral', score: 3, order: 2 },
              { label: 'Agree', score: 4, order: 3 },
              { label: 'Strongly Agree', score: 5, order: 4 },
            ],
          },
        ],
      },
    ],
    bands: [
      { label: 'High risk', minScore: 0, maxScore: 40, color: '#9a2420' },
      { label: 'Moderate', minScore: 40.01, maxScore: 70, color: '#a06a14' },
      { label: 'Low risk', minScore: 70.01, maxScore: 100, color: '#3b5d2a' },
    ],
  });
  await fx.publishTemplate(tpl.id);
  return fx.getTemplate(tpl.id);
}
