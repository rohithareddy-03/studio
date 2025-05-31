
'use server';
/**
 * @fileOverview An AI flow to extract primary and foreign key information from a SQL query.
 *
 * - extractKeysFromSql - A function that analyzes SQL to identify keys.
 * - ExtractKeysFromSqlInput - The input type for the function.
 * - ExtractKeysFromSqlOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z}
from 'genkit';
import { addLog } from '@/lib/log-store';

export const ExtractKeysFromSqlInputSchema = z.object({
  sqlQuery: z.string().describe('The SQL query (e.g., CREATE TABLE, ALTER TABLE, or analytical query with joins) to analyze for key structures.'),
  datasetName: z.string().describe('The name of the dataset this query pertains to.'),
  tableName: z.string().optional().describe('Optional. The specific table name if the query focuses on a single table. If not provided, the AI should try to infer table names from the query.'),
  existingSchemaContext: z.string().optional().describe('Optional. A string representation of the known schema (e.g., table names, column names, and types) for the dataset or table. This helps the AI understand the context of the SQL query.'),
});
export type ExtractKeysFromSqlInput = z.infer<typeof ExtractKeysFromSqlInputSchema>;

const KeyDetailSchema = z.object({
  tableName: z.string().describe("The name of the table this key belongs to."),
  columnName: z.string().describe("The name of the column that is part of the key.")
});

const ForeignKeyDetailSchema = KeyDetailSchema.extend({
  referencedTable: z.string().optional().describe("Optional. The table referenced by this foreign key."),
  referencedColumn: z.string().optional().describe("Optional. The column in the referenced table.")
});

export const ExtractKeysFromSqlOutputSchema = z.object({
  primaryKeys: z.array(KeyDetailSchema).describe("An array of identified primary key columns. Each PK should be listed as a separate object if it's a composite key, though typically a table has one set of PK columns.").default([]),
  foreignKeys: z.array(ForeignKeyDetailSchema).describe("An array of identified foreign key columns.").default([]),
  analysisSummary: z.string().describe("A summary of the key extraction process, including any ambiguities or assumptions made by the AI."),
  warnings: z.array(z.string()).optional().describe("Optional warnings if the query was hard to parse or results are uncertain."),
});
export type ExtractKeysFromSqlOutput = z.infer<typeof ExtractKeysFromSqlOutputSchema>;


export async function extractKeysFromSql(input: ExtractKeysFromSqlInput): Promise<ExtractKeysFromSqlOutput> {
  addLog(`[Genkit Flow: extractKeysFromSql] Invoked for dataset: ${input.datasetName}, table: ${input.tableName || 'N/A'}. SQL: ${input.sqlQuery.substring(0,100)}...`);
  // console.log('[extractKeysFromSql wrapper] Input received:', JSON.stringify(input, null, 2).substring(0, 500) + "...");
  try {
    const result = await extractKeysFlow(input);
    addLog(`[Genkit Flow: extractKeysFromSql] Successfully completed. Summary: ${result.analysisSummary.substring(0,100)}... PKs: ${result.primaryKeys.length}, FKs: ${result.foreignKeys.length}`);
    // console.log('[extractKeysFromSql wrapper] Flow Output (result):', JSON.stringify(result, null, 2).substring(0, 800) + "...");
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during SQL key extraction.";
    addLog(`[Genkit Flow: extractKeysFromSql] Error: ${errorMessage}. Input SQL: ${input.sqlQuery.substring(0,100)}...`);
    // console.error('[extractKeysFromSql wrapper] Error during flow execution:', error);
    return {
      primaryKeys: [],
      foreignKeys: [],
      analysisSummary: `Error during SQL key extraction: ${errorMessage}`,
      warnings: [`Extraction failed: ${errorMessage}`],
    };
  }
}

const prompt = ai.definePrompt({
  name: 'extractKeysFromSqlPrompt',
  input: { schema: ExtractKeysFromSqlInputSchema },
  output: { schema: ExtractKeysFromSqlOutputSchema },
  prompt: `You are a database schema analysis assistant. Your task is to analyze the provided SQL query text and infer primary and foreign key relationships.
You will NOT execute the SQL. You are only analyzing the SQL text.

Dataset Context:
Dataset Name: {{datasetName}}
{{#if tableName}}
Table in Focus (if provided): {{tableName}}
{{/if}}
{{#if existingSchemaContext}}
Existing Schema Information (for context):
{{{existingSchemaContext}}}
{{/if}}

SQL Query to Analyze:
\`\`\`sql
{{{sqlQuery}}}
\`\`\`

Analysis Tasks:
1.  **Identify Primary Keys:**
    *   Look for \`PRIMARY KEY\` constraints in \`CREATE TABLE\` or \`ALTER TABLE\` statements.
    *   Infer primary keys from common naming conventions (e.g., 'ID', '{table_name}_ID', 'PK_...') if explicit constraints are not present.
    *   If the query is analytical (e.g. SELECT with JOINs), primary keys might not be explicitly defined in THIS query, but you can infer based on common patterns or the existing schema context.
    *   List each primary key as an object: \`{ tableName: "TABLE_NAME", columnName: "COLUMN_NAME" }\`. If a table name cannot be definitively inferred from the query (and no specific tableName was provided in input), use a placeholder like "UNKNOWN_TABLE" or the most likely table name.

2.  **Identify Foreign Keys:**
    *   Look for \`FOREIGN KEY ... REFERENCES ...\` constraints.
    *   Infer foreign keys from common naming conventions (e.g., '{referenced_table}_ID', 'FK_{column_name}', columns used in JOIN ON clauses).
    *   If possible, identify the referenced table and column.
    *   List each foreign key as an object: \`{ tableName: "TABLE_NAME", columnName: "COLUMN_NAME", referencedTable: "REF_TABLE_NAME", referencedColumn: "REF_COLUMN_NAME" }\`. The referencedTable and referencedColumn are optional.

3.  **Analysis Summary:** Provide a brief summary of your findings, including any confidence levels, ambiguities, or assumptions made. If the query doesn't seem to contain key information (e.g., a simple SELECT * from a single table without joins or DDL), state that.

Output Format:
Ensure your output strictly adheres to the JSON schema provided for primaryKeys, foreignKeys, and analysisSummary.
Return empty arrays for primaryKeys or foreignKeys if none are confidently identified.
If the SQL query is malformed or uninterpretable for key extraction, the 'analysisSummary' should state this, and 'warnings' can be used.
`,
});

const extractKeysFlow = ai.defineFlow(
  {
    name: 'extractKeysFlow',
    inputSchema: ExtractKeysFromSqlInputSchema,
    outputSchema: ExtractKeysFromSqlOutputSchema,
  },
  async (input) => {
    addLog(`[Genkit Flow Step: extractKeysFlow (internal)] Input SQL: ${input.sqlQuery.substring(0,200)}... Context: ${input.existingSchemaContext?.substring(0,100)}...`);
    // console.log('[extractKeysFlow] Input to AI prompt:', JSON.stringify(input, null, 2).substring(0, 500) + "...");
    
    let outputFromPrompt;
    try {
      const result = await prompt(input);
      outputFromPrompt = result.output;
      if (!outputFromPrompt) {
        addLog(`[Genkit Prompt: extractKeysFromSqlPrompt] Error: Returned no output object.`);
        throw new Error('AI SQL key analysis returned no output.');
      }
      addLog(`[Genkit Prompt: extractKeysFromSqlPrompt] Response summary: ${outputFromPrompt.analysisSummary.substring(0,100)}... PKs: ${outputFromPrompt.primaryKeys?.length || 0}, FKs: ${outputFromPrompt.foreignKeys?.length || 0}`);
    } catch (e) {
      const promptError = e instanceof Error ? e.message : String(e);
      addLog(`[Genkit Prompt: extractKeysFromSqlPrompt] Execution Error: ${promptError}`);
      throw e;
    }

    // console.log('[extractKeysFlow] Raw output from AI prompt:', JSON.stringify(outputFromPrompt, null, 2).substring(0, 800) + "...");

    const finalOutput = {
        primaryKeys: outputFromPrompt.primaryKeys || [],
        foreignKeys: outputFromPrompt.foreignKeys || [],
        analysisSummary: outputFromPrompt.analysisSummary || "AI provided no analysis summary.",
        warnings: outputFromPrompt.warnings || [],
    };
    addLog(`[Genkit Flow Step: extractKeysFlow (internal)] Final output summary: ${finalOutput.analysisSummary.substring(0,100)}...`);
    return finalOutput;
  }
);

