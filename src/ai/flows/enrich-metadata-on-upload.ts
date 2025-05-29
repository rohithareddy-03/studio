
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
  Dataset_description: z.string().optional(),
  Tags: z.string().optional(),
  source: z.string().optional(), // Changed from SOURCE
  location: z.string().optional(), // Added location
});

const TableSchema = z.object({
  TABLE_NAME: z.string(),
  Dataset_name: z.string(),
  source: z.string().optional(), // Changed from SOURCE
  location: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
  SCHEMA_NAME: z.string().optional(),
  OWNER: z.string().optional(),
  PRIMARY_KEYS: z.string().optional(),
  FOREIGN_KEYS: z.string().optional(),
  CREATED_DATE: z.string().optional(),
  UPDATED_DATE: z.string().optional(),
  Row_count: z.string().optional(),
  Description: z.string().optional(),
  Table_tags: z.string().optional(),
  Sensitivity: z.string().optional(),
});

const ColumnSchema = z.object({
  TABLE_NAME: z.string(),
  COLUMN_NAME: z.string(),
  DATA_TYPE: z.string().optional(),
  PRIMARY_KEY: z.string().optional(),
  FOREIGN_KEY: z.string().optional(),
  column_description: z.string().optional(), // Changed from description
  Column_tags: z.string().optional(),
  Sensitivity: z.string().optional(),
  location: z.string().optional(), // Added location
});

const EnrichMetadataInputSchema = z.object({
  datasets: z.array(DatasetSchema),
  tables: z.array(TableSchema),
  columns: z.array(ColumnSchema),
});

export type EnrichMetadataInput = z.infer<typeof EnrichMetadataInputSchema>;

// Output schema should mirror input, as AI will return the full structure with enrichments
const EnrichMetadataOutputSchema = z.object({
  datasets: z.array(DatasetSchema.extend({
    Dataset_description: z.string().describe("Enriched dataset description."), // Ensure description is string in output
  })),
  tables: z.array(TableSchema.extend({
    Description: z.string().describe("Enriched table description."), // Ensure description is string
    Table_tags: z.string().describe("Enriched table tags."), // Ensure tags are string
  })),
  columns: z.array(ColumnSchema.extend({
    column_description: z.string().describe("Enriched column description."), // Ensure description is string
    Column_tags: z.string().describe("Enriched column tags."), // Ensure tags are string
  })),
});

export type EnrichMetadataOutput = z.infer<typeof EnrichMetadataOutputSchema>;

export async function enrichMetadata(input: EnrichMetadataInput): Promise<EnrichedMetadataOutput> {
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
    const sanitizedInput = {
        datasets: input.datasets.map(d => ({...d, Dataset_description: d.Dataset_description || ""})),
        tables: input.tables.map(t => ({...t, Description: t.Description || "", Table_tags: t.Table_tags || ""})),
        columns: input.columns.map(c => ({...c, column_description: c.column_description || "", Column_tags: c.Column_tags || ""})),
    };
    const {output} = await enrichMetadataPrompt(sanitizedInput);
    return output!;
  }
);

