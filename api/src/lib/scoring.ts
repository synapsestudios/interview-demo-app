import type {
  AnswerInput,
  SnapshotQuestion,
  SnapshotSection,
  TemplateSnapshotPayload,
} from './snapshot-types';
import { isQuestionVisible } from './conditional';

type SectionBreakdown = {
  sectionId: string;
  title: string;
  raw: number;
  max: number;
};

export type ScoringResult = {
  finalScore: number | null;
  band: { id: string; label: string; color: string } | null;
  sectionBreakdown: SectionBreakdown[];
  answeredVisibleQuestions: number;
  totalVisibleQuestions: number;
};

function maxPossibleForQuestion(q: SnapshotQuestion): number {
  if (q.type === 'likert') {
    return 5 * q.weight;
  }
  const max = q.options.reduce((acc, o) => Math.max(acc, o.score), 0);
  return max * q.weight;
}

function rawForAnswer(q: SnapshotQuestion, a: AnswerInput | undefined): number {
  if (!a) return 0;
  if (q.type === 'likert') {
    return (a.numericValue ?? 0) * q.weight;
  }
  const opt = q.options.find((o) => o.id === a.selectedOptionId);
  return (opt?.score ?? 0) * q.weight;
}

export function scoreScreening(
  snapshot: TemplateSnapshotPayload,
  answers: AnswerInput[],
): ScoringResult {
  const byId = new Map<string, AnswerInput>();
  for (const a of answers) byId.set(a.questionId, a);

  const breakdown: SectionBreakdown[] = [];
  let answeredVisible = 0;
  let totalVisible = 0;
  let templateRaw = 0;
  let templateMax = 0;

  for (const section of snapshot.sections) {
    let sectionRaw = 0;
    let sectionMax = 0;

    for (const q of section.questions) {
      if (!isQuestionVisible(q, byId)) continue;

      totalVisible++;
      const a = byId.get(q.id);
      if (a && (a.selectedOptionId || a.numericValue !== null)) {
        answeredVisible++;
      }

      sectionRaw += rawForAnswer(q, a);
      sectionMax += maxPossibleForQuestion(q);
    }

    const weightedRaw = sectionRaw * section.weight;
    const weightedMax = sectionMax * section.weight;
    templateRaw += weightedRaw;
    templateMax += weightedMax;

    breakdown.push({
      sectionId: section.id,
      title: section.title,
      raw: weightedRaw,
      max: weightedMax,
    });
  }

  const finalScore =
    templateMax > 0 ? Math.round((templateRaw / templateMax) * 10000) / 100 : null;

  const band = (() => {
    if (finalScore === null) return null;
    for (const b of snapshot.bands) {
      if (finalScore >= b.minScore && finalScore <= b.maxScore) {
        return { id: b.id, label: b.label, color: b.color };
      }
    }
    return null;
  })();

  return {
    finalScore,
    band,
    sectionBreakdown: breakdown,
    answeredVisibleQuestions: answeredVisible,
    totalVisibleQuestions: totalVisible,
  };
}
