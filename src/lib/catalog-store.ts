// src/lib/catalog-store.ts
import type { CatalogData, EnrichedDataset, EnrichedTable, EnrichedColumn, RawDataset, RawTable, RawColumn } from '@/types';
import { enrichSingleDataset, type EnrichDatasetInput, type EnrichDatasetOutput } from '@/ai/flows/enrich-dataset-flow';
import { enrichSingleTable, type EnrichTableInput, type EnrichTableOutput } from '@/ai/flows/enrich-table-flow';
import type { ExtractKeysFromSqlOutput } from '@/ai/flows/extract-keys-from-sql-flow';
import { addLog } from './log-store'; // Import addLog

let catalog: CatalogData = { datasets: [] };
let rawDataForEnrichment: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] } | null = null;

// Helper to transform raw data (from Excel) to initial Enriched CatalogData (without AI)
function transformRawToInitialCatalog(raw: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] }): CatalogData {
  addLog("[CatalogStore-RawToInitial] Starting transformation of raw data to initial catalog structure.");
  const datasetsMap = new Map<string, EnrichedDataset>();

  (raw.datasets || []).forEach(rd => {
    if (!rd || !rd.Dataset_name) {
      const warningMsg = `[CatalogStore-RawToInitial] Skipping raw dataset with missing Dataset_name: ${JSON.stringify(rd)}`;
      console.warn(warningMsg);
      addLog(warningMsg);
      return;
    }
    datasetsMap.set(rd.Dataset_name, {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description ?? null,
      tags: rd.Tags ?? null,
      source: rd.source ?? null,
      location: rd.location ?? null,
      sensitivity: 'unknown', 
      tables: [],
    });
  });
  addLog(`[CatalogStore-RawToInitial] Processed ${datasetsMap.size} raw datasets into initial map.`);

  (raw.tables || []).forEach(rt => {
    if (!rt || !rt.Dataset_name || !rt.TABLE_NAME) {
      const warningMsg = `[CatalogStore-RawToInitial] Skipping raw table with missing identifiers: ${JSON.stringify(rt)}`;
      console.warn(warningMsg);
      addLog(warningMsg);
      return;
    }
    const dataset = datasetsMap.get(rt.Dataset_name);
    if (dataset) {
      const tableColumns: EnrichedColumn[] = [];
      const uniqueColumnTracker = new Set<string>();

      (raw.columns || [])
        .filter(rc => rc && rc.TABLE_NAME === rt.TABLE_NAME)
        .forEach(rc => {
          if (!rc.COLUMN_NAME) {
            const colWarningMsg = `[CatalogStore-RawToInitial] Skipping raw column due to missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc)}`;
            console.warn(colWarningMsg);
            addLog(colWarningMsg);
            return;
          }
          const columnId = `${dataset.name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`;
          if (uniqueColumnTracker.has(columnId)) {
            const dupColMsg = `[CatalogStore-RawToInitial] Duplicate raw column ID skipped: ${columnId}`;
            console.warn(dupColMsg);
            addLog(dupColMsg);
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
            sensitivity: rc.Sensitivity ?? 'unknown', 
            location: rc.location ?? null,
          });
        });
      
      const primaryKeysString = tableColumns.filter(c => c.isPrimaryKey).map(c => c.name).join(', ') || null;
      const foreignKeysString = tableColumns.filter(c => c.isForeignKey).map(c => c.name).join(', ') || null;


      dataset.tables.push({
        id: `${dataset.name}/${rt.TABLE_NAME}`,
        name: rt.TABLE_NAME,
        description: rt.Description ?? null,
        tags: rt.Table_tags ?? null,
        sensitivity: rt.Sensitivity ?? 'unknown', 
        source: rt.source ?? null,
        location: rt.location ?? null,
        databaseName: rt.DATABASE_NAME ?? null,
        schemaName: rt.SCHEMA_NAME ?? null,
        owner: rt.OWNER ?? null,
        primaryKeys: primaryKeysString,
        foreignKeys: foreignKeysString,
        createdDate: rt.CREATED_DATE ?? null,
        updatedDate: rt.UPDATED_DATE ?? null,
        rowCount: rt.Row_count ? parseInt(String(rt.Row_count), 10) : undefined,
        columns: tableColumns,
      });
    } else {
      const tableDsWarn = `[CatalogStore-RawToInitial] Raw table ${rt.TABLE_NAME} refers to non-existent dataset ${rt.Dataset_name}`;
      console.warn(tableDsWarn);
      addLog(tableDsWarn);
    }
  });
  addLog(`[CatalogStore-RawToInitial] Finished processing raw tables and columns.`);
  const finalCatalog = { datasets: Array.from(datasetsMap.values()) };
  addLog(`[CatalogStore-RawToInitial] Transformation complete. Catalog has ${finalCatalog.datasets.length} datasets.`);
  return finalCatalog;
}


