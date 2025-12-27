const { AppError } = require('./errorHandler');

const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const validateUsername = (username) => {
  return username && username.length >= 3 && username.length <= 30;
};

const validateMessage = (message) => {
  return message && Array.isArray(message) && message.length > 0;
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

const validateUserRegistration = (data) => {
  const { username, email, publicKey, walletAddress } = data;
  
  if (!username || !validateUsername(username)) {
    throw new AppError('Username must be 3-30 characters', 400);
  }
  
  if (!email || !validateEmail(email)) {
    throw new AppError('Invalid email address', 400);
  }
  
  if (!publicKey || publicKey.length < 100) {
    throw new AppError('Invalid public key', 400);
  }
  
  if (!walletAddress) {
    throw new AppError('Wallet address required', 400);
  }
  
  return {
    username: sanitizeInput(username),
    email: sanitizeInput(email),
    publicKey,
    walletAddress
  };
};

module.exports = {
  validateEmail,
  validateUsername,
  validateMessage,
  sanitizeInput,
  validateUserRegistration
};
