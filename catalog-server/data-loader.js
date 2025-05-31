
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_PATH = path.join(__dirname, 'data');
const DATASETS_FILE = path.join(DATA_PATH, 'datasets.csv');
const TABLES_FILE = path.join(DATA_PATH, 'tables.csv');
const COLUMNS_FILE = path.join(DATA_PATH, 'columns.csv');

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }
    fs.createReadStream(filePath)
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim(), // Trim headers
        mapValues: ({ value }) => (value === '' || value === null || value === undefined) ? null : value.trim() // Handle empty strings as null
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

async function loadCatalogData() {
  try {
    const rawDatasets = await readCsv(DATASETS_FILE);
    const rawTables = await readCsv(TABLES_FILE);
    const rawColumns = await readCsv(COLUMNS_FILE);

    const datasetsMap = new Map();

    rawDatasets.forEach(rd => {
      if (!rd.Dataset_name) {
        console.warn('Skipping dataset with no name:', rd);
        return;
      }
      datasetsMap.set(rd.Dataset_name, {
        id: rd.Dataset_name, // Using name as ID for simplicity
        name: rd.Dataset_name,
        description: rd.Dataset_description,
        tags: rd.Tags,
        source: rd.source,
        location: rd.location,
        // Placeholder for other enriched fields if needed later
        sensitivity: 'unknown',
        tables: [],
      });
    });

    rawTables.forEach(rt => {
      if (!rt.Dataset_name || !rt.TABLE_NAME) {
        console.warn('Skipping table with missing Dataset_name or TABLE_NAME:', rt);
        return;
      }
      const dataset = datasetsMap.get(rt.Dataset_name);
      if (dataset) {
        const tableColumns = rawColumns
          .filter(rc => rc.TABLE_NAME === rt.TABLE_NAME && rc.COLUMN_NAME) // Ensure column has a name
          .map(rc => ({
            id: `${dataset.name}/${rt.TABLE_NAME}/${rc.COLUMN_NAME}`, // Composite ID
            name: rc.COLUMN_NAME,
            dataType: rc.DATA_TYPE,
            description: rc.column_description,
            tags: rc.Column_tags,
            isPrimaryKey: String(rc.PRIMARY_KEY).toLowerCase() === 'true',
            isForeignKey: String(rc.FOREIGN_KEY).toLowerCase() === 'true',
            // Placeholder for other enriched fields
            sensitivity: 'unknown', 
            location: rc.location, // Assuming location might be at column level too
            referencedTable: rc.REFERENCED_TABLE || null,
            referencedColumn: rc.REFERENCED_COLUMN || null,
          }));

        dataset.tables.push({
          id: `${dataset.name}/${rt.TABLE_NAME}`, // Composite ID
          name: rt.TABLE_NAME,
          description: rt.Description,
          tags: rt.Table_tags,
          primaryKeys: rt.PRIMARY_KEYS, // This is a summary from CSV
          foreignKeys: rt.FOREIGN_KEYS, // This is a summary from CSV
          rowCount: rt.Row_count ? parseInt(rt.Row_count, 10) : null,
          // Placeholder for other enriched fields
          sensitivity: 'unknown', 
          source: rt.source, // Table can have its own source/location overriding dataset
          location: rt.location,
          databaseName: rt.DATABASE_NAME,
          schemaName: rt.SCHEMA_NAME,
          owner: rt.OWNER,
          createdDate: rt.CREATED_DATE,
          updatedDate: rt.UPDATED_DATE,
          columns: tableColumns,
        });
      } else {
        console.warn(`Table '${rt.TABLE_NAME}' references non-existent dataset '${rt.Dataset_name}'`);
      }
    });

    return { datasets: Array.from(datasetsMap.values()) };
  } catch (error) {
    console.error("Error loading CSV data:", error);
    throw error; // Re-throw to be caught by server startup
  }
}

function getDataset(catalog, datasetName) {
  if (!catalog || !catalog.datasets) return null;
  return catalog.datasets.find(ds => ds.name === datasetName);
}

function getDatasetTables(catalog, datasetName) {
  const dataset = getDataset(catalog, datasetName);
  return dataset ? dataset.tables : null;
}

function getTable(catalog, datasetName, tableName) {
  const dataset = getDataset(catalog, datasetName);
  if (!dataset || !dataset.tables) return null;
  return dataset.tables.find(t => t.name === tableName);
}

module.exports = {
  loadCatalogData,
  getDataset,
  getTable,
  getDatasetTables
};