export async function initializeCatalog(rawD: RawDataset[], rawT: RawTable[], rawC: RawColumn[]): Promise<CatalogData> {
  addLog("[CatalogStore] Initializing catalog with raw data. Enrichment is now user-triggered per dataset/table.");
  const rawFullData = { datasets: rawD, tables: rawT, columns: rawC };
  storeRawDataForEnrichment(rawFullData);
  
  catalog = transformRawToInitialCatalog(rawFullData);
  addLog("[CatalogStore] Initial catalog built from raw data. No automatic AI enrichment on upload.");
  return catalog;
}

export async function enrichSingleDatasetInStore(datasetName: string): Promise<EnrichedDataset | null> {
  addLog(`[CatalogStore] enrichSingleDatasetInStore: Attempting to enrich dataset: ${datasetName}`);
  if (!rawDataForEnrichment) {
    const noRawMsg = "[CatalogStore] enrichSingleDatasetInStore: No raw data available to enrich dataset.";
    console.warn(noRawMsg);
    addLog(noRawMsg);
    return null;
  }
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  if (!rawDataset) {
    const notFoundMsg = `[CatalogStore] enrichSingleDatasetInStore: Raw dataset ${datasetName} not found for enrichment.`;
    console.warn(notFoundMsg);
    addLog(notFoundMsg);
    return null;
  }

  const tableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName)
    .map(t => t.TABLE_NAME);
  addLog(`[CatalogStore] enrichSingleDatasetInStore: Found ${tableNamesInDataset.length} tables for context for dataset ${datasetName}.`);

  try {
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
    addLog(`[CatalogStore] enrichSingleDatasetInStore: Calling AI for dataset ${datasetName}. Input: ${JSON.stringify(aiInput).substring(0,300)}...`);
    const enrichedOutput: EnrichDatasetOutput = await enrichSingleDataset(aiInput);
    addLog(`[CatalogStore] enrichSingleDatasetInStore: AI enrichment successful for dataset ${datasetName}. Output: ${JSON.stringify(enrichedOutput).substring(0,300)}...`);

    const datasetIndex = catalog.datasets.findIndex(d => d.name === datasetName);
    if (datasetIndex > -1) {
      catalog.datasets[datasetIndex].description = enrichedOutput.Dataset_description ?? catalog.datasets[datasetIndex].description;
      catalog.datasets[datasetIndex].tags = enrichedOutput.Tags ?? catalog.datasets[datasetIndex].tags;
      
      const rawDatasetIndex = rawDataForEnrichment.datasets.findIndex(d => d.Dataset_name === datasetName);
      if (rawDatasetIndex > -1) {
        rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description = enrichedOutput.Dataset_description ?? rawDataForEnrichment.datasets[rawDatasetIndex].Dataset_description;
        rawDataForEnrichment.datasets[rawDatasetIndex].Tags = enrichedOutput.Tags ?? rawDataForEnrichment.datasets[rawDatasetIndex].Tags;
      }
      addLog(`[CatalogStore] enrichSingleDatasetInStore: Dataset ${datasetName} updated in-memory catalog and rawDataForEnrichment.`);
      return catalog.datasets[datasetIndex];
    }
    addLog(`[CatalogStore] enrichSingleDatasetInStore: Dataset ${datasetName} not found in live catalog after enrichment (should not happen).`);
    return null;
  } catch (error) {
    const errorMsg = `[CatalogStore] enrichSingleDatasetInStore: Error enriching dataset ${datasetName}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg, error);
    addLog(errorMsg);
    return null;
  }
}

export async function enrichSingleTableInStore(datasetName: string, tableName: string): Promise<EnrichedTable | null> {
  addLog(`[CatalogStore] enrichSingleTableInStore: Attempting to enrich table: ${tableName} in dataset: ${datasetName}`);
  if (!rawDataForEnrichment) {
    const noRawMsg = "[CatalogStore] enrichSingleTableInStore: No raw data available to enrich table.";
    console.warn(noRawMsg);
    addLog(noRawMsg);
    return null;
  }
  const rawDataset = rawDataForEnrichment.datasets.find(d => d.Dataset_name === datasetName);
  const rawTable = rawDataForEnrichment.tables.find(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
  const rawColumnsForTable = rawDataForEnrichment.columns.filter(c => c.TABLE_NAME === tableName && rawDataForEnrichment.tables.some(rt => rt.TABLE_NAME === c.TABLE_NAME && rt.Dataset_name === datasetName) );


  if (!rawDataset || !rawTable) {
    const notFoundMsg = `[CatalogStore] enrichSingleTableInStore: Raw dataset ${datasetName} or table ${tableName} not found for enrichment.`;
    console.warn(notFoundMsg);
    addLog(notFoundMsg);
    return null;
  }
  addLog(`[CatalogStore] enrichSingleTableInStore: Found raw data for table ${tableName}. Columns count: ${rawColumnsForTable.length}`);
  
  const otherTableNamesInDataset = rawDataForEnrichment.tables
    .filter(t => t.Dataset_name === datasetName && t.TABLE_NAME !== tableName)
    .map(t => t.TABLE_NAME);
  
  try {
    const aiInput: EnrichTableInput = {
      datasetContext: { Dataset_name: rawDataset.Dataset_name, Dataset_description: rawDataset.Dataset_description ?? "" },
      tableToEnrich: { ...rawTable }, 
      columnsToEnrich: JSON.parse(JSON.stringify(rawColumnsForTable)), 
      otherTableNamesInDataset,
    };
    addLog(`[CatalogStore] enrichSingleTableInStore: Calling AI for table ${tableName}. Input (snippet): ${JSON.stringify(aiInput.tableToEnrich).substring(0,200)}... Columns (count): ${aiInput.columnsToEnrich.length}`);


    const aiOutput: EnrichTableOutput = await enrichSingleTable(aiInput);
    addLog(`[CatalogStore] enrichSingleTableInStore: AI enrichment successful for table ${tableName}. Output (snippet): ${JSON.stringify(aiOutput.enrichedTable).substring(0,200)}... Columns (count): ${aiOutput.enrichedColumns.length}`);


    const datasetInCatalog = catalog.datasets.find(d => d.name === datasetName);
    if (!datasetInCatalog) {
        const dsNotFoundMsg = `[CatalogStore] enrichSingleTableInStore: Dataset ${datasetName} not found in live catalog during merge.`;
        console.error(dsNotFoundMsg);
        addLog(dsNotFoundMsg);
        return null;
    }
    const tableIndexInCatalog = datasetInCatalog.tables.findIndex(t => t.name === tableName);
    if (tableIndexInCatalog === -1) {
        const tblNotFoundMsg = `[CatalogStore] enrichSingleTableInStore: Table ${tableName} not found in live catalog dataset ${datasetName} during merge.`;
        console.error(tblNotFoundMsg);
        addLog(tblNotFoundMsg);
        return null;
    }

    if (!aiOutput || !aiOutput.enrichedTable || !Array.isArray(aiOutput.enrichedColumns)) {
        const malformedMsg = `[CatalogStore] enrichSingleTableInStore: AI output for table ${tableName} was malformed or incomplete.`;
        console.error(malformedMsg, 'AI Output:', JSON.stringify(aiOutput).substring(0,1000));
        addLog(malformedMsg + ` AI Output (snippet): ${JSON.stringify(aiOutput).substring(0,200)}...`);
        throw new Error(malformedMsg);
    }

    const enrichedTableFromAI = aiOutput.enrichedTable;
    const enrichedColumnsFromAI = aiOutput.enrichedColumns;

    const currentTableInCatalog = datasetInCatalog.tables[tableIndexInCatalog];
    
    currentTableInCatalog.description = enrichedTableFromAI.Description ?? currentTableInCatalog.description;
    currentTableInCatalog.tags = enrichedTableFromAI.Table_tags ?? currentTableInCatalog.tags;
    currentTableInCatalog.sensitivity = enrichedTableFromAI.Sensitivity ?? currentTableInCatalog.sensitivity ?? 'unknown';
    
    currentTableInCatalog.source = enrichedTableFromAI.source ?? currentTableInCatalog.source;
    currentTableInCatalog.location = enrichedTableFromAI.location ?? currentTableInCatalog.location;
    currentTableInCatalog.databaseName = enrichedTableFromAI.DATABASE_NAME ?? currentTableInCatalog.databaseName;
    currentTableInCatalog.schemaName = enrichedTableFromAI.SCHEMA_NAME ?? currentTableInCatalog.schemaName;
    currentTableInCatalog.owner = enrichedTableFromAI.OWNER ?? currentTableInCatalog.owner;
    currentTableInCatalog.createdDate = enrichedTableFromAI.CREATED_DATE ?? currentTableInCatalog.createdDate;
    currentTableInCatalog.updatedDate = enrichedTableFromAI.UPDATED_DATE ?? currentTableInCatalog.updatedDate;
    currentTableInCatalog.rowCount = (enrichedTableFromAI.Row_count !== undefined && enrichedTableFromAI.Row_count !== null) 
                                     ? parseInt(String(enrichedTableFromAI.Row_count),10) 
                                     : currentTableInCatalog.rowCount;


    const rawTableIndex = rawDataForEnrichment.tables.findIndex(t => t.Dataset_name === datasetName && t.TABLE_NAME === tableName);
    if (rawTableIndex > -1) {
      rawDataForEnrichment.tables[rawTableIndex].Description = currentTableInCatalog.description;
      rawDataForEnrichment.tables[rawTableIndex].Table_tags = currentTableInCatalog.tags;
      rawDataForEnrichment.tables[rawTableIndex].Sensitivity = currentTableInCatalog.sensitivity;
      // Persist other fields to raw if AI provided them and they were different
      rawDataForEnrichment.tables[rawTableIndex].source = currentTableInCatalog.source;
      rawDataForEnrichment.tables[rawTableIndex].location = currentTableInCatalog.location;
      // ... and so on for other table fields if AI is allowed to change them
    }
    
    const updatedColumnsForCatalog: EnrichedColumn[] = [];
    for (const originalInputColumn of rawColumnsForTable) { 
      const colAI = enrichedColumnsFromAI.find(c => c.COLUMN_NAME === originalInputColumn.COLUMN_NAME && c.TABLE_NAME === tableName);
      
      const updatedCol: EnrichedColumn = {
        id: `${datasetName}/${tableName}/${originalInputColumn.COLUMN_NAME}`,
        name: originalInputColumn.COLUMN_NAME,
        dataType: colAI?.DATA_TYPE ?? originalInputColumn.DATA_TYPE ?? null,
        location: colAI?.location ?? originalInputColumn.location ?? null,
        description: colAI?.column_description ?? originalInputColumn.column_description ?? null,
        tags: colAI?.Column_tags ?? originalInputColumn.Column_tags ?? null,
        sensitivity: colAI?.Sensitivity ?? originalInputColumn.Sensitivity ?? 'unknown',
        isPrimaryKey: colAI ? String(colAI.PRIMARY_KEY).toLowerCase() === 'true' : String(originalInputColumn.PRIMARY_KEY).toLowerCase() === 'true',
        isForeignKey: colAI ? String(colAI.FOREIGN_KEY).toLowerCase() === 'true' : String(originalInputColumn.FOREIGN_KEY).toLowerCase() === 'true',
      };
      updatedColumnsForCatalog.push(updatedCol);

      const rawColIndex = rawDataForEnrichment.columns.findIndex(c => c.TABLE_NAME === tableName && c.COLUMN_NAME === originalInputColumn.COLUMN_NAME);
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
    currentTableInCatalog.primaryKeys = updatedColumnsForCatalog.filter(c => c.isPrimaryKey).map(c => c.name).join(', ') || null;
    currentTableInCatalog.foreignKeys = updatedColumnsForCatalog.filter(c => c.isForeignKey).map(c => c.name).join(', ') || null;


    addLog(`[CatalogStore] enrichSingleTableInStore: Table ${tableName} updated in-memory catalog and rawDataForEnrichment. Columns processed: ${updatedColumnsForCatalog.length}.`);
    return currentTableInCatalog;

  } catch (error) {
    const errorMsg = `[CatalogStore] enrichSingleTableInStore: Error enriching table ${tableName} in dataset ${datasetName}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg, error);
    addLog(errorMsg);
    return null;
  }
}


