// src/app/api/logs/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getLogs, clearLogs as clearServerLogs, addLog } from '@/lib/log-store';

export async function GET() {
  try {
    const currentLogs = getLogs();
    return NextResponse.json({ logs: currentLogs }, { status: 200 });
  } catch (error) {
    console.error('Error fetching logs:', error);
    // Avoid using addLog here to prevent potential infinite loop if addLog itself fails
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    clearServerLogs();
    // addLog("Server logs cleared via API request."); // addLog already does this
    return NextResponse.json({ message: 'Server logs cleared successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error clearing logs:', error);
    return NextResponse.json({ error: 'Failed to clear logs' }, { status: 500 });
  }
}
