
'use server';

/**
 * @fileOverview A metadata enrichment AI agent that uses Gemini to enhance
 * dataset descriptions, add relevant tags, and classify field sensitivity,
 * primary keys, and foreign keys.
 *
 * - enrichMetadata - A function that enriches metadata of datasets, tables, and columns.
 * - EnrichMetadataInput - The input type for the enrichMetadata function.
 * - EnrichMetadataOutput - The return type for the enrichMetadata function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { RawDataset, RawTable, RawColumn } from '@/types';


// Define Zod schemas based on Raw types for AI input/output
// These should match the structure the AI is expected to receive and produce.

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
  PRIMARY_KEY: z.string().nullable().optional(), // Input might be 'true'/'false' or empty
  FOREIGN_KEY: z.string().nullable().optional(), // Input might be 'true'/'false' or empty
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

// Output Schemas - AI will populate these fields
const DatasetSchemaForAIOutput = DatasetSchemaForAIInput.extend({
  Dataset_description: z.string().nullable().optional().describe("Generated or improved dataset description. Can be an empty string if no meaningful description can be generated."),
  Tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the dataset. Can be an empty string if no meaningful tags can be generated."),
});

const TableSchemaForAIOutput = TableSchemaForAIInput.extend({
  Description: z.string().nullable().optional().describe("Generated or improved table description. Can be an empty string if no meaningful description can be generated."),
  Table_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table. Can be an empty string if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown')."),
});

const ColumnSchemaForAIOutput = ColumnSchemaForAIInput.extend({
  column_description: z.string().nullable().optional().describe("Generated or improved column description. Can be an empty string if no meaningful description can be generated."),
  Column_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column. Can be an empty string if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown')."),
  PRIMARY_KEY: z.string().nullable().optional().describe("Determined if this column is a primary key ('true' or 'false' as a string)."),
  FOREIGN_KEY: z.string().nullable().optional().describe("Determined if this column is a foreign key ('true' or 'false' as a string)."),
});


const EnrichMetadataOutputSchema = z.object({
  datasets: z.array(DatasetSchemaForAIOutput),
  tables: z.array(TableSchemaForAIOutput),
  columns: z.array(ColumnSchemaForAIOutput),
});
export type EnrichMetadataOutput = z.infer<typeof EnrichMetadataOutputSchema>;


export async function enrichMetadata(input: EnrichMetadataInput): Promise<EnrichMetadataOutput> {
  return enrichMetadataFlow(input);
}

const enrichMetadataPrompt = ai.definePrompt({
  name: 'enrichMetadataPrompt',
  input: {schema: EnrichMetadataInputSchema},
  output: {schema: EnrichMetadataOutputSchema},
  prompt: `You are a data catalog enrichment assistant. Your primary goal is to analyze the provided raw metadata for datasets, tables, and columns, and then generate or enhance specific fields to improve the catalog's utility for data analysts and other AI assistants. You must preserve all existing data that you are not explicitly asked to modify or determine.

## Enrichment Tasks:

1.  **For Each Dataset:**
    *   Generate or improve \`Dataset_description\`: A concise, informative description of the dataset.
    *   Generate or improve \`Tags\`: Relevant comma-separated keywords or phrases.

2.  **For Each Table:**
    *   Generate or improve \`Description\`: A detailed description of the table's purpose, content, and common use cases.
    *   Generate or improve \`Table_tags\`: Relevant comma-separated keywords for the table.
    *   Determine \`Sensitivity\`: Classify as 'low', 'medium', or 'high' based on the table's name, its description, and the nature of its columns (e.g., presence of PII, financial data). Default to 'unknown' if unclear.

3.  **For Each Column:**
    *   Generate or improve \`column_description\`: A clear explanation of what the column represents.
    *   Generate or improve \`Column_tags\`: Relevant comma-separated keywords for the column.
    *   Determine \`Sensitivity\`: Classify as 'low', 'medium', or 'high' based on column name, data type, and description. Consider PII, financial data, etc. Default to 'unknown' if unclear.
    *   Determine \`PRIMARY_KEY\`: Based on the column's name (e.g., 'ID', 'PK', '{table_name}_ID') and its nature, determine if it's likely a primary key. Output 'true' or 'false' (as a string). If a value is already provided, you can validate it or refine your decision.
    *   Determine \`FOREIGN_KEY\`: Based on the column's name (e.g., '{related_table}_ID', 'FK_') and its relationship to other tables (if inferable from names), determine if it's likely a foreign key. Output 'true' or 'false' (as a string). If a value is already provided, you can validate it or refine your decision.

## Input Context:

You will be provided with arrays of datasets, tables, and columns.
- When processing a table, consider its columns and the names of other tables within the same dataset for context.
- When processing a column, consider its table name and the overall dataset.
- Give preference to existing values for Sensitivity, PRIMARY_KEY, and FOREIGN_KEY if they are already provided in the input and seem reasonable. Your role is to fill in blanks or correct obvious errors for these determination fields.

## Input Data:

Datasets: {{{JSON.stringify(datasets)}}}
Tables: {{{JSON.stringify(tables)}}}
Columns: {{{JSON.stringify(columns)}}}

## Output Format:
Ensure your output strictly adheres to the provided JSON schema. For fields you are asked to generate (like descriptions or tags), if an existing value is good, you can reuse or refine it. If you cannot generate a meaningful description or tags, return an empty string "" or null for those specific text fields. For determination fields (\`Sensitivity\`, \`PRIMARY_KEY\`, \`FOREIGN_KEY\`), provide your best assessment.
`,
});

const enrichMetadataFlow = ai.defineFlow(
  {
    name: 'enrichMetadataFlow',
    inputSchema: EnrichMetadataInputSchema,
    outputSchema: EnrichMetadataOutputSchema,
  },
  async (input) => {
    // Sanitize input to ensure fields intended for AI generation are at least empty strings if null/undefined
    // This helps guide the AI.
    const sanitizedInput = {
        datasets: input.datasets.map(d => ({
            ...d,
            Dataset_description: d.Dataset_description || "",
            Tags: d.Tags || "",
        })),
        tables: input.tables.map(t => ({
            ...t,
            Description: t.Description || "",
            Table_tags: t.Table_tags || "",
            // Sensitivity for tables will be determined by AI. Pass existing if available.
        })),
        columns: input.columns.map(c => ({
            ...c,
            column_description: c.column_description || "",
            Column_tags: c.Column_tags || "",
            // Sensitivity, PRIMARY_KEY, FOREIGN_KEY for columns will be determined by AI. Pass existing if available.
        })),
    };

    const promptResponse = await enrichMetadataPrompt(sanitizedInput);

    if (!promptResponse || !promptResponse.output) {
      const errorMsg = 'AI enrichment prompt returned no output or malformed response envelope.';
      console.error(errorMsg, 'Full prompt response:', promptResponse);
      throw new Error(errorMsg);
    }

    const output = promptResponse.output;

    if (typeof output !== 'object' || output === null) {
      const errorMsg = `AI enrichment output was not a valid object. Received type: ${typeof output}. Output snippet: ${String(output).substring(0, 200)}`;
      console.error(errorMsg);
      throw new Error(`AI enrichment output was not a valid object. Received type: ${typeof output}.`);
    }

    if (!('datasets' in output && Array.isArray(output.datasets) &&
          'tables' in output && Array.isArray(output.tables) &&
          'columns' in output && Array.isArray(output.columns))) {
        const errorMsg = `AI enrichment output is missing required top-level arrays (datasets, tables, columns) or they are not arrays. Output keys: ${Object.keys(output).join(', ')}`;
        console.error(errorMsg, 'Full output snippet:', JSON.stringify(output, null, 2).substring(0, 500));
        throw new Error('AI enrichment output is missing required top-level arrays or has incorrect structure.');
    }
    
    return output;
  }
);
