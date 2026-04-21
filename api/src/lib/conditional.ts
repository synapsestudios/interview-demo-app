import type {
  AnswerInput,
  SnapshotQuestion,
  TemplateSnapshotPayload,
} from './snapshot-types';

export function isQuestionVisible(
  question: SnapshotQuestion,
  answersByQuestionId: Map<string, AnswerInput>,
): boolean {
  if (question.conditionals.length === 0) return true;

  // All conditionals must be satisfied.
  for (const cond of question.conditionals) {
    const dep = answersByQuestionId.get(cond.dependsOnQuestionId);

    const matches = (() => {
      if (!dep) return false;
      if (cond.dependsOnAnswerOptionId) {
        return dep.selectedOptionId === cond.dependsOnAnswerOptionId;
      }
      if (cond.dependsOnNumericMin !== null || cond.dependsOnNumericMax !== null) {
        const v = dep.numericValue;
        if (v === null || v === undefined) return false;
        if (cond.dependsOnNumericMin !== null && v < cond.dependsOnNumericMin)
          return false;
        if (cond.dependsOnNumericMax !== null && v > cond.dependsOnNumericMax)
          return false;
        return true;
      }
      return false;
    })();

    const conditionPasses = cond.visible ? matches : !matches;
    if (!conditionPasses) return false;
  }

  return true;
}

export function visibleQuestions(
  snapshot: TemplateSnapshotPayload,
  answers: AnswerInput[],
): { section: string; question: SnapshotQuestion }[] {
  const byId = new Map<string, AnswerInput>();
  for (const a of answers) byId.set(a.questionId, a);

  const result: { section: string; question: SnapshotQuestion }[] = [];
  for (const section of snapshot.sections) {
    for (const q of section.questions) {
      if (isQuestionVisible(q, byId)) {
        result.push({ section: section.id, question: q });
      }
    }
  }
  return result;
}
