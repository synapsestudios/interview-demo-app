import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DB_TOKEN } from '../../db/db.module';
import type { Db } from '../../db';
import {
  templates,
  templateSections,
  templateQuestions,
  templateAnswerOptions,
  templateConditionals,
  scoringBands,
} from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import {
  CreateTemplateDto,
  SectionDto,
  ScoringBandDto,
  UpdateTemplateDto,
} from './dto/template.dto';
import { TemplateSnapshotPayload } from '../../lib/snapshot-types';

@Injectable()
export class TemplatesService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async list() {
    return this.db.select().from(templates).orderBy(templates.createdAt);
  }

  async get(id: string) {
    const row = await this.db.query.templates.findFirst({
      where: eq(templates.id, id),
      with: {
        bands: true,
        sections: {
          with: {
            questions: {
              with: {
                options: true,
                conditionals: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`Template ${id} not found`);
    return row;
  }

  async create(dto: CreateTemplateDto) {
    const [tpl] = await this.db
      .insert(templates)
      .values({
        name: dto.name,
        description: dto.description ?? null,
        status: 'draft',
        version: 1,
      })
      .returning();

    if (dto.sections) await this.replaceSections(tpl.id, dto.sections);
    if (dto.bands) await this.replaceBands(tpl.id, dto.bands);
    return this.get(tpl.id);
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.db.query.templates.findFirst({
      where: eq(templates.id, id),
    });
    if (!existing) throw new NotFoundException(`Template ${id} not found`);
    if (existing.status === 'published') {
      throw new BadRequestException(
        'Cannot edit a published template. Fork it to create a new version.',
      );
    }

    const patch: Partial<typeof templates.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    await this.db.update(templates).set(patch).where(eq(templates.id, id));

    if (dto.sections) await this.replaceSections(id, dto.sections);
    if (dto.bands) await this.replaceBands(id, dto.bands);
    return this.get(id);
  }

  async publish(id: string) {
    const tpl = await this.db.query.templates.findFirst({
      where: eq(templates.id, id),
    });
    if (!tpl) throw new NotFoundException(`Template ${id} not found`);
    if (tpl.status !== 'draft') {
      throw new BadRequestException(`Only draft templates can be published.`);
    }
    await this.db
      .update(templates)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(templates.id, id));
    return this.get(id);
  }

  async archive(id: string) {
    const tpl = await this.db.query.templates.findFirst({
      where: eq(templates.id, id),
    });
    if (!tpl) throw new NotFoundException(`Template ${id} not found`);
    await this.db
      .update(templates)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(templates.id, id));
    return this.get(id);
  }

  async fork(id: string) {
    const src = await this.get(id);
    if (src.status !== 'published') {
      throw new BadRequestException('Only published templates can be forked.');
    }
    const [tpl] = await this.db
      .insert(templates)
      .values({
        name: src.name,
        description: src.description,
        parentTemplateId: src.id,
        version: src.version + 1,
        status: 'draft',
      })
      .returning();

    // Clone sections + questions + options + conditionals.
    const oldToNewQuestionId = new Map<string, string>();
    const oldToNewOptionId = new Map<string, string>();

    for (const s of src.sections) {
      const [newSection] = await this.db
        .insert(templateSections)
        .values({
          templateId: tpl.id,
          title: s.title,
          order: s.order,
          weight: s.weight,
        })
        .returning();

      for (const q of s.questions) {
        const [newQ] = await this.db
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
        oldToNewQuestionId.set(q.id, newQ.id);

        for (const o of q.options) {
          const [newO] = await this.db
            .insert(templateAnswerOptions)
            .values({
              questionId: newQ.id,
              label: o.label,
              score: o.score,
              order: o.order,
            })
            .returning();
          oldToNewOptionId.set(o.id, newO.id);
        }
      }
    }

    // Second pass: conditionals require all question/option ID maps populated.
    for (const s of src.sections) {
      for (const q of s.questions) {
        for (const c of q.conditionals) {
          const newQId = oldToNewQuestionId.get(q.id)!;
          const newDepQ = oldToNewQuestionId.get(c.dependsOnQuestionId);
          const newDepOpt = c.dependsOnAnswerOptionId
            ? oldToNewOptionId.get(c.dependsOnAnswerOptionId)
            : null;
          if (!newDepQ) continue;
          await this.db.insert(templateConditionals).values({
            questionId: newQId,
            dependsOnQuestionId: newDepQ,
            dependsOnAnswerOptionId: newDepOpt ?? null,
            dependsOnNumericMin: c.dependsOnNumericMin,
            dependsOnNumericMax: c.dependsOnNumericMax,
            visible: c.visible,
          });
        }
      }
    }

    for (const b of src.bands) {
      await this.db.insert(scoringBands).values({
        templateId: tpl.id,
        label: b.label,
        minScore: b.minScore,
        maxScore: b.maxScore,
        color: b.color,
      });
    }

    return this.get(tpl.id);
  }

  /**
   * Build the denormalized snapshot payload stored on a screening.
   * Strips timestamps and foreign-key noise.
   */
  async buildSnapshotPayload(id: string): Promise<TemplateSnapshotPayload> {
    const t = await this.get(id);
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

  private async replaceSections(templateId: string, sections: SectionDto[]) {
    await this.db.delete(templateSections).where(eq(templateSections.templateId, templateId));
    for (const s of sections) {
      const [newSection] = await this.db
        .insert(templateSections)
        .values({
          templateId,
          title: s.title,
          order: s.order,
          weight: s.weight ?? 1,
        })
        .returning();

      const questionIdMap = new Map<string, string>();
      const optionIdMap = new Map<string, string>();

      for (const q of s.questions) {
        const [newQ] = await this.db
          .insert(templateQuestions)
          .values({
            sectionId: newSection.id,
            prompt: q.prompt,
            type: q.type,
            required: q.required ?? false,
            weight: q.weight ?? 1,
            order: q.order,
          })
          .returning();
        if (q.id) questionIdMap.set(q.id, newQ.id);

        for (const o of q.options) {
          const [newO] = await this.db
            .insert(templateAnswerOptions)
            .values({
              questionId: newQ.id,
              label: o.label,
              score: o.score,
              order: o.order,
            })
            .returning();
          if (o.id) optionIdMap.set(o.id, newO.id);
        }
      }

      for (const q of s.questions) {
        if (!q.conditionals) continue;
        const myNewId = q.id ? questionIdMap.get(q.id) : undefined;
        if (!myNewId) continue;
        for (const c of q.conditionals) {
          const depId =
            questionIdMap.get(c.dependsOnQuestionId) ?? c.dependsOnQuestionId;
          const optId = c.dependsOnAnswerOptionId
            ? (optionIdMap.get(c.dependsOnAnswerOptionId) ?? c.dependsOnAnswerOptionId)
            : null;
          await this.db.insert(templateConditionals).values({
            questionId: myNewId,
            dependsOnQuestionId: depId,
            dependsOnAnswerOptionId: optId,
            dependsOnNumericMin: c.dependsOnNumericMin ?? null,
            dependsOnNumericMax: c.dependsOnNumericMax ?? null,
            visible: c.visible ?? true,
          });
        }
      }
    }
  }

  private async replaceBands(templateId: string, bands: ScoringBandDto[]) {
    await this.db.delete(scoringBands).where(eq(scoringBands.templateId, templateId));
    for (const b of bands) {
      await this.db.insert(scoringBands).values({
        templateId,
        label: b.label,
        minScore: b.minScore,
        maxScore: b.maxScore,
        color: b.color ?? '#888888',
      });
    }
  }
}
