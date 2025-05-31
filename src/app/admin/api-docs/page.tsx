// src/app/admin/api-docs/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Code, Terminal, AlertTriangle, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils'; // Added this import

interface ApiEndpoint {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  parameters?: { name: string; type: 'path' | 'query' | 'body'; description: string; example?: string }[];
  curlExample: string;
  notes?: string;
}

const catalogServerEndpoints: ApiEndpoint[] = [
  {
    method: 'GET',
    path: '/api/datasets',
    description: 'Retrieves a list of all available datasets.',
    curlExample: 'curl http://localhost:3001/api/datasets',
  },
  {
    method: 'GET',
    path: '/api/datasets/:datasetName/tables',
    description: 'Retrieves all tables for a specific dataset.',
    parameters: [
      { name: 'datasetName', type: 'path', description: 'The name of the dataset.', example: 'SalesData' },
    ],
    curlExample: 'curl http://localhost:3001/api/datasets/SalesData/tables',
  },
  {
    method: 'GET',
    path: '/api/datasets/:datasetName/tables/:tableName',
    description: 'Retrieves details for a specific table, including its columns.',
    parameters: [
      { name: 'datasetName', type: 'path', description: 'The name of the dataset.', example: 'SalesData' },
      { name: 'tableName', type: 'path', description: 'The name of the table.', example: 'Customers' },
    ],
    curlExample: 'curl http://localhost:3001/api/datasets/SalesData/tables/Customers',
  },
  {
    method: 'POST',
    path: '/api/datasets/:datasetName/enrich',
    description: 'Placeholder: Simulates initiating an enrichment process for a specific dataset.',
    parameters: [
      { name: 'datasetName', type: 'path', description: 'The name of the dataset to "enrich".', example: 'SalesData' },
    ],
    curlExample: 'curl -X POST http://localhost:3001/api/datasets/SalesData/enrich',
    notes: 'This is a placeholder and does not perform actual AI enrichment or data modification on the CSV server.'
  },
  {
    method: 'POST',
    path: '/api/tables/:datasetName/:tableName/enrich',
    description: 'Placeholder: Simulates initiating an enrichment process for a specific table.',
    parameters: [
      { name: 'datasetName', type: 'path', description: 'The name of the dataset.', example: 'SalesData' },
      { name: 'tableName', type: 'path', description: 'The name of the table to "enrich".', example: 'Customers' },
    ],
    curlExample: 'curl -X POST http://localhost:3001/api/tables/SalesData/Customers/enrich',
    notes: 'This is a placeholder and does not perform actual AI enrichment or data modification on the CSV server.'
  },
  {
    method: 'POST',
    path: '/api/datasets/:datasetName/enrich-fk',
    description: 'Placeholder: Simulates enriching foreign key information for all tables in a dataset.',
    parameters: [
      { name: 'datasetName', type: 'path', description: 'The name of the dataset.', example: 'SalesData' },
    ],
    curlExample: 'curl -X POST http://localhost:3001/api/datasets/SalesData/enrich-fk',
    notes: 'This is a placeholder and does not perform actual AI enrichment or data modification on the CSV server.'
  },
];

export default function ApiDocsPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Card className="border-transparent bg-gradient-to-br from-primary/10 to-accent/10 shadow-2xl overflow-hidden rounded-xl">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3 mb-2">
            <Terminal size={32} className="text-primary" />
            <CardTitle className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-primary/80">
              External Catalog Server API
            </CardTitle>
          </div>
          <CardDescription className="text-base text-foreground/80">
            Documentation for the standalone Node.js Express server (runs on port 3001) that manages catalog data from CSV files.
            Use the curl commands below to test the endpoints.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="bg-accent/5 border-accent/20 shadow-md">
        <CardHeader>
            <div className="flex items-center gap-2 text-accent">
                <AlertTriangle size={20} />
                <CardTitle className="text-lg">Important Note</CardTitle>
            </div>
        </CardHeader>
        <CardContent className="text-sm text-accent-foreground/80">
          <p>
            The following endpoints interact with the **external catalog server** which you need to run separately.
            Navigate to the <code className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">catalog-server</code> directory in your terminal,
            run <code className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">npm install</code> (if you haven't already), and then <code className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">npm start</code>.
            The server typically runs on <code className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">http://localhost:3001</code>.
          </p>
        </CardContent>
      </Card>

      <Accordion type="multiple" className="w-full space-y-4">
        {catalogServerEndpoints.map((endpoint, index) => (
          <AccordionItem value={`item-${index}`} key={index} className="bg-card border border-border rounded-lg shadow-sm">
            <AccordionTrigger className="hover:bg-secondary/50 px-4 py-3 text-lg font-semibold rounded-t-md data-[state=closed]:rounded-b-md">
              <div className="flex items-center gap-3">
                <Badge 
                  variant={endpoint.method === 'GET' ? 'default' : 'secondary'}
                  className={cn(
                    endpoint.method === 'GET' ? 'bg-sky-600/80 hover:bg-sky-600 text-white' : 'bg-emerald-600/80 hover:bg-emerald-600 text-white',
                    'w-16 justify-center'
                  )}
                >
                  {endpoint.method}
                </Badge>
                <span className="text-primary/90 font-mono text-sm sm:text-base break-all">{endpoint.path}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 py-3 bg-card data-[state=closed]:border-none rounded-b-md">
              <p className="text-sm text-muted-foreground mb-3">{endpoint.description}</p>
              
              {endpoint.parameters && endpoint.parameters.length > 0 && (
                <div className="mb-3">
                  <h4 className="font-semibold text-sm text-foreground/90 mb-1">Parameters:</h4>
                  <ul className="list-disc list-inside pl-4 space-y-1 text-xs text-foreground/80">
                    {endpoint.parameters.map(param => (
                      <li key={param.name}>
                        <code className="bg-muted text-muted-foreground px-1 py-0.5 rounded-sm">{param.name}</code> ({param.type}): {param.description}
                        {param.example && <span className="italic"> (e.g., "{param.example}")</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {endpoint.notes && (
                <p className="text-xs text-amber-700 dark:text-amber-500 bg-amber-500/10 p-2 rounded-md mb-3 border border-amber-500/30">
                  <AlertTriangle size={14} className="inline mr-1.5 relative -top-px" />
                  {endpoint.notes}
                </p>
              )}
              
              <div>
                <h4 className="font-semibold text-sm text-foreground/90 mb-1.5 flex items-center gap-1.5">
                  <Code size={16} className="text-primary"/> Test with cURL:
                </h4>
                <pre className="bg-background border border-input p-3 rounded-md text-xs overflow-x-auto text-foreground/90">
                  <code>{endpoint.curlExample}</code>
                </pre>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
       <Card className="mt-8 bg-secondary/50 border-secondary/70">
        <CardHeader>
            <div className="flex items-center gap-2 text-foreground/80">
                <Server size={20} />
                <CardTitle className="text-lg">About This Server</CardTitle>
            </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            The external <code className="bg-muted px-1 py-0.5 rounded-sm">catalog-server</code> is a simple Node.js/Express application designed to serve data from CSV files.
            It is independent of the main Next.js application and its Genkit AI functionalities.
          </p>
          <p>
            The "enrichment" endpoints on this server are placeholders and do not perform real AI processing or modify the underlying CSV data.
            They exist to simulate a more complete catalog API structure.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
