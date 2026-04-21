export function PageHead({
  eyebrow,
  title,
  dek,
  note,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  dek?: string;
  note?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && (
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            {eyebrow}
          </div>
        )}
        <h1>{title}</h1>
        {dek && <div className="dek">{dek}</div>}
        {note && <div className="page-head-note">{note}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
