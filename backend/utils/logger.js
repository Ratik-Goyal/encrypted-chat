const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
}

class Logger {
  static info(message, data = "") {
    console.log(`${colors.blue}[INFO]${colors.reset} ${message}`, data)
  }

  static success(message, data = "") {
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`, data)
  }

  static warn(message, data = "") {
    console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`, data)
  }

  static error(message, error = "") {
    console.error(`${colors.red}[ERROR]${colors.reset} ${message}`, error)
  }

  static debug(message, data = "") {
    if (process.env.NODE_ENV === "development") {
      console.log(`${colors.magenta}[DEBUG]${colors.reset} ${message}`, data)
    }
  }
}

module.exports = Logger
