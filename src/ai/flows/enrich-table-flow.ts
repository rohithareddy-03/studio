
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
  source: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  DATABASE_NAME: z.string().nullable().optional(),
  SCHEMA_NAME: z.string().nullable().optional(),
  OWNER: z.string().nullable().optional(),
  // PRIMARY_KEYS: z.string().nullable().optional(), // This is a summary, AI will determine per column
  // FOREIGN_KEYS: z.string().nullable().optional(), // This is a summary, AI will determine per column
  CREATED_DATE: z.string().nullable().optional(), // Must be string or null
  UPDATED_DATE: z.string().nullable().optional(), // Must be string or null
  Row_count: z.string().nullable().optional(),    // Must be string or null
  Description: z.string().nullable().optional(),
  Table_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
});

const ColumnSchemaForAIInput = z.object({
  TABLE_NAME: z.string(), 
  COLUMN_NAME: z.string(),
  DATA_TYPE: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), 
  FOREIGN_KEY: z.string().nullable().optional(), 
  column_description: z.string().nullable().optional(),
  Column_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
});

const EnrichTableInputSchema = z.object({
  datasetContext: z.object({
    Dataset_name: z.string(),
    Dataset_description: z.string().nullable().optional(),
  }).describe("Context about the parent dataset."),
  tableToEnrich: TableSchemaForAIInput.describe("The raw metadata for the table to be enriched."),
  columnsToEnrich: z.array(ColumnSchemaForAIInput).describe("The raw metadata for columns belonging to the tableToEnrich."),
  otherTableNamesInDataset: z.array(z.string()).optional().describe("Names of other tables in the same dataset for broader context, e.g., for inferring foreign keys."),
});
export type EnrichTableInput = z.infer<typeof EnrichTableInputSchema>;


