
'use server';

/**
 * @fileOverview A metadata enrichment AI agent for a single table and its columns.
 * It uses Gemini to enhance descriptions, add relevant tags, and classify field sensitivity,
 * primary keys, and foreign keys.
 *
 * - enrichSingleTable - A function that enriches metadata of a single table and its columns.
 * - EnrichTableInput - The input type for the enrichSingleTable function.
 * - EnrichTableOutput - The return type for the enrichSingleTable function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { RawTable, RawColumn } from '@/types';
import { addLog } from '@/lib/log-store';


// Input Schemas (Raw data for the table and its columns)
const TableSchemaForAIInput = z.object({
  TABLE_NAME: z.string(),
  Dataset_name: z.string(), // For context
});

const ColumnSchemaForAIInput = z.object({
  TABLE_NAME: z.string(), 
  COLUMN_NAME: z.string(),
  DATA_TYPE: z.string().nullable().optional(),
});

const EnrichTableInputSchema = z.object({
  datasetContext: z.object({
    Dataset_name: z.string(),
    Dataset_description: z.string().nullable().optional(),
  }).describe("Context about the parent dataset."),
  tableToEnrich: z.object({ TABLE_NAME: z.string() }).describe("The raw metadata for the table to be enriched."),
  columnsToEnrich: z.array(z.object({ TABLE_NAME: z.string(), COLUMN_NAME: z.string() })).describe("The raw metadata for columns belonging to the tableToEnrich."),
  otherTableNamesInDataset: z.array(z.string()).optional().describe("Names of other tables in the same dataset for broader context, e.g., for inferring foreign keys."), // Still useful context for AI
});
export type EnrichTableInput = z.infer<typeof EnrichTableInputSchema>;


// --- Schemas for the AI's DIRECT output (Permissive, with renamed fields) ---
const PermissiveEnrichedTableDataForAIOutputSchema = z.object({
  TABLE_NAME: z.string().describe("The name of the table."),
  table_description: z.string().nullable().optional().describe("Generated or improved table description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
});

const PermissiveEnrichedColumnDataForAIOutputSchema = z.object({
  COLUMN_NAME: z.string().describe("The name of the column. Must match input."),
  description: z.string().nullable().optional().describe("Generated or improved column description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
  // AI should ideally return these, even if it didn't use them directly for enrichment tasks beyond context
  // DATA_TYPE: z.string().nullable().optional().describe("The data type of the column."),
  // PRIMARY_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a primary key ('true'/'false' as string, or boolean). Consider original value."),
  // FOREIGN_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a foreign key ('true'/'false' as string, or boolean). Consider original value and other table names."),
  // Pass-through fields - AI should return them as-is, schema is permissive
  // description and tags from original input are not in the AI input schema anymore
  // location: z.any().nullable().optional(),
});

const EnrichTableAIOutputSchema = z.object({
  tableToEnrich: PermissiveEnrichedTableDataForAIOutputSchema.describe("The enriched data for the table."),
  columnsToEnrich: z.array(PermissiveEnrichedColumnDataForAIOutputSchema).describe("The enriched data for the columns."),
});


// --- Schemas for what the FLOW will *RETURN* (Strictly typed after normalization) ---
// These remain unchanged as the application expects this final structure. They include more fields than the AI's direct input/output schemas.
const EnrichedTableDataSchema = TableSchemaForAIInput.extend({ 
  Description: z.string().nullable().optional(), // Maps from table_description
  Table_tags: z.string().nullable().optional(),  // Maps from tags
  Sensitivity: z.string().nullable().optional(),
});
 
const EnrichedColumnDataSchema = ColumnSchemaForAIInput.extend({ 
  column_description: z.string().nullable().optional(), // Maps from description
  Column_tags: z.string().nullable().optional(),        // Maps from tags
  Sensitivity: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), 
  FOREIGN_KEY: z.string().nullable().optional(), 
});

const EnrichTableOutputSchema = z.object({
  enrichedTable: EnrichedTableDataSchema,
  enrichedColumns: z.array(EnrichedColumnDataSchema),
});
export type EnrichTableOutput = z.infer<typeof EnrichTableOutputSchema>;


export async function enrichSingleTable(input: EnrichTableInput): Promise<EnrichTableOutput> {
  addLog(`[Genkit Flow: enrichSingleTable] Invoked for table: ${input.tableToEnrich.TABLE_NAME} in dataset: ${input.datasetContext.Dataset_name}. Columns: ${input.columnsToEnrich.length}, Other tables: ${input.otherTableNamesInDataset?.length || 0}`);
  try {
    // Compact the input data before sending to the AI
    const compactedInput: EnrichTableInput = {
      datasetContext: {
        Dataset_name: input.datasetContext.Dataset_name.trim(),
        Dataset_description: input.datasetContext.Dataset_description?.trim() ?? null,
      },
      tableToEnrich: { TABLE_NAME: input.tableToEnrich.TABLE_NAME.trim() },
      columnsToEnrich: (input.columnsToEnrich || []).map(col => ({
        TABLE_NAME: input.tableToEnrich.TABLE_NAME.trim(),
        COLUMN_NAME: col.COLUMN_NAME.trim(),
      })),
      otherTableNamesInDataset: (input.otherTableNamesInDataset || []).map(name => name.trim()).filter(name => name),
    };

    // Stringify the compacted input for logging
    const compactedInputString = JSON.stringify(compactedInput);
 addLog(`[Genkit Flow Step: enrichTableFlow (internal)] Compacted input for table ${input.tableToEnrich.TABLE_NAME}: ${compactedInputString.substring(0, 500)}...`);

    const flowResult = await enrichTableFlow(compactedInput);
    if (!flowResult) {
        const errorMsg = `EnrichTableFlow returned null or undefined for table ${input.tableToEnrich.TABLE_NAME}. This indicates an issue within the flow.`;
        addLog(`[Genkit Flow: enrichSingleTable] Error: ${errorMsg}`);
        throw new Error(errorMsg);
    }
    return flowResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    addLog(`[Genkit Flow: enrichSingleTable] Error for table ${input.tableToEnrich.TABLE_NAME}: ${errorMessage}`);
    throw error; 
  }
}

const prompt = ai.definePrompt({
  name: 'enrichSingleTablePrompt',
  input: {schema: EnrichTableInputSchema},
  output: {schema: EnrichTableAIOutputSchema}, 
  prompt: `You are a data catalog enrichment assistant. Your task is to enrich the metadata for a single table and its columns, based on the provided context.

Dataset Context:
Dataset Name: {{datasetContext.Dataset_name}}
Dataset Description: {{#if datasetContext.Dataset_description}}{{datasetContext.Dataset_description}}{{else}}Not Provided{{/if}}

Table to Enrich (Original Data):
Name: {{tableToEnrich.TABLE_NAME}}

Columns in {{tableToEnrich.TABLE_NAME}} (Original Data):
{{#each columnsToEnrich}}
- {{COLUMN_NAME}}
 {{/each}}

{{#if otherTableNamesInDataset}}
Other Table Names in Dataset "{{datasetContext.Dataset_name}}" (for inferring relationships):
{{#each otherTableNamesInDataset}}
- {{this}}
{{/each}}
{{/if}}

Enrichment Tasks:

1.  For the Current Table ({{tableToEnrich.TABLE_NAME}}), provide in the "tableToEnrich" output object:
    *   table_description: You MUST generate a detailed and informative description of the table's purpose, content, and common use cases. If the original description (provided as '{{tableToEnrich.Description}}') is non-existent, clearly a placeholder, or very brief, generate a comprehensive new one. If it is already detailed, you may refine it. If no meaningful description can be generated despite the context, return an empty string or null.
    *   tags: You MUST generate relevant, comma-separated keywords (tags) for the table. If the original tags (provided as '{{tableToEnrich.Table_tags}}') are non-existent, clearly placeholder, or insufficient, generate suitable new tags. If they are already good, you may refine them. If no meaningful tags can be generated, return an empty string or null.
    *   Sensitivity: Determine the sensitivity level for the table (options: 'low', 'medium', 'high', 'unknown'). Base this on the table's name, its (original or new) description, and the nature of its columns (e.g., presence of PII, financial data). If a reasonable original sensitivity is provided ('{{tableToEnrich.Sensitivity}}'), consider it.

2.  For Each Column in {{tableToEnrich.TABLE_NAME}}, provide these in the "columnsToEnrich" output array:
    *   description: You MUST generate a clear explanation of what the column represents. If the original description (provided as '{{column_description}}' for the respective column) is non-existent, clearly a placeholder, or very brief, generate a new one. If it is already detailed, refine it. If no meaningful description can be generated, return an empty string or null.
    *   tags: You MUST generate relevant comma-separated keywords for the column. If the original tags (provided as '{{Column_tags}}' for the respective column) are non-existent, placeholder, or insufficient, generate new ones. Refine if already good. If no meaningful tags can be generated, return an empty string or null.
    *   Sensitivity: Determine the sensitivity level ('low', 'medium', 'high', 'unknown'). Base this on column name, data type, its (original or new) description. If a reasonable original sensitivity ('{{Sensitivity}}' for the column) is provided, consider it.
    
Output Format:
Ensure your output strictly adheres to the JSON schema in COMPACTED FORMAT with a "tableToEnrich" object and a "columnsToEnrich" array.
Make the output JSON as compact as possible, minimizing whitespace and newlines. The "columnsToEnrich" array should contain objects for each column, and these objects DO NOT need to include the "TABLE_NAME" field.
Output the result as a single-line, compacted JSON object.`,
});

const enrichTableFlow = ai.defineFlow(
  {
    name: 'enrichTableFlow',
    inputSchema: EnrichTableInputSchema,
    outputSchema: EnrichTableOutputSchema, 
  },
  async (input): Promise<EnrichTableOutput> => {
    addLog(`[Genkit Flow Step: enrichTableFlow (internal)] Input for table ${input.tableToEnrich.TABLE_NAME}: Columns - ${input.columnsToEnrich.length}`);
    
    const sanitizedTableForPrompt = {
      ...input.tableToEnrich,
    };

    const sanitizedColumnsForPrompt = (input.columnsToEnrich || []).map(c => ({
      ...c,
    }));

    const sanitizedInputForAI = {
      datasetContext: {
        Dataset_name: input.datasetContext.Dataset_name,
        Dataset_description: input.datasetContext.Dataset_description || "",
      },
      tableToEnrich: { TABLE_NAME: sanitizedTableForPrompt.TABLE_NAME }, // Only pass TABLE_NAME
      columnsToEnrich: sanitizedColumnsForPrompt,
      otherTableNamesInDataset: input.otherTableNamesInDataset || [],
    };

    let aiModelOutput; 
    try {
      addLog(`[Genkit Prompt: enrichSingleTablePrompt] Invoking for table ${input.tableToEnrich.TABLE_NAME}....`);
      console.log(`[Genkit Prompt: enrichSingleTablePrompt] Invoking for table ${input.tableToEnrich.TABLE_NAME}...`);
      const {output} = await prompt(sanitizedInputForAI); 
      aiModelOutput = output;
      if (!aiModelOutput || !aiModelOutput.tableToEnrich || !Array.isArray(aiModelOutput.columnsToEnrich)) {
        addLog(`[Genkit Prompt: enrichSingleTablePrompt] Error for table ${input.tableToEnrich.TABLE_NAME}: Malformed response. Output: ${JSON.stringify(aiModelOutput).substring(0,300)}`);
        throw new Error('AI enrichment for table returned no output or malformed response envelope.');
      }
      addLog(`[Genkit Prompt: enrichSingleTablePrompt] Response for ${input.tableToEnrich.TABLE_NAME}: Table desc - ${aiModelOutput.tableToEnrich.table_description?.substring(0,50)}..., Columns enriched: ${aiModelOutput.columnsToEnrich.length}`);
    } catch (error) {
      const promptErrorMsg = error instanceof Error ? error.message : String(error);
      addLog(`[Genkit Prompt: enrichSingleTablePrompt] Execution Error for table ${input.tableToEnrich.TABLE_NAME}: ${promptErrorMsg}`);
      throw new Error(`AI prompt call failed for table ${input.tableToEnrich.TABLE_NAME}: ${promptErrorMsg}`);
    }

    const originalInputTable = input.tableToEnrich;
    const aiProvidedTable = aiModelOutput.tableToEnrich; 

    const finalEnrichedTableData: z.infer<typeof EnrichedTableDataSchema> = {
        TABLE_NAME: originalInputTable.TABLE_NAME,
        Dataset_name: input.datasetContext.Dataset_name, // Use dataset name from context
        Description: aiProvidedTable.table_description ?? null, // Only use AI description
        Table_tags: aiProvidedTable.tags ?? null, // Only use AI tags
        Sensitivity: aiProvidedTable.Sensitivity ?? 'unknown', // Only use AI sensitivity
    };

    const finalNormalizedColumns: z.infer<typeof EnrichedColumnDataSchema>[] = [];
    for (const originalInputCol of input.columnsToEnrich) { 
        const aiCol = aiModelOutput.columnsToEnrich.find(c => c.COLUMN_NAME === originalInputCol.COLUMN_NAME);
        let pkValue: string | null = null;
 if (aiCol) { // Only update if AI returned data for this column
        // const aiPk = aiCol?.PRIMARY_KEY;
        // if (typeof aiPk === 'boolean') pkValue = aiPk ? 'true' : 'false';
        // else if (typeof aiPk === 'string' && (aiPk.toLowerCase() === 'true' || aiPk.toLowerCase() === 'false')) pkValue = aiPk.toLowerCase();
        // else pkValue = originalInputCol.PRIMARY_KEY ?? null; 

        // let fkValue: string | null = null;
        // const aiFk = aiCol?.FOREIGN_KEY;
        // if (typeof aiFk === 'boolean') fkValue = aiFk ? 'true' : 'false';
        // else if (typeof aiFk === 'string' && (aiFk.toLowerCase() === 'true' || aiFk.toLowerCase() === 'false')) fkValue = aiFk.toLowerCase();
        // else fkValue = originalInputCol.FOREIGN_KEY ?? null; 
        
        const normalizedCol: z.infer<typeof EnrichedColumnDataSchema> = {
            TABLE_NAME: input.tableToEnrich.TABLE_NAME, 
            COLUMN_NAME: originalInputCol.COLUMN_NAME, 
            // DATA_TYPE: String(aiCol?.DATA_TYPE ?? originalInputCol.DATA_TYPE ?? null),
            // location: String(aiCol?.location ?? originalInputCol.location ?? null),
            column_description: aiCol?.description ?? null, 
            Column_tags: aiCol?.tags ?? null, 
            Sensitivity: aiCol?.Sensitivity ?? 'unknown',
            // PRIMARY_KEY: pkValue,
            // FOREIGN_KEY: fkValue,
        };
        finalNormalizedColumns.push(normalizedCol);
 }
    }
    
    const finalOutput: EnrichTableOutput = {
        enrichedTable: finalEnrichedTableData,
        enrichedColumns: finalNormalizedColumns,
    };

    addLog(`[Genkit Flow Step: enrichTableFlow (internal)] Output for table ${input.tableToEnrich.TABLE_NAME}: Table desc - ${finalOutput.enrichedTable.Description?.substring(0,50)}..., Columns: ${finalOutput.enrichedColumns.length}`);
    return finalOutput;
  }
);

