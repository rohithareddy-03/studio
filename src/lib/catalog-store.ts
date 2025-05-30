
// src/lib/catalog-store.ts
import type { CatalogData, EnrichedDataset, EnrichedTable, EnrichedColumn, RawDataset, RawTable, RawColumn } from '@/types';
import { enrichMetadata as enrichMetadataAI, type EnrichMetadataInput, type EnrichMetadataFlowOutput } from '@/ai/flows/enrich-metadata-on-upload';

// This is a simple in-memory store. Data will be lost when the server restarts.
// For a production environment, consider a persistent storage solution.
let catalog: CatalogData = { datasets: [] };
let rawDataForEnrichment: EnrichMetadataInput | null = null;

// Helper to transform AI bulk output to CatalogData
function transformAiOutputToCatalog(aiOutput: EnrichMetadataFlowOutput): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();

  // Ensure aiOutput and its properties are arrays before processing
  const aiDatasets = Array.isArray(aiOutput?.datasets) ? aiOutput.datasets : [];
  const aiTables = Array.isArray(aiOutput?.tables) ? aiOutput.tables : [];
  const aiColumns = Array.isArray(aiOutput?.columns) ? aiOutput.columns : [];

  aiDatasets.forEach(d_ai => {
    if (!d_ai || !d_ai.Dataset_name) {
      console.warn(`[CatalogStore-Transform] Skipping AI dataset due to missing Dataset_name: ${JSON.stringify(d_ai)}`);
      return;
    }
    const originalRawDataset = rawDataForEnrichment?.datasets.find(rd => rd.Dataset_name === d_ai.Dataset_name);

    datasetsMap.set(d_ai.Dataset_name, {
      id: d_ai.Dataset_name,
      name: d_ai.Dataset_name,
      description: d_ai.Dataset_description ?? originalRawDataset?.Dataset_description ?? null,
      tags: d_ai.Tags ?? originalRawDataset?.Tags ?? null,
      source: d_ai.source ?? originalRawDataset?.source ?? null,
      location: d_ai.location ?? originalRawDataset?.location ?? null,
      sensitivity: 'unknown', // Placeholder, can be derived
      tables: [],
    });
  });

  aiTables.forEach(t_ai => {
    if (!t_ai || !t_ai.Dataset_name || !t_ai.TABLE_NAME) {
      console.warn(`[CatalogStore-Transform] Skipping AI table due to missing identifiers: ${JSON.stringify(t_ai)}`);
      return;
    }
    const dataset = datasetsMap.get(t_ai.Dataset_name);
    if (dataset) {
      const originalRawTable = rawDataForEnrichment?.tables.find(rt => rt.Dataset_name === t_ai.Dataset_name && rt.TABLE_NAME === t_ai.TABLE_NAME);
      const tableColumns: EnrichedColumn[] = [];
      const uniqueColumnTracker = new Set<string>();

      aiColumns
        .filter(c_ai => c_ai && c_ai.TABLE_NAME === t_ai.TABLE_NAME)
        .forEach(c_ai => {
          if (!c_ai.COLUMN_NAME) {
            console.warn(`[CatalogStore-Transform] Skipping AI column due to missing COLUMN_NAME: ${JSON.stringify(c_ai)}`);
            return;
          }
          const columnId = `${dataset.name}/${t_ai.TABLE_NAME}/${c_ai.COLUMN_NAME}`;
          if (uniqueColumnTracker.has(columnId)) {
            console.warn(`[CatalogStore-Transform] Duplicate AI column ID skipped: ${columnId}`);
            return;
          }
          uniqueColumnTracker.add(columnId);
          const originalRawColumn = rawDataForEnrichment?.columns.find(rc => rc.TABLE_NAME === c_ai.TABLE_NAME && rc.COLUMN_NAME === c_ai.COLUMN_NAME);

          tableColumns.push({
            id: columnId,
            name: c_ai.COLUMN_NAME,
            description: c_ai.column_description ?? originalRawColumn?.column_description ?? null,
            tags: c_ai.Column_tags ?? originalRawColumn?.Column_tags ?? null,
            dataType: c_ai.DATA_TYPE ?? originalRawColumn?.DATA_TYPE ?? null,
            isPrimaryKey: (String(c_ai.PRIMARY_KEY).toLowerCase() === 'true'), // Normalize from AI
            isForeignKey: (String(c_ai.FOREIGN_KEY).toLowerCase() === 'true'), // Normalize from AI
            sensitivity: c_ai.Sensitivity ?? originalRawColumn?.Sensitivity ?? 'unknown',
            location: c_ai.location ?? originalRawColumn?.location ?? null,
          });
        });

      dataset.tables.push({
        id: `${dataset.name}/${t_ai.TABLE_NAME}`,
        name: t_ai.TABLE_NAME,
        description: t_ai.Description ?? originalRawTable?.Description ?? null,
        tags: t_ai.Table_tags ?? originalRawTable?.Table_tags ?? null,
        sensitivity: t_ai.Sensitivity ?? originalRawTable?.Sensitivity ?? 'unknown',
        source: t_ai.source ?? originalRawTable?.source ?? null,
        location: t_ai.location ?? originalRawTable?.location ?? null,
        databaseName: t_ai.DATABASE_NAME ?? originalRawTable?.DATABASE_NAME ?? null,
        schemaName: t_ai.SCHEMA_NAME ?? originalRawTable?.SCHEMA_NAME ?? null,
        owner: t_ai.OWNER ?? originalRawTable?.OWNER ?? null,
        primaryKeys: t_ai.PRIMARY_KEYS ?? originalRawTable?.PRIMARY_KEYS ?? null,
        foreignKeys: t_ai.FOREIGN_KEYS ?? originalRawTable?.FOREIGN_KEYS ?? null,
        createdDate: t_ai.CREATED_DATE ?? originalRawTable?.CREATED_DATE ?? null,
        updatedDate: t_ai.UPDATED_DATE ?? originalRawTable?.UPDATED_DATE ?? null,
        rowCount: (t_ai.Row_count ? parseInt(String(t_ai.Row_count), 10) : null) ?? (originalRawTable?.Row_count ? parseInt(originalRawTable.Row_count, 10) : undefined),
        columns: tableColumns,
      });
    } else {
        console.warn(`[CatalogStore-Transform] AI Table ${t_ai.TABLE_NAME} refers to non-existent dataset ${t_ai.Dataset_name}`);
    }
  });

  return { datasets: Array.from(datasetsMap.values()) };
}


