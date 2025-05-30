
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


// Input Schemas (Raw data for the table and its columns)
const TableSchemaForAIInput = z.object({
  TABLE_NAME: z.string(),
  Dataset_name: z.string(), // For context
  source: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  DATABASE_NAME: z.string().nullable().optional(),
  SCHEMA_NAME: z.string().nullable().optional(),
  OWNER: z.string().nullable().optional(),
  PRIMARY_KEYS: z.string().nullable().optional(), // Original PKs, AI will determine per column
  FOREIGN_KEYS: z.string().nullable().optional(), // Original FKs, AI will determine per column
  CREATED_DATE: z.string().nullable().optional(),
  UPDATED_DATE: z.string().nullable().optional(),
  Row_count: z.string().nullable().optional(),
  Description: z.string().nullable().optional(),
  Table_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
});

const ColumnSchemaForAIInput = z.object({
  TABLE_NAME: z.string(), // Redundant here but part of raw structure
  COLUMN_NAME: z.string(),
  DATA_TYPE: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), // Original value
  FOREIGN_KEY: z.string().nullable().optional(), // Original value
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


// Output Schemas - AI will populate these fields for the given table and its columns
const EnrichedTableDataSchema = TableSchemaForAIInput.extend({
  Description: z.string().nullable().optional().describe("Generated or improved table description. Can be an empty string or null if no meaningful description can be generated."),
  Table_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
}).omit({ PRIMARY_KEYS: true, FOREIGN_KEYS: true }); // AI determines these per column now

const EnrichedColumnDataSchema = ColumnSchemaForAIInput.extend({
  column_description: z.string().nullable().optional().describe("Generated or improved column description. Can be an empty string or null if no meaningful description can be generated."),
  Column_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
  PRIMARY_KEY: z.string().nullable().optional().describe("Determined if this column is a primary key ('true' or 'false' as string). Consider original value."),
  FOREIGN_KEY: z.string().nullable().optional().describe("Determined if this column is a foreign key ('true' or 'false' as string). Consider original value and other table names."),
});

const EnrichTableOutputSchema = z.object({
  enrichedTable: EnrichedTableDataSchema,
  enrichedColumns: z.array(EnrichedColumnDataSchema),
});
export type EnrichTableOutput = z.infer<typeof EnrichTableOutputSchema>;


export async function enrichSingleTable(input: EnrichTableInput): Promise<EnrichTableOutput> {
  console.log('[enrichSingleTableFlow] Input received for table processing:', JSON.stringify({
    datasetName: input.datasetContext.Dataset_name,
    tableName: input.tableToEnrich.TABLE_NAME,
    columnCount: input.columnsToEnrich.length,
    otherTableCount: input.otherTableNamesInDataset?.length || 0,
    firstColumnOriginalDescription: input.columnsToEnrich[0]?.column_description
  }, null, 2));

  try {
    const flowResult = await enrichTableFlow(input); 
    console.log(`[enrichSingleTableFlow] Successfully processed table: ${input.tableToEnrich.TABLE_NAME}. Output snippet:`, JSON.stringify(flowResult, null, 2).substring(0,1000) + '...');
    return flowResult;
  } catch (error) {
    console.error(`[enrichSingleTable Function Error] Failed to enrich table ${input.tableToEnrich.TABLE_NAME} during flow execution. Input that caused error:`, JSON.stringify(input, null, 2).substring(0,1000) + "...");
    console.error(`[enrichSingleTable Function Error] Detailed error:`, error);
    throw error; 
  }
}

const prompt = ai.definePrompt({
  name: 'enrichSingleTablePrompt',
  input: {schema: EnrichTableInputSchema},
  output: {schema: EnrichTableOutputSchema}, 
  prompt: `You are a data catalog enrichment assistant. Your task is to enrich the metadata for a single table and its columns, based on the provided context.

Dataset Context:
Dataset Name: {{datasetContext.Dataset_name}}
Dataset Description: {{#if datasetContext.Dataset_description}}{{datasetContext.Dataset_description}}{{else}}Not provided{{/if}}

Table to Enrich:
Name: {{tableToEnrich.TABLE_NAME}}
Original Description: {{#if tableToEnrich.Description}}{{tableToEnrich.Description}}{{else}}Not provided{{/if}}
Original Tags: {{#if tableToEnrich.Table_tags}}{{tableToEnrich.Table_tags}}{{else}}Not provided{{/if}}
Original Sensitivity: {{tableToEnrich.Sensitivity}}
Other Table Metadata: {{JSON.stringify tableToEnrich}}

Columns in {{tableToEnrich.TABLE_NAME}} (Original Data):
{{#each columnsToEnrich}}
- {{COLUMN_NAME}}:
  Data Type: {{DATA_TYPE}}
  Original PK: {{PRIMARY_KEY}}
  Original FK: {{FOREIGN_KEY}}
  Original Description: {{#if column_description}}{{column_description}}{{else}}Not provided{{/if}}
  Original Tags: {{#if Column_tags}}{{Column_tags}}{{else}}Not provided{{/if}}
  Original Sensitivity: {{Sensitivity}}
{{/each}}

{{#if otherTableNamesInDataset}}
Other Table Names in Dataset "{{datasetContext.Dataset_name}}" (for inferring relationships):
{{#each otherTableNamesInDataset}}
- {{this}}
{{/each}}
{{/if}}

Enrichment Tasks:

1.  For the Current Table ({{tableToEnrich.TABLE_NAME}}):
    *   Description: You MUST generate a detailed and informative description of the table's purpose, content, and common use cases. If the original description (provided as '{{tableToEnrich.Description}}') is non-existent, clearly a placeholder, or very brief, generate a comprehensive new one. If it is already detailed, you may refine it. If no meaningful description can be generated despite the context, return an empty string or null.
    *   Table_tags: You MUST generate relevant, comma-separated keywords (tags) for the table. If the original tags (provided as '{{tableToEnrich.Table_tags}}') are non-existent, clearly placeholder, or insufficient, generate suitable new tags. If they are already good, you may refine them. If no meaningful tags can be generated, return an empty string or null.
    *   Sensitivity: Determine the sensitivity level for the table (options: 'low', 'medium', 'high', 'unknown'). Base this on the table's name, its (original or new) description, and the nature of its columns (e.g., presence of PII, financial data). If a reasonable original sensitivity is provided, consider it.

2.  For Each Column in {{tableToEnrich.TABLE_NAME}}:
    *   column_description: You MUST generate a clear explanation of what the column represents. If the original description (provided as '{{column_description}}' for the respective column) is non-existent, clearly a placeholder, or very brief, generate a new one. If it is already detailed, refine it. If no meaningful description can be generated, return an empty string or null.
    *   Column_tags: You MUST generate relevant comma-separated keywords for the column. If the original tags (provided as '{{Column_tags}}' for the respective column) are non-existent, placeholder, or insufficient, generate new ones. Refine if already good. If no meaningful tags can be generated, return an empty string or null.
    *   Sensitivity: Determine the sensitivity level ('low', 'medium', 'high', 'unknown'). Base this on column name, data type, its (original or new) description. If a reasonable original sensitivity is provided, consider it.
    *   PRIMARY_KEY: Based on the column's name (e.g., 'ID', 'PK', '{table_name}_ID') and its nature, determine if it's likely a primary key. Output 'true' or 'false' (as a string). If a reasonable original value for PRIMARY_KEY is provided, prioritize it.
    *   FOREIGN_KEY: Based on the column's name (e.g., '{related_table}_ID', 'FK_') and its relationship to other tables (use "Other Table Names in Dataset" for context), determine if it's likely a foreign key. Output 'true' or 'false' (as a string). If a reasonable original value for FOREIGN_KEY is provided, prioritize it.

CRITICAL INSTRUCTIONS:
- You MUST return all original fields for the table and columns, even if you don't change them, but with your enriched values for the fields specified above.
- Preserve all existing data that you are not explicitly asked to modify or determine. For fields like source, location, DATABASE_NAME, SCHEMA_NAME, OWNER, CREATED_DATE, UPDATED_DATE, Row_count (for tables) and DATA_TYPE, location (for columns), return their original values as provided in the input.
- If an existing description/tag seems adequate or user-provided, you may refine it or keep it. Do not discard good existing information, but prioritize generating content if fields are clearly placeholders or empty.

Output Format:
Ensure your output strictly adheres to the JSON schema with an "enrichedTable" object and an "enrichedColumns" array.
The "enrichedTable" object should contain all original fields from the input tableToEnrich, with 'Description', 'Table_tags', and 'Sensitivity' updated.
Each object in "enrichedColumns" array should contain all original fields from the input column, with 'column_description', 'Column_tags', 'Sensitivity', 'PRIMARY_KEY', and 'FOREIGN_KEY' updated.
The TABLE_NAME in each enriched column must match the input table's TABLE_NAME.
The COLUMN_NAME in each enriched column must match its original COLUMN_NAME.
`,
});

const enrichTableFlow = ai.defineFlow(
  {
    name: 'enrichTableFlow',
    inputSchema: EnrichTableInputSchema,
    outputSchema: EnrichTableOutputSchema,
  },
  async (input) => {
    const sanitizedTable = {
      TABLE_NAME: input.tableToEnrich.TABLE_NAME,
      Dataset_name: input.tableToEnrich.Dataset_name,
      source: input.tableToEnrich.source ?? null,
      location: input.tableToEnrich.location ?? null,
      DATABASE_NAME: input.tableToEnrich.DATABASE_NAME ?? null,
      SCHEMA_NAME: input.tableToEnrich.SCHEMA_NAME ?? null,
      OWNER: input.tableToEnrich.OWNER ?? null,
      // PRIMARY_KEYS and FOREIGN_KEYS are on table level, not enriched by AI here per se
      PRIMARY_KEYS: input.tableToEnrich.PRIMARY_KEYS ?? null,
      FOREIGN_KEYS: input.tableToEnrich.FOREIGN_KEYS ?? null,
      CREATED_DATE: input.tableToEnrich.CREATED_DATE ?? null,
      UPDATED_DATE: input.tableToEnrich.UPDATED_DATE ?? null,
      Row_count: input.tableToEnrich.Row_count ?? null,
      Description: input.tableToEnrich.Description || "", // Ensure "" if null/undefined for prompt
      Table_tags: input.tableToEnrich.Table_tags || "",   // Ensure "" if null/undefined for prompt
      Sensitivity: input.tableToEnrich.Sensitivity || "unknown",
    };

    const sanitizedColumns = (input.columnsToEnrich || []).map(c => ({ 
      TABLE_NAME: c.TABLE_NAME, // Should match sanitizedTable.TABLE_NAME
      COLUMN_NAME: c.COLUMN_NAME,
      DATA_TYPE: c.DATA_TYPE ?? null,
      PRIMARY_KEY: c.PRIMARY_KEY || null,
      FOREIGN_KEY: c.FOREIGN_KEY || null,
      column_description: c.column_description || "", // Ensure "" for prompt
      Column_tags: c.Column_tags || "",           // Ensure "" for prompt
      Sensitivity: c.Sensitivity || "unknown",
      location: c.location ?? null,
    }));

    const sanitizedInput = {
      datasetContext: { 
        Dataset_name: input.datasetContext.Dataset_name,
        Dataset_description: input.datasetContext.Dataset_description || "", 
      },
      tableToEnrich: sanitizedTable,
      columnsToEnrich: sanitizedColumns,
      otherTableNamesInDataset: input.otherTableNamesInDataset || [], 
    };
    
    // Log the exact sanitized input being sent to the AI
    console.log('[enrichTableFlow] Exact Sanitized Input to AI Prompt:', JSON.stringify({
        datasetName: sanitizedInput.datasetContext.Dataset_name,
        tableName: sanitizedInput.tableToEnrich.TABLE_NAME,
        tableOriginalDescriptionForPrompt: sanitizedInput.tableToEnrich.Description,
        tableOriginalTagsForPrompt: sanitizedInput.tableToEnrich.Table_tags,
        columnCount: sanitizedInput.columnsToEnrich.length,
        firstColumnName: sanitizedInput.columnsToEnrich[0]?.COLUMN_NAME,
        firstColumnOriginalDescriptionForPrompt: sanitizedInput.columnsToEnrich[0]?.column_description,
        firstColumnOriginalTagsForPrompt: sanitizedInput.columnsToEnrich[0]?.Column_tags,
    }, null, 2));


    const {output} = await prompt(sanitizedInput); 

    if (!output || !output.enrichedTable || !output.enrichedColumns) {
      console.error('[enrichTableFlow] AI enrichment for table returned no output or malformed response envelope. Output received:', output);
      throw new Error('AI enrichment for table returned no output or malformed response envelope.');
    }
    
    console.log(`[enrichTableFlow] Raw AI Output for table ${input.tableToEnrich.TABLE_NAME}:`, JSON.stringify(output, null, 2).substring(0, 1000) + "...");

    const aiEnrichedColumns = output.enrichedColumns || [];
    
    // Start with a map of original columns for efficient lookup and ensuring all are processed
    const originalColumnsMap = new Map(input.columnsToEnrich.map(col => [col.COLUMN_NAME, col]));
    const finalNormalizedColumns: z.infer<typeof EnrichedColumnDataSchema>[] = [];

    for (const colAI of aiEnrichedColumns) {
        if (!colAI.COLUMN_NAME) {
            console.warn(`[enrichTableFlow-Normalize] AI returned a column without COLUMN_NAME for table ${input.tableToEnrich.TABLE_NAME}. Skipping. AI Column:`, colAI);
            continue;
        }
        const originalInputColumn = originalColumnsMap.get(colAI.COLUMN_NAME);
        if (!originalInputColumn) {
            console.warn(`[enrichTableFlow-Normalize] Column ${colAI.COLUMN_NAME} from AI not found in original input columns for table ${input.tableToEnrich.TABLE_NAME}. Skipping this column from AI output, but will retain original if it exists. AI Column:`, colAI);
            continue; // Skip AI column not in original input. Original will be added back later if it existed.
        }
        
        // Remove from map so we know it's been processed
        originalColumnsMap.delete(colAI.COLUMN_NAME);

        let pkValue = colAI.PRIMARY_KEY;
        if (typeof pkValue === 'boolean') pkValue = pkValue ? 'true' : 'false';
        else if (typeof pkValue === 'string' && (pkValue.toLowerCase() === 'true' || pkValue.toLowerCase() === 'false')) pkValue = pkValue.toLowerCase();
        else pkValue = originalInputColumn.PRIMARY_KEY ?? null; 

        let fkValue = colAI.FOREIGN_KEY;
        if (typeof fkValue === 'boolean') fkValue = fkValue ? 'true' : 'false';
        else if (typeof fkValue === 'string' && (fkValue.toLowerCase() === 'true' || fkValue.toLowerCase() === 'false')) fkValue = fkValue.toLowerCase();
        else fkValue = originalInputColumn.FOREIGN_KEY ?? null;
        
        finalNormalizedColumns.push({
            TABLE_NAME: input.tableToEnrich.TABLE_NAME,
            COLUMN_NAME: colAI.COLUMN_NAME,
            column_description: colAI.column_description ?? originalInputColumn.column_description ?? null,
            Column_tags: colAI.Column_tags ?? originalInputColumn.Column_tags ?? null,
            Sensitivity: colAI.Sensitivity ?? originalInputColumn.Sensitivity ?? 'unknown',
            PRIMARY_KEY: pkValue,
            FOREIGN_KEY: fkValue,
            DATA_TYPE: colAI.DATA_TYPE ?? originalInputColumn.DATA_TYPE ?? null,
            location: colAI.location ?? originalInputColumn.location ?? null,
        });
    }
    
    // Add back any original columns that the AI might have missed
    originalColumnsMap.forEach(originalCol => {
        console.warn(`[enrichTableFlow-Normalize] Original column ${originalCol.COLUMN_NAME} was not returned by AI for table ${input.tableToEnrich.TABLE_NAME}. Re-adding original raw column.`);
        finalNormalizedColumns.push({
            ...originalCol, // Spread original raw column
            TABLE_NAME: input.tableToEnrich.TABLE_NAME,
            PRIMARY_KEY: String(originalCol.PRIMARY_KEY).toLowerCase() === 'true' ? 'true' : (String(originalCol.PRIMARY_KEY).toLowerCase() === 'false' ? 'false' : null),
            FOREIGN_KEY: String(originalCol.FOREIGN_KEY).toLowerCase() === 'true' ? 'true' : (String(originalCol.FOREIGN_KEY).toLowerCase() === 'false' ? 'false' : null),
            column_description: originalCol.column_description ?? null,
            Column_tags: originalCol.Column_tags ?? null,
            Sensitivity: originalCol.Sensitivity ?? 'unknown',
        });
    });


    const originalInputTable = input.tableToEnrich;
    const finalEnrichedTableData = {
        ...originalInputTable, 
        ...output.enrichedTable, 
        TABLE_NAME: input.tableToEnrich.TABLE_NAME,
        Dataset_name: input.datasetContext.Dataset_name,
        Description: output.enrichedTable.Description ?? originalInputTable.Description ?? null,
        Table_tags: output.enrichedTable.Table_tags ?? originalInputTable.Table_tags ?? null,
        Sensitivity: output.enrichedTable.Sensitivity ?? originalInputTable.Sensitivity ?? 'unknown',
        Row_count: (output.enrichedTable.Row_count !== undefined && output.enrichedTable.Row_count !== null) 
                    ? String(output.enrichedTable.Row_count) 
                    : (originalInputTable.Row_count ?? null),
    };


    const finalOutput = {
        enrichedTable: finalEnrichedTableData,
        enrichedColumns: finalNormalizedColumns,
    };
    
    console.log(`[enrichTableFlow] Processed & Normalized Output for table ${input.tableToEnrich.TABLE_NAME}:`, JSON.stringify(finalOutput, null, 2).substring(0, 500) + "...");
    return finalOutput;
  }
);
