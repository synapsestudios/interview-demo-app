import type {
  AnswerInput,
  SnapshotQuestion,
  TemplateSnapshotPayload,
} from './snapshot-types';
import { isQuestionVisible } from './conditional';

export type CanSubmitResult = {
  canSubmit: boolean;
  blockingQuestions: { id: string; prompt: string; reason: string }[];
};

function answerIsPresent(q: SnapshotQuestion, a?: AnswerInput): boolean {
  if (!a) return false;
  if (q.type === 'likert') {
    return a.numericValue !== null && a.numericValue !== undefined;
  }
  return Boolean(a.selectedOptionId);
}

export function canSubmitScreening(
  snapshot: TemplateSnapshotPayload,
  answers: AnswerInput[],
): CanSubmitResult {
  const byId = new Map<string, AnswerInput>();
  for (const a of answers) byId.set(a.questionId, a);

  const blocking: CanSubmitResult['blockingQuestions'] = [];

  for (const section of snapshot.sections) {
    for (const q of section.questions) {
      if (!q.required) continue;
      if (!isQuestionVisible(q, byId)) continue;
      const a = byId.get(q.id);
      if (!answerIsPresent(q, a)) {
        blocking.push({
          id: q.id,
          prompt: q.prompt,
          reason: 'Required question has no answer.',
        });
      }
    }
  }

  return { canSubmit: blocking.length === 0, blockingQuestions: blocking };
}