export function getCatalog(): CatalogData {
  // addLog("[CatalogStore] getCatalog called."); // Can be too noisy
  return JSON.parse(JSON.stringify(catalog)); 
}

export function getDatasetByName(name: string): EnrichedDataset | undefined {
  const currentCatalog = getCatalog(); 
  return currentCatalog.datasets.find(d => d.name === name);
}

export function getTableByName(datasetName: string, tableName: string): EnrichedTable | undefined {
  const dataset = getDatasetByName(datasetName);
  if (!dataset) return undefined;
  return dataset.tables.find(t => t.name === tableName);
}

export function getTableMetadata(datasetName: string, tableName: string): string | undefined {
  const table = getTableByName(datasetName, tableName);
  if (!table) return undefined;

  let metadata = `Table: ${tableName}\nDescription: ${table.description || 'N/A'}\nSensitivity: ${table.sensitivity || 'N/A'}\nLocation: ${table.location || 'N/A'}\nColumns:\n`;
  (table.columns || []).forEach(col => {
    metadata += `  - ${col.name} (Type: ${col.dataType || 'N/A'}, PK: ${col.isPrimaryKey}, FK: ${col.isForeignKey}, Sensitivity: ${col.sensitivity || 'N/A'}, Description: ${col.description || 'N/A'}, Location: ${col.location || 'N/A'})\n`;
  });
  return metadata;
}

