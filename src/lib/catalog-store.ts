
// src/lib/catalog-store.ts
import type { CatalogData, EnrichedDataset, EnrichedTable, EnrichedColumn, RawDataset, RawTable, RawColumn } from '@/types';
import { enrichSingleDataset, type EnrichDatasetInput, type EnrichDatasetOutput } from '@/ai/flows/enrich-dataset-flow';
import { enrichSingleTable, type EnrichTableInput, type EnrichTableOutput } from '@/ai/flows/enrich-table-flow';

let catalog: CatalogData = { datasets: [] };
let rawDataForEnrichment: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } | null = null;

// Helper to transform raw data (from Excel) to initial Enriched CatalogData (without AI)
function transformRawToInitialCatalog(raw: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] }): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();

  raw.datasets.forEach(rd => {
    if (!rd || !rd.Dataset_name) {
      console.warn(`[CatalogStore-RawToInitial] Skipping raw dataset with missing Dataset_name: ${JSON.stringify(rd)}`);
      return;
    }
    datasetsMap.set(rd.Dataset_name, {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description ?? null,
      tags: rd.Tags ?? null,
      source: rd.source ?? null,
      location: rd.location ?? null,
      sensitivity: 'unknown', // Default, to be enriched later
      tables: [],
    });
  });

  raw.tables.forEach(rt => {
    if (!rt || !rt.Dataset_name || !rt.TABLE_NAME) {
      console.warn(`[CatalogStore-RawToInitial] Skipping raw table with missing identifiers: ${JSON.stringify(rt)}`);
      return;
    }
    const dataset = datasetsMap.get(rt.Dataset_name);
    if (dataset) {
      const tableColumns: EnrichedColumn[] = [];
      const uniqueColumnTracker = new Set<string>();

      raw.columns
        .filter(rc => rc && rc.TABLE_NAME === rt.TABLE_NAME)
        .forEach(rc => {
          if (!rc.COLUMN_NAME) {
            console.warn(`[CatalogStore-RawToInitial] Skipping raw column due to missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc)}`);
            return;
          }
          const columnId = `${dataset.name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`;
          if (uniqueColumnTracker.has(columnId)) {
            console.warn(`[CatalogStore-RawToInitial] Duplicate raw column ID skipped: ${columnId}`);
            return;
          }
          uniqueColumnTracker.add(columnId);

          tableColumns.push({
            id: columnId,
            name: rc.COLUMN_NAME,
            description: rc.column_description ?? null,
            tags: rc.Column_tags ?? null,
            dataType: rc.DATA_TYPE ?? null,
            isPrimaryKey: String(rc.PRIMARY_KEY).toLowerCase() === 'true',
            isForeignKey: String(rc.FOREIGN_KEY).toLowerCase() === 'true',
            sensitivity: rc.Sensitivity ?? 'unknown', // Default
            location: rc.location ?? null,
          });
        });

      dataset.tables.push({
        id: `${dataset.name}/${rt.TABLE_NAME}`,
        name: rt.TABLE_NAME,
        description: rt.Description ?? null,
        tags: rt.Table_tags ?? null,
        sensitivity: rt.Sensitivity ?? 'unknown', // Default
        source: rt.source ?? null,
        location: rt.location ?? null,
        databaseName: rt.DATABASE_NAME ?? null,
        schemaName: rt.SCHEMA_NAME ?? null,
        owner: rt.OWNER ?? null,
        primaryKeys: rt.PRIMARY_KEYS ?? null,
        foreignKeys: rt.FOREIGN_KEYS ?? null,
        createdDate: rt.CREATED_DATE ?? null,
        updatedDate: rt.UPDATED_DATE ?? null,
        rowCount: rt.Row_count ? parseInt(String(rt.Row_count), 10) : undefined,
        columns: tableColumns,
      });
    } else {
      console.warn(`[CatalogStore-RawToInitial] Raw table ${rt.TABLE_NAME} refers to non-existent dataset ${rt.Dataset_name}`);
    }
  });
  return { datasets: Array.from(datasetsMap.values()) };
}


