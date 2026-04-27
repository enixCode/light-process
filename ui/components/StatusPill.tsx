interface Props {
  status: string;
}

const styles: Record<string, { label: string; color: string; live?: boolean }> = {
  running: { label: 'Running', color: 'var(--color-accent)', live: true },
  success: { label: 'Success', color: 'var(--color-success)' },
  failed: { label: 'Failed', color: 'var(--color-danger)' },
};

export function StatusPill({ status }: Props) {
  const s = styles[status] ?? { label: status, color: 'var(--color-muted)' };
  return (
    <span
      className="badge"
      style={{
        color: s.color,
        borderColor: 'color-mix(in srgb, currentColor 30%, var(--color-border))',
      }}
    >
      <span className={`badge-dot${s.live ? ' live' : ''}`} />
      <span>{s.label}</span>
    </span>
  );
}
