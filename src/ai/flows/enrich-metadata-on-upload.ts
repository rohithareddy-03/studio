
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

const DatasetSchema = z.object({
  Dataset_name: z.string(),
  Dataset_description: z.string().nullable().optional(),
  Tags: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

const TableSchema = z.object({
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

const ColumnSchema = z.object({
  TABLE_NAME: z.string(),
  COLUMN_NAME: z.string(),
  DATA_TYPE: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), // Expect 'true'/'false' as string from Excel for AI
  FOREIGN_KEY: z.string().nullable().optional(), // Expect 'true'/'false' as string from Excel for AI
  column_description: z.string().nullable().optional(),
  Column_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

const EnrichMetadataInputSchema = z.object({
  datasets: z.array(DatasetSchema),
  tables: z.array(TableSchema),
  columns: z.array(ColumnSchema),
});

export type EnrichMetadataInput = z.infer<typeof EnrichMetadataInputSchema>;

const EnrichMetadataOutputSchema = z.object({
  datasets: z.array(DatasetSchema.extend({
    Dataset_description: z.string().nullable().optional().describe("Enriched dataset description. Can be an empty string if no meaningful description can be generated."),
  })),
  tables: z.array(TableSchema.extend({
    Description: z.string().nullable().optional().describe("Enriched table description. Can be an empty string if no meaningful description can be generated."),
    Table_tags: z.string().nullable().optional().describe("Enriched table tags. Can be an empty string if no meaningful tags can be generated."),
  })),
  columns: z.array(ColumnSchema.extend({
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
- For datasets, enrich the 'Dataset_description'.
- For tables, enrich the 'Description' and 'Table_tags'.
- For columns, enrich the 'column_description' and 'Column_tags'.
Preserve all other existing fields, including 'Sensitivity', 'source', and 'location' fields. Return a JSON object with the updated datasets, tables, and columns.

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
  async input => {
    // Ensure optional fields that AI should generate are indeed optional or empty strings for the prompt
    // This sanitization handles undefined, null, or existing empty strings for the specific fields AI will enrich.
    const sanitizedInput = {
        datasets: input.datasets.map(d => ({...d, Dataset_description: d.Dataset_description || ""})),
        tables: input.tables.map(t => ({...t, Description: t.Description || "", Table_tags: t.Table_tags || ""})),
        columns: input.columns.map(c => ({...c, column_description: c.column_description || "", Column_tags: c.Column_tags || ""})),
    };
    const {output} = await enrichMetadataPrompt(sanitizedInput);
    return output!;
  }
);