export async function initializeCatalog(rawD: RawDataset[], rawT: RawTable[], rawC: RawColumn[]): Promise<CatalogData> {
  console.log("[CatalogStore] Initializing catalog with raw data. Enrichment is user-triggered per dataset/table.");
  const rawFullData = { datasets: rawD, tables: rawT, columns: rawC };
  storeRawDataForEnrichment(rawFullData);
  
  catalog = transformRawToInitialCatalog(rawFullData);
  console.log("[CatalogStore] Initial catalog built from raw data. No automatic AI enrichment on upload.");
  return catalog;
}

export async function enrichSingleDatasetInStore(datasetName: string): Promise<EnrichedDataset | null> {
  if (!rawDataForEnrichment) {
    console.warn("[CatalogStore] No raw data available to enrich dataset.");
    return null;
  }
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  if (!rawDataset) {
    console.warn(`[CatalogStore] Raw dataset ${datasetName} not found for enrichment.`);
    return null;
  }

  const tableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName)
    .map(t => t.TABLE_NAME);

  try {
    console.log(`[CatalogStore] Enriching dataset: ${datasetName}`);
    const aiInput: EnrichDatasetInput = {
      datasetToEnrich: { 
        Dataset_name: rawDataset.Dataset_name,
        Dataset_description: rawDataset.Dataset_description,
        Tags: rawDataset.Tags,
        source: rawDataset.source,
        location: rawDataset.location,
      },
      tableNamesInDataset,
    };
    const enrichedOutput: EnrichDatasetOutput = await enrichSingleDataset(aiInput);

    const datasetIndex = catalog.datasets.findIndex(d => d.name === datasetName);
    if (datasetIndex > -1) {
      catalog.datasets[datasetIndex].description = enrichedOutput.Dataset_description ?? catalog.datasets[datasetIndex].description;
      catalog.datasets[datasetIndex].tags = enrichedOutput.Tags ?? catalog.datasets[datasetIndex].tags;
      
      const rawDatasetIndex = rawDataForEnrichment.datasets.findIndex(d => d.Dataset_name === datasetName);
      if (rawDatasetIndex > -1) {
        rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description = enrichedOutput.Dataset_description ?? rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description;
        rawDataForEnrichment.datasets[rawDatasetIndex].Tags = enrichedOutput.Tags ?? rawDataForEnrichment.datasets[rawDatasetIndex].Tags;
      }
      console.log(`[CatalogStore] Dataset ${datasetName} enriched and updated in-memory catalog and rawDataForEnrichment.`);
      return catalog.datasets[datasetIndex];
    }
    return null;
  } catch (error) {
    console.error(`[CatalogStore] Error enriching dataset ${datasetName}:`, error);
    return null;
  }
}

