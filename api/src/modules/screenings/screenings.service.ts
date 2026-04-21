import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DB_TOKEN } from '../../db/db.module';
import type { Db } from '../../db';
import {
  screenings,
  screeningAnswers,
  templateSnapshots,
  agencies,
  clients,
  templates,
} from '../../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { TemplatesService } from '../templates/templates.service';
import {
  AnswerInput,
  TemplateSnapshotPayload,
} from '../../lib/snapshot-types';
import { scoreScreening } from '../../lib/scoring';
import { canSubmitScreening } from '../../lib/can-submit';
import { AnswerDto, CreateScreeningDto } from './dto/screening.dto';

@Injectable()
export class ScreeningsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly templatesService: TemplatesService,
  ) {}

  async create(dto: CreateScreeningDto) {
    const template = await this.db.query.templates.findFirst({
      where: eq(templates.id, dto.templateId),
    });
    if (!template) throw new NotFoundException('Template not found');
    if (template.status !== 'published') {
      throw new BadRequestException(
        'Screenings can only be started from published templates.',
      );
    }

    const payload = await this.templatesService.buildSnapshotPayload(dto.templateId);
    const [snapshot] = await this.db
      .insert(templateSnapshots)
      .values({
        sourceTemplateId: template.id,
        sourceVersion: template.version,
        capturedPayload: payload,
      })
      .returning();

    const [row] = await this.db
      .insert(screenings)
      .values({
        agencyId: dto.agencyId,
        clientId: dto.clientId,
        templateSnapshotId: snapshot.id,
        status: 'draft',
      })
      .returning();

    return this.get(row.id);
  }

  async list(params: {
    agencyId?: string;
    status?: 'draft' | 'in_progress' | 'submitted';
    templateId?: string;
  }) {
    const filters = [] as any[];
    if (params.agencyId) filters.push(eq(screenings.agencyId, params.agencyId));
    if (params.status) filters.push(eq(screenings.status, params.status));

    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await this.db.query.screenings.findMany({
      where,
      with: { snapshot: true, agency: true, client: true },
      orderBy: (t, { desc }) => [desc(t.startedAt)],
    });

    const enriched = rows.map((r) => {
      const payload = r.snapshot.capturedPayload as TemplateSnapshotPayload;
      return {
        id: r.id,
        agencyId: r.agencyId,
        clientId: r.clientId,
        clientName: r.client.name,
        agencyName: r.agency.name,
        templateId: payload.templateId,
        templateName: payload.name,
        templateVersion: payload.version,
        status: r.status,
        startedAt: r.startedAt,
        submittedAt: r.submittedAt,
        finalScore: r.finalScore,
        finalBand: r.finalBand,
      };
    });

    return params.templateId
      ? enriched.filter((e) => e.templateId === params.templateId)
      : enriched;
  }

  async get(id: string) {
    const row = await this.db.query.screenings.findFirst({
      where: eq(screenings.id, id),
      with: {
        agency: true,
        client: true,
        snapshot: true,
        answers: true,
      },
    });
    if (!row) throw new NotFoundException('Screening not found');

    const snapshotPayload = row.snapshot.capturedPayload as TemplateSnapshotPayload;
    const answerInputs = this.toAnswerInputs(row.answers);
    const scoring = scoreScreening(snapshotPayload, answerInputs);
    const gating = canSubmitScreening(snapshotPayload, answerInputs);

    return {
      id: row.id,
      agencyId: row.agencyId,
      clientId: row.clientId,
      clientName: row.client.name,
      status: row.status,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      persistedFinalScore: row.finalScore,
      persistedFinalBand: row.finalBand,
      snapshot: snapshotPayload,
      answers: row.answers.map((a) => ({
        questionId: a.snapshotQuestionId,
        selectedOptionId: a.selectedOptionId,
        numericValue: a.numericValue,
        note: a.note,
        answeredAt: a.answeredAt,
      })),
      liveScoring: scoring,
      canSubmit: gating,
    };
  }

  async upsertAnswers(id: string, answers: AnswerDto[]) {
    const row = await this.db.query.screenings.findFirst({
      where: eq(screenings.id, id),
    });
    if (!row) throw new NotFoundException('Screening not found');
    if (row.status === 'submitted') {
      throw new BadRequestException('Cannot modify a submitted screening.');
    }

    for (const a of answers) {
      const existing = await this.db.query.screeningAnswers.findFirst({
        where: and(
          eq(screeningAnswers.screeningId, id),
          eq(screeningAnswers.snapshotQuestionId, a.questionId),
        ),
      });
      if (existing) {
        await this.db
          .update(screeningAnswers)
          .set({
            selectedOptionId: a.selectedOptionId ?? null,
            numericValue: a.numericValue ?? null,
            note: a.note ?? null,
            answeredAt: new Date(),
          })
          .where(eq(screeningAnswers.id, existing.id));
      } else {
        await this.db.insert(screeningAnswers).values({
          screeningId: id,
          snapshotQuestionId: a.questionId,
          selectedOptionId: a.selectedOptionId ?? null,
          numericValue: a.numericValue ?? null,
          note: a.note ?? null,
        });
      }
    }

    if (row.status === 'draft') {
      await this.db
        .update(screenings)
        .set({ status: 'in_progress' })
        .where(eq(screenings.id, id));
    }

    return this.get(id);
  }

  async submit(id: string) {
    const current = await this.get(id);
    if (current.status === 'submitted') {
      throw new BadRequestException('Screening is already submitted.');
    }
    if (!current.canSubmit.canSubmit) {
      throw new BadRequestException({
        message: 'Screening has unanswered required questions.',
        blockingQuestions: current.canSubmit.blockingQuestions,
      });
    }

    const { liveScoring } = current;
    await this.db
      .update(screenings)
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        finalScore: liveScoring.finalScore,
        finalBand: liveScoring.band?.label ?? null,
      })
      .where(eq(screenings.id, id));

    return this.get(id);
  }

  private toAnswerInputs(rows: typeof screeningAnswers.$inferSelect[]): AnswerInput[] {
    return rows.map((r) => ({
      questionId: r.snapshotQuestionId,
      selectedOptionId: r.selectedOptionId,
      numericValue: r.numericValue,
      note: r.note,
    }));
  }

  async exportCsv(params: { agencyId?: string; templateId?: string }) {
    const rows = await this.list(params);
    const header = [
      'id',
      'agency',
      'client',
      'template',
      'version',
      'status',
      'final_score',
      'final_band',
      'started_at',
      'submitted_at',
    ].join(',');
    const body = rows
      .map((r) =>
        [
          r.id,
          csvCell(r.agencyName),
          csvCell(r.clientName),
          csvCell(r.templateName),
          r.templateVersion,
          r.status,
          r.finalScore ?? '',
          r.finalBand ?? '',
          r.startedAt?.toISOString?.() ?? r.startedAt ?? '',
          r.submittedAt?.toISOString?.() ?? r.submittedAt ?? '',
        ].join(','),
      )
      .join('\n');
    return header + '\n' + body + '\n';
  }
}

function csvCell(s: string | null | undefined): string {
  const str = s ?? '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
