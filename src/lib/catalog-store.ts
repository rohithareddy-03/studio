
// src/lib/catalog-store.ts
import type { CatalogData, EnrichedDataset, EnrichedTable, EnrichedColumn, RawDataset, RawTable, RawColumn } from '@/types';
import { enrichMetadata as enrichMetadataAI, type EnrichMetadataInput, type EnrichMetadataOutput } from '@/ai/flows/enrich-metadata-on-upload';

// This is a simple in-memory store. Data will be lost when the server restarts.
// For a production environment, consider a persistent storage solution.
let catalog: CatalogData = { datasets: [] };
let rawDataForEnrichment: EnrichMetadataInput | null = null;

export async function initializeCatalog(rawDatasets: RawDataset[], rawTables: RawTable[], rawColumns: RawColumn[]): Promise<CatalogData> {
  rawDataForEnrichment = {
    datasets: rawDatasets.map(d => ({ ...d, Dataset_description: d.Dataset_description ?? null, Tags: d.Tags ?? null, source: d.source ?? null, location: d.location ?? null })),
    tables: rawTables.map(t => ({ ...t, source: t.source ?? null, location: t.location ?? null, DATABASE_NAME: t.DATABASE_NAME ?? null, SCHEMA_NAME: t.SCHEMA_NAME ?? null, OWNER: t.OWNER ?? null, PRIMARY_KEYS: t.PRIMARY_KEYS ?? null, FOREIGN_KEYS: t.FOREIGN_KEYS ?? null, CREATED_DATE: t.CREATED_DATE ?? null, UPDATED_DATE: t.UPDATED_DATE ?? null, Row_count: t.Row_count ?? null, Description: t.Description ?? null, Table_tags: t.Table_tags ?? null, Sensitivity: t.Sensitivity ?? null })),
    columns: rawColumns.map(c => ({ ...c, DATA_TYPE: c.DATA_TYPE ?? null, PRIMARY_KEY: c.PRIMARY_KEY ?? null, FOREIGN_KEY: c.FOREIGN_KEY ?? null, column_description: c.column_description ?? null, Column_tags: c.Column_tags ?? null, Sensitivity: c.Sensitivity ?? null, location: c.location ?? null })),
  };

  try {
    const enriched: EnrichMetadataOutput = await enrichMetadataAI(rawDataForEnrichment);
    catalog = transformEnrichedDataToCatalog(enriched.datasets, enriched.tables, enriched.columns);
    return catalog;
  } catch (error) {
    console.error("Error enriching metadata during initialization:", error);
    // Fallback: use raw data if enrichment fails
    catalog = transformRawDataToCatalog(rawDatasets, rawTables, rawColumns);
    return catalog;
  }
}

export async function reEnrichCatalog(): Promise<CatalogData | null> {
  if (!rawDataForEnrichment) {
    console.warn("No raw data available to re-enrich catalog.");
    return null;
  }
  try {
    const enriched: EnrichMetadataOutput = await enrichMetadataAI(rawDataForEnrichment);
    catalog = transformEnrichedDataToCatalog(enriched.datasets, enriched.tables, enriched.columns);
    return catalog;
  } catch (error) {
    console.error("Error re-enriching metadata:", error);
    // Explicitly return null to indicate AI enrichment phase failed, even if raw data was present.
    // The API route will use this to provide a more specific error message.
    return null;
  }
}


