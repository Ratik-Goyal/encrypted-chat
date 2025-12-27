const config = require('../config');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class Logger {
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logData = data ? ` | ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] [${level}] ${message}${logData}`);
  }

  static info(message, data) {
    console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`, data || '');
  }

  static success(message, data) {
    console.log(`${colors.green}✅ ${message}${colors.reset}`, data || '');
  }

  static warn(message, data) {
    console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`, data || '');
  }

  static error(message, error) {
    console.error(`${colors.red}❌ ${message}${colors.reset}`);
    if (error && config.isDevelopment()) {
      console.error(error);
    }
  }

  static debug(message, data) {
    if (config.isDevelopment()) {
      console.log(`${colors.magenta}🔍 ${message}${colors.reset}`, data || '');
    }
  }
}

module.exports = Logger;
