
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
import { addLog } from '@/lib/log-store';

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
  addLog(`[Genkit Flow: enrichSingleDataset] Invoked for dataset: ${input.datasetToEnrich.Dataset_name}. Tables for context: ${input.tableNamesInDataset.length}`);
  try {
    const result = await enrichDatasetFlow(input);
    addLog(`[Genkit Flow: enrichSingleDataset] Successfully completed for ${input.datasetToEnrich.Dataset_name}. Output: ${JSON.stringify(result).substring(0,200)}...`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    addLog(`[Genkit Flow: enrichSingleDataset] Error for dataset ${input.datasetToEnrich.Dataset_name}: ${errorMessage}`);
    throw error;
  }
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
    addLog(`[Genkit Flow Step: enrichDatasetFlow (internal)] Input for dataset ${input.datasetToEnrich.Dataset_name}: ${JSON.stringify(input.datasetToEnrich).substring(0,200)}...`);
    const sanitizedInput = {
      ...input,
      datasetToEnrich: {
        ...input.datasetToEnrich,
        Dataset_description: input.datasetToEnrich.Dataset_description || "",
        Tags: input.datasetToEnrich.Tags || "",
      }
    };

    let outputFromPrompt;
    try {
      const result = await prompt(sanitizedInput);
      outputFromPrompt = result.output;
      if (!outputFromPrompt) {
        addLog(`[Genkit Prompt: enrichDatasetPrompt] Error for dataset ${input.datasetToEnrich.Dataset_name}: Returned no output object.`);
        throw new Error('AI enrichment for dataset returned no output.');
      }
      addLog(`[Genkit Prompt: enrichDatasetPrompt] Response for ${input.datasetToEnrich.Dataset_name}: ${JSON.stringify(outputFromPrompt).substring(0,200)}...`);
    } catch (e) {
      const promptError = e instanceof Error ? e.message : String(e);
      addLog(`[Genkit Prompt: enrichDatasetPrompt] Execution Error for ${input.datasetToEnrich.Dataset_name}: ${promptError}`);
      throw e;
    }
    
    const finalOutput = {
        Dataset_name: input.datasetToEnrich.Dataset_name, 
        Dataset_description: outputFromPrompt.Dataset_description,
        Tags: outputFromPrompt.Tags,
    };
    addLog(`[Genkit Flow Step: enrichDatasetFlow (internal)] Output for ${input.datasetToEnrich.Dataset_name}: ${JSON.stringify(finalOutput).substring(0,200)}...`);
    return finalOutput;
  }
);

