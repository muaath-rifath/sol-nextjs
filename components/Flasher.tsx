"use client"

import { patchFirmware, type FlashConfig, type FirmwareTemplateId } from "@/lib/firmware-patcher"
import { useMemo, useState } from "react"

type FirmwareVersion = {
  id: string
  template_id: string
  version: string
}

type DeviceOption = {
  id: string
  name: string
  room_id: string
}

type Props = {
  firmwareVersions: FirmwareVersion[]
  devices: DeviceOption[]
  defaultTemplate?: string
}

export default function Flasher({ firmwareVersions, devices, defaultTemplate }: Props) {
  const [firmwareID, setFirmwareID] = useState<string>(firmwareVersions[0]?.id ?? "")
  const [deviceID, setDeviceID] = useState<string>(devices[0]?.id ?? "")
  const [wifiSsid, setWifiSsid] = useState("")
  const [wifiPassword, setWifiPassword] = useState("")
  const [mqttBrokerUri, setMqttBrokerUri] = useState("")
  const [templateMode, setTemplateMode] = useState("0")
  const [relayPins, setRelayPins] = useState("12,13,14,15")
  const [relayActiveLowMask, setRelayActiveLowMask] = useState("0")
  const [isBusy, setIsBusy] = useState(false)
  const [status, setStatus] = useState<string>("Ready")

  const selectedFirmware = useMemo(
    () => firmwareVersions.find((f) => f.id === firmwareID) ?? firmwareVersions[0],
    [firmwareID, firmwareVersions],
  )

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

      const pins = relayPins
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v))

      if (pins.length !== 4) {
        throw new Error("Relay pins must contain exactly 4 comma-separated numbers")
      }

      setStatus("Patching firmware...")
      const patched = await patchFirmware(bytes, {
        wifiSsid,
        wifiPassword,
        mqttBrokerUri,
        deviceId: deviceID,
        templateId: (selectedFirmware.template_id || defaultTemplate || "relay_single") as FirmwareTemplateId,
        templateMode: Number(templateMode),
        relayPins: [pins[0], pins[1], pins[2], pins[3]],
        relayActiveLowMask: Number(relayActiveLowMask),
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
    <div className="rounded-3xl border border-stone-200 bg-white/90 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-stone-900">WebSerial Flasher</h2>
      <p className="mt-1 text-sm text-stone-600">Download firmware, patch SOLCFGv2 fields, and flash via serial.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-stone-700">
          Firmware
          <select
            value={firmwareID}
            onChange={(e) => setFirmwareID(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
          >
            {firmwareVersions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.template_id}:{f.version}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-stone-700">
          Device
          <select
            value={deviceID}
            onChange={(e) => setDeviceID(e.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-stone-700">
          Wi-Fi SSID
          <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
        </label>

        <label className="text-xs font-semibold text-stone-700">
          Wi-Fi Password
          <input value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
        </label>

        <label className="text-xs font-semibold text-stone-700">
          MQTT Broker URI
          <input value={mqttBrokerUri} onChange={(e) => setMqttBrokerUri(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
        </label>

        <label className="text-xs font-semibold text-stone-700">
          Template Mode
          <input value={templateMode} onChange={(e) => setTemplateMode(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
        </label>

        <label className="text-xs font-semibold text-stone-700">
          Relay Pins (4)
          <input value={relayPins} onChange={(e) => setRelayPins(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
        </label>

        <label className="text-xs font-semibold text-stone-700">
          Active-Low Mask
          <input value={relayActiveLowMask} onChange={(e) => setRelayActiveLowMask(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onFlash}
          disabled={isBusy || !firmwareVersions.length || !devices.length}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isBusy ? "Flashing..." : "Start Flash"}
        </button>
        <span className="text-sm text-stone-700">{status}</span>
      </div>
    </div>
  )
}