export async function enrichSingleTableInStore(datasetName: string, tableName: string): Promise<EnrichedTable | null> {
  if (!rawDataForEnrichment) {
    console.warn("[CatalogStore] No raw data available to enrich table.");
    return null;
  }
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  const rawTable = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
  const rawColumnsForTable = rawDataForEnrichment.columns.filter(c => c.TABLE_NAME === tableName);

  if (!rawDataset || !rawTable) {
    console.warn(`[CatalogStore] Raw dataset ${datasetName} or table ${tableName} not found for enrichment.`);
    return null;
  }

  const otherTableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName && t.TABLE_NAME !== tableName)
    .map(t => t.TABLE_NAME);
  
  try {
    console.log(`[CatalogStore] Enriching table: ${tableName} in dataset: ${datasetName}`);
    const aiInput: EnrichTableInput = {
      datasetContext: { Dataset_name: rawDataset.Dataset_name, Dataset_description: rawDataset.Dataset_description },
      tableToEnrich: { ...rawTable }, 
      columnsToEnrich: JSON.parse(JSON.stringify(rawColumnsForTable)), 
      otherTableNamesInDataset,
    };
    console.log(`[CatalogStore] enrichSingleTableInStore - AI Input for table ${tableName}:`, JSON.stringify(aiInput, null, 2).substring(0,1000) + "...");

    const aiOutput: EnrichTableOutput = await enrichSingleTable(aiInput);
    console.log(`[CatalogStore] enrichSingleTableInStore - AI Output for table ${tableName}:`, JSON.stringify(aiOutput, null, 2).substring(0,1000) + "...");


    const datasetInCatalog = catalog.datasets.find(d => d.name === datasetName);
    if (!datasetInCatalog) {
        console.error(`[CatalogStore] enrichSingleTableInStore - Dataset ${datasetName} not found in live catalog during merge.`);
        return null;
    }
    const tableIndexInCatalog = datasetInCatalog.tables.findIndex(t => t.name === tableName);
    if (tableIndexInCatalog === -1) {
        console.error(`[CatalogStore] enrichSingleTableInStore - Table ${tableName} not found in live catalog dataset ${datasetName} during merge.`);
        return null;
    }

    // Defensive check for aiOutput structure
    if (!aiOutput || !aiOutput.enrichedTable || !Array.isArray(aiOutput.enrichedColumns)) {
        console.error(`[CatalogStore] enrichSingleTableInStore - AI output for table ${tableName} is malformed or incomplete. AI Output:`, JSON.stringify(aiOutput, null, 2).substring(0,1000));
        throw new Error(`AI output for table ${tableName} was malformed or incomplete.`);
    }

    const enrichedTableFromAI = aiOutput.enrichedTable;
    const enrichedColumnsFromAI = aiOutput.enrichedColumns;

    const currentTableInCatalog = datasetInCatalog.tables[tableIndexInCatalog];
    console.log(`[CatalogStore] enrichSingleTableInStore - Original table in catalog for ${tableName}:`, JSON.stringify(currentTableInCatalog, null, 2).substring(0,500) + "...");

    currentTableInCatalog.description = enrichedTableFromAI.Description ?? currentTableInCatalog.description;
    currentTableInCatalog.tags = enrichedTableFromAI.Table_tags ?? currentTableInCatalog.tags;
    currentTableInCatalog.sensitivity = enrichedTableFromAI.Sensitivity ?? currentTableInCatalog.sensitivity ?? 'unknown';
    // Preserve other original table fields that AI doesn't enrich from currentTableInCatalog
    currentTableInCatalog.source = enrichedTableFromAI.source ?? currentTableInCatalog.source;
    currentTableInCatalog.location = enrichedTableFromAI.location ?? currentTableInCatalog.location;
    currentTableInCatalog.databaseName = enrichedTableFromAI.DATABASE_NAME ?? currentTableInCatalog.databaseName;
    currentTableInCatalog.schemaName = enrichedTableFromAI.SCHEMA_NAME ?? currentTableInCatalog.schemaName;
    currentTableInCatalog.owner = enrichedTableFromAI.OWNER ?? currentTableInCatalog.owner;
    currentTableInCatalog.createdDate = enrichedTableFromAI.CREATED_DATE ?? currentTableInCatalog.createdDate;
    currentTableInCatalog.updatedDate = enrichedTableFromAI.UPDATED_DATE ?? currentTableInCatalog.updatedDate;
    currentTableInCatalog.rowCount = (enrichedTableFromAI.Row_count !== undefined && enrichedTableFromAI.Row_count !== null) 
                                     ? parseInt(String(enrichedTableFromAI.Row_count), 10) 
                                     : currentTableInCatalog.rowCount;


    console.log(`[CatalogStore] enrichSingleTableInStore - Updated table in catalog for ${tableName} (after AI merge):`, JSON.stringify(currentTableInCatalog, null, 2).substring(0,500) + "...");
    
    const rawTableIndex = rawDataForEnrichment.tables.findIndex(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
    if (rawTableIndex > -1) {
      rawDataForEnrichment.tables[rawTableIndex].Description = currentTableInCatalog.description;
      rawDataForEnrichment.tables[rawTableIndex].Table_tags = currentTableInCatalog.tags;
      rawDataForEnrichment.tables[rawTableIndex].Sensitivity = currentTableInCatalog.sensitivity;
      // Preserve other raw fields by not overwriting them unless AI provided them
      rawDataForEnrichment.tables[rawTableIndex].source = enrichedTableFromAI.source ?? rawDataForEnrichment.tables[rawTableIndex].source;
      rawDataForEnrichment.tables[rawTableIndex].location = enrichedTableFromAI.location ?? rawDataForEnrichment.tables[rawTableIndex].location;
      // ... and so on for other fields if AI flow is expected to return them
    }
    
    const updatedColumnsForCatalog: EnrichedColumn[] = [];
    for (const colAI of enrichedColumnsFromAI) {
      const originalColInCatalog = currentTableInCatalog.columns.find(c => c.name === colAI.COLUMN_NAME);
      const originalRawCol = rawColumnsForTable.find(rc => rc.COLUMN_NAME === colAI.COLUMN_NAME);
      console.log(`[CatalogStore] enrichSingleTableInStore - Processing column ${colAI.COLUMN_NAME}. AI:`, JSON.stringify(colAI, null, 2).substring(0,300), "OrigCatalog:", JSON.stringify(originalColInCatalog, null, 2).substring(0,300), "OrigRaw:", JSON.stringify(originalRawCol, null, 2).substring(0,300));

      const updatedCol: EnrichedColumn = {
        id: originalColInCatalog?.id || `${datasetName}/${tableName}/${colAI.COLUMN_NAME}`,
        name: colAI.COLUMN_NAME,
        description: colAI.column_description ?? originalColInCatalog?.description ?? null,
        tags: colAI.Column_tags ?? originalColInCatalog?.tags ?? null,
        dataType: colAI.DATA_TYPE ?? originalColInCatalog?.dataType ?? originalRawCol?.DATA_TYPE ?? null,
        isPrimaryKey: String(colAI.PRIMARY_KEY).toLowerCase() === 'true',
        isForeignKey: String(colAI.FOREIGN_KEY).toLowerCase() === 'true',
        sensitivity: colAI.Sensitivity ?? originalColInCatalog?.sensitivity ?? 'unknown',
        location: colAI.location ?? originalColInCatalog?.location ?? originalRawCol?.location ?? null,
      };
      updatedColumnsForCatalog.push(updatedCol);

      const rawColIndex = rawDataForEnrichment.columns.findIndex(c => c.TABLE_NAME === tableName && c.COLUMN_NAME === colAI.COLUMN_NAME);
      if (rawColIndex > -1) {
        rawDataForEnrichment.columns[rawColIndex].column_description = updatedCol.description;
        rawDataForEnrichment.columns[rawColIndex].Column_tags = updatedCol.tags;
        rawDataForEnrichment.columns[rawColIndex].Sensitivity = updatedCol.sensitivity;
        rawDataForEnrichment.columns[rawColIndex].PRIMARY_KEY = updatedCol.isPrimaryKey ? 'true' : 'false';
        rawDataForEnrichment.columns[rawColIndex].FOREIGN_KEY = updatedCol.isForeignKey ? 'true' : 'false';
        rawDataForEnrichment.columns[rawColIndex].DATA_TYPE = updatedCol.dataType;
        rawDataForEnrichment.columns[rawColIndex].location = updatedCol.location;

      }
    }
    currentTableInCatalog.columns = updatedColumnsForCatalog;

    console.log(`[CatalogStore] Table ${tableName} in dataset ${datasetName} enriched and updated in-memory catalog and rawDataForEnrichment.`);
    return currentTableInCatalog;

  } catch (error) {
    console.error(`[CatalogStore] Error enriching table ${tableName} in dataset ${datasetName}:`, error);
    return null;
  }
}


