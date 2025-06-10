
import { config } from 'dotenv';
config();

import '@/ai/flows/chat-integration-with-gemini.ts';
import '@/ai/flows/enrich-dataset-flow.ts'; // New flow for single dataset
import '@/ai/flows/enrich-table-flow.ts';   // Existing flow for single table
import '@/ai/flows/extract-keys-from-sql-flow.ts'; // New flow for SQL key extraction
// import '@/ai/flows/global-catalog-chat-flow.ts'; // Removed global catalog chat flow
// The old enrich-metadata-on-upload.ts (bulk) is now deprecated by this new approach.
// import '@/ai/flows/enrich-metadata-on-upload.ts'; 


