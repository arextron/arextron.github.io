import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '../logs');

// Function to read and parse log files
export function readLogFile(filename, lines = 100) {
  try {
    const filePath = path.join(logsDir, filename);
    if (!fs.existsSync(filePath)) {
      return { error: 'Log file not found' };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const logLines = content.split('\n').filter(line => line.trim());
    
    // Parse JSON log entries
    const logs = logLines
      .slice(-lines) // Get last N lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { raw: line, parseError: true };
        }
      })
      .filter(log => !log.parseError);

    return { logs, totalLines: logLines.length };
  } catch (error) {
    return { error: error.message };
  }
}

// Function to get chat logs for a specific session
export function getChatLogsForSession(sessionId, lines = 50) {
  try {
    const files = fs.readdirSync(logsDir);
    const chatFiles = files.filter(file => file.startsWith('chat-') && file.endsWith('.log'));
    
    let allChatLogs = [];
    
    // Read from all chat log files
    for (const file of chatFiles) {
      const result = readLogFile(file, 1000); // Read more lines to find session
      if (result.logs) {
        const sessionLogs = result.logs.filter(log => 
          log.sessionId === sessionId || 
          (log.message && log.message.includes(sessionId))
        );
        allChatLogs = allChatLogs.concat(sessionLogs);
      }
    }
    
    // Sort by timestamp
    allChatLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return { logs: allChatLogs.slice(-lines), total: allChatLogs.length };
  } catch (error) {
    return { error: error.message };
  }
}

// Function to get recent chat activity
export function getRecentChatActivity(hours = 24) {
  try {
    const files = fs.readdirSync(logsDir);
    const chatFiles = files.filter(file => file.startsWith('chat-') && file.endsWith('.log'));
    
    let recentLogs = [];
    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    // Read from recent chat log files
    for (const file of chatFiles) {
      const result = readLogFile(file, 1000);
      if (result.logs) {
        const recent = result.logs.filter(log => {
          const logTime = new Date(log.timestamp);
          return logTime > cutoffTime && (
            log.message === 'User Message' ||
            log.message === 'AI Response' ||
            log.message === 'Chat Conversation Started' ||
            log.message === 'Chat Conversation Ended'
          );
        });
        recentLogs = recentLogs.concat(recent);
      }
    }
    
    // Sort by timestamp
    recentLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return { logs: recentLogs, total: recentLogs.length };
  } catch (error) {
    return { error: error.message };
  }
}

// Function to get log statistics
export function getLogStatistics() {
  try {
    const files = fs.readdirSync(logsDir);
    const stats = {
      totalFiles: files.length,
      chatFiles: files.filter(f => f.startsWith('chat-')).length,
      errorFiles: files.filter(f => f.startsWith('error-')).length,
      combinedFiles: files.filter(f => f.startsWith('combined-')).length,
      httpFiles: files.filter(f => f.startsWith('http-')).length,
      totalSize: 0,
      files: []
    };
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stat = fs.statSync(filePath);
      stats.totalSize += stat.size;
      stats.files.push({
        name: file,
        size: stat.size,
        modified: stat.mtime,
        created: stat.birthtime
      });
    }
    
    return stats;
  } catch (error) {
    return { error: error.message };
  }
}

// Function to search logs
export function searchLogs(query, logType = 'all', limit = 100) {
  try {
    const files = fs.readdirSync(logsDir);
    let targetFiles = files;
    
    if (logType !== 'all') {
      targetFiles = files.filter(file => file.startsWith(`${logType}-`));
    }
    
    let matchingLogs = [];
    
    for (const file of targetFiles) {
      const result = readLogFile(file, 1000);
      if (result.logs) {
        const matches = result.logs.filter(log => {
          const searchText = JSON.stringify(log).toLowerCase();
          return searchText.includes(query.toLowerCase());
        });
        matchingLogs = matchingLogs.concat(matches);
      }
    }
    
    // Sort by timestamp (newest first)
    matchingLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return { logs: matchingLogs.slice(0, limit), total: matchingLogs.length };
  } catch (error) {
    return { error: error.message };
  }
}
