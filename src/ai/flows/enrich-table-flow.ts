
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


// --- Schemas for the AI's DIRECT output (Permissive) ---
const PermissiveEnrichedTableDataSchema = z.object({
  TABLE_NAME: z.string().describe("The name of the table. Must match input."),
  Dataset_name: z.string().describe("The name of the dataset. Must match input."),
  Description: z.string().nullable().optional().describe("Generated or improved table description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  Table_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the table. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
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

const PermissiveEnrichedColumnDataSchema = z.object({
  TABLE_NAME: z.string().describe("The name of the table this column belongs to. Must match input."),
  COLUMN_NAME: z.string().describe("The name of the column. Must match input."),
  column_description: z.string().nullable().optional().describe("Generated or improved column description. You MUST generate this. Can be an empty string or null if no meaningful description can be generated."),
  Column_tags: z.string().nullable().optional().describe("Generated or improved comma-separated tags for the column. You MUST generate this. Can be an empty string or null if no meaningful tags can be generated."),
  Sensitivity: z.string().nullable().optional().describe("Determined sensitivity level ('low', 'medium', 'high', or 'unknown'). Consider original value if present."),
  PRIMARY_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a primary key ('true'/'false' as string, or boolean). Consider original value."),
  FOREIGN_KEY: z.union([z.boolean(), z.string()]).nullable().optional().describe("Determined if this column is a foreign key ('true'/'false' as string, or boolean). Consider original value and other table names."),
  // Pass-through fields - AI should return them as-is, schema is permissive
  DATA_TYPE: z.any().nullable().optional(),
  location: z.any().nullable().optional(),
});

const EnrichTableAIOutputSchema = z.object({
  enrichedTable: PermissiveEnrichedTableDataSchema,
  enrichedColumns: z.array(PermissiveEnrichedColumnDataSchema),
});


// --- Schemas for what the FLOW will *RETURN* (Strictly typed after normalization) ---
const EnrichedTableDataSchema = TableSchemaForAIInput.extend({ // Base on input to include all original fields strictly
  Description: z.string().nullable().optional(),
  Table_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
}).omit({ PRIMARY_KEYS: true, FOREIGN_KEYS: true }); // These are handled per column

const EnrichedColumnDataSchema = ColumnSchemaForAIInput.extend({ // Base on input
  column_description: z.string().nullable().optional(),
  Column_tags: z.string().nullable().optional(),
  Sensitivity: z.string().nullable().optional(),
  PRIMARY_KEY: z.string().nullable().optional(), // 'true', 'false', or null
  FOREIGN_KEY: z.string().nullable().optional(), // 'true', 'false', or null
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
        const errorMsg = `EnrichTableFlow returned null or undefined for table ${input.tableToEnrich.TABLE_NAME}. This indicates an issue within the flow.`;
        console.error(`[enrichSingleTable Function Error] ${errorMsg}`);
        throw new Error(errorMsg);
    }
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
  output: {schema: EnrichTableAIOutputSchema}, // Use the PERMISSIVE schema for AI's direct output
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
    *   PRIMARY_KEY: Based on the column's name (e.g., 'ID', 'PK', '{table_name}_ID') and its nature, determine if it's likely a primary key. Output 'true' or 'false' (as a string or boolean). If a reasonable original value for PRIMARY_KEY is provided, prioritize it.
    *   FOREIGN_KEY: Based on the column's name (e.g., '{related_table}_ID', 'FK_') and its relationship to other tables (use "Other Table Names in Dataset" for context), determine if it's likely a foreign key. Output 'true' or 'false' (as a string or boolean). If a reasonable original value for FOREIGN_KEY is provided, prioritize it.

CRITICAL INSTRUCTIONS:
- You MUST return all original fields for the table and for EACH of its columns, even if you don't change them, but with your enriched values for the fields specified above.
- The "enrichedColumns" array in your output MUST contain an object for EVERY column that was in the "Columns in {{tableToEnrich.TABLE_NAME}}" section of the input.
- Each column object in your "enrichedColumns" output MUST preserve the original COLUMN_NAME and TABLE_NAME (which should match the table being enriched: {{tableToEnrich.TABLE_NAME}}).
- Each column object in "enrichedColumns" MUST also preserve its original DATA_TYPE and location.
- Preserve all existing table-level data that you are not explicitly asked to modify or determine (e.g., source, location, DATABASE_NAME, SCHEMA_NAME, OWNER, CREATED_DATE, UPDATED_DATE, Row_count).
- If an existing description/tag seems adequate or user-provided, you may refine it or keep it. Do not discard good existing information, but prioritize generating content if fields are clearly placeholders or empty.

Output Format:
Ensure your output strictly adheres to the JSON schema with an "enrichedTable" object and an "enrichedColumns" array.
The "enrichedTable" object should contain all original fields from the input tableToEnrich, with 'Description', 'Table_tags', and 'Sensitivity' updated as per your determination. It MUST also include TABLE_NAME and Dataset_name matching the input.
Each object in "enrichedColumns" array should contain all original fields from the input column, with 'column_description', 'Column_tags', 'Sensitivity', 'PRIMARY_KEY', and 'FOREIGN_KEY' updated as per your determination. It MUST also include TABLE_NAME (matching the input table) and COLUMN_NAME matching the input column.
`,
});

const enrichTableFlow = ai.defineFlow(
  {
    name: 'enrichTableFlow',
    inputSchema: EnrichTableInputSchema,
    outputSchema: EnrichTableOutputSchema, // Strict schema for the flow's final output
  },
  async (input): Promise<EnrichTableOutput> => {
    const sanitizedTable = {
      TABLE_NAME: input.tableToEnrich.TABLE_NAME,
      Dataset_name: input.tableToEnrich.Dataset_name,
      source: input.tableToEnrich.source ?? null,
      location: input.tableToEnrich.location ?? null,
      DATABASE_NAME: input.tableToEnrich.DATABASE_NAME ?? null,
      SCHEMA_NAME: input.tableToEnrich.SCHEMA_NAME ?? null,
      OWNER: input.tableToEnrich.OWNER ?? null,
      // PK/FK on table level are not sent to AI, derived from columns.
      CREATED_DATE: input.tableToEnrich.CREATED_DATE ?? null,
      UPDATED_DATE: input.tableToEnrich.UPDATED_DATE ?? null,
      Row_count: input.tableToEnrich.Row_count ?? null,
      Description: input.tableToEnrich.Description || "", // Send empty string if null
      Table_tags: input.tableToEnrich.Table_tags || "",   // Send empty string if null
      Sensitivity: input.tableToEnrich.Sensitivity || "unknown", // Default if null
    };

    const sanitizedColumns = (input.columnsToEnrich || []).map(c => ({
      TABLE_NAME: input.tableToEnrich.TABLE_NAME, 
      COLUMN_NAME: c.COLUMN_NAME,
      DATA_TYPE: c.DATA_TYPE ?? null,
      PRIMARY_KEY: c.PRIMARY_KEY || null, // Send original PK status or null
      FOREIGN_KEY: c.FOREIGN_KEY || null, // Send original FK status or null
      column_description: c.column_description || "", // Send empty string if null
      Column_tags: c.Column_tags || "",       // Send empty string if null
      Sensitivity: c.Sensitivity || "unknown",   // Default if null
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

    let aiModelOutput; // This will be of type z.infer<typeof EnrichTableAIOutputSchema>
    try {
      const {output} = await prompt(sanitizedInput); // AI call, parsed by Genkit using EnrichTableAIOutputSchema
      aiModelOutput = output;
    } catch (error) {
      console.error(`[enrichTableFlow] Error calling AI prompt for table ${input.tableToEnrich.TABLE_NAME}:`, error);
      throw new Error(`AI prompt call failed for table ${input.tableToEnrich.TABLE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!aiModelOutput || !aiModelOutput.enrichedTable || !Array.isArray(aiModelOutput.enrichedColumns)) {
      console.error('[enrichTableFlow] AI enrichment for table returned no output or malformed response envelope (e.g. missing enrichedTable or enrichedColumns). Output received:', aiModelOutput);
      throw new Error('AI enrichment for table returned no output or malformed response envelope.');
    }

    console.log(`[enrichTableFlow] Raw AI Output (parsed by Genkit against Permissive Schema) for table ${input.tableToEnrich.TABLE_NAME}:`, JSON.stringify(aiModelOutput, null, 2).substring(0, 1000) + "...");

    // --- Normalization Step: Convert AI's (permissive) output to the strict flow output schema ---
    const originalInputTable = input.tableToEnrich; // The non-sanitized version for true original values
    const aiProvidedTable = aiModelOutput.enrichedTable;

    const finalEnrichedTableData: z.infer<typeof EnrichedTableDataSchema> = {
        TABLE_NAME: originalInputTable.TABLE_NAME, // Must come from original input
        Dataset_name: originalInputTable.Dataset_name, // Must come from original input
        Description: aiProvidedTable.Description ?? originalInputTable.Description ?? null,
        Table_tags: aiProvidedTable.Table_tags ?? originalInputTable.Table_tags ?? null,
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
    // Iterate over original input columns to ensure all are present and correctly merged
    for (const originalInputCol of input.columnsToEnrich) { // Iterate over the original, non-sanitized columns
        const aiCol = aiModelOutput.enrichedColumns.find(c => c.COLUMN_NAME === originalInputCol.COLUMN_NAME && c.TABLE_NAME === originalInputCol.TABLE_NAME);

        let pkValue: string | null = null;
        const aiPk = aiCol?.PRIMARY_KEY;
        if (typeof aiPk === 'boolean') pkValue = aiPk ? 'true' : 'false';
        else if (typeof aiPk === 'string' && (aiPk.toLowerCase() === 'true' || aiPk.toLowerCase() === 'false')) pkValue = aiPk.toLowerCase();
        else pkValue = originalInputCol.PRIMARY_KEY ?? null; // Fallback to original

        let fkValue: string | null = null;
        const aiFk = aiCol?.FOREIGN_KEY;
        if (typeof aiFk === 'boolean') fkValue = aiFk ? 'true' : 'false';
        else if (typeof aiFk === 'string' && (aiFk.toLowerCase() === 'true' || aiFk.toLowerCase() === 'false')) fkValue = aiFk.toLowerCase();
        else fkValue = originalInputCol.FOREIGN_KEY ?? null; // Fallback to original
        
        const normalizedCol: z.infer<typeof EnrichedColumnDataSchema> = {
            TABLE_NAME: originalInputCol.TABLE_NAME, // Must be from original input
            COLUMN_NAME: originalInputCol.COLUMN_NAME, // Must be from original input
            DATA_TYPE: String(aiCol?.DATA_TYPE ?? originalInputCol.DATA_TYPE ?? null),
            location: String(aiCol?.location ?? originalInputCol.location ?? null),
            column_description: aiCol?.column_description ?? originalInputCol.column_description ?? null,
            Column_tags: aiCol?.Column_tags ?? originalInputCol.Column_tags ?? null,
            Sensitivity: aiCol?.Sensitivity ?? originalInputCol.Sensitivity ?? 'unknown',
            PRIMARY_KEY: pkValue,
            FOREIGN_KEY: fkValue,
        };
        finalNormalizedColumns.push(normalizedCol);
    }
    
    // Ensure no columns were dropped if AI didn't return them
    if (finalNormalizedColumns.length !== input.columnsToEnrich.length) {
        console.warn(`[enrichTableFlow] Column count mismatch for table ${input.tableToEnrich.TABLE_NAME}. Input: ${input.columnsToEnrich.length}, AI+Normalized: ${finalNormalizedColumns.length}. This might indicate AI dropped columns or naming issues.`);
        // Potentially re-iterate input.columnsToEnrich and add any missing ones using only original data
        input.columnsToEnrich.forEach(originalCol => {
            if (!finalNormalizedColumns.some(nc => nc.COLUMN_NAME === originalCol.COLUMN_NAME && nc.TABLE_NAME === originalCol.TABLE_NAME)) {
                console.log(`[enrichTableFlow] Adding back missing column from original input: ${originalCol.TABLE_NAME}.${originalCol.COLUMN_NAME}`);
                finalNormalizedColumns.push({
                    ...originalCol, // Spread all fields from original RawColumn
                    PRIMARY_KEY: String(originalCol.PRIMARY_KEY).toLowerCase() === 'true' ? 'true' : (String(originalCol.PRIMARY_KEY).toLowerCase() === 'false' ? 'false' : null),
                    FOREIGN_KEY: String(originalCol.FOREIGN_KEY).toLowerCase() === 'true' ? 'true' : (String(originalCol.FOREIGN_KEY).toLowerCase() === 'false' ? 'false' : null),
                });
            }
        });
    }


    const finalOutput: EnrichTableOutput = {
        enrichedTable: finalEnrichedTableData,
        enrichedColumns: finalNormalizedColumns,
    };

    console.log(`[enrichTableFlow] Processed & Normalized Output (to match strict schema) for table ${input.tableToEnrich.TABLE_NAME}:`, JSON.stringify(finalOutput, null, 2).substring(0, 500) + "...");
    return finalOutput;
  }
);

