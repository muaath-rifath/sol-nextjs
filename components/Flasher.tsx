"use client"

import { patchFirmware, type FlashConfig, type FirmwareTemplateId } from "@/lib/firmware-patcher"
import { useMemo, useState, useEffect } from "react"

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

type Props = {
  firmwareVersions: FirmwareVersion[]
  devices: DeviceOption[]
  defaultTemplate?: string
}

export default function Flasher({ firmwareVersions, devices, defaultTemplate }: Props) {
  const [deviceID, setDeviceID] = useState<string>(devices[0]?.id ?? "")
  const [wifiSsid, setWifiSsid] = useState("")
  const [wifiPassword, setWifiPassword] = useState("")
  const [mqttBrokerUri, setMqttBrokerUri] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const [status, setStatus] = useState<string>("Ready")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMqttBrokerUri(`mqtts://api.mysol.internal:8883`) // Example fallback
      if (window.location.hostname) {
        setMqttBrokerUri(window.location.protocol === 'https:'
          ? `mqtts://${window.location.hostname}:8883`
          : `mqtt://${window.location.hostname}:1883`)
      }
    }
  }, [])

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === deviceID) ?? devices[0],
    [deviceID, devices]
  )

  const selectedFirmware = useMemo(() => {
    if (!selectedDevice) return firmwareVersions[0]
    const fwId = selectedDevice.metadata?.firmware_id
    if (fwId) {
      const match = firmwareVersions.find((f) => f.id === fwId)
      if (match) return match
    }
    return firmwareVersions[0]
  }, [selectedDevice, firmwareVersions])

  async function onFlash() {
    if (!selectedFirmware) {
      setStatus("Select firmware first")
      return
    }
    if (!deviceID) {
      setStatus("Select device first")
      return
    }

    setIsBusy(true)
    try {
      setStatus("Downloading firmware...")
      const response = await fetch(`/api/firmware/${selectedFirmware.id}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      setStatus("Patching firmware...")
      const patched = await patchFirmware(bytes, {
        wifiSsid,
        wifiPassword,
        mqttBrokerUri,
        deviceId: deviceID,
        templateId: (selectedFirmware.template_id || defaultTemplate || "relay_single") as FirmwareTemplateId,
        templateMode: 0,
        relayPins: [12, 13, 14, 15],
        relayActiveLowMask: 0,
      } as FlashConfig)

      setStatus("Connecting to serial...")
      const nav = navigator as Navigator & {
        serial?: {
          requestPort: () => Promise<unknown>
        }
      }
      if (!nav.serial) {
        throw new Error("WebSerial is not supported in this browser")
      }

      const port = await nav.serial.requestPort()

      setStatus("Flashing with esptool-js...")
      const mod = (await import("esptool-js")) as unknown as {
        ESPLoader?: new (...args: unknown[]) => {
          main: () => Promise<void>
          writeFlash: (...args: unknown[]) => Promise<void>
          hardReset: () => Promise<void>
        }
        Transport?: new (...args: unknown[]) => unknown
      }

      if (!mod.ESPLoader || !mod.Transport) {
        throw new Error("esptool-js exports not found")
      }

      const transport = new mod.Transport(port)
      const loader = new mod.ESPLoader({
        transport,
        baudrate: 115200,
        terminal: {
          clean: () => undefined,
          writeLine: () => undefined,
          write: () => undefined,
        },
      })

      await loader.main()
      await loader.writeFlash({
        fileArray: [
          {
            address: 0x10000,
            data: patched,
          },
        ],
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
      })
      await loader.hardReset()
      setStatus("Flash complete")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Flash failed")
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
          MQTT URI (Auto-Detected)
          <input value={mqttBrokerUri} onChange={(e) => setMqttBrokerUri(e.target.value)} className="clay-inset mt-1 w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface" />
        </label>

        <label className="text-xs font-semibold text-on-surface-variant">
          Wi-Fi SSID
          <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} className="clay-inset mt-1 w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface" />
        </label>

        <label className="text-xs font-semibold text-on-surface-variant">
          Wi-Fi Password
          <input value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} className="clay-inset mt-1 w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onFlash}
          disabled={isBusy || !firmwareVersions.length || !devices.length}
          className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isBusy ? "Flashing..." : "Start Flash"}
        </button>
        <span className="text-sm text-on-surface-variant">{status}</span>
      </div>
    </div>
  )
}
