
'use server';

/**
 * @fileOverview THIS FLOW IS DEPRECATED. Use enrich-dataset-flow.ts and enrich-table-flow.ts instead.
 * A metadata enrichment AI agent that uses Gemini to enhance
 * dataset descriptions, add relevant tags, and classify field sensitivity,
 * primary keys, and foreign keys.
 *
 * - enrichMetadata - A function that enriches metadata of datasets, tables, and columns.
 * - EnrichMetadataInput - The input type for the enrichMetadata function.
 * - EnrichMetadataOutput - The return type for the enrichMetadata function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// --- Schemas for what AI is expected to receive (Raw-like but with guidance) ---
const DatasetSchemaForAIInput = z.object({
  Dataset_name: z.string(),
  Dataset_description: z.string().nullable().optional(),
  Tags: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

const TableSchemaForAIInput = z.object({
  TABLE_NAME: z.string(),
  Dataset_name: z.string(),
  source: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  DATABASE_NAME: z.string().nullable().optional(),
  SCHEMA_NAME: z.string().nullable().optional(),
  OWNER: z.string().nullable().optional(),
  PRIMARY_KEYS: z.string().nullable().optional(), // Original PKs, AI will determine per column
  FOREIGN_KEYS: z.string().nullable().optional(), // Original FKs, AI will determine per column
  CREATED_DATE: z.string().nullable().optional(),
  UPDATED_DATE: z.string().nullable().optional(),
  Row_count: z.string().nullable().optional(),
  Description: z.string().nullable().optional(),
  Table_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
});

const ColumnSchemaForAIInput = z.object({
  TABLE_NAME: z.string(),
  COLUMN_NAME: z.string(),
  DATA_TYPE: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), // Original value
  FOREIGN_KEY: z.string().nullable().optional(), // Original value
  column_description: z.string().nullable().optional(),
  Column_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

const EnrichMetadataInputSchema = z.object({
  datasets: z.array(DatasetSchemaForAIInput),
  tables: z.array(TableSchemaForAIInput),
  columns: z.array(ColumnSchemaForAIInput),
});
export type EnrichMetadataInput = z.infer<typeof EnrichMetadataInputSchema>;


// --- Schemas for what AI is expected to *RETURN* (Permissive for certain fields) ---
const DatasetSchemaForAIResponse = z.object({
  Dataset_name: z.string(), // Must be returned to match with input
  Dataset_description: z.string().nullable().optional().describe("Generated or improved dataset description. Can be an empty string or null if no meaningful description can be generated."),
  Tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the dataset. Can be an empty string or null if no meaningful tags can be generated."),
  // Pass-through fields - AI should return them as-is, schema is permissive
  source: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
});

const TableSchemaForAIResponse = z.object({
  TABLE_NAME: z.string(), // Must be returned
  Dataset_name: z.string(), // Must be returned
  Description: z.string().nullable().optional().describe("Generated or improved table description."),
  Table_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown')."),
  // Pass-through fields - AI should return them as-is, schema is permissive
  source: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
  DATABASE_NAME: z.any().nullable().optional(),
  SCHEMA_NAME: z.any().nullable().optional(),
  OWNER: z.any().nullable().optional(),
  // PRIMARY_KEYS and FOREIGN_KEYS on table are not enriched by AI here, done per column
  CREATED_DATE: z.any().nullable().optional(),
  UPDATED_DATE: z.any().nullable().optional(),
  Row_count: z.any().nullable().optional(),
});


const ColumnSchemaForAIResponse = z.object({
  TABLE_NAME: z.string(), // Must be returned
  COLUMN_NAME: z.string(), // Must be returned
  column_description: z.string().nullable().optional().describe("Generated or improved column description."),
  Column_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown')."),
  PRIMARY_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a primary key ('true'/'false' as string, or boolean)."),
  FOREIGN_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a foreign key ('true'/'false' as string, or boolean)."),
  // Pass-through fields - AI should return them as-is, schema is permissive
  DATA_TYPE: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
});

const EnrichMetadataAIResponseSchema = z.object({
  datasets: z.array(DatasetSchemaForAIResponse),
  tables: z.array(TableSchemaForAIResponse),
  columns: z.array(ColumnSchemaForAIResponse),
});


// --- Schemas for what the FLOW will *RETURN* (Strictly typed after normalization) ---
const DatasetSchemaForFlowOutput = DatasetSchemaForAIInput.extend({
  Dataset_description: z.string().nullable().optional(),
  Tags: z.string().nullable().optional(),
});

const TableSchemaForFlowOutput = TableSchemaForAIInput.extend({
  Description: z.string().nullable().optional(),
  Table_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
  // Row_count will be string or null
  Row_count: z.string().nullable().optional(),
});

const ColumnSchemaForFlowOutput = ColumnSchemaForAIInput.extend({
  column_description: z.string().nullable().optional(),
  Column_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), // Should be 'true', 'false', or null
  FOREIGN_KEY: z.string().nullable().optional(), // Should be 'true', 'false', or null
});

const EnrichMetadataFlowOutputSchema = z.object({
  datasets: z.array(DatasetSchemaForFlowOutput),
  tables: z.array(TableSchemaForFlowOutput),
  columns: z.array(ColumnSchemaForFlowOutput),
});
export type EnrichMetadataOutput = z.infer<typeof EnrichMetadataFlowOutputSchema>;


export async function enrichMetadata(input: EnrichMetadataInput): Promise<EnrichMetadataOutput> {
  console.warn("[enrichMetadata DEPRECATED] This bulk enrichment flow is deprecated. Use per-item enrichment flows instead.");
  return enrichMetadataFlow(input);
}

const enrichMetadataPrompt = ai.definePrompt({
  name: 'enrichMetadataPrompt',
  input: {schema: EnrichMetadataInputSchema},
  output: {schema: EnrichMetadataAIResponseSchema}, // AI output can be more permissive
  prompt: `You are a data catalog enrichment assistant. Your primary goal is to analyze the provided raw metadata for datasets, tables, and columns, and then generate or enhance specific fields to improve the catalog's utility.

CRITICAL INSTRUCTION:
- For text fields you are asked to enrich (like descriptions and tags): If the existing text is substantial and seems user-provided or already well-defined, PREFER TO REFINE OR ADD TO IT rather than replacing it wholesale. If the existing text is clearly a placeholder, very sparse, or missing, then generate new, comprehensive content.
- For determination fields (Sensitivity, PRIMARY_KEY, FOREIGN_KEY): Prioritize existing values if they are already provided and seem reasonable. Your role is to fill in blanks or correct obvious errors for these fields.
- You MUST return all original fields for datasets, tables, and columns, even if you don't change them, but with your enriched values for the fields specified below. Preserve data types like strings or null for fields like CREATED_DATE.

Enrichment Tasks:

1.  For Each Dataset:
    *   Dataset_description: Generate or improve the dataset description.
    *   Tags: Generate or improve relevant comma-separated tags.

2.  For Each Table:
    *   Description: Generate or improve the table's description.
    *   Table_tags: Generate or improve relevant comma-separated tags for the table.
    *   Sensitivity: Determine sensitivity level ('low', 'medium', 'high', or 'unknown').

3.  For Each Column:
    *   column_description: Generate or improve the column's description.
    *   Column_tags: Generate or improve relevant comma-separated tags for the column.
    *   Sensitivity: Determine sensitivity level ('low', 'medium', 'high', or 'unknown').
    *   PRIMARY_KEY: Determine if it's likely a primary key. Output 'true' or 'false' (as string or boolean).
    *   FOREIGN_KEY: Determine if it's likely a foreign key. Output 'true' or 'false' (as string or boolean).

Input Context:
- When processing a table, consider its columns and the names of other tables within the same dataset.
- When processing a column, consider its table name and the overall dataset.

Input Data:
Datasets: {{{JSON.stringify(datasets)}}}
Tables: {{{JSON.stringify(tables)}}}
Columns: {{{JSON.stringify(columns)}}}

Output Format:
Ensure your output strictly adheres to the JSON schema. For fields you are asked to generate, if an existing value is good, you can reuse or refine it. If you cannot generate meaningful content, return an empty string "" or null for those specific text fields. For determination fields, provide your best assessment.
`,
});

const enrichMetadataFlow = ai.defineFlow(
  {
    name: 'enrichMetadataFlow',
    inputSchema: EnrichMetadataInputSchema,
    outputSchema: EnrichMetadataFlowOutputSchema, // Flow output is strictly typed
  },
  async (input) => {
    const sanitizedInput = {
        datasets: input.datasets.map(d => ({
            ...d,
            Dataset_description: d.Dataset_description ?? "",
            Tags: d.Tags ?? "",
        })),
        tables: input.tables.map(t => ({
            ...t,
            Description: t.Description ?? "",
            Table_tags: t.Table_tags ?? "",
        })),
        columns: input.columns.map(c => ({
            ...c,
            column_description: c.column_description ?? "",
            Column_tags: c.Column_tags ?? "",
        })),
    };
    
    console.log('[enrichMetadataFlow] Sanitized input for AI:', JSON.stringify(sanitizedInput, null, 2).substring(0, 500) + "...");

    const promptResponse = await enrichMetadataPrompt(sanitizedInput);

    if (!promptResponse || !promptResponse.output) {
      const errorMsg = 'AI enrichment prompt returned no output or malformed response envelope.';
      console.error(errorMsg, 'Full prompt response:', promptResponse);
      throw new Error(errorMsg);
    }

    const aiOutput = promptResponse.output;
    console.log('[enrichMetadataFlow] Raw AI Output:', JSON.stringify(aiOutput, null, 2).substring(0, 500) + "...");


    // Normalize AI output to match FlowOutputSchema
    const normalizedDatasets = (aiOutput.datasets || []).map(d_ai => {
      const originalDataset = input.datasets.find(d_orig => d_orig.Dataset_name === d_ai.Dataset_name);
      if (!originalDataset) {
        console.warn(`[enrichMetadataFlow-Normalize] AI returned dataset "${d_ai.Dataset_name}" not found in original input. Skipping.`);
        return null;
      }
      const finalDescription = d_ai.Dataset_description ?? originalDataset.Dataset_description ?? null;
      const finalTags = d_ai.Tags ?? originalDataset.Tags ?? null;
      
      // Log detailed decision for the first dataset's description
      if (input.datasets.indexOf(originalDataset) === 0) {
        console.log(`[enrichMetadataFlow-Normalize-Dataset: ${d_ai.Dataset_name}] AI Desc: "${d_ai.Dataset_description}", Orig Desc: "${originalDataset.Dataset_description}", Final Desc: "${finalDescription}"`);
        console.log(`[enrichMetadataFlow-Normalize-Dataset: ${d_ai.Dataset_name}] AI Tags: "${d_ai.Tags}", Orig Tags: "${originalDataset.Tags}", Final Tags: "${finalTags}"`);
      }

      return {
        ...originalDataset, // Start with all original fields
        ...d_ai, // Overlay with AI fields (permissive types)
        Dataset_description: finalDescription,
        Tags: finalTags,
        // Ensure pass-through fields are strings or null if they came as 'any'
        source: String(d_ai.source ?? originalDataset.source ?? null),
        location: String(d_ai.location ?? originalDataset.location ?? null),
      };
    }).filter(Boolean) as z.infer<typeof DatasetSchemaForFlowOutput>[];

    const normalizedTables = (aiOutput.tables || []).map(t_ai => {
      const originalTable = input.tables.find(t_orig => t_orig.TABLE_NAME === t_ai.TABLE_NAME && t_orig.Dataset_name === t_ai.Dataset_name);
      if (!originalTable) {
        console.warn(`[enrichMetadataFlow-Normalize] AI returned table "${t_ai.TABLE_NAME}" (Dataset: ${t_ai.Dataset_name}) not found in original input. Skipping.`);
        return null;
      }
      return {
        ...originalTable,
        ...t_ai,
        Description: t_ai.Description ?? originalTable.Description ?? null,
        Table_tags: t_ai.Table_tags ?? originalTable.Table_tags ?? null,
        Sensitivity: t_ai.Sensitivity ?? originalTable.Sensitivity ?? 'unknown',
        // Normalize pass-through fields that might be 'any' from AI
        source: String(t_ai.source ?? originalTable.source ?? null),
        location: String(t_ai.location ?? originalTable.location ?? null),
        DATABASE_NAME: String(t_ai.DATABASE_NAME ?? originalTable.DATABASE_NAME ?? null),
        SCHEMA_NAME: String(t_ai.SCHEMA_NAME ?? originalTable.SCHEMA_NAME ?? null),
        OWNER: String(t_ai.OWNER ?? originalTable.OWNER ?? null),
        CREATED_DATE: String(t_ai.CREATED_DATE ?? originalTable.CREATED_DATE ?? null),
        UPDATED_DATE: String(t_ai.UPDATED_DATE ?? originalTable.UPDATED_DATE ?? null),
        Row_count: t_ai.Row_count !== undefined && t_ai.Row_count !== null ? String(t_ai.Row_count) : (originalTable.Row_count ?? null),
      };
    }).filter(Boolean) as z.infer<typeof TableSchemaForFlowOutput>[];

    const normalizedColumns = (aiOutput.columns || []).map(c_ai => {
      const originalColumn = input.columns.find(c_orig => c_orig.COLUMN_NAME === c_ai.COLUMN_NAME && c_orig.TABLE_NAME === c_ai.TABLE_NAME);
      if (!originalColumn) {
         console.warn(`[enrichMetadataFlow-Normalize] AI returned column "${c_ai.COLUMN_NAME}" (Table: ${c_ai.TABLE_NAME}) not found in original input. Skipping.`);
        return null;
      }
      
      let pkFinalValue: string | null = null;
      if (typeof c_ai.PRIMARY_KEY === 'boolean') {
        pkFinalValue = c_ai.PRIMARY_KEY ? 'true' : 'false';
      } else if (typeof c_ai.PRIMARY_KEY === 'string' && (c_ai.PRIMARY_KEY.toLowerCase() === 'true' || c_ai.PRIMARY_KEY.toLowerCase() === 'false')) {
        pkFinalValue = c_ai.PRIMARY_KEY.toLowerCase();
      } else {
        pkFinalValue = originalColumn.PRIMARY_KEY ?? null; // Fallback to original if AI's value is not clearly true/false
      }

      let fkFinalValue: string | null = null;
      if (typeof c_ai.FOREIGN_KEY === 'boolean') {
        fkFinalValue = c_ai.FOREIGN_KEY ? 'true' : 'false';
      } else if (typeof c_ai.FOREIGN_KEY === 'string' && (c_ai.FOREIGN_KEY.toLowerCase() === 'true' || c_ai.FOREIGN_KEY.toLowerCase() === 'false')) {
        fkFinalValue = c_ai.FOREIGN_KEY.toLowerCase();
      } else {
         fkFinalValue = originalColumn.FOREIGN_KEY ?? null; // Fallback
      }

      return {
        ...originalColumn,
        ...c_ai,
        column_description: c_ai.column_description ?? originalColumn.column_description ?? null,
        Column_tags: c_ai.Column_tags ?? originalColumn.Column_tags ?? null,
        Sensitivity: c_ai.Sensitivity ?? originalColumn.Sensitivity ?? 'unknown',
        PRIMARY_KEY: pkFinalValue,
        FOREIGN_KEY: fkFinalValue,
        // Normalize pass-through
        DATA_TYPE: String(c_ai.DATA_TYPE ?? originalColumn.DATA_TYPE ?? null),
        location: String(c_ai.location ?? originalColumn.location ?? null),
      };
    }).filter(Boolean) as z.infer<typeof ColumnSchemaForFlowOutput>[];
    
    const finalOutput = {
      datasets: normalizedDatasets,
      tables: normalizedTables,
      columns: normalizedColumns,
    };
    
    console.log('[enrichMetadataFlow] Processed & Normalized Output:', JSON.stringify(finalOutput, null, 2).substring(0, 500) + "...");
    return finalOutput;
  }
);
