// src/app/api/logs/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getLogs, clearLogs as clearServerLogs, addLog } from '@/lib/log-store';

export async function GET() {
  try {
    const currentLogs = getLogs();
    // Log on server to see what the API is about to send
    console.log(`[API GET /api/logs] Returning ${currentLogs.length} log entries.`);
    return NextResponse.json({ logs: currentLogs }, { status: 200 });
  } catch (error) {
    console.error('Error fetching logs via API:', error);
    // Avoid using addLog here to prevent potential infinite loop if addLog itself fails
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    console.log('[API DELETE /api/logs] Received request to clear server logs.');
    clearServerLogs(); // This already calls addLog internally
    return NextResponse.json({ message: 'Server logs cleared successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error clearing logs via API:', error);
    return NextResponse.json({ error: 'Failed to clear server logs' }, { status: 500 });
  }
}
