
const express = require('express');
const cors = require('cors');
const { loadCatalogData, getDataset, getTable, getDatasetTables } = require('./data-loader');

const app = express();
const port = process.env.CATALOG_PORT || 3001;

app.use(cors());
app.use(express.json());

let catalogData = null;

// Middleware to ensure catalog data is loaded
app.use(async (req, res, next) => {
  if (!catalogData) {
    try {
      catalogData = await loadCatalogData();
      console.log('Catalog data loaded successfully.');
    } catch (error) {
      console.error('Failed to load catalog data:', error);
      return res.status(500).json({ error: 'Failed to load catalog data' });
    }
  }
  next();
});

// Get all datasets
app.get('/api/datasets', (req, res) => {
  if (!catalogData || !catalogData.datasets) {
    return res.status(404).json({ error: 'No datasets found' });
  }
  res.json(catalogData.datasets.map(ds => ({ name: ds.name, description: ds.description, tags: ds.tags, source: ds.source, location: ds.location })));
});

// Get all tables for a specific dataset
app.get('/api/datasets/:datasetName/tables', (req, res) => {
  const { datasetName } = req.params;
  const tables = getDatasetTables(catalogData, datasetName);
  if (!tables) {
    return res.status(404).json({ error: `Dataset '${datasetName}' not found or has no tables` });
  }
  res.json(tables.map(t => ({ name: t.name, description: t.description, tags: t.tags, rowCount: t.rowCount })));
});

// Get details for a specific table (including its columns)
app.get('/api/datasets/:datasetName/tables/:tableName', (req, res) => {
  const { datasetName, tableName } = req.params;
  const table = getTable(catalogData, datasetName, tableName);
  if (!table) {
    return res.status(404).json({ error: `Table '${tableName}' in dataset '${datasetName}' not found` });
  }
  res.json(table);
});

// Placeholder: Enrich a specific dataset
app.post('/api/datasets/:datasetName/enrich', (req, res) => {
  const { datasetName } = req.params;
  // In a real app, this would trigger AI enrichment for the dataset
  // For now, we'll just simulate success if the dataset exists
  const dataset = getDataset(catalogData, datasetName);
  if (!dataset) {
    return res.status(404).json({ error: `Dataset '${datasetName}' not found` });
  }
  console.log(`Placeholder: Enriching dataset '${datasetName}'...`);
  // Simulate updating the dataset (in a real app, you'd modify catalogData)
  // dataset.description = dataset.description + " (Enriched)";
  // dataset.tags = (dataset.tags || "") + ", enriched_tag";
  res.json({ message: `Dataset '${datasetName}' enrichment process initiated (placeholder).` });
});

// Placeholder: Enrich a specific table
app.post('/api/tables/:datasetName/:tableName/enrich', (req, res) => {
  const { datasetName, tableName } = req.params;
  // In a real app, this would trigger AI enrichment for the table and its columns
  const table = getTable(catalogData, datasetName, tableName);
  if (!table) {
    return res.status(404).json({ error: `Table '${tableName}' in dataset '${datasetName}' not found` });
  }
  console.log(`Placeholder: Enriching table '${tableName}' in dataset '${datasetName}'...`);
  // Simulate updating the table and columns
  // table.description = table.description + " (Enriched)";
  // table.columns.forEach(col => col.description = (col.description || "") + " (Enriched Col Desc)");
  res.json({ message: `Table '${tableName}' enrichment process initiated (placeholder).` });
});

// Placeholder: Enrich Foreign Keys for all tables in a dataset
app.post('/api/datasets/:datasetName/enrich-fk', (req, res) => {
  const { datasetName } = req.params;
  const dataset = getDataset(catalogData, datasetName);
  if (!dataset) {
    return res.status(404).json({ error: `Dataset '${datasetName}' not found` });
  }
  console.log(`Placeholder: Enriching FKs for all tables in dataset '${datasetName}'...`);
  // Simulate updating FK information
  // dataset.tables.forEach(table => {
  //   table.foreignKeys = "Simulated FKs";
  //   table.columns.forEach(col => {
  //      if (col.name.toLowerCase().includes('_id') && !col.name.toLowerCase().startsWith(table.name.toLowerCase())) col.isForeignKey = true;
  //   });
  // });
  res.json({ message: `Foreign key enrichment for dataset '${datasetName}' initiated (placeholder).` });
});


app.listen(port, () => {
  console.log(`Catalog server listening at http://localhost:${port}`);
});
