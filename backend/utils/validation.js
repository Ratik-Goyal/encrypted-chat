const validateEmail = (email) => {
  if (typeof email !== "string" || email.length > 254) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const validateUsername = (username) => {
  return typeof username === "string" && /^[a-zA-Z0-9_.-]{3,30}$/.test(username.trim())
}

const validateMessage = (message) => {
  return message && message.trim().length > 0
}

const sanitizeInput = (input) => {
  if (typeof input !== "string") return input
  return input.trim().replace(/[<>]/g, "")
}

const validateUserRegistration = (data) => {
  const errors = []

  if (!data.username || !validateUsername(data.username)) {
    errors.push("Username must be 3-30 characters")
  }

  if (!validateEmail(data.email)) {
    errors.push("Invalid email format")
  }

  if (typeof data.password !== "string" || data.password.length < 12 || Buffer.byteLength(data.password, "utf8") > 72) {
    errors.push("Password must be 12-72 UTF-8 bytes")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

module.exports = {
  validateEmail,
  validateUsername,
  validateMessage,
  sanitizeInput,
  validateUserRegistration,
}
