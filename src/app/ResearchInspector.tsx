import { Panel } from "../components/Panel";

export interface InspectorSummary {
  selected: string;
  reason: string;
  status: string;
  details?: Array<{ label: string; value: string | number }>;
}

export interface ResearchInspectorProps {
  modelLabel: string;
  modelDescription: string;
  summary: InspectorSummary;
  warnings: string[];
}

export function ResearchInspector({
  modelLabel,
  modelDescription,
  summary,
  warnings,
}: ResearchInspectorProps) {
  return (
    <>
      <Panel
        title="Focus Inspector"
        actions={<span className="status-pill">{modelLabel}</span>}
      >
        <p className="model-summary">{modelDescription}</p>
        <InspectorAnswer
          heading="What is selected?"
          answer={summary.selected}
        />
        <InspectorAnswer heading="Why is it here?" answer={summary.reason} />
        <InspectorAnswer heading="Exact or drawing?" answer={summary.status} />
        {summary.details && summary.details.length > 0 ? (
          <details className="advanced-details compact-details">
            <summary>Selection details</summary>
            <dl className="inspector-definition-list">
              {summary.details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </Panel>

      <Panel
        title="Caveats"
        actions={<span className="warning-pill">{warnings.length}</span>}
      >
        {warnings.length === 0 ? (
          <p className="field-help">No active caveats.</p>
        ) : (
          <details className="compact-details">
            <summary>{warnings[0]}</summary>
            <ul className="warning-list">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
      </Panel>
    </>
  );
}

function InspectorAnswer({
  heading,
  answer,
}: {
  heading: string;
  answer: string;
}) {
  return (
    <section className="inspector-question">
      <h3>{heading}</h3>
      <p>{answer}</p>
    </section>
  );
}
