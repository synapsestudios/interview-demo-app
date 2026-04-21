export function StatusBadge({
  status,
}: {
  status: 'draft' | 'in_progress' | 'submitted' | 'published' | 'archived';
}) {
  const label = {
    draft: 'Draft',
    in_progress: 'In progress',
    submitted: 'Submitted',
    published: 'Published',
    archived: 'Archived',
  }[status];
  return <span className={`badge status-${status}`}>{label}</span>;
}

export function BandChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="badge band" style={{ color }}>
      {label}
    </span>
  );
}
