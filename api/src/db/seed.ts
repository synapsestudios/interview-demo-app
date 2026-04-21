import 'dotenv/config';
import { db, closeDbConnection } from './index';
import {
  agencies,
  clients,
  templates,
  templateSections,
  templateQuestions,
  templateAnswerOptions,
  templateConditionals,
  scoringBands,
  screenings,
  screeningAnswers,
  templateSnapshots,
} from './schema';
import { TemplateSnapshotPayload } from '../lib/snapshot-types';
import { scoreScreening } from '../lib/scoring';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Seeding...');

  // Wipe everything (cascade will handle children).
  await db.delete(screeningAnswers);
  await db.delete(screenings);
  await db.delete(templateSnapshots);
  await db.delete(scoringBands);
  await db.delete(templateConditionals);
  await db.delete(templateAnswerOptions);
  await db.delete(templateQuestions);
  await db.delete(templateSections);
  await db.delete(templates);
  await db.delete(clients);
  await db.delete(agencies);

  // Agencies
  const [acmeAgency, northwindAgency, summitAgency] = await db
    .insert(agencies)
    .values([{ name: 'Acme Health' }, { name: 'Northwind Services' }, { name: 'Summit Partners' }])
    .returning();

  // Clients
  const clientRows = await db
    .insert(clients)
    .values([
      { agencyId: acmeAgency.id, name: 'Jane Doe' },
      { agencyId: acmeAgency.id, name: 'John Smith' },
      { agencyId: acmeAgency.id, name: 'Aaliyah Patel' },
      { agencyId: northwindAgency.id, name: 'Miguel Torres' },
      { agencyId: northwindAgency.id, name: 'Lin Wei' },
      { agencyId: summitAgency.id, name: 'Petra Novak' },
    ])
    .returning();

  // Template v1 (published)
  const [tplV1] = await db
    .insert(templates)
    .values({
      name: 'Housing Stability Assessment',
      description:
        'Screens household housing stability across four domains: living situation, income, social support, and risk.',
      status: 'published',
      version: 1,
    })
    .returning();

  const sections = [
    {
      title: 'Living situation',
      weight: 1.5,
      order: 0,
      questions: [
        {
          prompt: 'Do you currently have stable housing?',
          type: 'true_false' as const,
          required: true,
          weight: 1.0,
          order: 0,
          options: [
            { label: 'Yes', score: 10, order: 0 },
            { label: 'No', score: 0, order: 1 },
          ],
        },
        {
          prompt: 'If no, how long have you been without stable housing?',
          type: 'multiple_choice' as const,
          required: false,
          weight: 1.0,
          order: 1,
          options: [
            { label: 'Less than 1 month', score: 7, order: 0 },
            { label: '1-3 months', score: 5, order: 1 },
            { label: '3-6 months', score: 3, order: 2 },
            { label: 'More than 6 months', score: 0, order: 3 },
          ],
          conditionalOn: { qIdx: 0, optIdx: 1 }, // show only when Q0 answered "No"
        },
      ],
    },
    {
      title: 'Income & employment',
      weight: 1.0,
      order: 1,
      questions: [
        {
          prompt: 'Are you currently employed?',
          type: 'true_false' as const,
          required: true,
          weight: 1.0,
          order: 0,
          options: [
            { label: 'Yes', score: 10, order: 0 },
            { label: 'No', score: 0, order: 1 },
          ],
        },
        {
          prompt: 'How confident are you in your current financial situation?',
          type: 'likert' as const,
          required: true,
          weight: 1.5,
          order: 1,
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
    {
      title: 'Social support',
      weight: 0.75,
      order: 2,
      questions: [
        {
          prompt: 'How strongly do you agree: "I have people I can turn to for help"?',
          type: 'likert' as const,
          required: true,
          weight: 1.0,
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
    {
      title: 'Risk factors',
      weight: 1.25,
      order: 3,
      questions: [
        {
          prompt: 'Have you experienced any of the following in the past 12 months?',
          type: 'multiple_choice' as const,
          required: false,
          weight: 1.0,
          order: 0,
          options: [
            { label: 'None of the below', score: 10, order: 0 },
            { label: 'Eviction notice', score: 3, order: 1 },
            { label: 'Utility shut-off', score: 5, order: 2 },
            { label: 'Medical emergency', score: 4, order: 3 },
          ],
        },
      ],
    },
  ];

  type QStored = { id: string; options: { id: string; label: string }[] };
  const sectionQStored: QStored[][] = [];

  for (const s of sections) {
    const [newSection] = await db
      .insert(templateSections)
      .values({
        templateId: tplV1.id,
        title: s.title,
        order: s.order,
        weight: s.weight,
      })
      .returning();

    const stored: QStored[] = [];

    for (const q of s.questions) {
      const [newQ] = await db
        .insert(templateQuestions)
        .values({
          sectionId: newSection.id,
          prompt: q.prompt,
          type: q.type,
          required: q.required,
          weight: q.weight,
          order: q.order,
        })
        .returning();

      const storedOptions: { id: string; label: string }[] = [];
      for (const o of q.options) {
        const [newO] = await db
          .insert(templateAnswerOptions)
          .values({
            questionId: newQ.id,
            label: o.label,
            score: o.score,
            order: o.order,
          })
          .returning();
        storedOptions.push({ id: newO.id, label: newO.label });
      }
      stored.push({ id: newQ.id, options: storedOptions });
    }
    sectionQStored.push(stored);
  }

  // Conditional: section 0, question 1 depends on section 0, question 0, option 1 ("No")
  const depQId = sectionQStored[0][0].id;
  const depOptId = sectionQStored[0][0].options[1].id;
  const targetQId = sectionQStored[0][1].id;
  await db.insert(templateConditionals).values({
    questionId: targetQId,
    dependsOnQuestionId: depQId,
    dependsOnAnswerOptionId: depOptId,
    visible: true,
  });

  // Scoring bands
  await db.insert(scoringBands).values([
    { templateId: tplV1.id, label: 'High risk', minScore: 0, maxScore: 40, color: '#dc2626' },
    { templateId: tplV1.id, label: 'Moderate risk', minScore: 40.01, maxScore: 70, color: '#d97706' },
    { templateId: tplV1.id, label: 'Low risk', minScore: 70.01, maxScore: 100, color: '#16a34a' },
  ]);

  // Template v2 — forked and published
  const [tplV2] = await db
    .insert(templates)
    .values({
      name: 'Housing Stability Assessment',
      description: 'v2: recalibrated scoring bands and added "past-year risk" weighting.',
      status: 'published',
      version: 2,
      parentTemplateId: tplV1.id,
    })
    .returning();

  // Just give v2 one quick section/question so it's usable for a screening
  const [v2Section] = await db
    .insert(templateSections)
    .values({ templateId: tplV2.id, title: 'Summary', order: 0, weight: 1 })
    .returning();
  const [v2Q] = await db
    .insert(templateQuestions)
    .values({
      sectionId: v2Section.id,
      prompt: 'Overall, how stable is your housing situation today?',
      type: 'likert',
      required: true,
      weight: 1,
      order: 0,
    })
    .returning();
  for (let i = 1; i <= 5; i++) {
    await db.insert(templateAnswerOptions).values({
      questionId: v2Q.id,
      label: `Level ${i}`,
      score: i,
      order: i - 1,
    });
  }
  await db.insert(scoringBands).values([
    { templateId: tplV2.id, label: 'At risk', minScore: 0, maxScore: 50, color: '#dc2626' },
    { templateId: tplV2.id, label: 'Stable', minScore: 50.01, maxScore: 100, color: '#16a34a' },
  ]);

  // Archived v0-ish template
  await db
    .insert(templates)
    .values({
      name: 'Legacy intake (deprecated)',
      description: 'Kept as an example of the archived status.',
      status: 'archived',
      version: 1,
    })
    .returning();

  // Build some screenings using v1 (submitted) and one draft.
  const v1Payload = await buildSnapshotPayload(tplV1.id);

  async function makeScreening(opts: {
    agencyId: string;
    clientId: string;
    payload: TemplateSnapshotPayload;
    answers: { questionIndex: [number, number]; optionIndex?: number; likert?: number }[];
    submit: boolean;
    submittedAt?: Date;
  }) {
    const [snap] = await db
      .insert(templateSnapshots)
      .values({
        sourceTemplateId: opts.payload.templateId,
        sourceVersion: opts.payload.version,
        capturedPayload: opts.payload,
      })
      .returning();

    const [s] = await db
      .insert(screenings)
      .values({
        agencyId: opts.agencyId,
        clientId: opts.clientId,
        templateSnapshotId: snap.id,
        status: 'draft',
      })
      .returning();

    const answerInputs = opts.answers.map((a) => {
      const section = opts.payload.sections[a.questionIndex[0]];
      const question = section.questions[a.questionIndex[1]];
      return {
        questionId: question.id,
        selectedOptionId:
          a.optionIndex !== undefined ? question.options[a.optionIndex].id : null,
        numericValue: a.likert ?? null,
        note: null,
      };
    });

    for (const ai of answerInputs) {
      await db.insert(screeningAnswers).values({
        screeningId: s.id,
        snapshotQuestionId: ai.questionId,
        selectedOptionId: ai.selectedOptionId,
        numericValue: ai.numericValue,
      });
    }

    if (!opts.submit) {
      await db
        .update(screenings)
        .set({ status: 'in_progress' })
        .where(eq(screenings.id, s.id));
      return;
    }

    const scoring = scoreScreening(opts.payload, answerInputs);
    await db
      .update(screenings)
      .set({
        status: 'submitted',
        submittedAt: opts.submittedAt ?? new Date(),
        finalScore: scoring.finalScore,
        finalBand: scoring.band?.label ?? null,
      })
      .where(eq(screenings.id, s.id));
  }

  // Spread screenings across a few months for the time-series chart.
  const months = [
    new Date('2026-01-15'),
    new Date('2026-02-10'),
    new Date('2026-02-22'),
    new Date('2026-03-07'),
    new Date('2026-03-18'),
    new Date('2026-04-02'),
    new Date('2026-04-15'),
  ];

  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[0].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[0],
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 }, // stable: Yes -> 10
      { questionIndex: [1, 0], optionIndex: 0 }, // employed: Yes -> 10
      { questionIndex: [1, 1], likert: 5 },
      { questionIndex: [2, 0], likert: 5 },
      { questionIndex: [3, 0], optionIndex: 0 }, // None of the below
    ],
  });
  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[1].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[1],
    answers: [
      { questionIndex: [0, 0], optionIndex: 1 }, // stable: No
      { questionIndex: [0, 1], optionIndex: 2 }, // 3-6 months (now visible)
      { questionIndex: [1, 0], optionIndex: 1 },
      { questionIndex: [1, 1], likert: 2 },
      { questionIndex: [2, 0], likert: 2 },
      { questionIndex: [3, 0], optionIndex: 1 },
    ],
  });
  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[2].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[2],
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 },
      { questionIndex: [1, 0], optionIndex: 0 },
      { questionIndex: [1, 1], likert: 4 },
      { questionIndex: [2, 0], likert: 4 },
      { questionIndex: [3, 0], optionIndex: 2 },
    ],
  });
  await makeScreening({
    agencyId: northwindAgency.id,
    clientId: clientRows[3].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[3],
    answers: [
      { questionIndex: [0, 0], optionIndex: 1 },
      { questionIndex: [0, 1], optionIndex: 3 }, // >6 months
      { questionIndex: [1, 0], optionIndex: 1 },
      { questionIndex: [1, 1], likert: 1 },
      { questionIndex: [2, 0], likert: 1 },
      { questionIndex: [3, 0], optionIndex: 3 },
    ],
  });
  await makeScreening({
    agencyId: northwindAgency.id,
    clientId: clientRows[4].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[4],
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 },
      { questionIndex: [1, 0], optionIndex: 0 },
      { questionIndex: [1, 1], likert: 3 },
      { questionIndex: [2, 0], likert: 3 },
      { questionIndex: [3, 0], optionIndex: 0 },
    ],
  });
  // One in-progress draft so the ledger shows multiple statuses on first load.
  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[0].id,
    payload: v1Payload,
    submit: false,
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 }, // just one answer so far
    ],
  });

  console.log('Seed complete.');
  await closeDbConnection();
}

/**
 * Local duplicate of TemplatesService.buildSnapshotPayload to avoid pulling
 * Nest DI into a standalone script.
 */
async function buildSnapshotPayload(
  templateId: string,
): Promise<TemplateSnapshotPayload> {
  const t = await db.query.templates.findFirst({
    where: eq(templates.id, templateId),
    with: {
      bands: true,
      sections: {
        with: {
          questions: {
            with: { options: true, conditionals: true },
          },
        },
      },
    },
  });
  if (!t) throw new Error('template not found');
  return {
    templateId: t.id,
    name: t.name,
    description: t.description,
    version: t.version,
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
              dependsOnAnswerOptionId: c.dependsOnAnswerOptionId ?? null,
              dependsOnNumericMin: c.dependsOnNumericMin,
              dependsOnNumericMax: c.dependsOnNumericMax,
              visible: c.visible,
            })),
          })),
      })),
    bands: t.bands.map((b) => ({
      id: b.id,
      label: b.label,
      minScore: b.minScore,
      maxScore: b.maxScore,
      color: b.color,
    })),
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
