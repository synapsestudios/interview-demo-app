export type SnapshotAnswerOption = {
  id: string;
  label: string;
  score: number;
  order: number;
};

export type SnapshotConditional = {
  id: string;
  dependsOnQuestionId: string;
  dependsOnAnswerOptionId: string | null;
  dependsOnNumericMin: number | null;
  dependsOnNumericMax: number | null;
  visible: boolean;
};

export type SnapshotQuestion = {
  id: string;
  prompt: string;
  type: 'true_false' | 'multiple_choice' | 'likert';
  required: boolean;
  weight: number;
  order: number;
  options: SnapshotAnswerOption[];
  conditionals: SnapshotConditional[];
};

export type SnapshotSection = {
  id: string;
  title: string;
  order: number;
  weight: number;
  questions: SnapshotQuestion[];
};

export type SnapshotBand = {
  id: string;
  label: string;
  minScore: number;
  maxScore: number;
  color: string;
};

export type TemplateSnapshotPayload = {
  templateId: string;
  name: string;
  description: string | null;
  version: number;
  sections: SnapshotSection[];
  bands: SnapshotBand[];
};

export type AnswerInput = {
  questionId: string;
  selectedOptionId?: string | null;
  numericValue?: number | null;
  note?: string | null;
};
