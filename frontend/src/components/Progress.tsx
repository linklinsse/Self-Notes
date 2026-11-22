/** NOTE-4: how much of a checklist is done, as a bar and "checked/total". Nothing for an empty list. */
export function Progress({ checked, total, className }: { checked: number; total: number; className?: string }) {
  if (total === 0) return null;
  return (
    <div
      className={`progress ${className ?? ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={checked}
      aria-label={`${checked} of ${total} done`}
    >
      <div className="progress-bar">
        <span style={{ width: `${Math.round((checked / total) * 100)}%` }} />
      </div>
      <span className="progress-label">
        {checked}/{total}
      </span>
    </div>
  );
}
