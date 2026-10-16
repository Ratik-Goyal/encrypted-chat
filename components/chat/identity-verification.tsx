"use client"

import { useEffect, useRef, useState } from "react"
import type { MatrixClient } from "matrix-js-sdk"
import type { ShowQrCodeCallbacks, ShowSasCallbacks, VerificationRequest, Verifier } from "matrix-js-sdk/lib/crypto-api"
import { Button } from "@/components/ui/button"
import { getMatrixClient } from "@/lib/matrix"

type Trust = "unknown" | "unverified" | "verified" | "changed"
type Flow = "none" | "requesting" | "waiting" | "incoming" | "ready" | "verifying" | "sas" | "showQr" | "scanQr" | "qrConfirm" | "error"
interface DeviceSummary {
  id: string
  name: string
  fingerprint: string
  isCurrent: boolean
  trust: "verified" | "unverified" | "unknown"
  trustSource: "cross-signing" | "this device" | "not verified"
}

export function IdentityVerification({ peerUserId, roomId, isSelf = false, onSecurityAlert }: {
  peerUserId: string
  roomId: string
  isSelf?: boolean
  onSecurityAlert?: (message: string | null) => void
}) {
  const clientRef = useRef<MatrixClient | null>(null)
  const requestRef = useRef<VerificationRequest | null>(null)
  const attachRequestRef = useRef<(request: VerificationRequest) => void>(() => undefined)
  const startSasRef = useRef<(request: VerificationRequest) => void>(() => undefined)
  const startQrRef = useRef<(request: VerificationRequest, verifier?: Verifier) => void>(() => undefined)
  const scanBytesRef = useRef<(bytes: number[]) => void>(() => undefined)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [trust, setTrust] = useState<Trust>("unknown")
  const [flow, setFlow] = useState<Flow>("none")
  const [sas, setSas] = useState<ShowSasCallbacks | null>(null)
  const [qrImage, setQrImage] = useState("")
  const [qrConfirmation, setQrConfirmation] = useState<ShowQrCodeCallbacks | null>(null)
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [deviceKeyAlert, setDeviceKeyAlert] = useState("")
  const [requestingDeviceId, setRequestingDeviceId] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    let client: MatrixClient | null = null
    let sdkEvents: typeof import("matrix-js-sdk/lib/crypto-api") | null = null
    let requestEventListener: ((request: VerificationRequest) => void) | null = null
    let trustEventListener: ((userId: string) => void) | null = null
    let devicesEventListener: ((userIds: string[], initialFetch: boolean) => void) | null = null
    let requestListener: (() => void) | null = null
    let verifier: Verifier | null = null
    let sasListener: ((callbacks: ShowSasCallbacks) => void) | null = null
    let qrListener: ((callbacks: ShowQrCodeCallbacks) => void) | null = null
    let cancelListener: (() => void) | null = null
    const startedRequests = new WeakSet<VerificationRequest>()
    const startedQrRequests = new WeakSet<VerificationRequest>()
    let knownDeviceKeys: Record<string, string> | null = null
    let hadStoredDeviceSnapshot = false
    const pendingDeviceKeys = new Map<string, string>()
    let refreshQueue = Promise.resolve()
    setTrust("unknown")
    setFlow("none")
    setSas(null)
    setQrImage("")
    setQrConfirmation(null)
    setDevices([])
    setDeviceKeyAlert("")
    setError("")
    onSecurityAlert?.(null)

    const refreshTrust = (allowDeviceAlerts = false) => {
      refreshQueue = refreshQueue.catch(() => undefined).then(async () => {
        const crypto = client?.getCrypto()
        if (!crypto) return
        const [status, deviceMap] = await Promise.all([
          crypto.getUserVerificationStatus(peerUserId),
          crypto.getUserDeviceInfo([peerUserId], true),
        ])
        if (!active) return
        setTrust(status.needsUserApproval ? "changed" : status.isVerified() ? "verified" : "unverified")
        const peerDevices = deviceMap.get(peerUserId)
        const summaries = await Promise.all(Array.from(peerDevices || [], async ([deviceId, device]) => {
          const deviceStatus = await crypto.getDeviceVerificationStatus(peerUserId, deviceId)
          return {
            id: deviceId,
            name: device.displayName || "Unnamed Matrix device",
            fingerprint: device.getFingerprint() || "Unavailable",
            isCurrent: deviceId === client?.getDeviceId(),
            trust: deviceStatus?.isVerified() ? "verified" : deviceStatus ? "unverified" : "unknown",
            trustSource: deviceStatus?.localVerified ? "this device" : deviceStatus?.crossSigningVerified ? "cross-signing" : "not verified",
          } as DeviceSummary
        }))
        if (!active) return
        setDevices(summaries.sort((left, right) => left.name.localeCompare(right.name)))

        const currentUserId = client?.getUserId() || "unknown"
        const snapshotKey = `cipher-matrix-device-keys:${encodeURIComponent(currentUserId)}:${encodeURIComponent(peerUserId)}`
        if (knownDeviceKeys === null) {
          try {
            const stored = localStorage.getItem(snapshotKey)
            hadStoredDeviceSnapshot = stored !== null
            const saved = JSON.parse(stored || "null") as Record<string, unknown> | null
            knownDeviceKeys = saved && typeof saved === "object" && !Array.isArray(saved)
              ? Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, string] =>
                typeof entry[1] === "string" && entry[1].length > 0 && entry[1].length <= 512,
              ))
              : {}
          } catch {
            knownDeviceKeys = {}
          }
        }

        const deviceChanges = allowDeviceAlerts
          ? summaries.filter((device) => device.fingerprint !== "Unavailable" && device.trust !== "verified" && (
            knownDeviceKeys![device.id] === undefined || knownDeviceKeys![device.id] !== device.fingerprint
          ))
          : []
        deviceChanges.forEach((device) => pendingDeviceKeys.set(device.id, device.name))
        const trustedKeys = Object.fromEntries(summaries
          .filter((device) => device.trust === "verified" && device.fingerprint !== "Unavailable")
          .map((device) => [device.id, device.fingerprint]))
        for (const device of summaries) {
          if (device.trust === "verified") pendingDeviceKeys.delete(device.id)
        }
        knownDeviceKeys = { ...knownDeviceKeys, ...trustedKeys }
        try {
          localStorage.setItem(snapshotKey, JSON.stringify(knownDeviceKeys))
        } catch {
          // Device fingerprints stay local; alerting still works for this open conversation.
        }

        const messages = [
          status.needsUserApproval ? "Matrix reports that this contact's verified identity changed. Verify it before trusting new keys." : "",
          pendingDeviceKeys.size
            ? `New or changed unverified Matrix device keys detected: ${Array.from(pendingDeviceKeys.values()).join(", ")}. Review their IDs and fingerprints before trusting them.`
            : "",
        ].filter(Boolean)
        const alert = messages.join(" ")
        setDeviceKeyAlert(pendingDeviceKeys.size ? messages[messages.length - 1] : "")
        onSecurityAlert?.(alert || null)
      })
      return refreshQueue
    }

    const startSas = async (request: VerificationRequest) => {
      if (startedRequests.has(request)) return
      startedRequests.add(request)
      try {
        if (!sdkEvents) throw new Error("Matrix verification is unavailable.")
        if (!request.methods.includes("m.sas.v1")) {
          throw new Error("The other Matrix client does not support emoji verification.")
        }
        verifier = request.verifier || await request.startVerification("m.sas.v1")
        if (!active || !verifier) return
        setFlow("verifying")
        sasListener = (callbacks) => {
          if (!active) return
          setSas(callbacks)
          setFlow("sas")
        }
        cancelListener = () => {
          if (!active) return
          setSas(null)
          setFlow("none")
          setError("The Matrix verification was cancelled or expired.")
        }
        verifier.on(sdkEvents.VerifierEvent.ShowSas, sasListener)
        verifier.on(sdkEvents.VerifierEvent.Cancel, cancelListener)
        const existingSas = verifier.getShowSasCallbacks()
        if (existingSas) sasListener(existingSas)
        void verifier.verify().then(async () => {
          if (!active) return
          setSas(null)
          setFlow("none")
          await refreshTrust()
        }).catch((verificationError) => {
          if (!active) return
          setSas(null)
          setFlow("error")
          setError(verificationError instanceof Error ? verificationError.message : "Matrix verification did not complete.")
        })
      } catch (verificationError) {
        startedRequests.delete(request)
        if (!active) return
        setFlow("error")
        setError(verificationError instanceof Error ? verificationError.message : "Could not start Matrix verification.")
      }
    }

    startSasRef.current = (request) => { void startSas(request) }

    const startQrVerification = (request: VerificationRequest, suppliedVerifier?: Verifier) => {
      if (startedQrRequests.has(request)) return
      const activeVerifier = suppliedVerifier || request.verifier
      if (!activeVerifier || !sdkEvents) return
      startedQrRequests.add(request)
      verifier = activeVerifier
      setFlow("verifying")
      qrListener = (callbacks) => {
        if (!active) return
        setQrConfirmation(callbacks)
        setFlow("qrConfirm")
      }
      cancelListener = () => {
        if (!active) return
        setQrConfirmation(null)
        setQrImage("")
        setFlow("none")
        setError("The Matrix QR verification was cancelled or expired.")
      }
      verifier.on(sdkEvents.VerifierEvent.ShowReciprocateQr, qrListener)
      verifier.on(sdkEvents.VerifierEvent.Cancel, cancelListener)
      const existingQr = verifier.getReciprocateQrCodeCallbacks()
      if (existingQr) qrListener(existingQr)
      void verifier.verify().then(async () => {
        if (!active) return
        setQrConfirmation(null)
        setQrImage("")
        setFlow("none")
        await refreshTrust()
      }).catch((verificationError) => {
        if (!active) return
        setQrConfirmation(null)
        setFlow("error")
        setError(verificationError instanceof Error ? verificationError.message : "Matrix QR verification did not complete.")
      })
    }

    startQrRef.current = startQrVerification

    const attachRequest = (request: VerificationRequest) => {
      if (!sdkEvents || request.otherUserId !== peerUserId) return
      if (request.roomId !== undefined && request.roomId !== roomId) return
      if (request.roomId === undefined && !request.otherDeviceId) return
      if (requestRef.current === request) return
      if (requestRef.current && requestListener) {
        requestRef.current.off(sdkEvents.VerificationRequestEvent.Change, requestListener)
      }
      requestRef.current = request
      requestListener = () => { void handleRequest(request) }
      request.on(sdkEvents.VerificationRequestEvent.Change, requestListener)
      void handleRequest(request)
    }

    const handleRequest = async (request: VerificationRequest) => {
      if (!active || requestRef.current !== request) return
      const sdk = await import("matrix-js-sdk/lib/crypto-api")
      if (!active || requestRef.current !== request) return
      switch (request.phase) {
        case sdk.VerificationPhase.Requested:
          setSas(null)
          setFlow(request.initiatedByMe ? "waiting" : "incoming")
          break
        case sdk.VerificationPhase.Ready:
          setSas(null)
          setQrConfirmation(null)
          setFlow("ready")
          break
        case sdk.VerificationPhase.Started:
          if (request.chosenMethod === "m.sas.v1") void startSas(request)
          else if (request.chosenMethod === "m.reciprocate.v1") startQrVerification(request)
          else {
            setFlow("error")
            setError("This verification request selected an unsupported method. Cancel it and retry with QR or emoji verification.")
          }
          break
        case sdk.VerificationPhase.Cancelled:
          setSas(null)
          setQrImage("")
          setQrConfirmation(null)
          setFlow("none")
          setError("The Matrix verification was cancelled or expired.")
          if (requestListener) request.off(sdk.VerificationRequestEvent.Change, requestListener)
          requestListener = null
          requestRef.current = null
          break
        case sdk.VerificationPhase.Done:
          setSas(null)
          setQrImage("")
          setQrConfirmation(null)
          setFlow("none")
          setError("")
          if (requestListener) request.off(sdk.VerificationRequestEvent.Change, requestListener)
          requestListener = null
          requestRef.current = null
          await refreshTrust()
          break
        default:
          break
      }
    }

    const initialize = async () => {
      try {
        const [matrixClient, sdk] = await Promise.all([
          getMatrixClient(),
          import("matrix-js-sdk/lib/crypto-api"),
        ])
        if (!active) return
        client = matrixClient
        sdkEvents = sdk
        clientRef.current = matrixClient
        const crypto = matrixClient.getCrypto()
        if (!crypto) throw new Error("Matrix encryption is unavailable.")

        requestEventListener = (request: VerificationRequest) => attachRequest(request)
        trustEventListener = (userId: string) => {
          if (userId === peerUserId) void refreshTrust().catch(() => {
            if (active) setError("Could not refresh Matrix identity status.")
          })
        }
        devicesEventListener = (userIds: string[], initialFetch: boolean) => {
          if (userIds.includes(peerUserId)) {
            void refreshTrust(!initialFetch || hadStoredDeviceSnapshot).catch(() => {
              if (active) setError("Could not refresh this contact's device keys.")
            })
          }
        }
        matrixClient.on(sdk.CryptoEvent.VerificationRequestReceived, requestEventListener)
        matrixClient.on(sdk.CryptoEvent.UserTrustStatusChanged, trustEventListener)
        matrixClient.on(sdk.CryptoEvent.DevicesUpdated, devicesEventListener)
        attachRequestRef.current = attachRequest

        await refreshTrust()
        if (isSelf) {
          const requests = crypto.getVerificationRequestsToDeviceInProgress(peerUserId)
          const request = requests.find((candidate) => candidate.initiatedByMe) || requests[0]
          if (request) attachRequest(request)
        }
        if (roomId) {
          const existing = crypto.findVerificationRequestDMInProgress(roomId, peerUserId)
          if (existing) attachRequest(existing)
        }
      } catch (initializationError) {
        if (!active) return
        setFlow("error")
        setError(initializationError instanceof Error ? initializationError.message : "Could not read Matrix identity status.")
      }
    }

    void initialize()
    return () => {
      active = false
      attachRequestRef.current = () => undefined
      startSasRef.current = () => undefined
      startQrRef.current = () => undefined
      if (client && sdkEvents && requestEventListener) client.off(sdkEvents.CryptoEvent.VerificationRequestReceived, requestEventListener)
      if (client && sdkEvents && trustEventListener) client.off(sdkEvents.CryptoEvent.UserTrustStatusChanged, trustEventListener)
      if (client && sdkEvents && devicesEventListener) client.off(sdkEvents.CryptoEvent.DevicesUpdated, devicesEventListener)
      if (requestRef.current && requestListener && sdkEvents) requestRef.current.off(sdkEvents.VerificationRequestEvent.Change, requestListener)
      if (verifier && sasListener && sdkEvents) verifier.off(sdkEvents.VerifierEvent.ShowSas, sasListener)
      if (verifier && qrListener && sdkEvents) verifier.off(sdkEvents.VerifierEvent.ShowReciprocateQr, qrListener)
      if (verifier && cancelListener && sdkEvents) verifier.off(sdkEvents.VerifierEvent.Cancel, cancelListener)
      requestRef.current = null
      clientRef.current = null
    }
  }, [isSelf, onSecurityAlert, peerUserId, roomId])

  useEffect(() => {
    if (flow !== "scanQr") return
    let stopped = false
    let animationFrame = 0
    let stream: MediaStream | null = null
    const video = videoRef.current

    const scan = async () => {
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is unavailable in this browser. Use emoji verification instead.")
      }
      const { default: jsQR } = await import("jsqr")
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      const canvas = document.createElement("canvas")
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error("Could not start the QR scanner. Use emoji verification instead.")
      let lastScannedAt = 0

      const scanFrame = () => {
        if (stopped) return
        if (performance.now() - lastScannedAt < 120) {
          animationFrame = requestAnimationFrame(scanFrame)
          return
        }
        lastScannedAt = performance.now()
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          animationFrame = requestAnimationFrame(scanFrame)
          return
        }
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
        if (result?.data) {
          scanBytesRef.current(result.binaryData)
          return
        }
        animationFrame = requestAnimationFrame(scanFrame)
      }
      scanFrame()
    }

    void scan().catch((scanError) => {
      if (stopped) return
      setFlow("ready")
      setError(scanError instanceof Error ? scanError.message : "Could not open the camera for QR scanning.")
    })

    return () => {
      stopped = true
      cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
    }
  }, [flow])

  const beginVerification = async () => {
    const client = clientRef.current
    if (!client) return
    const crypto = client.getCrypto()
    if (!crypto) return
    setError("")
    setFlow("requesting")
    try {
      const request = crypto.findVerificationRequestDMInProgress(roomId, peerUserId)
        || await crypto.requestVerificationDM(peerUserId, roomId)
      attachRequestRef.current(request)
    } catch (verificationError) {
      setFlow("error")
      setError(verificationError instanceof Error ? verificationError.message : "Could not send a Matrix verification request.")
    }
  }

  const showQrCode = async () => {
    const request = requestRef.current
    if (!request) return
    setError("")
    try {
      const bytes = await request.generateQRCode()
      if (!bytes?.length) throw new Error("Matrix could not create a QR code. Confirm recovery setup and try emoji verification.")
      const qrcode = await import("qrcode")
      const image = await qrcode.toDataURL([{ mode: "byte", data: new Uint8Array(bytes) }], { errorCorrectionLevel: "M", margin: 2, width: 256 })
      setQrImage(image)
      setFlow("showQr")
    } catch (qrError) {
      setFlow("ready")
      setError(qrError instanceof Error ? qrError.message : "Could not generate a Matrix verification QR code.")
    }
  }

  const scanQrBytes = async (bytes: number[]) => {
    const request = requestRef.current
    if (!request) {
      setFlow("error")
      setError("The Matrix verification request is no longer ready. Cancel it and start again.")
      return
    }
    try {
      const sdk = await import("matrix-js-sdk/lib/crypto-api")
      if (request.phase !== sdk.VerificationPhase.Ready) throw new Error("The Matrix verification request is no longer ready. Cancel it and start again.")
      if (!bytes.length || bytes.length > 2048) throw new Error("The Matrix verification QR code has an invalid size.")
      const activeVerifier = await request.scanQRCode(new Uint8ClampedArray(bytes))
      startQrRef.current(request, activeVerifier)
    } catch (qrError) {
      setFlow("ready")
      setError(qrError instanceof Error ? qrError.message : "Could not verify the scanned Matrix QR code.")
    }
  }

  scanBytesRef.current = (bytes) => { void scanQrBytes(bytes) }

  const confirmQrScan = () => {
    if (!qrConfirmation) return
    qrConfirmation.confirm()
    setQrConfirmation(null)
    setFlow("verifying")
  }

  const rejectQrScan = () => {
    qrConfirmation?.cancel()
    setQrConfirmation(null)
    setQrImage("")
    setFlow("none")
    setError(`You cancelled the QR verification. Do not confirm if you did not see ${isSelf ? "the other device scan" : "the other person scan"} your code.`)
  }

  const acceptVerification = async () => {
    try {
      await requestRef.current?.accept()
    } catch (verificationError) {
      setFlow("error")
      setError(verificationError instanceof Error ? verificationError.message : "Could not accept the Matrix verification request.")
    }
  }

  const cancelVerification = async () => {
    try {
      await requestRef.current?.cancel()
    } catch {
      setError("Could not cancel the Matrix verification request.")
    }
    setSas(null)
    setQrImage("")
    setQrConfirmation(null)
    setFlow("none")
  }

  const verifyDevice = async (deviceId: string) => {
    const crypto = clientRef.current?.getCrypto()
    if (!crypto || flow !== "none" || requestRef.current) return
    setRequestingDeviceId(deviceId)
    setError("")
    setFlow("requesting")
    try {
      if (isSelf && !(await crypto.isCrossSigningReady())) {
        throw new Error("Restore or set up this device's Matrix recovery identity before linking another device.")
      }
      const request = await crypto.requestDeviceVerification(peerUserId, deviceId)
      if (request.otherDeviceId !== deviceId) {
        await request.cancel()
        throw new Error("Matrix returned a verification request for a different device. No device was trusted.")
      }
      attachRequestRef.current(request)
    } catch (verificationError) {
      setFlow("error")
      setError(verificationError instanceof Error ? verificationError.message : "Could not request verification for this Matrix device.")
    } finally {
      setRequestingDeviceId("")
    }
  }

  const confirmSas = async () => {
    if (!sas) return
    try {
      await sas.confirm()
      setSas(null)
      setFlow("verifying")
    } catch (verificationError) {
      setFlow("error")
      setError(verificationError instanceof Error ? verificationError.message : "Could not confirm the Matrix verification.")
    }
  }

  const rejectSas = () => {
    sas?.mismatch()
    setSas(null)
    setFlow("none")
    setError("You marked the emoji comparison as different. The request was rejected.")
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {trust === "verified"
          ? isSelf ? "Matrix reports this account's cross-signing identity as verified on this device." : "Matrix reports this contact's cryptographic identity as verified on this device."
          : trust === "changed"
            ? isSelf ? "Matrix detected a changed account identity. Verify the new identity before linking another device." : "Matrix detected a changed contact identity. Verify the new identity before trusting it."
            : trust === "unknown"
              ? "Checking Matrix identity status…"
              : isSelf ? "This account's Matrix cross-signing identity has not been verified on this device." : "This contact's Matrix identity has not been verified on this device."}
      </p>
      {deviceKeyAlert && !onSecurityAlert && <p role="alert" className="text-xs text-destructive">{deviceKeyAlert}</p>}
      {devices.length > 0 && (
        <details className="rounded-md border p-2">
          <summary className="cursor-pointer text-xs font-medium">
            Matrix devices: {devices.filter((device) => device.trust === "verified").length} of {devices.length} verified
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">{isSelf
            ? "Keep both devices with you. Compare the QR code or emoji on this device with the target device to link it."
            : "For device-specific verification, be physically present with that device and compare the QR code or emoji there."}</p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {devices.map((device) => (
              <li key={device.id} className="rounded bg-muted/50 p-2 text-xs">
                <div className="flex flex-wrap justify-between gap-1">
                  <span className="font-medium">{device.name}{device.isCurrent ? " · This device" : ""}</span>
                  <span className={device.trust === "verified" ? "text-success" : "text-warning"}>
                    {device.trust === "verified" ? `Verified by ${device.trustSource}` : device.trust === "unknown" ? "No encryption key" : "Not verified"}
                  </span>
                </div>
                <div className="mt-1 break-all text-muted-foreground">Device {device.id} · Fingerprint {device.fingerprint}</div>
                {device.trust !== "verified" && !device.isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7"
                    disabled={flow !== "none" || Boolean(requestRef.current) || Boolean(requestingDeviceId)}
                    onClick={() => void verifyDevice(device.id)}
                  >
                    {requestingDeviceId === device.id ? "Requesting…" : isSelf ? "Link this device" : "Verify this device"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {flow === "incoming" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void acceptVerification()}>Accept verification</Button>
          <Button size="sm" variant="outline" onClick={() => void cancelVerification()}>Decline</Button>
        </div>
      )}
      {flow === "ready" && requestRef.current && (
        <div className="flex flex-wrap gap-2">
          {requestRef.current.otherPartySupportsMethod("m.qr_code.scan.v1") && (
            <Button size="sm" variant="outline" onClick={() => void showQrCode()}>Show QR code</Button>
          )}
          {requestRef.current.otherPartySupportsMethod("m.qr_code.show.v1") && (
            <Button size="sm" variant="outline" onClick={() => setFlow("scanQr")}>Scan their QR code</Button>
          )}
          {requestRef.current.methods.includes("m.sas.v1") && (
            <Button size="sm" variant="outline" onClick={() => startSasRef.current(requestRef.current!)}>Compare emoji</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void cancelVerification()}>Cancel</Button>
        </div>
      )}
      {flow === "showQr" && qrImage && (
        <div className="space-y-2 rounded-md border bg-background p-3 text-center">
          <p className="text-sm">{isSelf
            ? "Open a Matrix verification scanner on the other device and scan this code. Keep it visible only during this verification."
            : "Have the other person scan this code with their Cipher device. Keep it visible only during this verification."}</p>
          <img src={qrImage} alt="Temporary Matrix identity verification QR code" className="mx-auto h-64 w-64 max-w-full rounded bg-white p-2" />
          <Button size="sm" variant="outline" onClick={() => setFlow("ready")}>Back to verification options</Button>
        </div>
      )}
      {flow === "scanQr" && (
        <div className="space-y-2 rounded-md border bg-background p-3">
          <p className="text-sm">{isSelf
            ? "Scan the target device’s Matrix verification code in person. The code is processed in this browser."
            : "Scan the other person’s Matrix verification code in person. The code is processed in this browser."}</p>
          <video ref={videoRef} muted playsInline aria-label="Camera view for scanning a Matrix verification QR code" className="mx-auto max-h-64 w-full rounded bg-black object-contain" />
          <Button size="sm" variant="outline" onClick={() => setFlow("ready")}>Stop scanning</Button>
        </div>
      )}
      {flow === "qrConfirm" && qrConfirmation && (
        <div className="space-y-2 rounded-md border bg-background p-3">
          <p className="text-sm font-medium">{isSelf ? "Did you scan the QR code on the device you intend to link?" : "Did you personally see the other person scan your QR code?"}</p>
          <p className="text-xs text-muted-foreground">{isSelf ? "Confirm only if you used the other device in your possession." : "Confirm only if the person you intended to verify scanned it in your presence."}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmQrScan}>{isSelf ? "Yes, I scanned the other device" : "Yes, I saw them scan it"}</Button>
            <Button size="sm" variant="outline" onClick={rejectQrScan}>No, cancel</Button>
          </div>
        </div>
      )}
      {flow === "sas" && sas && (
        <div className="space-y-3 rounded-md border bg-background p-3">
          <p className="text-sm font-medium">{isSelf
            ? "Compare these symbols on both devices. Confirm only when they match."
            : "Compare these symbols with the other person in person or over a separate trusted voice channel."}</p>
          {sas.sas.emoji?.length ? (
            <div className="grid grid-cols-4 gap-2 text-center sm:grid-cols-7">
              {sas.sas.emoji.map(([emoji, name]) => (
                <div key={`${emoji}-${name}`} className="rounded bg-muted p-2">
                  <div className="text-2xl" aria-label={name}>{emoji}</div>
                  <div className="text-[10px] text-muted-foreground">{name}</div>
                </div>
              ))}
            </div>
          ) : sas.sas.decimal ? (
            <p className="text-center text-2xl font-semibold tracking-widest">{sas.sas.decimal.join(" · ")}</p>
          ) : (
            <p role="alert" className="text-sm text-destructive">No comparison code is available. Cancel and retry.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void confirmSas()} disabled={!sas.sas.emoji?.length && !sas.sas.decimal}>They match</Button>
            <Button size="sm" variant="outline" onClick={rejectSas}>They do not match</Button>
          </div>
        </div>
      )}
      {flow === "waiting" && <p className="text-xs text-muted-foreground">{isSelf ? "Verification request sent. Accept it on the target device." : "Verification request sent. Waiting for the other person to accept."}</p>}
      {flow === "verifying" && <p className="text-xs text-muted-foreground">Waiting for the Matrix verification to finish.</p>}
      {flow === "requesting" && <p className="text-xs text-muted-foreground">Sending verification request…</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {!isSelf && flow !== "incoming" && flow !== "waiting" && flow !== "verifying" && flow !== "sas" && flow !== "requesting" && trust !== "verified" && !requestRef.current?.pending && (
        <Button size="sm" variant="outline" onClick={() => void beginVerification()} disabled={!roomId || trust === "unknown"}>
          Start identity verification
        </Button>
      )}
      {(flow === "waiting" || (flow === "error" && requestRef.current?.pending)) && <Button size="sm" variant="outline" onClick={() => void cancelVerification()}>Cancel request</Button>}
      {isSelf && flow === "error" && !requestRef.current?.pending && (
        <Button size="sm" variant="outline" onClick={() => { setError(""); setFlow("none") }}>Try device verification again</Button>
      )}
      <p className="text-[11px] text-muted-foreground">{isSelf
        ? "A linked device can receive new room keys after Matrix verifies its cross-signing identity. Only link a device you control."
        : "QR and emoji checks verify Matrix key material. They identify a person only if you already know who you are checking in person or on a separate trusted channel."}</p>
    </div>
  )
}
