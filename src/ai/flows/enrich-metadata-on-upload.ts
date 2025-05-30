
'use server';

/**
 * @fileOverview A metadata enrichment AI agent that uses Gemini to enhance
 * dataset descriptions, add relevant tags, and classify field sensitivity,
 * primary keys, and foreign keys. This flow handles bulk enrichment.
 *
 * - enrichMetadata - A function that enriches metadata of datasets, tables, and columns.
 * - EnrichMetadataInput - The input type for the enrichMetadata function.
 * - EnrichMetadataOutput - The return type for the enrichMetadata function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { RawDataset, RawTable, RawColumn } from '@/types';


// Schemas for AI Input (matching Raw types, allowing null for optional fields)
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
  PRIMARY_KEYS: z.string().nullable().optional(),
  FOREIGN_KEYS: z.string().nullable().optional(),
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
  PRIMARY_KEY: z.string().nullable().optional(),
  FOREIGN_KEY: z.string().nullable().optional(),
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


// Schemas for AI's Direct Response (more permissive for some fields)
const DatasetSchemaForAIResponse = z.object({
  Dataset_name: z.string(),
  Dataset_description: z.string().nullable().optional().describe("Generated or improved dataset description. If existing description is good, refine it or keep it. If empty or placeholder, generate a new one. Can be empty string/null if no meaningful description can be generated."),
  Tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the dataset. If existing tags are good, refine them or keep them. If empty or placeholder, generate new ones. Can be empty string/null if no meaningful tags can be generated."),
  source: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
});

const TableSchemaForAIResponse = z.object({
  TABLE_NAME: z.string(),
  Dataset_name: z.string(),
  Description: z.string().nullable().optional().describe("Generated or improved table description. If existing description is good, refine it or keep it. If empty or placeholder, generate a new one. Can be empty string/null if no meaningful description can be generated."),
  Table_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table. If existing tags are good, refine them or keep them. If empty or placeholder, generate new ones. Can be empty string/null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Prioritize existing reasonable values."),
  source: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
  DATABASE_NAME: z.any().nullable().optional(),
  SCHEMA_NAME: z.any().nullable().optional(),
  OWNER: z.any().nullable().optional(),
  PRIMARY_KEYS: z.any().nullable().optional(), // Existing string from Excel if present
  FOREIGN_KEYS: z.any().nullable().optional(), // Existing string from Excel if present
  CREATED_DATE: z.any().nullable().optional(),
  UPDATED_DATE: z.any().nullable().optional(),
  Row_count: z.any().nullable().optional(),
});

const ColumnSchemaForAIResponse = z.object({
  TABLE_NAME: z.string(),
  COLUMN_NAME: z.string(),
  column_description: z.string().nullable().optional().describe("Generated or improved column description. If existing description is good, refine it or keep it. If empty or placeholder, generate a new one. Can be empty string/null if no meaningful description can be generated."),
  Column_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column. If existing tags are good, refine them or keep them. If empty or placeholder, generate new ones. Can be empty string/null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Prioritize existing reasonable values."),
  PRIMARY_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a primary key ('true' or 'false' as a string, or boolean). Prioritize existing reasonable values."),
  FOREIGN_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a foreign key ('true' or 'false' as a string, or boolean). Prioritize existing reasonable values."),
  DATA_TYPE: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
});

const EnrichMetadataAIResponseSchema = z.object({
  datasets: z.array(DatasetSchemaForAIResponse),
  tables: z.array(TableSchemaForAIResponse),
  columns: z.array(ColumnSchemaForAIResponse),
});


// Schemas for the Flow's final, strictly-typed output
const DatasetSchemaForFlowOutput = DatasetSchemaForAIInput.extend({
  Dataset_description: z.string().nullable().optional(),
  Tags: z.string().nullable().optional(),
});

const TableSchemaForFlowOutput = TableSchemaForAIInput.extend({
  Description: z.string().nullable().optional(),
  Table_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(), // Should be 'low', 'medium', 'high', or 'unknown' or null
});

const ColumnSchemaForFlowOutput = ColumnSchemaForAIInput.extend({
  column_description: z.string().nullable().optional(),
  Column_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(), // Should be 'low', 'medium', 'high', or 'unknown' or null
  PRIMARY_KEY: z.string().nullable().optional(), // Normalized to 'true', 'false', or null
  FOREIGN_KEY: z.string().nullable().optional(), // Normalized to 'true', 'false', or null
});

export const EnrichMetadataFlowOutputSchema = z.object({
  datasets: z.array(DatasetSchemaForFlowOutput),
  tables: z.array(TableSchemaForFlowOutput),
  columns: z.array(ColumnSchemaForFlowOutput),
});
export type EnrichMetadataOutput = z.infer<typeof EnrichMetadataFlowOutputSchema>;


export async function enrichMetadata(input: EnrichMetadataInput): Promise<EnrichMetadataOutput> {
  return enrichMetadataFlow(input);
}

const enrichMetadataPrompt = ai.definePrompt({
  name: 'enrichMetadataPrompt',
  input: {schema: EnrichMetadataInputSchema},
  output: {schema: EnrichMetadataAIResponseSchema}, // AI output is validated against the permissive schema
  prompt: `You are a data catalog enrichment assistant. Your primary goal is to analyze the provided raw metadata for datasets, tables, and columns, and then generate or enhance specific fields to improve the catalog's utility for data analysts and other AI assistants. You must preserve all existing data that you are not explicitly asked to modify or determine.

**CRITICAL INSTRUCTION: If a field like a description or tags already contains substantial, non-placeholder text, treat it as a primary source; this content may have been manually edited by a user. Your role is to refine this existing content for clarity, add to it if necessary, or fill in blanks where content is sparse. Avoid completely replacing well-formed existing content unless it's clearly inadequate or a placeholder (e.g., "to be filled", "description needed", "N/A", or very short/generic").**

## Enrichment Tasks:

1.  **For Each Dataset:**
    *   Generate or improve \`Dataset_description\`: A concise, informative description.
    *   Generate or improve \`Tags\`: Relevant comma-separated keywords.

2.  **For Each Table:**
    *   Generate or improve \`Description\`: A detailed description of the table's purpose, content, and common use cases.
    *   Generate or improve \`Table_tags\`: Relevant comma-separated keywords.
    *   Determine \`Sensitivity\`: Classify as 'low', 'medium', 'high', or 'unknown'.

3.  **For Each Column:**
    *   Generate or improve \`column_description\`: A clear explanation of what the column represents.
    *   Generate or improve \`Column_tags\`: Relevant comma-separated keywords.
    *   Determine \`Sensitivity\`: Classify as 'low', 'medium', 'high', or 'unknown'.
    *   Determine \`PRIMARY_KEY\`: ('true' or 'false' as string, or boolean).
    *   Determine \`FOREIGN_KEY\`: ('true' or 'false' as string, or boolean).

## Input Context:
You will be provided with arrays of datasets, tables, and columns.
- When processing a table, consider its columns and the names of other tables within the same dataset for context.
- When processing a column, consider its table name and the overall dataset.
- **Prioritize existing values for descriptions, tags, Sensitivity, PRIMARY_KEY, and FOREIGN_KEY if they are already provided in the input and seem reasonable or user-edited.** Your role is to fill in blanks or correct obvious errors for these fields.
- For fields like CREATED_DATE, UPDATED_DATE, Row_count, SOURCE, LOCATION, DATABASE_NAME, SCHEMA_NAME, OWNER, DATA_TYPE, if they are present in the input, preserve their original values and string/null types as much as possible.

## Input Data:
Datasets: {{{JSON.stringify(datasets)}}}
Tables: {{{JSON.stringify(tables)}}}
Columns: {{{JSON.stringify(columns)}}}

## Output Format:
Ensure your output strictly adheres to the provided JSON schema. For fields you are asked to generate (like descriptions or tags), if an existing value is good and non-placeholder, refine it or keep it. If you cannot generate a meaningful description or tags, return an empty string "" or null. For determination fields (\`Sensitivity\`, \`PRIMARY_KEY\`, \`FOREIGN_KEY\`), provide your best assessment based on the context. Preserve non-enrichment fields from the input.
`,
});

const enrichMetadataFlow = ai.defineFlow(
  {
    name: 'enrichMetadataFlow',
    inputSchema: EnrichMetadataInputSchema,
    outputSchema: EnrichMetadataFlowOutputSchema, // Flow's final output is validated against the strict schema
  },
  async (input) => {
    // Prepare input for AI: ensure enrichable text fields are at least empty strings if null/undefined
    const sanitizedInput: EnrichMetadataInput = {
        datasets: input.datasets.map(d => ({
            ...d,
            Dataset_description: d.Dataset_description ?? "",
            Tags: d.Tags ?? "",
        })),
        tables: input.tables.map(t => ({
            ...t,
            Description: t.Description ?? "",
            Table_tags: t.Table_tags ?? "",
            // Sensitivity for tables will be determined by AI. Pass existing if available.
        })),
        columns: input.columns.map(c => ({
            ...c,
            column_description: c.column_description ?? "",
            Column_tags: c.Column_tags ?? "",
            // Sensitivity, PRIMARY_KEY, FOREIGN_KEY for columns will be determined by AI. Pass existing if available.
        })),
    };
    console.log('[enrichMetadataFlow] Sanitized input being sent to AI:', JSON.stringify(sanitizedInput, null, 2).substring(0, 1000) + "...");


    const promptResponse = await enrichMetadataPrompt(sanitizedInput);

    if (!promptResponse || !promptResponse.output) {
      const errorMsg = 'AI enrichment prompt returned no output or malformed response envelope.';
      console.error(errorMsg, 'Full prompt response:', promptResponse);
      throw new Error(errorMsg);
    }

    const aiOutput = promptResponse.output as z.infer<typeof EnrichMetadataAIResponseSchema>; // Cast to permissive AI response type

    // --- Normalization and Merging Step ---
    const normalizedOutput: EnrichMetadataOutput = {
      datasets: [],
      tables: [],
      columns: [],
    };

    // Normalize Datasets
    if (aiOutput.datasets && Array.isArray(aiOutput.datasets)) {
      normalizedOutput.datasets = aiOutput.datasets.map((d_ai, index) => {
        const originalDataset = input.datasets.find(ds => ds.Dataset_name === d_ai.Dataset_name) || {} as RawDataset;
        
        const finalDescription = d_ai.Dataset_description ?? originalDataset.Dataset_description ?? null;
        const finalTags = d_ai.Tags ?? originalDataset.Tags ?? null;

        if (index === 0) { // Log only for the first item to avoid flooding
            console.log(`[enrichMetadataFlow-Normalize-Dataset: ${d_ai.Dataset_name}] AI Desc: "${d_ai.Dataset_description}", Original Desc: "${originalDataset.Dataset_description}", Final Desc: "${finalDescription}"`);
            console.log(`[enrichMetadataFlow-Normalize-Dataset: ${d_ai.Dataset_name}] AI Tags: "${d_ai.Tags}", Original Tags: "${originalDataset.Tags}", Final Tags: "${finalTags}"`);
        }

        return {
          Dataset_name: d_ai.Dataset_name,
          Dataset_description: finalDescription,
          Tags: finalTags,
          source: String(d_ai.source ?? originalDataset.source ?? null),
          location: String(d_ai.location ?? originalDataset.location ?? null),
        };
      });
    }


    // Normalize Tables
    if (aiOutput.tables && Array.isArray(aiOutput.tables)) {
      normalizedOutput.tables = aiOutput.tables.map((t_ai, index) => {
        const originalTable = input.tables.find(rt => rt.TABLE_NAME === t_ai.TABLE_NAME && rt.Dataset_name === t_ai.Dataset_name) || {} as RawTable;
        
        const finalDescription = t_ai.Description ?? originalTable.Description ?? null;
        const finalTableTags = t_ai.Table_tags ?? originalTable.Table_tags ?? null;

        if (index === 0) {
            console.log(`[enrichMetadataFlow-Normalize-Table: ${t_ai.TABLE_NAME}] AI Desc: "${t_ai.Description}", Original Desc: "${originalTable.Description}", Final Desc: "${finalDescription}"`);
            console.log(`[enrichMetadataFlow-Normalize-Table: ${t_ai.TABLE_NAME}] AI Tags: "${t_ai.Table_tags}", Original Tags: "${originalTable.Table_tags}", Final Tags: "${finalTableTags}"`);
        }
        
        return {
          TABLE_NAME: t_ai.TABLE_NAME,
          Dataset_name: t_ai.Dataset_name,
          Description: finalDescription,
          Table_tags: finalTableTags,
          Sensitivity: t_ai.Sensitivity ?? originalTable.Sensitivity ?? 'unknown',
          source: String(t_ai.source ?? originalTable.source ?? null),
          location: String(t_ai.location ?? originalTable.location ?? null),
          DATABASE_NAME: String(t_ai.DATABASE_NAME ?? originalTable.DATABASE_NAME ?? null),
          SCHEMA_NAME: String(t_ai.SCHEMA_NAME ?? originalTable.SCHEMA_NAME ?? null),
          OWNER: String(t_ai.OWNER ?? originalTable.OWNER ?? null),
          PRIMARY_KEYS: String(t_ai.PRIMARY_KEYS ?? originalTable.PRIMARY_KEYS ?? null),
          FOREIGN_KEYS: String(t_ai.FOREIGN_KEYS ?? originalTable.FOREIGN_KEYS ?? null),
          CREATED_DATE: t_ai.CREATED_DATE !== undefined && t_ai.CREATED_DATE !== null ? String(t_ai.CREATED_DATE) : (originalTable.CREATED_DATE ?? null),
          UPDATED_DATE: t_ai.UPDATED_DATE !== undefined && t_ai.UPDATED_DATE !== null ? String(t_ai.UPDATED_DATE) : (originalTable.UPDATED_DATE ?? null),
          Row_count: t_ai.Row_count !== undefined && t_ai.Row_count !== null ? String(t_ai.Row_count) : (originalTable.Row_count ?? null),
        };
      });
    }

    // Normalize Columns
    if (aiOutput.columns && Array.isArray(aiOutput.columns)) {
      normalizedOutput.columns = aiOutput.columns.map((c_ai, index) => {
        const originalColumn = input.columns.find(rc => rc.COLUMN_NAME === c_ai.COLUMN_NAME && rc.TABLE_NAME === c_ai.TABLE_NAME) || {} as RawColumn;

        const finalDescription = c_ai.column_description ?? originalColumn.column_description ?? null;
        const finalColumnTags = c_ai.Column_tags ?? originalColumn.Column_tags ?? null;

        let pk_normalized: string | null = null;
        if (typeof c_ai.PRIMARY_KEY === 'boolean') pk_normalized = c_ai.PRIMARY_KEY ? 'true' : 'false';
        else if (typeof c_ai.PRIMARY_KEY === 'string') pk_normalized = c_ai.PRIMARY_KEY.toLowerCase() === 'true' ? 'true' : (c_ai.PRIMARY_KEY.toLowerCase() === 'false' ? 'false' : null);
        else pk_normalized = originalColumn.PRIMARY_KEY ?? null; // Fallback to original if AI provides neither bool nor understandable string

        let fk_normalized: string | null = null;
        if (typeof c_ai.FOREIGN_KEY === 'boolean') fk_normalized = c_ai.FOREIGN_KEY ? 'true' : 'false';
        else if (typeof c_ai.FOREIGN_KEY === 'string') fk_normalized = c_ai.FOREIGN_KEY.toLowerCase() === 'true' ? 'true' : (c_ai.FOREIGN_KEY.toLowerCase() === 'false' ? 'false' : null);
        else fk_normalized = originalColumn.FOREIGN_KEY ?? null;

        if (index === 0) {
             console.log(`[enrichMetadataFlow-Normalize-Column: ${c_ai.COLUMN_NAME}] AI Desc: "${c_ai.column_description}", Original Desc: "${originalColumn.column_description}", Final Desc: "${finalDescription}"`);
        }

        return {
          TABLE_NAME: c_ai.TABLE_NAME,
          COLUMN_NAME: c_ai.COLUMN_NAME,
          column_description: finalDescription,
          Column_tags: finalColumnTags,
          Sensitivity: c_ai.Sensitivity ?? originalColumn.Sensitivity ?? 'unknown',
          PRIMARY_KEY: pk_normalized,
          FOREIGN_KEY: fk_normalized,
          DATA_TYPE: String(c_ai.DATA_TYPE ?? originalColumn.DATA_TYPE ?? null),
          location: String(c_ai.location ?? originalColumn.location ?? null),
        };
      });
    }
    console.log('[enrichMetadataFlow] Output after normalization and merging:', JSON.stringify(normalizedOutput, null, 2).substring(0, 1000) + "...");
    
    // Validate final normalized output against strict schema
    const validationResult = EnrichMetadataFlowOutputSchema.safeParse(normalizedOutput);
    if (!validationResult.success) {
        console.error('[enrichMetadataFlow] Normalized output failed strict schema validation:', validationResult.error.errors);
        throw new Error(`Normalized output failed strict schema validation: ${validationResult.error.message}`);
    }
    
    return validationResult.data;
  }
);
