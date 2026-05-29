interface StatProps {
  label: string;
  value: string | number;
  testId?: string;
}

export function Stat({ label, value, testId }: StatProps) {
  return (
    <div className="stat" data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
