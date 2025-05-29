
'use server';

/**
 * @fileOverview A metadata enrichment AI agent that uses Gemini to enhance
 * dataset descriptions, add relevant tags, and classify field sensitivity.
 *
 * - enrichMetadata - A function that enriches metadata of datasets, tables, and columns.
 * - EnrichMetadataInput - The input type for the enrichMetadata function.
 * - EnrichMetadataOutput - The return type for the enrichMetadata function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { RawDataset, RawTable, RawColumn } from '@/types';


// Define Zod schemas based on Raw types for AI input/output
// These should match the structure the AI is expected to receive and produce,
// which aligns with the Raw types plus nullability for optional fields.

const DatasetSchemaForAI = z.object({
  Dataset_name: z.string(),
  Dataset_description: z.string().nullable().optional(),
  Tags: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

const TableSchemaForAI = z.object({
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
  Description: z.string().nullable().optional(), // AI enriches this
  Table_tags: z.string().nullable().optional(), // AI enriches this
  Sensitivity: z.string().nullable().optional(),
});

const ColumnSchemaForAI = z.object({
  TABLE_NAME: z.string(),
  COLUMN_NAME: z.string(),
  DATA_TYPE: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), // Expect 'true'/'false' as string
  FOREIGN_KEY: z.string().nullable().optional(), // Expect 'true'/'false' as string
  column_description: z.string().nullable().optional(), // AI enriches this
  Column_tags: z.string().nullable().optional(), // AI enriches this
  Sensitivity: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});


const EnrichMetadataInputSchema = z.object({
  datasets: z.array(DatasetSchemaForAI),
  tables: z.array(TableSchemaForAI),
  columns: z.array(ColumnSchemaForAI),
});
export type EnrichMetadataInput = z.infer<typeof EnrichMetadataInputSchema>;

const EnrichMetadataOutputSchema = z.object({
  datasets: z.array(DatasetSchemaForAI.extend({
    Dataset_description: z.string().nullable().optional().describe("Enriched dataset description. Can be an empty string if no meaningful description can be generated."),
  })),
  tables: z.array(TableSchemaForAI.extend({
    Description: z.string().nullable().optional().describe("Enriched table description. Can be an empty string if no meaningful description can be generated."),
    Table_tags: z.string().nullable().optional().describe("Enriched table tags. Can be an empty string if no meaningful tags can be generated."),
  })),
  columns: z.array(ColumnSchemaForAI.extend({
    column_description: z.string().nullable().optional().describe("Enriched column description. Can be an empty string if no meaningful description can be generated."),
    Column_tags: z.string().nullable().optional().describe("Enriched column tags. Can be an empty string if no meaningful tags can be generated."),
  })),
});
export type EnrichMetadataOutput = z.infer<typeof EnrichMetadataOutputSchema>;


export async function enrichMetadata(input: EnrichMetadataInput): Promise<EnrichMetadataOutput> {
  return enrichMetadataFlow(input);
}

const enrichMetadataPrompt = ai.definePrompt({
  name: 'enrichMetadataPrompt',
  input: {schema: EnrichMetadataInputSchema},
  output: {schema: EnrichMetadataOutputSchema},
  prompt: `You are a metadata enrichment assistant. Your task is to enhance the provided dataset, table, and column metadata. Specifically, if descriptions or tags are missing or sparse, you should generate or improve them.
- For datasets, enrich 'Dataset_description'.
- For tables, enrich 'Description' and 'Table_tags'.
- For columns, enrich 'column_description' and 'Column_tags'.

If a description or tag field is already populated, you can choose to refine it or leave it as is if it's good quality.
Preserve all other existing fields, including 'Sensitivity', 'source', 'location', primary/foreign keys, etc.
Ensure the output strictly adheres to the provided JSON schema.

Datasets: {{{JSON.stringify(datasets)}}}
Tables: {{{JSON.stringify(tables)}}}
Columns: {{{JSON.stringify(columns)}}}`,
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
        datasets: input.datasets.map(d => ({...d, Dataset_description: d.Dataset_description || ""})),
        tables: input.tables.map(t => ({...t, Description: t.Description || "", Table_tags: t.Table_tags || ""})),
        columns: input.columns.map(c => ({...c, column_description: c.column_description || "", Column_tags: c.Column_tags || ""})),
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
