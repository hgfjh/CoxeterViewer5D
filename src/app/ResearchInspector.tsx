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
  // With nothing selected, the summary's reason is the model description
  // already shown above it. Show a selection hint instead of repeating it.
  const nothingSelected = summary.reason === modelDescription;
  const caveatCount = warnings.length;
  return (
    <>
      <Panel
        title="Focus Inspector"
        tourId="focus-inspector"
        actions={<span className="status-pill">{modelLabel}</span>}
      >
        <p className="model-summary">{modelDescription}</p>
        <InspectorAnswer
          heading="What is selected?"
          answer={summary.selected}
        />
        {nothingSelected ? (
          <p className="field-help">
            Click a vertex, edge, or cell in the viewer to inspect it.
          </p>
        ) : (
          <InspectorAnswer heading="Why is it here?" answer={summary.reason} />
        )}
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
        actions={
          <span
            className="warning-pill"
            role="img"
            aria-label={`${caveatCount} active ${caveatCount === 1 ? "caveat" : "caveats"}`}
          >
            {caveatCount}
          </span>
        }
      >
        {caveatCount === 0 ? (
          <p className="field-help">No active caveats.</p>
        ) : (
          <details className="compact-details">
            <summary>
              Show {caveatCount} {caveatCount === 1 ? "caveat" : "caveats"}
            </summary>
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
