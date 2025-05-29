// src/ai/flows/chat-integration-with-gemini.ts
'use server';

/**
 * @fileOverview Integrates Gemini with a chat interface to generate SQL queries and dataset summaries.
 *
 * - chatWithGemini - A function that handles the chat interaction with Gemini.
 * - ChatWithGeminiInput - The input type for the chatWithGemini function.
 * - ChatWithGeminiOutput - The return type for the chatWithGemini function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatWithGeminiInputSchema = z.object({
  query: z.string().describe('The user query.'),
  datasetDescription: z.string().optional().describe('The description of the selected dataset.'),
  tableMetadata: z.string().optional().describe('Metadata about the selected table, as a JSON string.'),
});
export type ChatWithGeminiInput = z.infer<typeof ChatWithGeminiInputSchema>;

const ChatWithGeminiOutputSchema = z.object({
  response: z.string().describe('The response from Gemini, which could be a SQL query or a dataset summary.'),
});
export type ChatWithGeminiOutput = z.infer<typeof ChatWithGeminiOutputSchema>;

export async function chatWithGemini(input: ChatWithGeminiInput): Promise<ChatWithGeminiOutput> {
  return chatWithGeminiFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatWithGeminiPrompt',
  input: {schema: ChatWithGeminiInputSchema},
  output: {schema: ChatWithGeminiOutputSchema},
  prompt: `You are a data science assistant. A data scientist is asking you questions about a dataset.

  You have access to the following information about the dataset:
  {{#if datasetDescription}}
  Dataset Description: {{{datasetDescription}}}
  {{/if}}

  {{#if tableMetadata}}
  Table Metadata: {{{tableMetadata}}}
  {{/if}}

  Based on this information, answer the following question:
  {{{query}}}

  If the user asks for a SQL query, generate the SQL query. If the user asks for a dataset summary, generate the summary. Use markdown formatting in your responses.
  `,
});

const chatWithGeminiFlow = ai.defineFlow(
  {
    name: 'chatWithGeminiFlow',
    inputSchema: ChatWithGeminiInputSchema,
    outputSchema: ChatWithGeminiOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
