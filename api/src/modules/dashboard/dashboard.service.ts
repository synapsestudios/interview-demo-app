import { Inject, Injectable } from '@nestjs/common';
import { DB_TOKEN } from '../../db/db.module';
import type { Db } from '../../db';
import { screenings, templateSnapshots } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { TemplateSnapshotPayload } from '../../lib/snapshot-types';

@Injectable()
export class DashboardService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /**
   * Histogram of final scores for submitted screenings on a specific template
   * (any version) for an agency. Buckets are 10 wide: 0-10, 10-20, ..., 90-100.
   */
  async scoreDistribution(agencyId: string, templateId: string) {
    const rows = await this.fetchSubmitted(agencyId, templateId);

    const buckets = Array.from({ length: 10 }, (_, i) => ({
      bucketStart: i * 10,
      bucketEnd: (i + 1) * 10,
      count: 0,
    }));
    for (const r of rows) {
      if (r.finalScore === null || r.finalScore === undefined) continue;
      const idx = Math.min(Math.floor(r.finalScore / 10), 9);
      buckets[idx].count++;
    }
    return buckets;
  }

  /**
   * Result-band counts by month (YYYY-MM).
   */
  async bandCountsOverTime(agencyId: string, templateId: string) {
    const rows = await this.fetchSubmitted(agencyId, templateId);

    const byMonth = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!r.submittedAt) continue;
      const month = monthKey(r.submittedAt);
      const band = r.finalBand ?? 'unscored';
      if (!byMonth.has(month)) byMonth.set(month, new Map());
      const inner = byMonth.get(month)!;
      inner.set(band, (inner.get(band) ?? 0) + 1);
    }

    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, inner]) => ({
        month,
        counts: Object.fromEntries(inner.entries()),
      }));
  }

  private async fetchSubmitted(agencyId: string, templateId: string) {
    const rows = await this.db.query.screenings.findMany({
      where: and(
        eq(screenings.agencyId, agencyId),
        eq(screenings.status, 'submitted'),
      ),
      with: { snapshot: true },
    });
    return rows.filter((r) => {
      const payload = r.snapshot.capturedPayload as TemplateSnapshotPayload;
      return payload.templateId === templateId;
    });
  }
}

function monthKey(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