// Fallback transformer if AI enrichment fails completely
function transformRawDataToCatalog(rawDatasets: RawDataset[], rawTables: RawTable[], rawColumns: RawColumn[]): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();

  rawDatasets.forEach(rd => {
    if (!rd || !rd.Dataset_name) {
        console.warn(`[CatalogStore-RawTransform] Skipping raw dataset with missing Dataset_name: ${JSON.stringify(rd)}`);
        return;
    }
    datasetsMap.set(rd.Dataset_name, {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description,
      tags: rd.Tags,
      source: rd.source,
      location: rd.location,
      sensitivity: 'unknown',
      tables: [],
    });
  });

  rawTables.forEach(rt => {
    if (!rt || !rt.Dataset_name || !rt.TABLE_NAME) {
      console.warn(`[CatalogStore-RawTransform] Skipping raw table with missing identifiers: ${JSON.stringify(rt)}`);
      return;
    }
    const dataset = datasetsMap.get(rt.Dataset_name);
    if (dataset) {
        const uniqueTableColumnsMap = new Map<string, EnrichedColumn>();
        rawColumns
          .filter(rc => rc && rc.TABLE_NAME === rt.TABLE_NAME)
          .forEach(rc => {
            if (!rc.COLUMN_NAME) {
                console.warn(`[CatalogStore-RawTransform] Skipping raw column with missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc)}`);
                return;
            }
            const columnId = `${dataset.name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`;
            if (!uniqueTableColumnsMap.has(columnId)) {
                uniqueTableColumnsMap.set(columnId, {
                  id: columnId,
                  name: rc.COLUMN_NAME,
                  dataType: rc.DATA_TYPE,
                  isPrimaryKey: String(rc.PRIMARY_KEY).toLowerCase() === 'true',
                  isForeignKey: String(rc.FOREIGN_KEY).toLowerCase() === 'true',
                  description: rc.column_description,
                  tags: rc.Column_tags,
                  sensitivity: rc.Sensitivity || 'unknown',
                  location: rc.location,
                });
            }
          });
        const tableColumns: EnrichedColumn[] = Array.from(uniqueTableColumnsMap.values());

      dataset.tables.push({
          id: `${dataset.name}/${rt.TABLE_NAME}`,
          name: rt.TABLE_NAME,
          source: rt.source,
          location: rt.location,
          databaseName: rt.DATABASE_NAME,
          schemaName: rt.SCHEMA_NAME,
          owner: rt.OWNER,
          primaryKeys: rt.PRIMARY_KEYS,
          foreignKeys: rt.FOREIGN_KEYS,
          createdDate: rt.CREATED_DATE,
          updatedDate: rt.UPDATED_DATE,
          rowCount: rt.Row_count ? parseInt(rt.Row_count, 10) : undefined,
          description: rt.Description,
          tags: rt.Table_tags,
          sensitivity: rt.Sensitivity || 'unknown',
          columns: tableColumns,
        });
    } else {
        console.warn(`[CatalogStore-RawTransform] Raw table ${rt.TABLE_NAME} refers to a non-existent dataset ${rt.Dataset_name}.`);
    }
  });
  return { datasets: Array.from(datasetsMap.values()) };
}