function transformRawDataToCatalog(rawDatasets: RawDataset[], rawTables: RawTable[], rawColumns: RawColumn[]): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();

  rawDatasets.forEach(rd => {
    if (!rd || !rd.Dataset_name) {
        console.warn(`Skipping raw dataset with missing Dataset_name: ${JSON.stringify(rd)}`);
        return;
    }
    datasetsMap.set(rd.Dataset_name, {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description,
      tags: rd.Tags,
      source: rd.source,
      location: rd.location,
      sensitivity: 'unknown', // Default: derive from tables/columns if needed later
      tables: [],
    });
  });

  rawTables.forEach(rt => {
    if (!rt || !rt.Dataset_name || !rt.TABLE_NAME) {
      console.warn(`Skipping raw table with missing Dataset_name or TABLE_NAME: ${JSON.stringify(rt)}`);
      return;
    }
    const dataset = datasetsMap.get(rt.Dataset_name);
    if (dataset) {
        const uniqueTableColumnsMap = new Map<string, EnrichedColumn>();
        rawColumns
          .filter(rc => rc && rc.TABLE_NAME === rt.TABLE_NAME)
          .forEach(rc => {
            if (!rc.COLUMN_NAME) {
                console.warn(`Skipping raw column with missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc)}`);
                return;
            }
            const columnId = `${dataset.name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`;
            if (!uniqueTableColumnsMap.has(columnId)) {
                uniqueTableColumnsMap.set(columnId, {
                  id: columnId,
                  name: rc.COLUMN_NAME,
                  dataType: rc.DATA_TYPE,
                  isPrimaryKey: rc.PRIMARY_KEY === 'true' || rc.PRIMARY_KEY === true,
                  isForeignKey: rc.FOREIGN_KEY === 'true' || rc.FOREIGN_KEY === true,
                  description: rc.column_description,
                  tags: rc.Column_tags,
                  sensitivity: rc.Sensitivity || 'unknown',
                  location: rc.location,
                });
            } else {
                console.warn(`Duplicate raw column ID detected and skipped: ${columnId}`);
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
        console.warn(`Raw table ${rt.TABLE_NAME} refers to a non-existent dataset ${rt.Dataset_name}. Skipping table.`);
    }
  });
  return { datasets: Array.from(datasetsMap.values()) };
}


function transformEnrichedDataToCatalog(
  enrichedDatasetsFromAI: (RawDataset | null | undefined)[],
  enrichedTablesFromAI: (RawTable | null | undefined)[],
  enrichedColumnsFromAI: (RawColumn | null | undefined)[]
): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();
  const finalDatasets: EnrichedDataset[] = [];

  const validEnrichedDatasets = Array.isArray(enrichedDatasetsFromAI) ? enrichedDatasetsFromAI.filter(Boolean) as RawDataset[] : [];
  const validEnrichedTables = Array.isArray(enrichedTablesFromAI) ? enrichedTablesFromAI.filter(Boolean) as RawTable[] : [];
  const validEnrichedColumns = Array.isArray(enrichedColumnsFromAI) ? enrichedColumnsFromAI.filter(Boolean) as RawColumn[] : [];

  validEnrichedDatasets.forEach(ed_ai => {
    if (!ed_ai.Dataset_name) {
      console.warn(`Skipping dataset from AI output due to missing Dataset_name: ${JSON.stringify(ed_ai)}`);
      return;
    }
    const originalRawDataset = rawDataForEnrichment?.datasets.find(rd => rd.Dataset_name === ed_ai.Dataset_name);

    const enrichedDataset: EnrichedDataset = {
      id: ed_ai.Dataset_name,
      name: ed_ai.Dataset_name,
      description: ed_ai.Dataset_description, // AI is authoritative for this field
      tags: ed_ai.Tags ?? originalRawDataset?.Tags ?? null,
      source: ed_ai.source ?? originalRawDataset?.source ?? null,
      location: ed_ai.location ?? originalRawDataset?.location ?? null,
      sensitivity: 'unknown', // Dataset sensitivity often derived or managed separately
      tables: [],
    };
    datasetsMap.set(ed_ai.Dataset_name, enrichedDataset);
    finalDatasets.push(enrichedDataset);
  });

  validEnrichedTables.forEach(et_ai => {
    if (!et_ai.Dataset_name || !et_ai.TABLE_NAME) {
      console.warn(`Skipping table from AI output due to missing Dataset_name or TABLE_NAME: ${JSON.stringify(et_ai)}`);
      return;
    }

    const dataset = datasetsMap.get(et_ai.Dataset_name);
    if (dataset) {
      const originalRawTable = rawDataForEnrichment?.tables.find(rt => rt.Dataset_name === et_ai.Dataset_name && rt.TABLE_NAME === et_ai.TABLE_NAME);
      const uniqueTableColumnsMap = new Map<string, EnrichedColumn>();

      validEnrichedColumns
        .filter(ec_ai => ec_ai.TABLE_NAME === et_ai.TABLE_NAME)
        .forEach(ec_ai => {
          if (!ec_ai.COLUMN_NAME) {
            console.warn(`Skipping column from AI output with missing COLUMN_NAME for table ${et_ai.TABLE_NAME}: ${JSON.stringify(ec_ai)}`);
            return;
          }
          const columnId = `${dataset.name}/${et_ai.TABLE_NAME}/${ec_ai.COLUMN_NAME}`;
          if (!uniqueTableColumnsMap.has(columnId)) {
            const originalRawColumn = rawDataForEnrichment?.columns.find(rc => rc.TABLE_NAME === ec_ai.TABLE_NAME && rc.COLUMN_NAME === ec_ai.COLUMN_NAME);
            
            uniqueTableColumnsMap.set(columnId, {
              id: columnId,
              name: ec_ai.COLUMN_NAME,
              description: ec_ai.column_description, // AI is authoritative
              tags: ec_ai.Column_tags,             // AI is authoritative
              dataType: ec_ai.DATA_TYPE ?? originalRawColumn?.DATA_TYPE ?? null,
              isPrimaryKey: (ec_ai.PRIMARY_KEY === 'true' || ec_ai.PRIMARY_KEY === true) ?? (originalRawColumn?.PRIMARY_KEY === 'true' || originalRawColumn?.PRIMARY_KEY === true) ?? false,
              isForeignKey: (ec_ai.FOREIGN_KEY === 'true' || ec_ai.FOREIGN_KEY === true) ?? (originalRawColumn?.FOREIGN_KEY === 'true' || originalRawColumn?.FOREIGN_KEY === true) ?? false,
              sensitivity: ec_ai.Sensitivity ?? originalRawColumn?.Sensitivity ?? 'unknown',
              location: ec_ai.location ?? originalRawColumn?.location ?? null,
            });
          } else {
            console.warn(`Duplicate column ID detected and skipped during AI output transformation: ${columnId}`);
          }
        });
      const tableColumns: EnrichedColumn[] = Array.from(uniqueTableColumnsMap.values());

      const table: EnrichedTable = {
        id: `${dataset.name}/${et_ai.TABLE_NAME}`,
        name: et_ai.TABLE_NAME,
        description: et_ai.Description, // AI is authoritative
        tags: et_ai.Table_tags,       // AI is authoritative
        source: et_ai.source ?? originalRawTable?.source ?? null,
        location: et_ai.location ?? originalRawTable?.location ?? null,
        databaseName: et_ai.DATABASE_NAME ?? originalRawTable?.DATABASE_NAME ?? null,
        schemaName: et_ai.SCHEMA_NAME ?? originalRawTable?.SCHEMA_NAME ?? null,
        owner: et_ai.OWNER ?? originalRawTable?.OWNER ?? null,
        primaryKeys: et_ai.PRIMARY_KEYS ?? originalRawTable?.PRIMARY_KEYS ?? null,
        foreignKeys: et_ai.FOREIGN_KEYS ?? originalRawTable?.FOREIGN_KEYS ?? null,
        createdDate: et_ai.CREATED_DATE ?? originalRawTable?.CREATED_DATE ?? null,
        updatedDate: et_ai.UPDATED_DATE ?? originalRawTable?.UPDATED_DATE ?? null,
        rowCount: (et_ai.Row_count ? parseInt(et_ai.Row_count, 10) : null) ?? (originalRawTable?.Row_count ? parseInt(originalRawTable.Row_count, 10) : undefined),
        sensitivity: et_ai.Sensitivity ?? originalRawTable?.Sensitivity ?? 'unknown',
        columns: tableColumns,
      };
      dataset.tables.push(table);
    } else {
      console.warn(`Table ${et_ai.TABLE_NAME} from AI output refers to a non-existent or invalid dataset ${et_ai.Dataset_name}. Skipping table.`);
    }
  });
  
  return { datasets: finalDatasets };
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
  rawDataForEnrichment = data;
}

function ensureRawDataTransformationIsRobust() {
    // The transformRawDataToCatalog was already updated to include these checks.
    // This function is a placeholder to note the review.
}
ensureRawDataTransformationIsRobust();
