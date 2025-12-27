class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, socket) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  console.error(`❌ Error [${statusCode}]:`, message);
  
  if (err.stack && process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }
  
  socket.emit('error', {
    message: err.isOperational ? message : 'Something went wrong',
    statusCode
  });
};

const asyncHandler = (fn) => {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      const socket = args[0];
      errorHandler(error, socket);
    }
  };
};

module.exports = { AppError, errorHandler, asyncHandler };
