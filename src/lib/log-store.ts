// src/lib/log-store.ts
const MAX_LOG_LINES = 100; // Store up to 100 log lines
const logs: { timestamp: Date; message: string }[] = [];

export function addLog(message: string): void {
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
    // Don't add logs during testing to avoid memory issues or test interference
    return;
  }
  try {
    // Log to the actual server console as well for immediate visibility there
    console.log(`LOG_STORE_ADD: ${message.substring(0,100)}...`); 
    
    const formattedMessage = `[${new Date().toISOString()}] ${message}`;
    logs.push({ timestamp: new Date(), message: formattedMessage });
    if (logs.length > MAX_LOG_LINES) {
      logs.shift(); // Remove the oldest log line
    }
  } catch (e) {
    // Failsafe to prevent logging issues from crashing the server
    console.error("Error in addLog:", e);
  }
}

export function getLogs(): { timestamp: Date; message: string }[] {
  return [...logs]; // Return a copy
}

export function clearLogs(): void {
  logs.length = 0;
  addLog("Server-side in-memory logs cleared by request.");
}