export async function initializeCatalog(rawD: RawDataset[], rawT: RawTable[], rawC: RawColumn[]): Promise<CatalogData> {
  console.log("[CatalogStore] Initializing catalog with raw data lengths:", rawD.length, rawT.length, rawC.length);
  storeRawDataForEnrichment({ datasets: rawD, tables: rawT, columns: rawC });

  if (!rawDataForEnrichment) {
    console.error("[CatalogStore] rawDataForEnrichment is null after storing. Cannot proceed with enrichment.");
    catalog = transformRawDataToCatalog(rawD, rawT, rawC); // Fallback to raw
    return catalog;
  }
  
  try {
    console.log("[CatalogStore] Calling bulk AI enrichment...");
    const enrichedAiOutput: EnrichMetadataFlowOutput = await enrichMetadataAI(rawDataForEnrichment);
    console.log("[CatalogStore] Bulk AI enrichment successful. Transforming AI output to catalog.");
    catalog = transformAiOutputToCatalog(enrichedAiOutput);
    return catalog;
  } catch (error) {
    console.error("[CatalogStore] Bulk AI enrichment failed during initialization:", error);
    console.log("[CatalogStore] Falling back to using raw data for catalog due to AI error.");
    catalog = transformRawDataToCatalog(rawD, rawT, rawC);
    return catalog;
  }
}

export async function reEnrichCatalog(): Promise<CatalogData | null> {
  if (!rawDataForEnrichment) {
    console.warn("[CatalogStore] No raw data available to re-enrich catalog.");
    return null;
  }
  try {
    console.log("[CatalogStore] Re-enriching catalog with stored raw data...");
    const enrichedAiOutput: EnrichMetadataFlowOutput = await enrichMetadataAI(rawDataForEnrichment);
    console.log("[CatalogStore] Re-enrichment successful. Transforming AI output to catalog.");
    catalog = transformAiOutputToCatalog(enrichedAiOutput);
    return catalog;
  } catch (error) {
    console.error("[CatalogStore] Error re-enriching metadata:", error);
    return null; 
  }
}

export function getCatalog(): CatalogData {
  return JSON.parse(JSON.stringify(catalog)); // Return a deep copy
}

export function getDatasetByName(name: string): EnrichedDataset | undefined {
  const currentCatalog = getCatalog(); 
  return currentCatalog.datasets.find(d => d.name === name);
}

