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

  // Agencies — security assessment firms running screenings against client applications.
  const [acmeAgency, northwindAgency, summitAgency] = await db
    .insert(agencies)
    .values([
      { name: 'Acme Security Partners' },
      { name: 'Northwind AppSec' },
      { name: 'Summit Audit Group' },
    ])
    .returning();

  // Clients — each client is an application (or service) being assessed by the agency.
  const clientRows = await db
    .insert(clients)
    .values([
      { agencyId: acmeAgency.id, name: 'Checkout Service' },
      { agencyId: acmeAgency.id, name: 'Admin Portal' },
      { agencyId: acmeAgency.id, name: 'Billing API' },
      { agencyId: northwindAgency.id, name: 'Mobile Gateway' },
      { agencyId: northwindAgency.id, name: 'Data Export Job' },
      { agencyId: summitAgency.id, name: 'Patient Lookup Service' },
    ])
    .returning();

  // Template v1 (published)
  const [tplV1] = await db
    .insert(templates)
    .values({
      name: 'Application Security Baseline',
      description:
        'Baseline application-security screening across authentication, data protection, supply-chain, and monitoring domains. Based loosely on OWASP ASVS controls.',
      status: 'published',
      version: 1,
    })
    .returning();

  const sections = [
    {
      title: 'Authentication & access',
      weight: 1.5,
      order: 0,
      questions: [
        {
          prompt: 'Is multi-factor authentication enforced for all privileged accounts?',
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
          prompt: 'If MFA is not yet enforced, what is the planned timeline?',
          type: 'multiple_choice' as const,
          required: false,
          weight: 1.0,
          order: 1,
          options: [
            { label: 'Rolling out within 30 days', score: 7, order: 0 },
            { label: 'Planned within 90 days', score: 5, order: 1 },
            { label: 'Planned this year', score: 3, order: 2 },
            { label: 'Not on the roadmap', score: 0, order: 3 },
          ],
          conditionalOn: { qIdx: 0, optIdx: 1 }, // show only when Q0 answered "No"
        },
        {
          prompt: 'How are sessions terminated on logout?',
          type: 'multiple_choice' as const,
          required: true,
          weight: 1.0,
          order: 2,
          options: [
            { label: 'Server-side token invalidated and cookie cleared', score: 10, order: 0 },
            { label: 'Cookie cleared; token remains valid until expiry', score: 4, order: 1 },
            { label: 'No explicit teardown on the server', score: 0, order: 2 },
          ],
        },
      ],
    },
    {
      title: 'Data protection',
      weight: 1.5,
      order: 1,
      questions: [
        {
          prompt: 'How are user passwords hashed at rest?',
          type: 'multiple_choice' as const,
          required: true,
          weight: 1.5,
          order: 0,
          options: [
            { label: 'Argon2id or scrypt with tuned parameters', score: 10, order: 0 },
            { label: 'bcrypt with cost ≥ 12', score: 8, order: 1 },
            { label: 'PBKDF2 with ≥ 100k iterations', score: 6, order: 2 },
            { label: 'Another KDF, legacy parameters', score: 3, order: 3 },
            { label: 'Plaintext, MD5, or unsalted SHA', score: 0, order: 4 },
          ],
        },
        {
          prompt: 'Is sensitive data (PII, tokens, secrets) encrypted at rest?',
          type: 'true_false' as const,
          required: true,
          weight: 1.0,
          order: 1,
          options: [
            { label: 'Yes', score: 10, order: 0 },
            { label: 'No', score: 0, order: 1 },
          ],
        },
        {
          prompt: 'How confident is the team in its data-classification inventory?',
          type: 'likert' as const,
          required: true,
          weight: 1.0,
          order: 2,
          options: [
            { label: 'Very low', score: 1, order: 0 },
            { label: 'Low', score: 2, order: 1 },
            { label: 'Moderate', score: 3, order: 2 },
            { label: 'High', score: 4, order: 3 },
            { label: 'Very high', score: 5, order: 4 },
          ],
        },
      ],
    },
    {
      title: 'Supply chain',
      weight: 1.0,
      order: 2,
      questions: [
        {
          prompt: 'Are third-party dependencies scanned for known vulnerabilities on every CI run?',
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
          prompt: 'How often are production container images rebuilt from their base image?',
          type: 'multiple_choice' as const,
          required: true,
          weight: 1.0,
          order: 1,
          options: [
            { label: 'On every merge to main', score: 10, order: 0 },
            { label: 'Nightly', score: 8, order: 1 },
            { label: 'Weekly', score: 5, order: 2 },
            { label: 'Monthly or longer', score: 2, order: 3 },
          ],
        },
      ],
    },
    {
      title: 'Monitoring & incident response',
      weight: 1.25,
      order: 3,
      questions: [
        {
          prompt: 'How confident is the team in its incident-response playbook for a production compromise?',
          type: 'likert' as const,
          required: true,
          weight: 1.0,
          order: 0,
          options: [
            { label: 'Very low', score: 1, order: 0 },
            { label: 'Low', score: 2, order: 1 },
            { label: 'Moderate', score: 3, order: 2 },
            { label: 'High', score: 4, order: 3 },
            { label: 'Very high', score: 5, order: 4 },
          ],
        },
        {
          prompt: 'Is there a documented on-call rotation for security incidents?',
          type: 'true_false' as const,
          required: true,
          weight: 1.0,
          order: 1,
          options: [
            { label: 'Yes', score: 10, order: 0 },
            { label: 'No', score: 0, order: 1 },
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
    { templateId: tplV1.id, label: 'Critical risk', minScore: 0, maxScore: 40, color: '#b42318' },
    { templateId: tplV1.id, label: 'Needs attention', minScore: 40.01, maxScore: 70, color: '#b45309' },
    { templateId: tplV1.id, label: 'Strong posture', minScore: 70.01, maxScore: 100, color: '#0e7a4f' },
  ]);

  // Template v2 — forked and published (tightened bands, trimmed summary shape)
  const [tplV2] = await db
    .insert(templates)
    .values({
      name: 'Application Security Baseline',
      description: 'v2: tightened scoring bands and added explicit supply-chain weighting.',
      status: 'published',
      version: 2,
      parentTemplateId: tplV1.id,
    })
    .returning();

  const [v2Section] = await db
    .insert(templateSections)
    .values({ templateId: tplV2.id, title: 'Executive summary', order: 0, weight: 1 })
    .returning();
  const [v2Q] = await db
    .insert(templateQuestions)
    .values({
      sectionId: v2Section.id,
      prompt: 'Overall, how would you rate this application\u2019s security posture today?',
      type: 'likert',
      required: true,
      weight: 1,
      order: 0,
    })
    .returning();
  const v2LikertLabels = ['Very weak', 'Weak', 'Adequate', 'Strong', 'Very strong'];
  for (let i = 1; i <= 5; i++) {
    await db.insert(templateAnswerOptions).values({
      questionId: v2Q.id,
      label: v2LikertLabels[i - 1],
      score: i,
      order: i - 1,
    });
  }
  await db.insert(scoringBands).values([
    { templateId: tplV2.id, label: 'At risk', minScore: 0, maxScore: 50, color: '#b42318' },
    { templateId: tplV2.id, label: 'Acceptable', minScore: 50.01, maxScore: 100, color: '#0e7a4f' },
  ]);

  // Archived template — kept to showcase the archived lifecycle state.
  await db
    .insert(templates)
    .values({
      name: 'Legacy perimeter checklist (deprecated)',
      description: 'Retired in favor of the current application-security baseline.',
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

  // Checkout Service — mature posture, nearly perfect.
  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[0].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[0],
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 }, // MFA: Yes
      { questionIndex: [0, 2], optionIndex: 0 }, // Session termination: Server-side invalidated
      { questionIndex: [1, 0], optionIndex: 0 }, // Password hashing: Argon2id
      { questionIndex: [1, 1], optionIndex: 0 }, // Encryption at rest: Yes
      { questionIndex: [1, 2], likert: 5 },       // Data classification confidence: Very high
      { questionIndex: [2, 0], optionIndex: 0 }, // Dep scanning: Yes
      { questionIndex: [2, 1], optionIndex: 0 }, // Image rebuild: Every merge
      { questionIndex: [3, 0], likert: 5 },       // IR playbook confidence: Very high
      { questionIndex: [3, 1], optionIndex: 0 }, // On-call rotation: Yes
    ],
  });

  // Admin Portal — legacy-shaped; many critical gaps.
  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[1].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[1],
    answers: [
      { questionIndex: [0, 0], optionIndex: 1 }, // MFA: No
      { questionIndex: [0, 1], optionIndex: 3 }, // Timeline: Not on the roadmap (now visible)
      { questionIndex: [0, 2], optionIndex: 2 }, // Session termination: None
      { questionIndex: [1, 0], optionIndex: 4 }, // Hashing: Plaintext/MD5
      { questionIndex: [1, 1], optionIndex: 1 }, // Encryption at rest: No
      { questionIndex: [1, 2], likert: 1 },       // Classification confidence: Very low
      { questionIndex: [2, 0], optionIndex: 1 }, // Dep scanning: No
      { questionIndex: [2, 1], optionIndex: 3 }, // Image rebuild: Monthly or longer
      { questionIndex: [3, 0], likert: 1 },       // IR playbook: Very low
      { questionIndex: [3, 1], optionIndex: 1 }, // On-call rotation: No
    ],
  });

  // Billing API — mid-band; mostly solid with a few soft spots.
  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[2].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[2],
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 }, // MFA: Yes
      { questionIndex: [0, 2], optionIndex: 1 }, // Session termination: Cookie cleared only
      { questionIndex: [1, 0], optionIndex: 1 }, // Hashing: bcrypt
      { questionIndex: [1, 1], optionIndex: 0 }, // Encryption: Yes
      { questionIndex: [1, 2], likert: 4 },       // Classification: High
      { questionIndex: [2, 0], optionIndex: 0 }, // Dep scanning: Yes
      { questionIndex: [2, 1], optionIndex: 1 }, // Image rebuild: Nightly
      { questionIndex: [3, 0], likert: 4 },       // IR playbook: High
      { questionIndex: [3, 1], optionIndex: 0 }, // On-call: Yes
    ],
  });

  // Mobile Gateway — legacy; critical everywhere.
  await makeScreening({
    agencyId: northwindAgency.id,
    clientId: clientRows[3].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[3],
    answers: [
      { questionIndex: [0, 0], optionIndex: 1 }, // MFA: No
      { questionIndex: [0, 1], optionIndex: 2 }, // Timeline: Planned this year
      { questionIndex: [0, 2], optionIndex: 2 }, // Session: No teardown
      { questionIndex: [1, 0], optionIndex: 4 }, // Hashing: Plaintext
      { questionIndex: [1, 1], optionIndex: 1 }, // Encryption: No
      { questionIndex: [1, 2], likert: 1 },       // Classification: Very low
      { questionIndex: [2, 0], optionIndex: 1 }, // Dep scanning: No
      { questionIndex: [2, 1], optionIndex: 3 }, // Image rebuild: Monthly or longer
      { questionIndex: [3, 0], likert: 1 },       // IR playbook: Very low
      { questionIndex: [3, 1], optionIndex: 1 }, // On-call: No
    ],
  });

  // Data Export Job — needs attention but workable.
  await makeScreening({
    agencyId: northwindAgency.id,
    clientId: clientRows[4].id,
    payload: v1Payload,
    submit: true,
    submittedAt: months[4],
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 }, // MFA: Yes
      { questionIndex: [0, 2], optionIndex: 0 }, // Session: Server-side invalidated
      { questionIndex: [1, 0], optionIndex: 2 }, // Hashing: PBKDF2
      { questionIndex: [1, 1], optionIndex: 0 }, // Encryption: Yes
      { questionIndex: [1, 2], likert: 3 },       // Classification: Moderate
      { questionIndex: [2, 0], optionIndex: 0 }, // Dep scanning: Yes
      { questionIndex: [2, 1], optionIndex: 2 }, // Image rebuild: Weekly
      { questionIndex: [3, 0], likert: 3 },       // IR playbook: Moderate
      { questionIndex: [3, 1], optionIndex: 0 }, // On-call: Yes
    ],
  });

  // One in-progress draft (Checkout Service revisit) so the ledger shows mixed statuses on first load.
  await makeScreening({
    agencyId: acmeAgency.id,
    clientId: clientRows[0].id,
    payload: v1Payload,
    submit: false,
    answers: [
      { questionIndex: [0, 0], optionIndex: 0 }, // MFA: Yes — just the first answer so far
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
