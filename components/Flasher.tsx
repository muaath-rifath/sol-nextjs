"use client"

import { patchFirmware, buildCertsPartition, type FlashConfig, type FirmwareTemplateId } from "@/lib/firmware-patcher"
import { getDeviceProvisioning } from "@/lib/actions"
import { IconAlertCircle, IconCheck, IconLoader2, IconX } from "@tabler/icons-react"
import clsx from "clsx"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type FirmwareVersion = {
  id: string
  template_id: string
  version: string
}

type DeviceOption = {
  id: string
  name: string
  room_id: string
  metadata?: Record<string, string>
}

type LogEntry = {
  text: string
  type: "info" | "error" | "success"
}

type Props = {
  firmwareVersions: FirmwareVersion[]
  devices: DeviceOption[]
  defaultTemplate?: string
  mqttBrokerUrl: string
  mqttUsername: string
  mqttPassword: string
  caCert: string
}

export default function Flasher({
  firmwareVersions,
  devices,
  defaultTemplate,
  mqttBrokerUrl,
  mqttUsername,
  mqttPassword,
  caCert,
}: Props) {
  const [deviceID, setDeviceID] = useState<string>(devices[0]?.id ?? "")
  const [selectedFirmwareId, setSelectedFirmwareId] = useState<string>(firmwareVersions[0]?.id ?? "")
  const [wifiSsid, setWifiSsid] = useState("")
  const [wifiPassword, setWifiPassword] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const [status, setStatus] = useState<string>("Ready")
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [showLogs, setShowLogs] = useState(false)

  const logEndRef = useRef<HTMLDivElement>(null)

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === deviceID) ?? devices[0],
    [deviceID, devices]
  )

  const selectedFirmware = useMemo(() => {
    return firmwareVersions.find((f) => f.id === selectedFirmwareId) ?? firmwareVersions[0]
  }, [selectedFirmwareId, firmwareVersions])

  useEffect(() => {
    if (!selectedFirmwareId && firmwareVersions.length > 0) {
      setSelectedFirmwareId(firmwareVersions[0].id)
    }
  }, [firmwareVersions, selectedFirmwareId])

  function firmwareLabel(firmware: FirmwareVersion, index: number) {
    const tags = []
    if (index === 0) tags.push("latest")
    if (selectedDevice?.metadata?.firmware_id === firmware.id) tags.push("assigned")

    return tags.length
      ? `${firmware.version} (${firmware.template_id}, ${tags.join(", ")})`
      : `${firmware.version} (${firmware.template_id})`
  }

  const addLog = useCallback((text: string, type: "info" | "error" | "success" = "info") => {
    setLogs((prev) => [...prev, { text, type }])
  }, [])

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs])

  function getFriendlyErrorMessage(message: string): string[] {
    if (
      message.includes("Failed to execute 'open' on 'SerialPort'") ||
      message.includes("Failed to open serial port")
    ) {
      return [
        "Failed to open serial port.",
        "Close anything using the port (idf.py monitor, screen, minicom, another browser tab), then retry.",
        "On Linux, ModemManager may grab CH340 ports: sudo systemctl stop ModemManager",
        "For a permanent fix: sudo systemctl disable ModemManager",
        "On Linux, ensure your user is in dialout: sudo usermod -aG dialout $USER (then log out/in).",
        "CH340 adapters usually appear as /dev/ttyUSB*.",
      ]
    }

    if (message.includes("No port selected") || message.includes("user gesture")) {
      return ["No serial port selected."]
    }

    if (
      message.includes("Failed to connect with the device") ||
      message.includes("timed out waiting for packet header")
    ) {
      return [
        "Failed to connect to ESP32 bootloader.",
        "Press and hold BOOT, tap RESET, release RESET, then release BOOT and retry immediately.",
        "If your board has CH340, auto-reset wiring may be missing; manual bootloader entry is often required.",
      ]
    }

    if (
      message.includes("The device has been lost") ||
      message.includes("device has been lost")
    ) {
      return [
        "USB serial device was lost during flashing.",
        "Close idf.py monitor or any serial tool using the same port, then retry.",
        "If monitor is open, press Ctrl+] in that terminal to exit it cleanly.",
        "If this keeps happening, unplug/replug the USB cable and try again.",
      ]
    }

    return [`Error: ${message}`]
  }

  async function onFlash() {
    if (!deviceID) {
      setStatus("Select a device first")
      return
    }
    if (!selectedFirmware) {
      setStatus("No firmware binary uploaded yet — go to Manage Firmware and upload one first")
      return
    }
    if (!wifiSsid.trim()) {
      setStatus("Please enter a Wi-Fi SSID")
      return
    }

    const nav = navigator as Navigator & {
      serial?: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requestPort: (options?: { filters?: { usbVendorId: number; usbProductId?: number }[] }) => Promise<any>
      }
    }
    if (!nav.serial) {
      setStatus("WebSerial is not supported in this browser")
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let port: any
    try {
      port = await nav.serial.requestPort({
        filters: [
          { usbVendorId: 0x1a86, usbProductId: 0x55d3 }, // CH340
          { usbVendorId: 0x303a }, // Espressif USB interfaces
        ],
      })
    } catch (err) {
      console.error("User cancelled or failed to select port", err)
      return
    }

    setIsBusy(true)
    setShowLogs(true)
    setLogs([])
    try {
      addLog("Starting flash process...")
      setStatus("Downloading firmware...")
      addLog(`Selected firmware: ${selectedFirmware.version} (${selectedFirmware.template_id}, ${selectedFirmware.id})`)
      addLog(`Downloading firmware version ${selectedFirmware.version}...`)
      const response = await fetch(`/api/firmware/${selectedFirmware.id}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)

      let certBundle: { CertificatePEM: string; PrivateKeyPEM: string } | null = null
      try {
        addLog("Generating device mTLS certificates...")
        certBundle = await getDeviceProvisioning(deviceID)
        if (certBundle) {
          addLog("Certificates generated successfully.")
        } else {
          addLog("mTLS is disabled on the server, skipping certificate generation.")
        }
      } catch (e) {
        addLog(`Certificate generation failed: ${e instanceof Error ? e.message : "Unknown error"}`)
        throw e
      }

      setStatus("Patching firmware...")
      addLog("Patching SOLCFGv2 fields...")
      const patched = await patchFirmware(bytes, {
        wifiSsid,
        wifiPassword,
        mqttBrokerUri: mqttBrokerUrl,
        mqttUsername: mqttUsername,
        mqttPassword: mqttPassword,
        deviceId: deviceID,
        templateId: (selectedFirmware.template_id || defaultTemplate || "switch") as FirmwareTemplateId,
        relayPins: [12, 13, 14, 15],
        relayActiveLowMask: 0,
        mtls: certBundle ? {
          caCert: caCert, // We need to get the Root CA cert to the frontend
          clientCert: certBundle.CertificatePEM,
          clientKey: certBundle.PrivateKeyPEM,
        } : undefined,
      } as FlashConfig)

      // Build certs partition binary (64KB at 0x610000)
      let certsPartition: Uint8Array | null = null
      if (certBundle) {
        addLog("Building certs partition binary...")
        certsPartition = buildCertsPartition(
          caCert,
          certBundle.CertificatePEM,
          certBundle.PrivateKeyPEM,
        )
      }

      setStatus("Flashing with esptool-js...")
      addLog("Connecting to ESP32...")
      const mod = (await import("esptool-js")) as unknown as {
        ESPLoader?: new (...args: unknown[]) => {
          main: () => Promise<void>
          writeFlash: (...args: unknown[]) => Promise<void>
          after: (mode: string) => Promise<void>
        }
        Transport?: new (...args: unknown[]) => unknown
      }

      if (!mod.ESPLoader || !mod.Transport) {
        throw new Error("esptool-js exports not found")
      }

      const transport = new mod.Transport(port)
      const loader = new mod.ESPLoader({
        transport,
        baudrate: 921600,
        terminal: {
          clean: () => setLogs([]),
          writeLine: (data: string) => addLog(data),
          write: (data: string) => addLog(data),
        },
      })

      await loader.main()
      addLog("Chip connected. Writing flash...")
      await loader.writeFlash({
        fileArray: [
          {
            address: 0x10000,
            data: patched,
          },
          // Write the certs partition to 0x610000 (matches partitions.csv)
          ...(certsPartition ? [{ address: 0x610000, data: certsPartition }] : []),
          // Reset OTA data to force boot from ota_0
          {
            address: 0xe000,
            data: new Uint8Array(8192).fill(0xff),
          },
        ],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
      })
      addLog("Flash complete! Resetting...", "success")
      await loader.after("hard_reset")
      setStatus("Flash complete")
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      for (const line of getFriendlyErrorMessage(msg)) {
        addLog(line, "error")
      }
      setStatus("Flash failed")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="rounded-3xl border border-white/60 bg-surface-container-low p-5 shadow-[10px_10px_24px_rgba(87,66,62,0.12),-10px_-10px_24px_rgba(255,255,255,0.92)]">
      <h2 className="font-display text-lg font-semibold text-on-surface">WebSerial Flasher</h2>
      <p className="mt-1 text-sm text-on-surface-variant">Download firmware, patch SOLCFGv2 fields, and flash via serial.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-on-surface-variant">
          Node (Switchboard)
          <select
            value={deviceID}
            onChange={(e) => setDeviceID(e.target.value)}
            className="clay-inset mt-1 w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-on-surface-variant">
          Firmware Version
          <select
            value={selectedFirmwareId}
            onChange={(e) => setSelectedFirmwareId(e.target.value)}
            className="clay-inset mt-1 w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface"
          >
            {firmwareVersions.map((f, index) => (
              <option key={f.id} value={f.id}>
                {firmwareLabel(f, index)}
              </option>
            ))}
          </select>
        </label>

        <label className="col-span-full text-xs font-semibold text-on-surface-variant md:col-span-1">
          Wi-Fi SSID
          <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} className="clay-inset mt-1 w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface" />
        </label>

        <label className="col-span-full text-xs font-semibold text-on-surface-variant md:col-span-1">
          Wi-Fi Password
          <input type="password" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} className="clay-inset mt-1 w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface" />
        </label>

        <div className="flex items-end">
          <p className="text-xs text-on-surface-variant">
            MQTT broker: <span className="font-mono text-primary">{mqttBrokerUrl}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!firmwareVersions.length && (
          <p className="w-full rounded-xl bg-error-container px-3 py-2 text-xs text-on-error-container">
            No firmware binary found. Upload one on the{" "}
            <a href="../firmware" className="underline">Manage Firmware</a> page first.
          </p>
        )}
        <button
          type="button"
          onClick={onFlash}
          disabled={isBusy || !devices.length || !firmwareVersions.length}
          className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isBusy ? "Flashing..." : "Start Flash"}
        </button>
        <span className="text-sm text-on-surface-variant">{status}</span>
        {logs.length > 0 && (
          <button
            onClick={() => setShowLogs(true)}
            className="text-xs font-bold text-primary hover:underline"
          >
            View Logs
          </button>
        )}
      </div>

      {showLogs && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm">
          <div className="bg-clay-canvas w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-white/60 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/40 p-6">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-xl font-bold text-on-surface">Flashing Logs</h2>
                {isBusy && <IconLoader2 className="animate-spin text-primary" size={20} />}
                {status === "Flash complete" && <IconCheck className="text-emerald-500" size={20} />}
                {status === "Flash failed" && <IconAlertCircle className="text-error" size={20} />}
              </div>
              <button onClick={() => setShowLogs(false)} className="text-on-surface-variant hover:text-on-surface">
                <IconX size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="clay-inset relative h-96 overflow-hidden rounded-2xl border border-white/55 bg-stone-950 font-mono text-xs text-stone-100">
                <div className="absolute inset-0 overflow-y-auto p-4">
                  {logs.map((log, i) => (
                    <div key={i} className={clsx("mb-1", {
                      "text-error": log.type === "error",
                      "text-emerald-400": log.type === "success",
                      "text-stone-300": log.type === "info"
                    })}>
                      {log.text}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-medium text-on-surface-variant">
                  Status: <span className={clsx("font-bold", {
                    "text-error": status === "Flash failed",
                    "text-emerald-600": status === "Flash complete",
                    "text-primary": isBusy
                  })}>{status}</span>
                </span>
                <button
                  onClick={() => setShowLogs(false)}
                  className="btn-outline px-6 py-2 text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
