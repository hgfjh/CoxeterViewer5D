export interface ImportRepairSuggestion {
  id: string;
  label: string;
  detail: string;
}

export function importRepairSuggestions(
  message: string,
): ImportRepairSuggestion[] {
  const lower = message.toLowerCase();
  const suggestions: ImportRepairSuggestion[] = [];

  if (lower.includes("schemaversion")) {
    suggestions.push({
      id: "schema-version",
      label: "Check schemaVersion",
      detail:
        "The viewer accepts the current schema only. Use the migration script before importing older artifacts.",
    });
  }
  if (lower.includes("generator") || lower.includes("unknown")) {
    suggestions.push({
      id: "generator-ids",
      label: "Check generator ids",
      detail:
        "Generator ids, edge labels, and cell generator pairs must refer to the source system rank.",
    });
  }
  if (
    lower.includes("cell") ||
    lower.includes("edge") ||
    lower.includes("vertex")
  ) {
    suggestions.push({
      id: "references",
      label: "Check references",
      detail:
        "Cells should reference existing vertices and edges; clipped or missing boundaries should stay warnings, not filled cells.",
    });
  }
  if (
    lower.includes("certificate") ||
    lower.includes("hash") ||
    lower.includes("torsion") ||
    lower.includes("manifold")
  ) {
    suggestions.push({
      id: "certificate-claims",
      label: "Check certificate claims",
      detail:
        "The app will not promote quotient, manifold, or theorem-level claims without passed certificate metadata and matching hashes.",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      id: "validate-json",
      label: "Validate JSON shape",
      detail:
        "Confirm this is a Coxeter system, generated Cayley ball, or quotient complex JSON file.",
    });
  }

  return suggestions;
}
