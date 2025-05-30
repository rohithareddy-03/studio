
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
  Description: z.string().nullable().optional().describe("Generated or improved table description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  Table_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
}).omit({ PRIMARY_KEYS: true, FOREIGN_KEYS: true }); // AI determines these per column now

const EnrichedColumnDataSchema = ColumnSchemaForAIInput.extend({
  column_description: z.string().nullable().optional().describe("Generated or improved column description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  Column_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
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
    if (!flowResult) {
        // This case should ideally be handled by enrichTableFlow itself throwing an error if !output.
        // But as a safeguard, if enrichTableFlow somehow returns null/undefined:
        const errorMsg = `EnrichTableFlow returned null or undefined for table ${input.tableToEnrich.TABLE_NAME}. This indicates an issue within the flow.`;
        console.error(`[enrichSingleTable Function Error] ${errorMsg}`);
        throw new Error(errorMsg);
    }
    console.log(`[enrichSingleTableFlow] Successfully processed table: ${input.tableToEnrich.TABLE_NAME}. Output snippet:`, JSON.stringify(flowResult, null, 2).substring(0,1000) + '...');
    return flowResult;
  } catch (error) {
    console.error(`[enrichSingleTable Function Error] Failed to enrich table ${input.tableToEnrich.TABLE_NAME} during flow execution. Input that caused error:`, JSON.stringify(input, null, 2).substring(0,1000) + "...");
    console.error(`[enrichSingleTable Function Error] Detailed error:`, error);
    throw error; // Re-throw the error to be caught by the API route or CatalogProvider
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
- You MUST return all original fields for the table and for EACH of its columns, even if you don't change them, but with your enriched values for the fields specified above.
- The "enrichedColumns" array in your output MUST contain an object for EVERY column that was in the "Columns in {{tableToEnrich.TABLE_NAME}}" section of the input.
- Each column object in your "enrichedColumns" output MUST preserve the original COLUMN_NAME and TABLE_NAME (which should match the table being enriched: {{tableToEnrich.TABLE_NAME}}).
- Each column object in "enrichedColumns" MUST also preserve its original DATA_TYPE and location.
- Preserve all existing table-level data that you are not explicitly asked to modify or determine (e.g., source, location, DATABASE_NAME, SCHEMA_NAME, OWNER, CREATED_DATE, UPDATED_DATE, Row_count).
- If an existing description/tag seems adequate or user-provided, you may refine it or keep it. Do not discard good existing information, but prioritize generating content if fields are clearly placeholders or empty.

Output Format:
Ensure your output strictly adheres to the JSON schema with an "enrichedTable" object and an "enrichedColumns" array.
The "enrichedTable" object should contain all original fields from the input tableToEnrich, with 'Description', 'Table_tags', and 'Sensitivity' updated as per your determination.
Each object in "enrichedColumns" array should contain all original fields from the input column, with 'column_description', 'Column_tags', 'Sensitivity', 'PRIMARY_KEY', and 'FOREIGN_KEY' updated as per your determination.
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
      PRIMARY_KEYS: input.tableToEnrich.PRIMARY_KEYS ?? null,
      FOREIGN_KEYS: input.tableToEnrich.FOREIGN_KEYS ?? null,
      CREATED_DATE: input.tableToEnrich.CREATED_DATE ?? null,
      UPDATED_DATE: input.tableToEnrich.UPDATED_DATE ?? null,
      Row_count: input.tableToEnrich.Row_count ?? null,
      Description: input.tableToEnrich.Description || "",
      Table_tags: input.tableToEnrich.Table_tags || "",
      Sensitivity: input.tableToEnrich.Sensitivity || "unknown",
    };

    const sanitizedColumns = (input.columnsToEnrich || []).map(c => ({
      TABLE_NAME: input.tableToEnrich.TABLE_NAME, // Ensure AI sees correct table name context
      COLUMN_NAME: c.COLUMN_NAME,
      DATA_TYPE: c.DATA_TYPE ?? null,
      PRIMARY_KEY: c.PRIMARY_KEY || null,
      FOREIGN_KEY: c.FOREIGN_KEY || null,
      column_description: c.column_description || "",
      Column_tags: c.Column_tags || "",
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

    let aiResponseOutput;
    try {
      const {output} = await prompt(sanitizedInput);
      aiResponseOutput = output;
    } catch (error) {
      console.error(`[enrichTableFlow] Error calling AI prompt for table ${input.tableToEnrich.TABLE_NAME}:`, error);
      // Re-throw the error so it can be caught by the calling function (enrichSingleTable)
      // and then by the API route, which can return a proper error response to the client.
      throw new Error(`AI prompt call failed for table ${input.tableToEnrich.TABLE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
    }


    if (!aiResponseOutput || !aiResponseOutput.enrichedTable || !Array.isArray(aiResponseOutput.enrichedColumns)) {
      console.error('[enrichTableFlow] AI enrichment for table returned no output or malformed response envelope. Output received:', aiResponseOutput);
      throw new Error('AI enrichment for table returned no output or malformed response envelope.');
    }

    console.log(`[enrichTableFlow] Raw AI Output for table ${input.tableToEnrich.TABLE_NAME}:`, JSON.stringify(aiResponseOutput, null, 2).substring(0, 1000) + "...");

    const aiEnrichedColumnsFromAI = aiResponseOutput.enrichedColumns || [];
    const finalNormalizedColumns: z.infer<typeof EnrichedColumnDataSchema>[] = [];

    // Iterate over the original input columns to ensure all are processed and preserved
    for (const originalInputColumn of input.columnsToEnrich) {
      const colAI = aiEnrichedColumnsFromAI.find(c => c.COLUMN_NAME === originalInputColumn.COLUMN_NAME && c.TABLE_NAME === input.tableToEnrich.TABLE_NAME);

      if (!colAI) {
        console.warn(`[enrichTableFlow-Normalize] Column ${originalInputColumn.COLUMN_NAME} from original input not found in AI's response for table ${input.tableToEnrich.TABLE_NAME}. Using original raw column data.`);
        finalNormalizedColumns.push({
            ...originalInputColumn,
            TABLE_NAME: input.tableToEnrich.TABLE_NAME, // Ensure correct table name
            PRIMARY_KEY: String(originalInputColumn.PRIMARY_KEY).toLowerCase() === 'true' ? 'true' : (String(originalInputColumn.PRIMARY_KEY).toLowerCase() === 'false' ? 'false' : null),
            FOREIGN_KEY: String(originalInputColumn.FOREIGN_KEY).toLowerCase() === 'true' ? 'true' : (String(originalInputColumn.FOREIGN_KEY).toLowerCase() === 'false' ? 'false' : null),
            column_description: originalInputColumn.column_description ?? null,
            Column_tags: originalInputColumn.Column_tags ?? null,
            Sensitivity: originalInputColumn.Sensitivity ?? 'unknown',
        });
        continue;
      }

      let pkValue = colAI.PRIMARY_KEY;
      if (typeof pkValue === 'boolean') pkValue = pkValue ? 'true' : 'false';
      else if (typeof pkValue === 'string' && (pkValue.toLowerCase() === 'true' || pkValue.toLowerCase() === 'false')) pkValue = pkValue.toLowerCase();
      else pkValue = originalInputColumn.PRIMARY_KEY ?? null;

      let fkValue = colAI.FOREIGN_KEY;
      if (typeof fkValue === 'boolean') fkValue = fkValue ? 'true' : 'false';
      else if (typeof fkValue === 'string' && (fkValue.toLowerCase() === 'true' || fkValue.toLowerCase() === 'false')) fkValue = fkValue.toLowerCase();
      else fkValue = originalInputColumn.FOREIGN_KEY ?? null;

      finalNormalizedColumns.push({
          ...originalInputColumn, // Preserves original DATA_TYPE, location, etc.
          TABLE_NAME: input.tableToEnrich.TABLE_NAME, // Crucial: Ensure table name is from input
          COLUMN_NAME: originalInputColumn.COLUMN_NAME, // Crucial: Ensure column name is from input
          column_description: colAI.column_description ?? originalInputColumn.column_description ?? null,
          Column_tags: colAI.Column_tags ?? originalInputColumn.Column_tags ?? null,
          Sensitivity: colAI.Sensitivity ?? originalInputColumn.Sensitivity ?? 'unknown',
          PRIMARY_KEY: pkValue,
          FOREIGN_KEY: fkValue,
          DATA_TYPE: colAI.DATA_TYPE ?? originalInputColumn.DATA_TYPE ?? null,
          location: colAI.location ?? originalInputColumn.location ?? null,
      });
    }

    const originalInputTable = input.tableToEnrich;
    const finalEnrichedTableData = {
        ...originalInputTable,
        ...aiResponseOutput.enrichedTable,
        TABLE_NAME: input.tableToEnrich.TABLE_NAME, // Critical: ensure AI cannot change table name
        Dataset_name: input.datasetContext.Dataset_name, // Critical: ensure AI cannot change dataset name
        Description: aiResponseOutput.enrichedTable.Description ?? originalInputTable.Description ?? null,
        Table_tags: aiResponseOutput.enrichedTable.Table_tags ?? originalInputTable.Table_tags ?? null,
        Sensitivity: aiResponseOutput.enrichedTable.Sensitivity ?? originalInputTable.Sensitivity ?? 'unknown',
        Row_count: (aiResponseOutput.enrichedTable.Row_count !== undefined && aiResponseOutput.enrichedTable.Row_count !== null)
                    ? String(aiResponseOutput.enrichedTable.Row_count)
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

