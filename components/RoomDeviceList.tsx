"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IconCpu, IconX } from "@tabler/icons-react"
import { type Appliance, type RoomDevice } from "@/lib/sol-core"
import AddAppliancePopover from "@/components/AddAppliancePopover"
import { useWS } from "@/providers/WSProvider"

function coerceBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") return value === "true" || value === "1" || value === "on"
  return false
}

interface Props {
  homeId: string
  roomId: string
  initialDevices: RoomDevice[]
  initialAppliances: Appliance[]
  addApplianceAction: (formData: FormData) => Promise<void>
  deleteDeviceAction: (formData: FormData) => Promise<void>
  deleteApplianceAction: (formData: FormData) => Promise<void>
}

interface DeviceStateEvent {
  device_id: string
  state: Record<string, unknown>
}

interface ApplianceStateEvent {
  appliance_id: string
  state: Record<string, unknown>
}

export default function RoomDeviceList({
  homeId,
  roomId,
  initialDevices,
  initialAppliances,
  addApplianceAction,
  deleteDeviceAction,
  deleteApplianceAction,
}: Props) {
  const { subscribe, send } = useWS()
  const [devices, setDevices] = useState<RoomDevice[]>(initialDevices)
  const [appliances, setAppliances] = useState<Appliance[]>(initialAppliances)

  const pendingRef = useRef<Map<string, boolean>>(new Map())
  // Maps correlationId → {applianceId, previousIsOn} for rollback on failure
  const pendingCommandsRef = useRef<Map<string, { applianceId: string; previousIsOn: boolean }>>(new Map())

  useEffect(() => {
    const unsubDevice = subscribe("device.state", (raw) => {
      const data = raw as DeviceStateEvent
      if (!data?.device_id) return
      setDevices((prev) =>
        prev.map((d) =>
          d.id === data.device_id
            ? { ...d, state: data.state, online: data.state?.online !== false }
            : d
        )
      )
    })

    const unsubAppliance = subscribe("appliance.state", (raw) => {
      const data = raw as ApplianceStateEvent
      if (!data?.appliance_id) return
      // Device confirmed its real state — clear any pending optimistic entry.
      pendingRef.current.delete(data.appliance_id)
      for (const [cid, entry] of pendingCommandsRef.current) {
        if (entry.applianceId === data.appliance_id) {
          pendingCommandsRef.current.delete(cid)
        }
      }
      setAppliances((prev) =>
        prev.map((a) =>
          a.id === data.appliance_id ? { ...a, state: data.state } : a
        )
      )
    })

    return () => {
      unsubDevice()
      unsubAppliance()
    }
  }, [subscribe])

  const toggle = useCallback(
    (deviceId: string, channel: number, currentlyOn: boolean, applianceId: string) => {
      const turnOn = !currentlyOn
      const correlationId = crypto.randomUUID()

      pendingRef.current.set(applianceId, turnOn)
      pendingCommandsRef.current.set(correlationId, { applianceId, previousIsOn: currentlyOn })

      setAppliances((prev) =>
        prev.map((a) =>
          a.id === applianceId ? { ...a, state: { ...a.state, isOn: turnOn } } : a
        )
      )

      send({
        type: "device.command",
        correlationId,
        data: {
          home_id: homeId,
          room_id: roomId,
          device_id: deviceId,
          action: "relay_set",
          params: { channel, power: turnOn },
        },
      })
    },
    [homeId, roomId, send]
  )

  useEffect(() => {
    const unsub = subscribe("command.ack", (raw) => {
      const data = raw as { correlationId?: string; success?: boolean }
      if (!data?.correlationId || data.success !== false) return
      const pending = pendingCommandsRef.current.get(data.correlationId)
      if (!pending) return
      pendingCommandsRef.current.delete(data.correlationId)
      pendingRef.current.delete(pending.applianceId)
      setAppliances((prev) =>
        prev.map((a) =>
          a.id === pending.applianceId
            ? { ...a, state: { ...a.state, isOn: pending.previousIsOn } }
            : a
        )
      )
    })
    return unsub
  }, [subscribe])

  if (devices.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-outline">No devices in this room</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {devices.map((device) => {
        const deviceAppliances = appliances.filter((a) => a.device_id === device.id)

        return (
          <div
            key={device.id}
            className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-surface-container-low p-1 shadow-[8px_8px_24px_rgba(87,66,62,0.07),-8px_-8px_24px_rgba(255,255,255,0.9)] transition-all hover:scale-[1.01] hover:shadow-[12px_12px_32px_rgba(87,66,62,0.1)]"
          >
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-[inset_1px_1px_4px_rgba(255,255,255,0.6)] ${
                      device.online ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    <IconCpu size={24} />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-on-surface leading-tight">
                      {device.name}
                    </h3>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-outline">
                      {device.type} · {device.online ? "Connected" : "Offline"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <AddAppliancePopover
                    addApplianceAction={addApplianceAction}
                    device={{ id: device.id, name: device.name }}
                  />
                  <form action={deleteDeviceAction}>
                    <input type="hidden" name="device_id" value={device.id ?? ""} />
                    <button
                      type="submit"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-error-container/10 text-error opacity-0 transition-opacity group-hover:opacity-100 hover:bg-error-container/20"
                      title="Delete Device"
                    >
                      <IconX size={14} />
                    </button>
                  </form>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-outline">
                    Uptime
                  </span>
                  <span className="text-xs font-medium text-on-surface-variant">
                    {formatUptime(device.state?.uptime as number)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-outline">
                    IP Address
                  </span>
                  <span className="text-xs font-medium text-on-surface-variant">
                    {String(device.state?.ip_address ?? "---")}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-auto space-y-1 bg-surface-container/40 p-3">
              {deviceAppliances.length === 0 ? (
                <div className="py-2 text-center">
                  <p className="text-[10px] italic text-outline">No appliances configured</p>
                </div>
              ) : (
                deviceAppliances.map((app) => {
                  const isOn = coerceBool(app.state?.isOn)
                  return (
                    <div
                      key={app.id}
                      className="group/item mr-auto inline-flex max-w-[250px] items-center justify-between rounded-xl border border-white/40 bg-white/30 p-2.5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),2px_2px_4px_rgba(0,0,0,0.02)] transition-colors hover:bg-white/50"
                    >
                      <div className="min-w-0 w-[140px] max-w-[140px] pr-2">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`h-1.5 w-1.5 rounded-full ${
                              isOn
                                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                                : "bg-stone-500"
                            }`}
                          />
                          <p className="truncate text-xs font-medium text-on-surface leading-tight">
                            {app.name}
                          </p>
                        </div>
                        <p className="truncate text-[9px] text-on-surface-variant/60 leading-tight">
                          {app.type} · Ch{app.channel ?? "?"}
                          {app.gpio_pin != null ? ` · GPIO${app.gpio_pin}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            toggle(device.id, app.channel ?? 0, isOn, app.id)
                          }
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold transition-all ${
                            isOn
                              ? "border-primary-container bg-primary-fixed text-on-primary-fixed-variant"
                              : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline"
                          }`}
                        >
                          {isOn ? "On" : "Off"}
                        </button>

                        <div className="flex opacity-0 transition-opacity group-hover/item:opacity-100">
                          <form action={deleteApplianceAction}>
                            <input type="hidden" name="appliance_id" value={app.id} />
                            <button
                              type="submit"
                              className="flex h-5 w-5 items-center justify-center rounded-md border border-error/20 bg-error-container/10 text-error hover:bg-error-container/30"
                            >
                              <IconX size={10} />
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatUptime(ms?: number): string {
  if (!ms) return "--"
  const d = Math.floor(ms / (1000 * 60 * 60 * 24))
  const h = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    .toString()
    .padStart(2, "0")
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
    .toString()
    .padStart(2, "0")
  return `${d}d ${h}h ${m}m`
}
