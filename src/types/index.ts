
export interface BaseMetadata {
  description?: string | null; // AI enriched fields use this
  tags?: string | null; // AI enriched fields use this
  sensitivity?: 'low' | 'medium' | 'high' | 'unknown' | string | null; 
  location?: string | null; 
}

// Raw types match Excel structure + allow null from parsing empty cells
export interface RawDataset {
  /** Primary Key for this dataset. Used to link tables. */
  Dataset_name: string; 
  Dataset_description?: string | null;
  Tags?: string | null;
  source?: string | null; 
  location?: string | null;
}

export interface RawTable {
  /** Primary Key for this table (unique within its dataset). Used to link columns. */
  TABLE_NAME: string; 
  /** Foreign Key: Links to RawDataset.Dataset_name */
  Dataset_name: string; 
  source?: string | null; 
  location?: string | null;
  DATABASE_NAME?: string | null;
  SCHEMA_NAME?: string | null;
  OWNER?: string | null;
  PRIMARY_KEYS?: string | null;
  FOREIGN_KEYS?: string | null;
  CREATED_DATE?: string | null;
  UPDATED_DATE?: string | null;
  Row_count?: string | null; // Will be parsed to number later
  Description?: string | null; // This is the field AI enriches for table description
  Table_tags?: string | null; // This is the field AI enriches for table tags
  Sensitivity?: string | null;
}

export interface RawColumn {
  /** Foreign Key: Links to RawTable.TABLE_NAME */
  TABLE_NAME: string; 
  /** Primary Key for this column (unique within its table). */
  COLUMN_NAME: string; 
  DATA_TYPE?: string | null;
  PRIMARY_KEY?: 'true' | 'false' | boolean | string | null;
  FOREIGN_KEY?: 'true' | 'false' | boolean | string | null;
  column_description?: string | null; // This is the field AI enriches for column description
  Column_tags?: string | null; // This is the field AI enriches for column tags
  Sensitivity?: string | null;
  location?: string | null; 
}

// Enriched types - these are what we'll primarily use in the app
export interface EnrichedColumn extends BaseMetadata { // description, tags, sensitivity, location are from BaseMetadata
  id: string; // e.g., datasetName/tableName/columnName
  name: string;
  dataType?: string | null;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
}

export interface EnrichedTable extends BaseMetadata { // description, tags, sensitivity, location are from BaseMetadata
  id: string; // e.g., datasetName/tableName
  name: string;
  source?: string | null;
  databaseName?: string | null;
  schemaName?: string | null;
  owner?: string | null;
  primaryKeys?: string | null; 
  foreignKeys?: string | null; 
  createdDate?: string | null;
  updatedDate?: string | null;
  rowCount?: number; // Parsed from string
  columns: EnrichedColumn[];
}

export interface EnrichedDataset extends BaseMetadata { // description, tags, sensitivity, location are from BaseMetadata
  id: string; // e.g., datasetName
  name: string;
  source?: string | null;
  tables: EnrichedTable[];
}

export interface CatalogData {
  datasets: EnrichedDataset[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

