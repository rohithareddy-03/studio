
// src/ai/flows/chat-integration-with-gemini.ts
'use server';

/**
 * @fileOverview Integrates Gemini with a chat interface to generate SQL queries and dataset summaries,
 * maintaining conversation history and strict focus on catalog data.
 *
 * - chatWithGemini - A function that handles the chat interaction with Gemini.
 * - ChatWithGeminiInput - The input type for the chatWithGemini function.
 * - ChatWithGeminiOutput - The return type for the chatWithGemini function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(z.object({text: z.string()})),
});
export type ChatMessageHistory = z.infer<typeof ChatMessageSchema>;

const ChatWithGeminiInputSchema = z.object({
  query: z.string().describe('The user current query.'),
  datasetDescription: z.string().optional().describe('The description of the selected dataset.'),
  tableMetadata: z.string().optional().describe('Metadata about the selected table, as a JSON string.'),
  history: z.array(ChatMessageSchema).optional().describe('Previous messages in the conversation.'),
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
  prompt: `You are DataSage, a specialized AI assistant for data catalog exploration.
Your ONLY purpose is to help users understand and query the provided dataset context, using the conversation history to understand follow-up questions.
You MUST strictly adhere to the following rules:
1. ONLY answer questions directly related to the dataset description and table metadata provided in the "Dataset Context" section, OR questions that are direct follow-ups, clarifications, or modifications to SQL queries or summaries you have previously generated in this conversation.
2. If a question is outside this scope (e.g., social chat, general knowledge, harmful, unrelated topics, coding help, or any topic not directly about the provided data catalog information or your prior responses in this conversation), you MUST politely refuse to answer. State that you are an assistant for data catalog queries only and cannot help with that specific request. Do not attempt to answer it, apologize, or provide any information beyond this refusal.
3. Use Markdown for all your responses, especially for SQL queries and summaries.

Dataset Context:
{{#if datasetDescription}}
Dataset Description: {{{datasetDescription}}}
{{/if}}

{{#if tableMetadata}}
Available Table Metadata:
{{{tableMetadata}}}
{{/if}}

User's current question:
{{{query}}}
  `,
});

const chatWithGeminiFlow = ai.defineFlow(
  {
    name: 'chatWithGeminiFlow',
    inputSchema: ChatWithGeminiInputSchema,
    outputSchema: ChatWithGeminiOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input, {history: input.history});
    return output!;
  }
);

