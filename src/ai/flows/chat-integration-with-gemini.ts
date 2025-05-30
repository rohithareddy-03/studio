
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
Your purpose is to help users understand and query the provided dataset context, using the conversation history to understand follow-up questions.

You MUST strictly adhere to the following rules:

1.  **Primary Focus on Provided Data:**
    *   You MUST answer questions that are directly related to the "Dataset Context" (which includes the Dataset Description and Table Metadata) provided below.

2.  **Handling Follow-up Questions:**
    *   You ARE PERMITTED and ENCOURAGED to answer questions that are direct follow-ups, clarifications, or modifications to SQL queries or summaries that YOU (DataSage) have previously generated in the current conversation.
    *   Use the conversation history to identify if the user's current query is a follow-up to your prior responses.

3.  **Strict Refusal for Out-of-Scope Questions:**
    *   If the user's question is NOT directly related to the "Dataset Context" (as per Rule 1) AND is NOT a direct follow-up to your previous responses in this conversation (as per Rule 2), then you MUST politely refuse to answer.
    *   Examples of out-of-scope questions include: social chat, general knowledge, harmful content, unrelated topics, coding help not directly related to analyzing the provided data or your generated SQL.

4.  **Refusal Protocol:**
    *   When refusing an out-of-scope question, respond ONLY with: "I am DataSage, an AI assistant for data catalog queries. I can only help with questions about the provided dataset or follow-ups to my previous responses about it."
    *   Do NOT apologize, try to answer the unrelated question, or provide any information beyond this specific refusal message.

5.  **Output Formatting:**
    *   Use Markdown for all your responses, especially for SQL queries and summaries.

Dataset Context:
{{#if datasetDescription}}
Dataset Description:
{{{datasetDescription}}}
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

