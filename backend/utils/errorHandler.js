const Logger = require("./logger")
const { emitSocketEvent } = require("./socket-events")

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    Error.captureStackTrace(this, this.constructor)
  }
}

const errorHandler = (error, socket) => {
  Logger.error("Socket request failed:", error.statusCode || 500)

  if (error.isOperational) {
    emitSocketEvent(socket, "error", {
      message: error.message,
      statusCode: error.statusCode,
    })
  } else {
    emitSocketEvent(socket, "error", {
      message: "An unexpected error occurred",
      statusCode: 500,
    })
  }
}

const asyncHandler = (fn) => {
  return async (...args) => {
    try {
      await fn(...args)
    } catch (error) {
      errorHandler(error, args[0])
    }
  }
}

module.exports = { AppError, errorHandler, asyncHandler }
