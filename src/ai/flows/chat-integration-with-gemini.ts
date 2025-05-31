
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
import { addLog } from '@/lib/log-store';

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
  addLog(`[Genkit Flow: chatWithGemini] Invoked. Query: ${input.query.substring(0,100)}... Dataset context: ${input.datasetDescription ? 'Provided' : 'Not provided'}. Table context: ${input.tableMetadata ? 'Provided' : 'Not provided'}. History items: ${input.history?.length || 0}`);
  try {
    const result = await chatWithGeminiFlow(input);
    addLog(`[Genkit Flow: chatWithGemini] Successfully completed. Response: ${result.response.substring(0,100)}...`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    addLog(`[Genkit Flow: chatWithGemini] Error: ${errorMessage}`);
    throw error;
  }
}

const prompt = ai.definePrompt({
  name: 'chatWithGeminiPrompt',
  input: {schema: ChatWithGeminiInputSchema},
  output: {schema: ChatWithGeminiOutputSchema},
  prompt: `You are DataSage, a specialized AI assistant for data catalog exploration.
Your purpose is to help users understand and query the provided dataset context, using the conversation history to understand follow-up questions.

You MUST strictly adhere to the following decision process:

1.  **Assess User's Query Against Dataset Context:**
    *   Is the user's current query ("{{{query}}}") a request for information *about* the provided "Dataset Description" or "Table Metadata"? This includes asking to identify tables/columns based on criteria (e.g., "fact tables", "tables with PII", "columns related to customer data"), requesting summaries of the data, or asking for SQL queries to be generated based on this data.
    *   If YES, use the provided "Dataset Context" to answer the question.

2.  **Assess User's Query as a Follow-Up (If Not Answered by Rule 1):**
    *   Examine the "Conversation History" provided.
    *   Is the user's current query ("{{{query}}}") a direct follow-up, clarification, or modification to a SQL query or summary that YOU (DataSage) previously generated in this conversation?
    *   If YES, answer the question by addressing the follow-up, clarification, or modification.

3.  **Refusal for Out-of-Scope Questions (If Not Answered by Rule 1 or Rule 2):**
    *   If the user's query is NOT directly related to the "Dataset Context" (as defined in Rule 1) AND is NOT a direct follow-up to your previous responses (Rule 2), then you MUST politely refuse to answer.
    *   Examples of out-of-scope questions include: social chat, general knowledge, harmful content, unrelated topics, coding help not directly related to analyzing the provided data or your generated SQL.
    *   When refusing, respond ONLY with: "I am DataSage, an AI assistant for data catalog queries. I can only help with questions about the provided dataset or follow-ups to my previous responses about it."
    *   Do NOT apologize, try to answer the unrelated question, or provide any information beyond this specific refusal message.

4.  **Output Formatting:**
    *   Use Markdown for all your responses, especially for SQL queries and summaries.

Conversation History:
{{#if history}}
{{#each history}}
{{this.role}}: {{this.parts.0.text}}
{{/each}}
{{else}}
No previous conversation.
{{/if}}

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
    addLog(`[Genkit Flow Step: chatWithGeminiFlow (internal)] Input: Query - ${input.query.substring(0,100)}..., History items: ${input.history?.length || 0}`);
    
    let outputFromPrompt;
    try {
      const result = await prompt(input, {history: input.history});
      outputFromPrompt = result.output;
       if (!outputFromPrompt) {
        addLog(`[Genkit Prompt: chatWithGeminiPrompt] Error: Returned no output object.`);
        throw new Error('AI prompt for chat returned no output.');
      }
      addLog(`[Genkit Prompt: chatWithGeminiPrompt] Response: ${outputFromPrompt.response.substring(0,100)}...`);
    } catch (e) {
      const promptError = e instanceof Error ? e.message : String(e);
      addLog(`[Genkit Prompt: chatWithGeminiPrompt] Execution Error: ${promptError}`);
      throw e; // Re-throw to be caught by the outer wrapper or calling function
    }
    
    addLog(`[Genkit Flow Step: chatWithGeminiFlow (internal)] Output: ${outputFromPrompt.response.substring(0,100)}...`);
    return outputFromPrompt!;
  }
);

