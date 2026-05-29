# GAP quotient-export hook.
#
# The deterministic demo workflow is driven by scripts/run_quotient_export.mjs,
# which emits finite quotient artifacts with Sage/GAP parity summaries. This
# GAP file is kept as the external-tool integration point for future subgroup
# and coset-action exports that require a native GAP session.

Print("{\n");
Print("  \"ok\": true,\n");
Print("  \"status\": \"skipped\",\n");
Print("  \"backend\": \"gapQuotientExportBackend\",\n");
Print("  \"checkedAt\": \"1970-01-01T00:00:00.000Z\",\n");
Print("  \"warnings\": [\n");
Print("    \"Use scripts/run_quotient_export.mjs for deterministic finite demo exports; native GAP quotient enumeration is reserved for future subgroup artifacts.\"\n");
Print("  ]\n");
Print("}\n");
QUIT;