export function storeRawDataForEnrichment(data: { datasets: RawDataset[], tables: RawTable[], columns: RawColumn[] }) {
  rawDataForEnrichment = JSON.parse(JSON.stringify(data));
  addLog("[CatalogStore] Stored raw data for enrichment. Datasets: " + (data.datasets?.length || 0) + ", Tables: " + (data.tables?.length || 0) + ", Columns: " + (data.columns?.length || 0));
}


export function updateRawDataField(itemId: string, fieldKeyToUpdate: 'description' | 'tags', newValue: string): boolean {
  addLog(`[CatalogStore-UpdateRaw] Request to update item: ${itemId}, field: ${fieldKeyToUpdate}, newValue: ${newValue.substring(0,50)}...`);
  let rawDataUpdated = false;
  if (!rawDataForEnrichment) {
    const noRawMsg = "[CatalogStore-UpdateRaw] No raw data available to update.";
    console.warn(noRawMsg);
    addLog(noRawMsg);
    return false;
  }
  
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

  let catalogItemUpdated = false;
  const datasetToUpdateInCatalog = catalog.datasets.find(d => d.name === datasetName);

  if (datasetToUpdateInCatalog) {
    if (columnName && tableName) { 
      const tableToUpdateInCatalog = datasetToUpdateInCatalog.tables.find(t => t.name === tableName);
      if (tableToUpdateInCatalog) {
        const columnToUpdateInCatalog = tableToUpdateInCatalog.columns.find(c => c.name === columnName);
        if (columnToUpdateInCatalog) {
          if (fieldKeyToUpdate === 'description') columnToUpdateInCatalog.description = newValue;
          else if (fieldKeyToUpdate === 'tags') columnToUpdateInCatalog.tags = newValue;
          catalogItemUpdated = true;
        }
      }
    } else if (tableName) { 
      const tableToUpdateInCatalog = datasetToUpdateInCatalog.tables.find(t => t.name === tableName);
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

  if (rawDataUpdated) addLog(`[CatalogStore-UpdateRaw] Successfully updated rawDataForEnrichment for item ${itemId}. Field: ${fieldKeyToUpdate}`);
  if (catalogItemUpdated) addLog(`[CatalogStore-UpdateInMemoryCatalog] Successfully updated in-memory 'catalog' for item ${itemId}. Field: ${fieldKeyToUpdate}`);
  
  if (!rawDataUpdated) addLog(`[CatalogStore-UpdateRaw] Failed to find or update item ${itemId} in rawDataForEnrichment.`);
  if (!catalogItemUpdated) addLog(`[CatalogStore-UpdateInMemoryCatalog] Failed to find or update item ${itemId} in in-memory 'catalog'.`);

  return rawDataUpdated && catalogItemUpdated;
}


export function updateKeysFromSqlAnalysis(datasetName: string, targetTableName: string | undefined, keyInfo: ExtractKeysFromSqlOutput): boolean {
  addLog(`[CatalogStore-UpdateKeysSQL] Starting update for dataset: ${datasetName}, table: ${targetTableName || 'all relevant'}, keyInfo: ${JSON.stringify(keyInfo).substring(0,300)}...`);
  if (!rawDataForEnrichment) {
    const noRawMsg = "[CatalogStore-UpdateKeysSQL] No raw data available.";
    console.warn(noRawMsg);
    addLog(noRawMsg);
    return false;
  }
  if (!catalog) {
    const noCatMsg = "[CatalogStore-UpdateKeysSQL] Live catalog not available.";
    console.warn(noCatMsg);
    addLog(noCatMsg);
    return false;
  }

  let changesMade = false;
  const datasetInCatalog = catalog.datasets.find(d => d.name === datasetName);
  if (!datasetInCatalog) {
    const dsNotFoundMsg = `[CatalogStore-UpdateKeysSQL] Dataset ${datasetName} not found in live catalog.`;
    console.warn(dsNotFoundMsg);
    addLog(dsNotFoundMsg);
    return false;
  }

  const tablesToResetKeys = targetTableName 
    ? [targetTableName] 
    : Array.from(new Set([...keyInfo.primaryKeys.map(k => k.tableName), ...keyInfo.foreignKeys.map(k => k.tableName)]));
  addLog(`[CatalogStore-UpdateKeysSQL] Tables to reset/update keys for: ${tablesToResetKeys.join(', ')}`);

  tablesToResetKeys.forEach(tableNameFromAI => {
    rawDataForEnrichment.columns.forEach(rawCol => {
      if (rawCol.TABLE_NAME === tableNameFromAI && rawDataForEnrichment.tables.some(t => t.TABLE_NAME === tableNameFromAI && t.Dataset_name === datasetName)) {
        rawCol.PRIMARY_KEY = 'false';
        rawCol.FOREIGN_KEY = 'false';
      }
    });
    const tableInCatalog = datasetInCatalog.tables.find(t => t.name === tableNameFromAI);
    if (tableInCatalog) {
      tableInCatalog.columns.forEach(col => {
        col.isPrimaryKey = false;
        col.isForeignKey = false;
      });
    }
  });
  addLog(`[CatalogStore-UpdateKeysSQL] Finished resetting PK/FK flags for relevant tables.`);


  keyInfo.primaryKeys.forEach(pk => {
    if (targetTableName && pk.tableName !== targetTableName) return; 

    const rawCol = rawDataForEnrichment.columns.find(c => c.TABLE_NAME === pk.tableName && c.COLUMN_NAME === pk.columnName && rawDataForEnrichment.tables.some(t => t.TABLE_NAME === pk.tableName && t.Dataset_name === datasetName));
    if (rawCol) {
      if (rawCol.PRIMARY_KEY !== 'true') {
        rawCol.PRIMARY_KEY = 'true';
        changesMade = true;
        addLog(`[CatalogStore-UpdateKeysSQL] Raw PK updated: ${pk.tableName}.${pk.columnName}`);
      }
    }
    const tableInCatalog = datasetInCatalog.tables.find(t => t.name === pk.tableName);
    if (tableInCatalog) {
      const colInCatalog = tableInCatalog.columns.find(c => c.name === pk.columnName);
      if (colInCatalog && !colInCatalog.isPrimaryKey) {
        colInCatalog.isPrimaryKey = true;
        changesMade = true; // Count change if live catalog is updated
         addLog(`[CatalogStore-UpdateKeysSQL] Catalog PK updated: ${pk.tableName}.${pk.columnName}`);
      }
    }
  });

  keyInfo.foreignKeys.forEach(fk => {
    if (targetTableName && fk.tableName !== targetTableName) return;

    const rawCol = rawDataForEnrichment.columns.find(c => c.TABLE_NAME === fk.tableName && c.COLUMN_NAME === fk.columnName && rawDataForEnrichment.tables.some(t => t.TABLE_NAME === fk.tableName && t.Dataset_name === datasetName));
    if (rawCol) {
      if (rawCol.FOREIGN_KEY !== 'true') {
        rawCol.FOREIGN_KEY = 'true';
        changesMade = true;
         addLog(`[CatalogStore-UpdateKeysSQL] Raw FK updated: ${fk.tableName}.${fk.columnName}`);
      }
    }
    const tableInCatalog = datasetInCatalog.tables.find(t => t.name === fk.tableName);
    if (tableInCatalog) {
      const colInCatalog = tableInCatalog.columns.find(c => c.name === fk.columnName);
      if (colInCatalog && !colInCatalog.isForeignKey) {
        colInCatalog.isForeignKey = true;
        changesMade = true; // Count change
        addLog(`[CatalogStore-UpdateKeysSQL] Catalog FK updated: ${fk.tableName}.${fk.columnName}`);
      }
    }
  });

  tablesToResetKeys.forEach(tableNameToUpdate => {
      const tableInCatalog = datasetInCatalog.tables.find(t => t.name === tableNameToUpdate);
      if (tableInCatalog) {
          const newPrimaryKeys = tableInCatalog.columns.filter(c => c.isPrimaryKey).map(c => c.name).join(', ') || null;
          const newForeignKeys = tableInCatalog.columns.filter(c => c.isForeignKey).map(c => c.name).join(', ') || null;
          
          if(tableInCatalog.primaryKeys !== newPrimaryKeys || tableInCatalog.foreignKeys !== newForeignKeys) {
            changesMade = true;
            tableInCatalog.primaryKeys = newPrimaryKeys;
            tableInCatalog.foreignKeys = newForeignKeys;
            addLog(`[CatalogStore-UpdateKeysSQL] Updated PK/FK summary strings for table ${tableInCatalog.name}: PKs: ${tableInCatalog.primaryKeys}, FKs: ${tableInCatalog.foreignKeys}`);
          }
      }
  });
  
  if (changesMade) {
    addLog(`[CatalogStore-UpdateKeysSQL] Successfully updated key information. Changes were made.`);
  } else {
    addLog(`[CatalogStore-UpdateKeysSQL] No changes made to key information. This might be because no keys were found or matched existing raw data flags.`);
  }
  return changesMade;
}