export function getTableMetadata(datasetName: string, tableName: string): string | undefined {
  const dataset = getDatasetByName(datasetName);
  if (!dataset) return undefined;
  const table = dataset.tables.find(t => t.name === tableName);
  if (!table) return undefined;

  let metadata = `Table: ${tableName}\nDescription: ${table.description || 'N/A'}\nSensitivity: ${table.sensitivity || 'N/A'}\nLocation: ${table.location || 'N/A'}\nColumns:\n`;
  table.columns.forEach(col => {
    metadata += `  - ${col.name} (Type: ${col.dataType || 'N/A'}, PK: ${col.isPrimaryKey}, FK: ${col.isForeignKey}, Sensitivity: ${col.sensitivity || 'N/A'}, Description: ${col.description || 'N/A'}, Location: ${col.location || 'N/A'})\n`;
  });
  return metadata;
}

export function storeRawDataForEnrichment(data: EnrichMetadataInput) {
  // Deep copy to prevent accidental modification of the stored raw data by reference
  rawDataForEnrichment = JSON.parse(JSON.stringify(data));
  console.log("[CatalogStore] Stored raw data for enrichment.");
}


export function updateRawDataField(itemId: string, fieldKeyToUpdate: 'description' | 'tags', newValue: string): boolean {
  if (!rawDataForEnrichment) {
    console.warn("[CatalogStore-UpdateRaw] No raw data available to update.");
    return false;
  }

  const parts = itemId.split('/');
  const datasetName = parts[0];
  const tableName = parts.length > 1 ? parts[1] : undefined;
  const columnName = parts.length > 2 ? parts[2] : undefined;

  let itemUpdated = false;

  if (columnName && tableName && datasetName) { // It's a column
    const columnToUpdate = rawDataForEnrichment.columns.find(
      (c) => c.TABLE_NAME === tableName && c.COLUMN_NAME === columnName
    );
    // We also need to ensure this column is part of a table that belongs to datasetName
    const parentTableInRaw = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);

    if (columnToUpdate && parentTableInRaw) {
      console.log(`[CatalogStore-UpdateRaw] Updating column ${itemId}. Field: ${fieldKeyToUpdate}, New Value: ${newValue}`);
      if (fieldKeyToUpdate === 'description') columnToUpdate.column_description = newValue;
      else if (fieldKeyToUpdate === 'tags') columnToUpdate.Column_tags = newValue;
      itemUpdated = true;
    } else {
      console.warn(`[CatalogStore-UpdateRaw] Column ${itemId} (or its parent table in specified dataset) not found in raw data.`);
    }
  } else if (tableName && datasetName) { // It's a table
    const tableToUpdate = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
    if (tableToUpdate) {
      console.log(`[CatalogStore-UpdateRaw] Updating table ${itemId}. Field: ${fieldKeyToUpdate}, New Value: ${newValue}`);
      if (fieldKeyToUpdate === 'description') tableToUpdate.Description = newValue;
      else if (fieldKeyToUpdate === 'tags') tableToUpdate.Table_tags = newValue;
      itemUpdated = true;
    } else {
       console.warn(`[CatalogStore-UpdateRaw] Table ${itemId} not found in raw data tables array.`);
    }
  } else if (datasetName) { // It's a dataset
    const datasetToUpdate = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
    if (datasetToUpdate) {
      console.log(`[CatalogStore-UpdateRaw] Updating dataset ${itemId}. Field: ${fieldKeyToUpdate}, New Value: ${newValue}`);
      if (fieldKeyToUpdate === 'description') datasetToUpdate.Dataset_description = newValue;
      else if (fieldKeyToUpdate === 'tags') datasetToUpdate.Tags = newValue;
      itemUpdated = true;
    } else {
       console.warn(`[CatalogStore-UpdateRaw] Dataset ${itemId} not found in raw data datasets array.`);
    }
  }

  if (itemUpdated) {
    console.log(`[CatalogStore-UpdateRaw] Successfully updated rawDataForEnrichment for item ${itemId}.`);
  } else {
    console.warn(`[CatalogStore-UpdateRaw] Failed to find and update item ${itemId} in rawDataForEnrichment.`);
  }
  return itemUpdated;
}