export function getCatalog(): CatalogData {
  return JSON.parse(JSON.stringify(catalog)); 
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

export function storeRawDataForEnrichment(data: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] }) {
  rawDataForEnrichment = JSON.parse(JSON.stringify(data));
  console.log("[CatalogStore] Stored raw data for enrichment.");
}


export function updateRawDataField(itemId: string, fieldKeyToUpdate: 'description' | 'tags', newValue: string): boolean {
  let rawDataUpdated = false;
  if (rawDataForEnrichment) {
    const parts = itemId.split('/');
    const datasetName = parts[0];
    const tableName = parts.length > 1 ? parts[1] : undefined;
    const columnName = parts.length > 2 ? parts[2] : undefined;

    if (columnName && tableName && datasetName) {
      const columnToUpdate = rawDataForEnrichment.columns.find(
        (c) => c.TABLE_NAME === tableName && c.COLUMN_NAME === columnName && rawDataForEnrichment.tables.some(t => t.TABLE_NAME === tableName && t.Dataset_name === datasetName)
      );
      if (columnToUpdate) {
        if (fieldKeyToUpdate === 'description') columnToUpdate.column_description = newValue;
        else if (fieldKeyToUpdate === 'tags') columnToUpdate.Column_tags = newValue;
        rawDataUpdated = true;
      }
    } else if (tableName && datasetName) {
      const tableToUpdate = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
      if (tableToUpdate) {
        if (fieldKeyToUpdate === 'description') tableToUpdate.Description = newValue;
        else if (fieldKeyToUpdate === 'tags') tableToUpdate.Table_tags = newValue;
        rawDataUpdated = true;
      }
    } else if (datasetName) {
      const datasetToUpdate = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
      if (datasetToUpdate) {
        if (fieldKeyToUpdate === 'description') datasetToUpdate.Dataset_description = newValue;
        else if (fieldKeyToUpdate === 'tags') datasetToUpdate.Tags = newValue;
        rawDataUpdated = true;
      }
    }
    if (rawDataUpdated) {
      console.log(`[CatalogStore-UpdateRaw] Successfully updated rawDataForEnrichment for item ${itemId}. Field: ${fieldKeyToUpdate}`);
    } else {
      console.warn(`[CatalogStore-UpdateRaw] Failed to find and update item ${itemId} in rawDataForEnrichment.`);
    }
  } else {
    console.warn("[CatalogStore-UpdateRaw] No raw data available to update.");
    return false;
  }

  let catalogItemUpdated = false;
  const parts = itemId.split('/');
  const datasetNameFromId = parts[0];
  const tableNameFromId = parts.length > 1 ? parts[1] : undefined;
  const columnNameFromId = parts.length > 2 ? parts[2] : undefined;
  
  const datasetToUpdateInCatalog = catalog.datasets.find(d => d.name === datasetNameFromId);

  if (datasetToUpdateInCatalog) {
    if (columnNameFromId && tableNameFromId) { 
      const tableToUpdateInCatalog = datasetToUpdateInCatalog.tables.find(t => t.name === tableNameFromId);
      if (tableToUpdateInCatalog) {
        const columnToUpdateInCatalog = tableToUpdateInCatalog.columns.find(c => c.name === columnNameFromId);
        if (columnToUpdateInCatalog) {
          if (fieldKeyToUpdate === 'description') columnToUpdateInCatalog.description = newValue;
          else if (fieldKeyToUpdate === 'tags') columnToUpdateInCatalog.tags = newValue;
          catalogItemUpdated = true;
        }
      }
    } else if (tableNameFromId) { 
      const tableToUpdateInCatalog = datasetToUpdateInCatalog.tables.find(t => t.name === tableNameFromId);
      if (tableToUpdateInCatalog) {
        if (fieldKeyToUpdate === 'description') tableToUpdateInCatalog.description = newValue;
        else if (fieldKeyToUpdate === 'tags') tableToUpdateInCatalog.tags = newValue;
        catalogItemUpdated = true;
      }
    } else { 
      if (fieldKeyToUpdate === 'description') datasetToUpdateInCatalog.description = newValue;
      else if (fieldKeyToUpdate === 'tags') datasetToUpdateInCatalog.tags = newValue;
      catalogItemUpdated = true;
    }
  }

  if (catalogItemUpdated) {
    console.log(`[CatalogStore-UpdateInMemoryCatalog] Successfully updated in-memory 'catalog' for item ${itemId}. Field: ${fieldKeyToUpdate}`);
  } else {
    console.warn(`[CatalogStore-UpdateInMemoryCatalog] Failed to find and update item ${itemId} in in-memory 'catalog'.`);
  }

  return rawDataUpdated && catalogItemUpdated;
}
