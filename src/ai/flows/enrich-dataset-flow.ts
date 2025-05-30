
'use server';
/**
 * @fileOverview A metadata enrichment AI agent for a single dataset.
 *
 * - enrichDatasetFlow - A function that enriches a single dataset's description and tags.
 * - EnrichDatasetInput - The input type for the enrichDatasetFlow.
 * - EnrichDatasetOutput - The return type for the enrichDatasetFlow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { RawDataset } from '@/types';

const EnrichDatasetInputSchema = z.object({
  datasetToEnrich: z.object({
    Dataset_name: z.string(),
    Dataset_description: z.string().nullable().optional(),
    Tags: z.string().nullable().optional(),
    source: z.string().nullable().optional(), // Retain for context if needed by AI
    location: z.string().nullable().optional(), // Retain for context
  }),
  tableNamesInDataset: z.array(z.string()).describe("A list of table names belonging to this dataset, to provide context for enrichment."),
});
export type EnrichDatasetInput = z.infer<typeof EnrichDatasetInputSchema>;

const EnrichDatasetOutputSchema = z.object({
  Dataset_name: z.string(), // Must be returned to match with input
  Dataset_description: z.string().nullable().optional().describe("Generated or improved dataset description. Can be an empty string or null if no meaningful description can be generated."),
  Tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the dataset. Can be an empty string or null if no meaningful tags can be generated."),
});
export type EnrichDatasetOutput = z.infer<typeof EnrichDatasetOutputSchema>;

export async function enrichSingleDataset(input: EnrichDatasetInput): Promise<EnrichDatasetOutput> {
  return enrichDatasetFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enrichDatasetPrompt',
  input: {schema: EnrichDatasetInputSchema},
  output: {schema: EnrichDatasetOutputSchema},
  prompt: `You are a data catalog enrichment assistant. Your task is to enrich the metadata for a single dataset.

Dataset Context:
Dataset Name: {{datasetToEnrich.Dataset_name}}
Existing Description: {{#if datasetToEnrich.Dataset_description}}{{datasetToEnrich.Dataset_description}}{{else}}Not provided{{/if}}
Existing Tags: {{#if datasetToEnrich.Tags}}{{datasetToEnrich.Tags}}{{else}}Not provided{{/if}}
Source: {{datasetToEnrich.source}}
Location: {{datasetToEnrich.location}}

Table Names in this Dataset (for context):
{{#if tableNamesInDataset}}
{{#each tableNamesInDataset}}
- {{this}}
{{/each}}
{{else}}
No table names provided for context.
{{/if}}

Enrichment Tasks for Dataset "{{datasetToEnrich.Dataset_name}}":
1.  Dataset_description: Generate or improve the dataset description. It should be concise and informative, reflecting the dataset's purpose based on its name, existing metadata, and the names of tables it contains. If the existing description is good, you can refine it. If no meaningful description can be generated, return an empty string or null.
2.  Tags: Generate or improve relevant comma-separated keywords or phrases for the dataset. Consider the dataset name, its (new or existing) description, and its table names. If no meaningful tags can be generated, return an empty string or null.

Output Format:
Ensure your output strictly adheres to the JSON schema, returning the Dataset_name along with the enriched Dataset_description and Tags.
`,
});

const enrichDatasetFlow = ai.defineFlow(
  {
    name: 'enrichDatasetFlow',
    inputSchema: EnrichDatasetInputSchema,
    outputSchema: EnrichDatasetOutputSchema,
  },
  async (input) => {
    const sanitizedInput = {
      ...input,
      datasetToEnrich: {
        ...input.datasetToEnrich,
        Dataset_description: input.datasetToEnrich.Dataset_description || "",
        Tags: input.datasetToEnrich.Tags || "",
      }
    };
    const {output} = await prompt(sanitizedInput);
    if (!output) {
      throw new Error('AI enrichment for dataset returned no output.');
    }
    // Ensure Dataset_name is returned correctly, as it's key for mapping
    return {
        Dataset_name: input.datasetToEnrich.Dataset_name, 
        Dataset_description: output.Dataset_description,
        Tags: output.Tags,
    };
  }
);
