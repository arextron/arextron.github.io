# Logging System Documentation

## Overview

This API now includes a comprehensive logging system built with Winston that provides structured logging for all aspects of the application, with special focus on chat conversations and chatbot interactions.

## Features

### 🎯 **Structured Logging**
- JSON-formatted logs for easy parsing and analysis
- Multiple log levels: error, warn, info, http, debug
- Timestamped entries with service identification

### 📁 **Log File Organization**
- **Error logs**: `error-YYYY-MM-DD.log` - Application errors and exceptions
- **Combined logs**: `combined-YYYY-MM-DD.log` - All log levels combined
- **HTTP logs**: `http-YYYY-MM-DD.log` - API request/response logging
- **Chat logs**: `chat-YYYY-MM-DD.log` - Chatbot conversation logs (kept for 30 days)

### 🔄 **Log Rotation**
- Daily log rotation with date-based naming
- Automatic compression of old logs
- Configurable retention periods
- Size-based rotation (20MB for most logs, 50MB for chat logs)

## Chat Logging Features

### 📝 **Conversation Tracking**
- **Session Management**: Track individual chat sessions
- **Message Logging**: Log user messages and AI responses
- **Intent Analysis**: Track detected user intents and conversation flow
- **Performance Metrics**: Response times and API call durations

### 🔍 **Detailed Chat Analytics**
- User message analysis with intent detection
- AI response generation tracking
- Gemini API call monitoring
- Follow-up suggestion generation
- Conversation context management

### 📊 **Chat Log Types**
- `Chat Conversation Started` - New session initialization
- `User Message` - Incoming user questions with intent analysis
- `AI Response` - Generated responses with performance metrics
- `Intent Analysis` - Detailed intent detection results
- `Follow-up Suggestions Generated` - Suggested next questions
- `Gemini API Call Success/Failed` - External API call tracking
- `Chat Conversation Ended` - Session termination

## API Endpoints

### Chat Analytics
- `GET /api/chat/analytics` - Get current chat session statistics
- `GET /api/logs/chat/:sessionId` - Get logs for specific chat session
- `GET /api/logs/recent?hours=24` - Get recent chat activity
- `GET /api/logs/stats` - Get log file statistics
- `GET /api/logs/search?q=query&type=chat&limit=100` - Search logs

### Health Check
- `GET /health` - Includes logging system status

## Log Structure

### Chat Log Entry Example
```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "info",
  "message": "User Message",
  "sessionId": "user_123",
  "message": "Tell me about Aryan's projects",
  "messageLength": 32,
  "intent": "projects",
  "hasContext": true,
  "contextLength": 3,
  "service": "aryan-api"
}
```

### AI Response Log Entry Example
```json
{
  "timestamp": "2024-01-15 10:30:47",
  "level": "info",
  "message": "AI Response",
  "sessionId": "user_123",
  "response": "Aryan has worked on several impressive projects...",
  "responseLength": 245,
  "responseTime": "1250ms",
  "intent": "projects",
  "geminiResponseTime": 1200,
  "service": "aryan-api"
}
```

## Configuration

### Environment Variables
- `LOG_LEVEL` - Set minimum log level (default: 'info')
- `NODE_ENV` - Environment mode affects console output level

### Log Levels
- `error` (0) - Error conditions
- `warn` (1) - Warning conditions  
- `info` (2) - Informational messages
- `http` (3) - HTTP request logging
- `debug` (4) - Debug-level messages

## Monitoring and Analysis

### Real-time Monitoring
- Console output with colorized logs in development
- Structured JSON logs in files for production analysis
- Automatic error tracking and exception handling

### Log Analysis
- Search functionality across all log types
- Session-based chat log retrieval
- Performance metrics tracking
- Error pattern analysis

## Security Features

### 🔒 **Data Protection**
- Sensitive data redaction (API keys, tokens)
- Message length limits in logs (500 chars for messages/responses)
- IP address and user agent tracking for security analysis

### 🛡️ **Security Logging**
- Suspicious activity detection
- Request pattern analysis
- Error tracking with context

## Usage Examples

### View Chat Logs for a Session
```bash
curl "http://localhost:3001/api/logs/chat/user_123?lines=100"
```

### Search for Specific Terms
```bash
curl "http://localhost:3001/api/logs/search?q=projects&type=chat&limit=50"
```

### Get Recent Activity
```bash
curl "http://localhost:3001/api/logs/recent?hours=6"
```

### View Log Statistics
```bash
curl "http://localhost:3001/api/logs/stats"
```

## File Locations

- **Log Files**: `/api/logs/`
- **Logger Config**: `/api/utils/logger.js`
- **Logging Middleware**: `/api/middleware/logging.js`
- **Log Viewer Utils**: `/api/utils/logViewer.js`

## Best Practices

1. **Log Levels**: Use appropriate log levels for different types of information
2. **Structured Data**: Always include relevant context in log entries
3. **Performance**: Be mindful of log volume in production
4. **Security**: Never log sensitive information like passwords or API keys
5. **Monitoring**: Regularly review logs for patterns and issues

## Troubleshooting

### Common Issues
- **Log files not created**: Check directory permissions for `/api/logs/`
- **High disk usage**: Adjust log rotation settings or retention periods
- **Missing chat logs**: Verify session ID consistency across requests

### Debug Mode
Set `LOG_LEVEL=debug` to see detailed logging information including intent analysis and follow-up suggestions.

---

This logging system provides comprehensive visibility into your chatbot's performance and user interactions, making it easier to monitor, debug, and improve the application.