// --- Schemas for the AI's DIRECT output (Permissive, with renamed fields) ---
const PermissiveEnrichedTableDataForAIOutputSchema = z.object({
  TABLE_NAME: z.string().describe("The name of the table. Must match input."),
  Dataset_name: z.string().describe("The name of the dataset. Must match input."),
  table_description: z.string().nullable().optional().describe("Generated or improved table description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
  // Pass-through fields - AI should return them as-is, schema is permissive
  source: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
  DATABASE_NAME: z.any().nullable().optional(),
  SCHEMA_NAME: z.any().nullable().optional(),
  OWNER: z.any().nullable().optional(),
  CREATED_DATE: z.any().nullable().optional(),
  UPDATED_DATE: z.any().nullable().optional(),
  Row_count: z.any().nullable().optional(),
});

const PermissiveEnrichedColumnDataForAIOutputSchema = z.object({
  TABLE_NAME: z.string().describe("The name of the table this column belongs to. Must match input."),
  COLUMN_NAME: z.string().describe("The name of the column. Must match input."),
  description: z.string().nullable().optional().describe("Generated or improved column description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
  PRIMARY_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a primary key ('true'/'false' as string, or boolean). Consider original value."),
  FOREIGN_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a foreign key ('true'/'false' as string, or boolean). Consider original value and other table names."),
  // Pass-through fields - AI should return them as-is, schema is permissive
  DATA_TYPE: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
});

const EnrichTableAIOutputSchema = z.object({
  tableToEnrich: PermissiveEnrichedTableDataForAIOutputSchema.describe("The enriched data for the table."),
  columnsToEnrich: z.array(PermissiveEnrichedColumnDataForAIOutputSchema).describe("The enriched data for the columns."),
});


// --- Schemas for what the FLOW will *RETURN* (Strictly typed after normalization) ---
// These remain unchanged as the application expects this final structure.
const EnrichedTableDataSchema = TableSchemaForAIInput.extend({ 
  Description: z.string().nullable().optional(), // Maps from table_description
  Table_tags: z.string().nullable().optional(),  // Maps from tags
  Sensitivity: z.string().nullable().optional(),
});
// .omit({ PRIMARY_KEYS: true, FOREIGN_KEYS: true }); // Omit summary fields not handled by this flow

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
    const flowResult = await enrichTableFlow(input);
    if (!flowResult) {
        const errorMsg = `EnrichTableFlow returned null or undefined for table ${input.tableToEnrich.TABLE_NAME}. This indicates an issue within the flow.`;
        addLog(`[Genkit Flow: enrichSingleTable] Error: ${errorMsg}`);
        throw new Error(errorMsg);
    }
    addLog(`[Genkit Flow: enrichSingleTable] Successfully completed for table ${input.tableToEnrich.TABLE_NAME}. Output (table desc): ${flowResult.enrichedTable.Description?.substring(0,100)}...`);
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
Original Description: {{#if tableToEnrich.Description}}{{tableToEnrich.Description}}{{else}}Not provided{{/if}}
Original Tags: {{#if tableToEnrich.Table_tags}}{{tableToEnrich.Table_tags}}{{else}}Not provided{{/if}}
Original Sensitivity: {{#if tableToEnrich.Sensitivity}}{{tableToEnrich.Sensitivity}}{{else}}Not provided{{/if}}
Original Source: {{#if tableToEnrich.source}}{{tableToEnrich.source}}{{else}}Not provided{{/if}}
Original Location: {{#if tableToEnrich.location}}{{tableToEnrich.location}}{{else}}Not provided{{/if}}
Original DB Name: {{#if tableToEnrich.DATABASE_NAME}}{{tableToEnrich.DATABASE_NAME}}{{else}}Not provided{{/if}}
Original Schema: {{#if tableToEnrich.SCHEMA_NAME}}{{tableToEnrich.SCHEMA_NAME}}{{else}}Not provided{{/if}}
Original Owner: {{#if tableToEnrich.OWNER}}{{tableToEnrich.OWNER}}{{else}}Not provided{{/if}}
Original Created Date: {{#if tableToEnrich.CREATED_DATE}}{{tableToEnrich.CREATED_DATE}}{{else}}Not provided{{/if}}
Original Updated Date: {{#if tableToEnrich.UPDATED_DATE}}{{tableToEnrich.UPDATED_DATE}}{{else}}Not provided{{/if}}
Original Row Count: {{#if tableToEnrich.Row_count}}{{tableToEnrich.Row_count}}{{else}}Not provided{{/if}}


Columns in {{tableToEnrich.TABLE_NAME}} (Original Data):
{{#each columnsToEnrich}}
- {{COLUMN_NAME}}:
  Data Type: {{DATA_TYPE}}
  Original Description: {{#if column_description}}{{column_description}}{{else}}Not provided{{/if}}
  Original Tags: {{#if Column_tags}}{{Column_tags}}{{else}}Not provided{{/if}}
  Original Sensitivity: {{#if Sensitivity}}{{Sensitivity}}{{else}}Not provided{{/if}}
  Original PK: {{#if PRIMARY_KEY}}{{PRIMARY_KEY}}{{else}}Not provided{{/if}}
  Original FK: {{#if FOREIGN_KEY}}{{FOREIGN_KEY}}{{else}}Not provided{{/if}}
  Original Location: {{#if location}}{{location}}{{else}}Not provided{{/if}}
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
    *   PRIMARY_KEY: Based on the column's name (e.g., 'ID', 'PK', '{table_name}_ID') and its nature, determine if it's likely a primary key. Output 'true' or 'false' (as a string or boolean). If a reasonable original value for PRIMARY_KEY ('{{PRIMARY_KEY}}' for the column) is provided, prioritize it.
    *   FOREIGN_KEY: Based on the column's name (e.g., '{related_table}_ID', 'FK_') and its relationship to other tables (use "Other Table Names in Dataset" for context), determine if it's likely a foreign key. Output 'true' or 'false' (as a string or boolean). If a reasonable original value for FOREIGN_KEY ('{{FOREIGN_KEY}}' for the column) is provided, prioritize it.

CRITICAL INSTRUCTIONS:
- You MUST return all original fields for the table and for EACH of its columns that were part of the input, even if you don't change them, but with your enriched values for the fields specified above.
- The "columnsToEnrich" array in your output MUST contain an object for EVERY column that was in the "Columns in {{tableToEnrich.TABLE_NAME}}" section of the input.
- Each column object in your "columnsToEnrich" output MUST preserve the original COLUMN_NAME and TABLE_NAME (which should match the table being enriched: {{tableToEnrich.TABLE_NAME}}).
- Each column object in "columnsToEnrich" MUST also preserve its original DATA_TYPE and location.
- Preserve all existing table-level data that you are not explicitly asked to modify or determine (e.g., source, location, DATABASE_NAME, SCHEMA_NAME, OWNER, CREATED_DATE, UPDATED_DATE, Row_count).
- If an existing description/tag seems adequate or user-provided, you may refine it or keep it. Do not discard good existing information, but prioritize generating content if fields are clearly placeholders or empty.

Output Format:
Ensure your output strictly adheres to the JSON schema with a "tableToEnrich" object and a "columnsToEnrich" array.
The "tableToEnrich" object should contain all original fields from the input tableToEnrich, with 'table_description', 'tags', and 'Sensitivity' updated as per your determination. It MUST also include TABLE_NAME and Dataset_name matching the input.
Each object in "columnsToEnrich" array should contain all original fields from the input column, with 'description', 'tags', 'Sensitivity', 'PRIMARY_KEY', and 'FOREIGN_KEY' updated as per your determination. It MUST also include TABLE_NAME (matching the input table) and COLUMN_NAME matching the input column.
`,
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
      Description: input.tableToEnrich.Description || "", 
      Table_tags: input.tableToEnrich.Table_tags || "",   
      Sensitivity: input.tableToEnrich.Sensitivity || "unknown",
      Row_count: (input.tableToEnrich.Row_count !== null && input.tableToEnrich.Row_count !== undefined)
                    ? String(input.tableToEnrich.Row_count)
                    : null,
      CREATED_DATE: (input.tableToEnrich.CREATED_DATE !== null && input.tableToEnrich.CREATED_DATE !== undefined)
                    ? String(input.tableToEnrich.CREATED_DATE)
                    : null,
      UPDATED_DATE: (input.tableToEnrich.UPDATED_DATE !== null && input.tableToEnrich.UPDATED_DATE !== undefined)
                    ? String(input.tableToEnrich.UPDATED_DATE)
                    : null,
    };

    const sanitizedColumnsForPrompt = (input.columnsToEnrich || []).map(c => ({
      ...c,
      column_description: c.column_description || "", 
      Column_tags: c.Column_tags || "",       
      Sensitivity: c.Sensitivity || "unknown",
      PRIMARY_KEY: c.PRIMARY_KEY || null, 
      FOREIGN_KEY: c.FOREIGN_KEY || null,
    }));

    const sanitizedInputForAI = {
      datasetContext: {
        Dataset_name: input.datasetContext.Dataset_name,
        Dataset_description: input.datasetContext.Dataset_description || "",
      },
      tableToEnrich: sanitizedTableForPrompt,
      columnsToEnrich: sanitizedColumnsForPrompt,
      otherTableNamesInDataset: input.otherTableNamesInDataset || [],
    };

    let aiModelOutput; 
    try {
      addLog(`[Genkit Prompt: enrichSingleTablePrompt] Invoking for table ${input.tableToEnrich.TABLE_NAME}. Sanitized input (table desc): ${sanitizedInputForAI.tableToEnrich.Description?.substring(0,50)}...`);
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
        Dataset_name: originalInputTable.Dataset_name, 
        Description: aiProvidedTable.table_description ?? originalInputTable.Description ?? null, 
        Table_tags: aiProvidedTable.tags ?? originalInputTable.Table_tags ?? null, 
        Sensitivity: aiProvidedTable.Sensitivity ?? originalInputTable.Sensitivity ?? 'unknown',
        source: String(aiProvidedTable.source ?? originalInputTable.source ?? null),
        location: String(aiProvidedTable.location ?? originalInputTable.location ?? null),
        DATABASE_NAME: String(aiProvidedTable.DATABASE_NAME ?? originalInputTable.DATABASE_NAME ?? null),
        SCHEMA_NAME: String(aiProvidedTable.SCHEMA_NAME ?? originalInputTable.SCHEMA_NAME ?? null),
        OWNER: String(aiProvidedTable.OWNER ?? originalInputTable.OWNER ?? null),
        CREATED_DATE: String(aiProvidedTable.CREATED_DATE ?? originalInputTable.CREATED_DATE ?? null),
        UPDATED_DATE: String(aiProvidedTable.UPDATED_DATE ?? originalInputTable.UPDATED_DATE ?? null),
        Row_count: (aiProvidedTable.Row_count !== undefined && aiProvidedTable.Row_count !== null)
                    ? String(aiProvidedTable.Row_count)
                    : (originalInputTable.Row_count ?? null),
    };

    const finalNormalizedColumns: z.infer<typeof EnrichedColumnDataSchema>[] = [];
    for (const originalInputCol of input.columnsToEnrich) { 
        const aiCol = aiModelOutput.columnsToEnrich.find(c => c.COLUMN_NAME === originalInputCol.COLUMN_NAME && c.TABLE_NAME === originalInputCol.TABLE_NAME);

        let pkValue: string | null = null;
        const aiPk = aiCol?.PRIMARY_KEY;
        if (typeof aiPk === 'boolean') pkValue = aiPk ? 'true' : 'false';
        else if (typeof aiPk === 'string' && (aiPk.toLowerCase() === 'true' || aiPk.toLowerCase() === 'false')) pkValue = aiPk.toLowerCase();
        else pkValue = originalInputCol.PRIMARY_KEY ?? null; 

        let fkValue: string | null = null;
        const aiFk = aiCol?.FOREIGN_KEY;
        if (typeof aiFk === 'boolean') fkValue = aiFk ? 'true' : 'false';
        else if (typeof aiFk === 'string' && (aiFk.toLowerCase() === 'true' || aiFk.toLowerCase() === 'false')) fkValue = aiFk.toLowerCase();
        else fkValue = originalInputCol.FOREIGN_KEY ?? null; 
        
        const normalizedCol: z.infer<typeof EnrichedColumnDataSchema> = {
            TABLE_NAME: originalInputCol.TABLE_NAME, 
            COLUMN_NAME: originalInputCol.COLUMN_NAME, 
            DATA_TYPE: String(aiCol?.DATA_TYPE ?? originalInputCol.DATA_TYPE ?? null),
            location: String(aiCol?.location ?? originalInputCol.location ?? null),
            column_description: aiCol?.description ?? originalInputCol.column_description ?? null, 
            Column_tags: aiCol?.tags ?? originalInputCol.Column_tags ?? null, 
            Sensitivity: aiCol?.Sensitivity ?? originalInputCol.Sensitivity ?? 'unknown',
            PRIMARY_KEY: pkValue,
            FOREIGN_KEY: fkValue,
        };
        finalNormalizedColumns.push(normalizedCol);
    }
    
    // The main loop above ensures one output column for each input column.
    // The block for handling column count mismatches has been removed as it was a likely source of duplicates.

    const finalOutput: EnrichTableOutput = {
        enrichedTable: finalEnrichedTableData,
        enrichedColumns: finalNormalizedColumns,
    };

    addLog(`[Genkit Flow Step: enrichTableFlow (internal)] Output for table ${input.tableToEnrich.TABLE_NAME}: Table desc - ${finalOutput.enrichedTable.Description?.substring(0,50)}..., Columns: ${finalOutput.enrichedColumns.length}`);
    return finalOutput;
  }
);

