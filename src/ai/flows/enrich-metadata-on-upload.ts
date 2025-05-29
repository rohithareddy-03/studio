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
  SOURCE: z.string().optional(),
});

const TableSchema = z.object({
  TABLE_NAME: z.string(),
  Dataset_name: z.string(),
  SOURCE: z.string().optional(),
  LOCATION: z.string().optional(),
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
  description: z.string().optional(),
  Column_tags: z.string().optional(),
  Sensitivity: z.string().optional(),
});

const EnrichMetadataInputSchema = z.object({
  datasets: z.array(DatasetSchema),
  tables: z.array(TableSchema),
  columns: z.array(ColumnSchema),
});

export type EnrichMetadataInput = z.infer<typeof EnrichMetadataInputSchema>;

const EnrichMetadataOutputSchema = z.object({
  datasets: z.array(DatasetSchema),
  tables: z.array(TableSchema),
  columns: z.array(ColumnSchema),
});

export type EnrichMetadataOutput = z.infer<typeof EnrichMetadataOutputSchema>;

export async function enrichMetadata(input: EnrichMetadataInput): Promise<EnrichMetadataOutput> {
  return enrichMetadataFlow(input);
}

const enrichMetadataPrompt = ai.definePrompt({
  name: 'enrichMetadataPrompt',
  input: {schema: EnrichMetadataInputSchema},
  output: {schema: EnrichMetadataOutputSchema},
  prompt: `You are a metadata enrichment assistant. Based on the provided dataset structure, provide missing descriptions, relevant tags, and classify the sensitivity of each field. Return a JSON object with updated datasets, tables, and columns.

Datasets: {{{JSON.stringify(datasets)}}
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
    const {output} = await enrichMetadataPrompt(input);
    return output!;
  }
);
