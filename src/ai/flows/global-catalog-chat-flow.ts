
// src/ai/flows/global-catalog-chat-flow.ts
'use server';

/**
 * @fileOverview Integrates Gemini with a chat interface to generate SQL queries and dataset summaries
 * about the ENTIRE data catalog, maintaining conversation history.
 *
 * - globalCatalogChat - A function that handles the chat interaction with Gemini for global catalog queries.
 * - GlobalCatalogChatInput - The input type for the function.
 * - GlobalCatalogChatOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { addLog } from '@/lib/log-store';
import type { ChatMessageHistory } from './chat-integration-with-gemini'; // Reuse ChatMessageHistory

const GlobalCatalogChatInputSchema = z.object({
  query: z.string().describe('The user current query about the entire data catalog.'),
  catalogSummary: z.string().describe('A textual summary of all datasets, their descriptions, and table names in the catalog.'),
  history: z.array(
    z.object({
      role: z.enum(['user', 'model']),
      parts: z.array(z.object({text: z.string()})),
    })
  ).optional().describe('Previous messages in the conversation.'),
});
export type GlobalCatalogChatInput = z.infer<typeof GlobalCatalogChatInputSchema>;

const GlobalCatalogChatOutputSchema = z.object({
  response: z.string().describe('The response from Gemini, which could be an answer, a SQL query, or a summary related to the entire catalog.'),
});
export type GlobalCatalogChatOutput = z.infer<typeof GlobalCatalogChatOutputSchema>;

export async function globalCatalogChat(input: GlobalCatalogChatInput): Promise<GlobalCatalogChatOutput> {
  addLog(`[Genkit Flow: globalCatalogChat] Invoked. Query: ${input.query.substring(0,100)}... Catalog summary length: ${input.catalogSummary.length}. History items: ${input.history?.length || 0}`);
  try {
    const result = await globalCatalogChatFlow(input);
    addLog(`[Genkit Flow: globalCatalogChat] Successfully completed. Response: ${result.response.substring(0,100)}...`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    addLog(`[Genkit Flow: globalCatalogChat] Error: ${errorMessage}`);
    throw error;
  }
}

const prompt = ai.definePrompt({
  name: 'globalCatalogChatPrompt',
  input: {schema: GlobalCatalogChatInputSchema},
  output: {schema: GlobalCatalogChatOutputSchema},
  prompt: `You are DataSage, a specialized AI assistant for data catalog exploration.
Your purpose is to help users understand and query the ENTIRE data catalog provided, using the conversation history to understand follow-up questions.

You MUST strictly adhere to the following decision process:

1.  **Assess User's Query Against Full Catalog Context:**
    *   Is the user's current query ("{{{query}}}") a request for information *about* the provided "Full Catalog Summary"? This includes questions like:
        - "Which datasets contain personal information?"
        - "List all tables in the 'Sales' dataset."
        - "How many datasets are there in total?"
        - "Generate a SQL query to join tables X and Y from different datasets if relevant based on their descriptions."
        - "Summarize the 'Marketing' dataset."
    *   If YES, use the provided "Full Catalog Summary" to answer the question.

2.  **Assess User's Query as a Follow-Up (If Not Answered by Rule 1):**
    *   Examine the "Conversation History" provided.
    *   Is the user's current query ("{{{query}}}") a direct follow-up, clarification, or modification to a SQL query or summary that YOU (DataSage) previously generated in this conversation about the full catalog?
    *   If YES, answer the question by addressing the follow-up, clarification, or modification.

3.  **Refusal for Out-of-Scope Questions (If Not Answered by Rule 1 or Rule 2):**
    *   If the user's query is NOT directly related to the "Full Catalog Summary" (as defined in Rule 1) AND is NOT a direct follow-up to your previous responses (Rule 2), then you MUST politely refuse to answer.
    *   Examples of out-of-scope questions include: social chat, general knowledge, harmful content, unrelated topics, coding help not directly related to analyzing the provided data or your generated SQL.
    *   When refusing, respond ONLY with: "I am DataSage, an AI assistant for data catalog queries. I can only help with questions about the provided data catalog or follow-ups to my previous responses about it."
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

Full Catalog Summary:
{{{catalogSummary}}}

User's current question:
{{{query}}}
  `,
});

const globalCatalogChatFlow = ai.defineFlow(
  {
    name: 'globalCatalogChatFlow',
    inputSchema: GlobalCatalogChatInputSchema,
    outputSchema: GlobalCatalogChatOutputSchema,
  },
  async (input) => {
    addLog(`[Genkit Flow Step: globalCatalogChatFlow (internal)] Input: Query - ${input.query.substring(0,100)}..., History items: ${input.history?.length || 0}`);
    
    let outputFromPrompt;
    try {
      const result = await prompt(input, {history: input.history}); // Pass history correctly
      outputFromPrompt = result.output;
       if (!outputFromPrompt) {
        addLog(`[Genkit Prompt: globalCatalogChatPrompt] Error: Returned no output object.`);
        throw new Error('AI prompt for global catalog chat returned no output.');
      }
      addLog(`[Genkit Prompt: globalCatalogChatPrompt] Response: ${outputFromPrompt.response.substring(0,100)}...`);
    } catch (e) {
      const promptError = e instanceof Error ? e.message : String(e);
      addLog(`[Genkit Prompt: globalCatalogChatPrompt] Execution Error: ${promptError}`);
      throw e;
    }
    
    addLog(`[Genkit Flow Step: globalCatalogChatFlow (internal)] Output: ${outputFromPrompt.response.substring(0,100)}...`);
    return outputFromPrompt!;
  }
);
