
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
    console.error("Error enriching metadata:", error);
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
    return null;
  }
}


function transformRawDataToCatalog(rawDatasets: RawDataset[], rawTables: RawTable[], rawColumns: RawColumn[]): CatalogData {
  const datasets: EnrichedDataset[] = rawDatasets.map(rd => {
    if (!rd.Dataset_name) {
        console.warn(`Skipping raw dataset with missing Dataset_name: ${JSON.stringify(rd)}`);
        return null;
    }
    const datasetTables = rawTables
      .filter(rt => rt.Dataset_name === rd.Dataset_name)
      .map(rt => {
        if (!rt.TABLE_NAME) {
            console.warn(`Skipping raw table with missing TABLE_NAME for dataset ${rd.Dataset_name}: ${JSON.stringify(rt)}`);
            return null;
        }

        const uniqueTableColumnsMap = new Map<string, EnrichedColumn>();
        rawColumns
          .filter(rc => rc.TABLE_NAME === rt.TABLE_NAME)
          .forEach(rc => {
            if (!rc.COLUMN_NAME) {
                console.warn(`Skipping raw column with missing COLUMN_NAME for table ${rt.TABLE_NAME}: ${JSON.stringify(rc)}`);
                return;
            }
            const columnId = `${rd.Dataset_name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`;
            if (!uniqueTableColumnsMap.has(columnId)) { // Add only if ID is not already present
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

        return {
          id: `${rd.Dataset_name}/${rt.TABLE_NAME}`,
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
        };
      }).filter((table): table is EnrichedTable => table !== null);

    return {
      id: rd.Dataset_name,
      name: rd.Dataset_name,
      description: rd.Dataset_description,
      tags: rd.Tags,
      source: rd.source,
      location: rd.location,
      sensitivity: 'unknown', // Default: derive from tables/columns if needed later
      tables: datasetTables,
    };
  }).filter((ds): ds is EnrichedDataset => ds !== null);
  return { datasets };
}


function transformEnrichedDataToCatalog(
  enrichedDatasetsFromAI: (RawDataset | null | undefined)[],
  enrichedTablesFromAI: (RawTable | null | undefined)[],
  enrichedColumnsFromAI: (RawColumn | null | undefined)[]
): CatalogData {
  const datasetsMap = new Map<string, EnrichedDataset>();

  const validEnrichedDatasets = Array.isArray(enrichedDatasetsFromAI) ? enrichedDatasetsFromAI : [];
  const validEnrichedTables = Array.isArray(enrichedTablesFromAI) ? enrichedTablesFromAI : [];
  const validEnrichedColumns = Array.isArray(enrichedColumnsFromAI) ? enrichedColumnsFromAI : [];


  validEnrichedDatasets.forEach(ed => {
    if (!ed || !ed.Dataset_name) {
      console.warn(`Skipping dataset from AI output due to missing data or Dataset_name: ${JSON.stringify(ed)}`);
      return;
    }
    datasetsMap.set(ed.Dataset_name, {
      id: ed.Dataset_name,
      name: ed.Dataset_name,
      description: ed.Dataset_description,
      tags: ed.Tags,
      source: ed.source,
      location: ed.location,
      sensitivity: 'unknown', 
      tables: [], 
    });
  });

  validEnrichedTables.forEach(et => {
    if (!et || !et.Dataset_name || !et.TABLE_NAME) {
      console.warn(`Skipping table from AI output due to missing data, Dataset_name, or TABLE_NAME: ${JSON.stringify(et)}`);
      return;
    }

    const dataset = datasetsMap.get(et.Dataset_name);
    if (dataset) {
      const uniqueTableColumnsMap = new Map<string, EnrichedColumn>();
      validEnrichedColumns
        .filter((ec): ec is RawColumn => ec !== null && ec !== undefined && ec.TABLE_NAME === et.TABLE_NAME)
        .forEach(ec => {
          if (!ec.COLUMN_NAME) {
            console.warn(`Skipping column from AI output with missing COLUMN_NAME for table ${et.TABLE_NAME}: ${JSON.stringify(ec)}`);
            return;
          }
          const columnId = `${dataset.name}/${et.TABLE_NAME}/${ec.COLUMN_NAME}`;
          if (!uniqueTableColumnsMap.has(columnId)) { // Add only if ID is not already present
            uniqueTableColumnsMap.set(columnId, {
              id: columnId,
              name: ec.COLUMN_NAME,
              dataType: ec.DATA_TYPE,
              isPrimaryKey: ec.PRIMARY_KEY === 'true' || ec.PRIMARY_KEY === true,
              isForeignKey: ec.FOREIGN_KEY === 'true' || ec.FOREIGN_KEY === true,
              description: ec.column_description,
              tags: ec.Column_tags,
              sensitivity: ec.Sensitivity || 'unknown',
              location: ec.location,
            });
          } else {
            console.warn(`Duplicate column ID detected and skipped during AI output transformation: ${columnId}`);
          }
        });
      const tableColumns: EnrichedColumn[] = Array.from(uniqueTableColumnsMap.values());

      const table: EnrichedTable = {
        id: `${dataset.name}/${et.TABLE_NAME}`,
        name: et.TABLE_NAME,
        source: et.source,
        location: et.location,
        databaseName: et.DATABASE_NAME,
        schemaName: et.SCHEMA_NAME,
        owner: et.OWNER,
        primaryKeys: et.PRIMARY_KEYS,
        foreignKeys: et.FOREIGN_KEYS,
        createdDate: et.CREATED_DATE,
        updatedDate: et.UPDATED_DATE,
        rowCount: et.Row_count ? parseInt(et.Row_count, 10) : undefined,
        description: et.Description,
        tags: et.Table_tags,
        sensitivity: et.Sensitivity || 'unknown',
        columns: tableColumns,
      };
      dataset.tables.push(table);
    } else {
      console.warn(`Table ${et.TABLE_NAME} from AI output refers to a non-existent or invalid dataset ${et.Dataset_name}. Skipping table.`);
    }
  });
  
  return { datasets: Array.from(datasetsMap.values()) };
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
