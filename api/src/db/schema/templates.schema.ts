import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  real,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const templateStatusEnum = pgEnum('template_status', [
  'draft',
  'published',
  'archived',
]);

export const questionTypeEnum = pgEnum('question_type', [
  'true_false',
  'multiple_choice',
  'likert',
]);

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').notNull().default(1),
  parentTemplateId: uuid('parent_template_id'),
  status: templateStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const templateSections = pgTable('template_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => templates.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  order: integer('order').notNull().default(0),
  weight: real('weight').notNull().default(1),
});

export const templateQuestions = pgTable('template_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => templateSections.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  type: questionTypeEnum('type').notNull(),
  required: boolean('required').notNull().default(false),
  weight: real('weight').notNull().default(1),
  order: integer('order').notNull().default(0),
});

export const templateAnswerOptions = pgTable('template_answer_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id')
    .notNull()
    .references(() => templateQuestions.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  score: real('score').notNull().default(0),
  order: integer('order').notNull().default(0),
});

export const templateConditionals = pgTable('template_conditionals', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id')
    .notNull()
    .references(() => templateQuestions.id, { onDelete: 'cascade' }),
  dependsOnQuestionId: uuid('depends_on_question_id')
    .notNull()
    .references(() => templateQuestions.id, { onDelete: 'cascade' }),
  dependsOnAnswerOptionId: uuid('depends_on_answer_option_id').references(
    () => templateAnswerOptions.id,
    { onDelete: 'cascade' },
  ),
  dependsOnNumericMin: real('depends_on_numeric_min'),
  dependsOnNumericMax: real('depends_on_numeric_max'),
  visible: boolean('visible').notNull().default(true),
});

export const scoringBands = pgTable('scoring_bands', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id')
    .notNull()
    .references(() => templates.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  minScore: real('min_score').notNull(),
  maxScore: real('max_score').notNull(),
  color: text('color').notNull().default('#888888'),
});

// Relations
export const templatesRelations = relations(templates, ({ many }) => ({
  sections: many(templateSections),
  bands: many(scoringBands),
}));

export const templateSectionsRelations = relations(
  templateSections,
  ({ one, many }) => ({
    template: one(templates, {
      fields: [templateSections.templateId],
      references: [templates.id],
    }),
    questions: many(templateQuestions),
  }),
);

export const templateQuestionsRelations = relations(
  templateQuestions,
  ({ one, many }) => ({
    section: one(templateSections, {
      fields: [templateQuestions.sectionId],
      references: [templateSections.id],
    }),
    options: many(templateAnswerOptions),
    conditionals: many(templateConditionals, {
      relationName: 'question_conditionals',
    }),
  }),
);

export const templateAnswerOptionsRelations = relations(
  templateAnswerOptions,
  ({ one }) => ({
    question: one(templateQuestions, {
      fields: [templateAnswerOptions.questionId],
      references: [templateQuestions.id],
    }),
  }),
);

export const templateConditionalsRelations = relations(
  templateConditionals,
  ({ one }) => ({
    question: one(templateQuestions, {
      fields: [templateConditionals.questionId],
      references: [templateQuestions.id],
      relationName: 'question_conditionals',
    }),
    dependsOnQuestion: one(templateQuestions, {
      fields: [templateConditionals.dependsOnQuestionId],
      references: [templateQuestions.id],
    }),
  }),
);

export const scoringBandsRelations = relations(scoringBands, ({ one }) => ({
  template: one(templates, {
    fields: [scoringBands.templateId],
    references: [templates.id],
  }),
}));
