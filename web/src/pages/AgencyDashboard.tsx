import { useEffect, useMemo, useState } from 'react';
import { api, TemplateListItem, Template } from '../api';
import { PageHead } from '../components/PageHead';
import { BandChip } from '../components/Badge';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';

export function AgencyDashboard({ agencyId }: { agencyId: string }) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [template, setTemplate] = useState<Template | null>(null);
  const [dist, setDist] = useState<{ bucketStart: number; bucketEnd: number; count: number }[] | null>(
    null,
  );
  const [band, setBand] = useState<{ month: string; counts: Record<string, number> }[] | null>(null);

  useEffect(() => {
    api.listTemplates().then((ts) => {
      const published = ts.filter((t) => t.status === 'published');
      setTemplates(published);
      if (!selected && published[0]) setSelected(published[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    api.getTemplate(selected).then(setTemplate);
  }, [selected]);

  useEffect(() => {
    if (!agencyId || !selected) return;
    setDist(null);
    setBand(null);
    api.scoreDistribution(agencyId, selected).then(setDist);
    api.bandCounts(agencyId, selected).then(setBand);
  }, [agencyId, selected]);

  const bandColorByLabel = useMemo(() => {
    const map = new Map<string, string>();
    template?.bands.forEach((b) => map.set(b.label, b.color));
    return map;
  }, [template]);

  const bandLabels = useMemo(
    () => (template?.bands ?? []).map((b) => b.label),
    [template],
  );

  const bandChartData = useMemo(() => {
    if (!band) return [];
    return band.map((row) => {
      const obj: Record<string, string | number> = { month: row.month };
      for (const lbl of bandLabels) obj[lbl] = row.counts[lbl] ?? 0;
      // Include unknown bands seen in data (defensive).
      for (const k of Object.keys(row.counts)) {
        if (!(k in obj)) obj[k] = row.counts[k];
      }
      return obj;
    });
  }, [band, bandLabels]);

  const totalSubmitted = dist?.reduce((n, b) => n + b.count, 0) ?? 0;

  if (!agencyId) return <div className="loading">Choose an agency from the masthead.</div>;

  return (
    <div className="stagger">
      <PageHead
        eyebrow="§ III · Compendium"
        title="Compendium"
        dek="Aggregated view across all submitted casefiles for this instrument. Drafts are omitted. Each instrument version shares a single lineage in this view."
        note={dist ? `${totalSubmitted} submitted casefiles plotted` : 'Loading…'}
      />

      <div className="filters" style={{ marginBottom: 22 }}>
        <span className="filter-label">Instrument</span>
        <select
          className="select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · v{t.version}
            </option>
          ))}
        </select>
        <div className="spacer" />
        {template && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {template.bands.map((b) => (
              <BandChip key={b.id} label={b.label} color={b.color} />
            ))}
          </div>
        )}
      </div>

      <div className="two-col">
        <div className="chart-card">
          <h2>Score distribution</h2>
          <div className="axis-note">0 — 100 · ten-wide buckets · submitted only</div>
          <div className="chart-wrap">
            {dist ? (
              <ResponsiveContainer>
                <BarChart data={dist} margin={{ top: 14, right: 16, left: 0, bottom: 10 }}>
                  <CartesianGrid vertical={false} stroke="#d9d0b9" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="bucketStart"
                    tickFormatter={(v) => `${v}`}
                    tick={{ fontFamily: 'var(--mono)', fontSize: 11, fill: '#8a8172' }}
                    axisLine={{ stroke: '#a89e88' }}
                    tickLine={{ stroke: '#a89e88' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontFamily: 'var(--mono)', fontSize: 11, fill: '#8a8172' }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(16,11,8,0.04)' }}
                    contentStyle={journalTooltip}
                    labelFormatter={(l) => `${l}–${Number(l) + 10}`}
                  />
                  <Bar dataKey="count" fill="#1a140e" radius={0} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="loading" style={{ padding: '40px 0' }}>
                Plotting distribution…
              </div>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h2>Band counts · monthly</h2>
          <div className="axis-note">Stacked by result band</div>
          <div className="chart-wrap">
            {band ? (
              bandChartData.length === 0 ? (
                <div className="empty" style={{ padding: '40px 0' }}>
                  No submitted casefiles yet.
                </div>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={bandChartData} margin={{ top: 14, right: 16, left: 0, bottom: 10 }}>
                    <CartesianGrid vertical={false} stroke="#d9d0b9" strokeDasharray="2 4" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontFamily: 'var(--mono)', fontSize: 11, fill: '#8a8172' }}
                      axisLine={{ stroke: '#a89e88' }}
                      tickLine={{ stroke: '#a89e88' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontFamily: 'var(--mono)', fontSize: 11, fill: '#8a8172' }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip cursor={{ fill: 'rgba(16,11,8,0.04)' }} contentStyle={journalTooltip} />
                    <Legend
                      wrapperStyle={{ fontFamily: 'var(--sans)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4a4239' }}
                    />
                    {[...bandLabels, ...discoverExtraBands(bandChartData, bandLabels)].map((lbl) => (
                      <Bar
                        key={lbl}
                        dataKey={lbl}
                        stackId="a"
                        fill={bandColorByLabel.get(lbl) ?? '#1a140e'}
                        radius={0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : (
              <div className="loading" style={{ padding: '40px 0' }}>
                Plotting months…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const journalTooltip = {
  background: '#faf6ed',
  border: '1px solid #4a4239',
  borderRadius: 0,
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 12,
  color: '#1a140e',
  padding: '8px 10px',
};

function discoverExtraBands(
  rows: Record<string, string | number>[],
  known: string[],
): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (k === 'month' || known.includes(k)) continue;
      seen.add(k);
    }
  }
  return Array.from(seen);
}
