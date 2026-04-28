import { solCore } from "@/lib/sol-core"
import {
  IconActivity,
  IconArrowLeft,
  IconBolt,
  IconCloudDownload,
  IconCpu,
  IconTool,
  IconUsb,
  IconWifi,
  IconWifiOff,
  IconX,
} from "@tabler/icons-react"
import AddAppliancePopover from "@/components/AddAppliancePopover"
import ClearSearchParams from "@/components/ClearSearchParams"
import CreateDevicePopover from "@/components/CreateDevicePopover"
import OTALogPanel from "@/components/OTALogPanel"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"

export const dynamic = "force-dynamic"

type RoomPageSearchParams = Promise<{
  notice?: string
  error?: string
}>

function roomHref(homeID: string, roomID: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue
    query.set(key, value)
  }
  const encoded = query.toString()
  return encoded
    ? `/dashboard/homes/${homeID}/rooms/${roomID}?${encoded}`
    : `/dashboard/homes/${homeID}/rooms/${roomID}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong"
}

function coerceBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") return value === "true" || value === "1" || value === "on"
  return false
}

function formatUptime(ms?: number): string {
  if (!ms) return "--"
  const d = Math.floor(ms / (1000 * 60 * 60 * 24))
  const h = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, "0")
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, "0")
  return `${d}d ${h}h ${m}m`
}

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string; roomId: string }>
  searchParams: RoomPageSearchParams
}) {
  const { homeId, roomId } = await params
  const query = await searchParams

  const roomResult = await solCore.rooms.get(homeId, roomId).catch(() => null)
  if (!roomResult) {
    redirect(`/dashboard/homes/${homeId}?error=Room+not+found`)
  }
  const room = roomResult

  const [devices, firmwareVersions, activityRes, appliancesRes, otaAttemptsRes] = await Promise.all([
    solCore.rooms.devices.listAll(homeId, roomId).catch(() => []),
    solCore.firmware.list().catch(() => []),
    solCore.rooms.activity(homeId, roomId, 20).catch(() => ({ data: [] })),
    solCore.appliances.listByRoom(homeId, roomId).catch(() => ({ data: [] })),
    solCore.rooms.otaAttempts.list(homeId, roomId, 50).catch(() => ({ data: [] })),
  ])
  const activityLogs = activityRes?.data || []
  const appliances = appliancesRes?.data || []
  const otaAttempts = otaAttemptsRes?.data || []

  const onlineCount = devices.filter((device) => device.online).length
  const activeCount = devices.filter((device) => coerceBool(device.state?.isOn)).length

  const primaryDevice = devices[0]
  const primaryOnlineDevice = devices.find((d) => d.online)
  const envSensorDevice = devices.find((device) => device.type.toLowerCase().includes("sensor"))
  const showRightRail = Boolean(envSensorDevice)

  let currentTemp: number | undefined
  let currentHumid: number | undefined
  if (envSensorDevice) {
    try {
      const pts = await solCore.devices.getTelemetry(envSensorDevice.id, 1)
      if (pts?.[0]?.data) {
        currentTemp = pts[0].data.temperature as number
        currentHumid = pts[0].data.humidity as number
      }
    } catch { }
  }

  async function createDeviceAction(formData: FormData) {
    "use server"
    const name = String(formData.get("name") ?? "").trim()
    const type = String(formData.get("type") ?? "esp32").trim()

    if (!name) {
      redirect(roomHref(homeId, roomId, { error: "Device name is required" }))
    }

    try {
      await solCore.rooms.devices.create(homeId, roomId, { name, type })
      redirect(roomHref(homeId, roomId, { notice: "Device created" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  async function addApplianceAction(formData: FormData) {
    "use server"
    const deviceID = String(formData.get("device_id") ?? "").trim()
    const name = String(formData.get("name") ?? "").trim()
    const type = String(formData.get("type") ?? "custom").trim()
    const channelStr = String(formData.get("channel") ?? "").trim()
    const gpioPinStr = String(formData.get("gpio_pin") ?? "").trim()
    const activeLow = String(formData.get("active_low") ?? "") === "true"

    if (!name || !deviceID) {
      redirect(roomHref(homeId, roomId, { error: "Appliance name and switchboard are required" }))
    }

    try {
      await solCore.appliances.create({
        device_id: deviceID,
        room_id: roomId,
        name,
        type,
        channel: channelStr ? parseInt(channelStr, 10) : undefined,
        gpio_pin: gpioPinStr ? parseInt(gpioPinStr, 10) : undefined,
        active_low: activeLow,
      })
      redirect(roomHref(homeId, roomId, { notice: "Appliance created" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  async function toggleDeviceAction(formData: FormData) {
    "use server"
    const deviceID = String(formData.get("device_id") ?? "").trim()
    const channelStr = String(formData.get("channel") ?? "").trim()
    const turnOn = String(formData.get("turn_on") ?? "") === "1"

    if (!deviceID) {
      redirect(roomHref(homeId, roomId, { error: "Missing device id" }))
    }

    try {
      const params: Record<string, unknown> = { power: turnOn }
      params.channel = channelStr ? parseInt(channelStr, 10) : 0
      await solCore.rooms.devices.command(homeId, roomId, deviceID, {
        action: "relay_set",
        params,
      })
      redirect(roomHref(homeId, roomId, { notice: "Command sent" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  async function deleteDeviceAction(formData: FormData) {
    "use server"
    const deviceID = String(formData.get("device_id") ?? "").trim()

    if (!deviceID) {
      redirect(roomHref(homeId, roomId, { error: "Missing device id" }))
    }

    try {
      await solCore.devices.delete(deviceID)
      redirect(roomHref(homeId, roomId, { notice: "Device deleted" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  async function updateApplianceAction(formData: FormData) {
    "use server"
    const applianceID = String(formData.get("appliance_id") ?? "").trim()
    const name = String(formData.get("name") ?? "").trim()

    if (!applianceID || !name) {
      redirect(roomHref(homeId, roomId, { error: "Missing appliance update data" }))
    }

    try {
      await solCore.appliances.update(applianceID, { name })
      redirect(roomHref(homeId, roomId, { notice: "Appliance updated" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  async function deleteApplianceAction(formData: FormData) {
    "use server"
    const applianceID = String(formData.get("appliance_id") ?? "").trim()

    if (!applianceID) {
      redirect(roomHref(homeId, roomId, { error: "Missing appliance id" }))
    }

    try {
      await solCore.appliances.delete(applianceID)
      redirect(roomHref(homeId, roomId, { notice: "Appliance deleted" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  async function otaAction(formData: FormData) {
    "use server"
    const deviceID = String(formData.get("device_id") ?? "").trim()
    const firmwareVersionID = String(formData.get("firmware_version_id") ?? "").trim()

    if (!deviceID || !firmwareVersionID) {
      redirect(roomHref(homeId, roomId, { error: "Device and firmware are required" }))
    }

    try {
      await solCore.rooms.devices.ota(homeId, roomId, deviceID, {
        firmware_version_id: firmwareVersionID,
        idempotency_key: `${deviceID}:${firmwareVersionID}`,
      })
      redirect(roomHref(homeId, roomId, { notice: "OTA flashing started" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-6 pt-0 md:px-8 md:pb-8 md:pt-0">
      <ClearSearchParams keys={["notice", "error"]} />
      <div className="-mt-0.5 mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-white/60 bg-surface-container-low p-6 shadow-[10px_10px_24px_rgba(87,66,62,0.12),-10px_-10px_24px_rgba(255,255,255,0.92)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Room Detail</p>
              <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-on-surface">
                {room.name}
              </h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                Manage central hub connectivity and adjust ambient settings.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/dashboard/homes/${homeId}`}
                className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-4 py-2 text-sm font-medium text-on-surface-variant"
              >
                <IconArrowLeft size={16} />
                Back to home
              </Link>
              <Link
                href={`/dashboard/homes/${homeId}/rooms/${roomId}/flash`}
                className="btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
              >
                <IconUsb size={16} />
                Flash via USB
              </Link>
            </div>
          </div>
        </header>

        {query.notice ? (
          <p className="rounded-2xl border border-tertiary-fixed-dim bg-tertiary-fixed px-4 py-3 text-sm text-on-tertiary-fixed shadow-sm">
            {query.notice}
          </p>
        ) : null}
        {query.error ? (
          <p className="rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container shadow-sm">
            {query.error}
          </p>
        ) : null}

        <div
          className={
            showRightRail
              ? "grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]"
              : "grid grid-cols-1 items-start gap-6"
          }
        >
          <section className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/55 bg-surface-container-low p-5 shadow-[8px_8px_20px_rgba(87,66,62,0.06),-8px_-8px_20px_rgba(255,255,255,0.9)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shadow-[inset_1px_1px_4px_rgba(255,255,255,0.5)]">
                    <IconWifi size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Network</p>
                    <p className="text-sm font-bold text-on-surface">
                      {onlineCount} / {devices.length} Online
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/55 bg-surface-container-low p-5 shadow-[8px_8px_20px_rgba(87,66,62,0.06),-8px_-8px_20px_rgba(255,255,255,0.9)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary-container text-on-secondary-container shadow-[inset_1px_1px_4px_rgba(255,255,255,0.5)]">
                    <IconBolt size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Appliances</p>
                    <p className="text-sm font-bold text-on-surface">
                      {activeCount} Active
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-white/50 bg-surface-container p-6 shadow-[15px_15px_35px_rgba(87,66,62,0.08),-15px_-15px_35px_rgba(255,255,255,1)]">
              <div className="mb-6 flex items-center justify-between px-2">
                <h2 className="font-display text-2xl font-semibold text-on-surface">Nodes & Appliances</h2>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high shadow-sm">
                    <IconCpu size={16} className="text-primary" />
                  </div>
                  <CreateDevicePopover createDeviceAction={createDeviceAction} />
                </div>
              </div>

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
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-[inset_1px_1px_4px_rgba(255,255,255,0.6)] ${device.online ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-400"}`}>
                              <IconCpu size={24} />
                            </div>
                            <div>
                              <h3 className="font-display text-lg font-bold text-on-surface leading-tight">{device.name}</h3>
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
                            <span className="text-[9px] font-bold uppercase tracking-widest text-outline">Uptime</span>
                            <span className="text-xs font-medium text-on-surface-variant">
                              {formatUptime(device.state?.uptime as number)}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-outline">IP Address</span>
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
                                    <div className={`h-1.5 w-1.5 rounded-full ${isOn ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" : "bg-stone-500"}`} />
                                    <p className="truncate text-xs font-medium text-on-surface leading-tight">{app.name}</p>
                                  </div>
                                  <p className="truncate text-[9px] text-on-surface-variant/60 leading-tight">
                                    {app.type} · Ch{app.channel ?? "?"}{app.gpio_pin != null ? ` · GPIO${app.gpio_pin}` : ""}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1">
                                  <form action={toggleDeviceAction}>
                                    <input type="hidden" name="device_id" value={device.id ?? ""} />
                                    <input type="hidden" name="channel" value={app.channel ?? ""} />
                                    <input type="hidden" name="turn_on" value={isOn ? "0" : "1"} />
                                    <button
                                      type="submit"
                                      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold transition-all ${isOn
                                        ? "border-primary-container bg-primary-fixed text-on-primary-fixed-variant"
                                        : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline"
                                        }`}
                                    >
                                      {isOn ? "On" : "Off"}
                                    </button>
                                  </form>

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

              <div className="relative z-10 mt-8 border-t border-outline-variant/35 pt-6">
                <h3 className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                  <IconTool size={15} />
                  Device Maintenance
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  {primaryDevice ? (
                    <form action={otaAction} className="contents">
                      <input type="hidden" name="device_id" value={primaryOnlineDevice?.id ?? ""} />
                      <input
                        type="hidden"
                        name="firmware_version_id"
                        value={firmwareVersions[0]?.id ?? ""}
                      />
                      <button
                        type="submit"
                        disabled={!firmwareVersions[0] || !primaryOnlineDevice}
                        className="group flex items-center gap-3 rounded-xl border border-white/40 bg-primary-container p-4 text-on-primary-container shadow-[6px_6px_16px_rgba(165,59,41,0.2),-6px_-6px_16px_rgba(255,255,255,0.9)] transition hover:scale-[1.01] disabled:opacity-60"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/30 shadow-[inset_2px_2px_4px_rgba(255,255,255,0.5)]">
                          <IconCloudDownload size={20} />
                        </span>
                        <span className="text-left">
                          <span className="block text-base font-semibold leading-tight">OTA Update</span>
                          <span className="block text-xs opacity-80">
                            {primaryOnlineDevice ? "Flash remotely via Wi-Fi" : "Bring a device online to start OTA"}
                          </span>
                        </span>
                      </button>
                    </form>
                  ) : (
                    <div className="rounded-xl border border-outline-variant/40 bg-surface p-4 text-sm text-on-surface-variant">
                      Add a device to use OTA actions.
                    </div>
                  )}

                  <Link
                    href={`/dashboard/homes/${homeId}/rooms/${roomId}/flash`}
                    className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface p-4 text-primary shadow-[4px_4px_12px_rgba(87,66,62,0.06),-4px_-4px_12px_rgba(255,255,255,0.8)]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high shadow-[inset_2px_2px_4px_rgba(87,66,62,0.05),inset_-2px_-2px_4px_rgba(255,255,255,0.8)]">
                      <IconUsb size={20} />
                    </span>
                    <span className="text-left">
                      <span className="block text-base font-semibold text-on-surface">Flash via USB</span>
                      <span className="block text-xs text-outline">Local WebSerial connection</span>
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {showRightRail ? (
            <aside className="grid w-full min-w-0 gap-6">
              <article className="rounded-3xl border border-white/55 bg-surface-container p-5 shadow-[8px_8px_16px_rgba(87,66,62,0.08),-8px_-8px_16px_rgba(255,255,255,0.9)]">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container shadow-[inset_2px_2px_6px_rgba(255,255,255,0.6),4px_4px_8px_rgba(87,66,62,0.1)]">
                    <IconActivity size={24} />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-on-surface">Climate</h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {`${currentTemp?.toFixed(1) ?? "--"}°C · ${currentHumid?.toFixed(1) ?? "--"}% RH`}
                </p>
                <div className="mt-4 rounded-full bg-surface-container-high p-1.5 shadow-[inset_4px_4px_8px_rgba(87,66,62,0.1),inset_-4px_-4px_8px_rgba(255,255,255,0.8)]">
                  <div className="h-5 rounded-full bg-secondary shadow-[2px_0_6px_rgba(87,66,62,0.2),inset_1px_1px_2px_rgba(255,255,255,0.4)]" style={{ width: `${currentTemp ? Math.min(100, Math.max(0, ((currentTemp - 10) / 30) * 100)) : 0}%` }} />
                </div>
              </article>
            </aside>
          ) : null}
        </div>

        <section className="w-full min-w-0 overflow-hidden rounded-3xl border border-white/45 bg-surface-container p-5 shadow-[8px_8px_16px_rgba(87,66,62,0.05),-8px_-8px_16px_rgba(255,255,255,0.8)]">
          <div className="mb-4 flex items-center justify-between border-b border-outline-variant/30 pb-3">
            <h3 className="font-display text-lg sm:text-xl font-semibold text-on-surface">Recent Activity</h3>
            <span className="shrink-0 text-xs font-medium text-primary">Live logs</span>
          </div>

          <div className="w-full space-y-3">
            {activityLogs.length === 0 ? (
              <p className="text-sm text-outline px-2">No recent activity.</p>
            ) : activityLogs.map((log, index) => (
              <div key={index} className="flex w-full items-center gap-3 overflow-hidden rounded-xl border border-white/40 bg-surface p-3 shadow-[inset_2px_2px_6px_rgba(87,66,62,0.03),inset_-2px_-2px_6px_rgba(255,255,255,0.9)]">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high ${log.badge_text === "Success" || log.badge_text === "Online" ? "text-tertiary" : "text-error"}`}>
                  {log.badge_text === "Success" || log.badge_text === "Online" ? <IconCloudDownload size={17} /> : <IconWifiOff size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-on-surface">{log.title}</p>
                  <p className="truncate mt-0.5 text-xs text-outline">{new Date(log.timestamp).toLocaleString()} • {log.description}</p>
                </div>
                <span className={`shrink-0 rounded-full border border-white/55 px-2 py-1 text-[10px] font-medium sm:px-3 sm:text-xs ${log.badge_color}`}>
                  {log.badge_text}
                </span>
              </div>
            ))}
          </div>
        </section>

        <OTALogPanel
          homeId={homeId}
          roomId={roomId}
          devices={devices.map((d) => ({ id: d.id, name: d.name }))}
          initialAttempts={otaAttempts}
        />
      </div>
    </div>
  )
}
