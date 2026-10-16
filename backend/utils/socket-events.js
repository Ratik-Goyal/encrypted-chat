const Logger = require("./logger")
const { isSocketEventPayload } = require("../../shared/socket-events.cjs")

function emitSocketEvent(target, event, payload) {
  if (!isSocketEventPayload(event, payload)) {
    Logger.error("Rejected malformed Socket.IO server event:", event)
    return false
  }

  target.emit(event, payload)
  return true
}

module.exports = { emitSocketEvent }
