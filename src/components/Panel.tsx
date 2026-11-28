import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Stable hook for the guided tour's spotlight (`data-tour`). */
  tourId?: string;
}

export function Panel({ title, actions, children, tourId }: PanelProps) {
  return (
    <section className="panel" data-tour={tourId}>
      <div className="panel-header">
        <h2>{title}</h2>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
