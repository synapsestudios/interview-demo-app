import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  jsonb,
  pgEnum,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agencies } from './agencies.schema';
import { clients } from './clients.schema';
import { templates } from './templates.schema';

export const screeningStatusEnum = pgEnum('screening_status', [
  'draft',
  'in_progress',
  'submitted',
]);

export const templateSnapshots = pgTable('template_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceTemplateId: uuid('source_template_id')
    .notNull()
    .references(() => templates.id),
  sourceVersion: integer('source_version').notNull(),
  capturedPayload: jsonb('captured_payload').notNull(),
  capturedAt: timestamp('captured_at').notNull().defaultNow(),
});

export const screenings = pgTable('screenings', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  templateSnapshotId: uuid('template_snapshot_id')
    .notNull()
    .references(() => templateSnapshots.id),
  status: screeningStatusEnum('status').notNull().default('draft'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  submittedAt: timestamp('submitted_at'),
  finalScore: real('final_score'),
  finalBand: text('final_band'),
});

export const screeningAnswers = pgTable('screening_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  screeningId: uuid('screening_id')
    .notNull()
    .references(() => screenings.id, { onDelete: 'cascade' }),
  snapshotQuestionId: uuid('snapshot_question_id').notNull(),
  selectedOptionId: uuid('selected_option_id'),
  numericValue: real('numeric_value'),
  note: text('note'),
  answeredAt: timestamp('answered_at').notNull().defaultNow(),
});

export const templateSnapshotsRelations = relations(
  templateSnapshots,
  ({ one, many }) => ({
    template: one(templates, {
      fields: [templateSnapshots.sourceTemplateId],
      references: [templates.id],
    }),
    screenings: many(screenings),
  }),
);

export const screeningsRelations = relations(screenings, ({ one, many }) => ({
  agency: one(agencies, {
    fields: [screenings.agencyId],
    references: [agencies.id],
  }),
  client: one(clients, {
    fields: [screenings.clientId],
    references: [clients.id],
  }),
  snapshot: one(templateSnapshots, {
    fields: [screenings.templateSnapshotId],
    references: [templateSnapshots.id],
  }),
  answers: many(screeningAnswers),
}));

export const screeningAnswersRelations = relations(
  screeningAnswers,
  ({ one }) => ({
    screening: one(screenings, {
      fields: [screeningAnswers.screeningId],
      references: [screenings.id],
    }),
  }),
);
