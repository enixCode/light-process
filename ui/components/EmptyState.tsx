interface Props {
  children: React.ReactNode;
  variant?: 'list' | 'page';
}

export function EmptyState({ children, variant = 'list' }: Props) {
  const padding = variant === 'page' ? 'py-16' : 'py-10 px-4';
  return (
    <div className={`text-[13px] text-center ${padding} text-fg-muted`}>
      {children}
    </div>
  );
}
