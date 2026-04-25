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
import ClearSearchParams from "@/components/ClearSearchParams"
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

  const [devices, firmwareVersions, activityRes, appliancesRes] = await Promise.all([
    solCore.rooms.devices.listAll(homeId, roomId).catch(() => []),
    solCore.firmware.list().catch(() => []),
    solCore.rooms.activity(homeId, roomId, 20).catch(() => ({ data: [] })),
    solCore.appliances.listByRoom(homeId, roomId).catch(() => ({ data: [] })),
  ])
  const activityLogs = activityRes?.data || []
  const appliances = appliancesRes?.data || []

  const onlineCount = devices.filter((device) => device.online).length
  const activeCount = devices.filter((device) => coerceBool(device.state?.isOn)).length

  const primaryDevice = devices[0]
  const envSensorDevice = devices.find((device) => device.type.toLowerCase().includes("sensor"))

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

  async function addDeviceAction(formData: FormData) {
    "use server"
    const name = String(formData.get("name") ?? "").trim()
    const firmwareId = String(formData.get("firmware_id") ?? "").trim()

    if (!name) {
      redirect(roomHref(homeId, roomId, { error: "Switchboard name is required" }))
    }

    try {
      await solCore.rooms.devices.create(homeId, roomId, {
        name,
        type: "switchboard",
        metadata: firmwareId ? { firmware_id: firmwareId } : {},
      })
      redirect(roomHref(homeId, roomId, { notice: "Node created" }))
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
      if (channelStr) params.channel = parseInt(channelStr, 10)

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

  async function updateDeviceAction(formData: FormData) {
    "use server"
    const deviceID = String(formData.get("device_id") ?? "").trim()
    const name = String(formData.get("name") ?? "").trim()

    if (!deviceID || !name) {
      redirect(roomHref(homeId, roomId, { error: "Missing device update data" }))
    }

    try {
      await solCore.devices.update(deviceID, { name })
      redirect(roomHref(homeId, roomId, { notice: "Device updated" }))
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
      })
      redirect(roomHref(homeId, roomId, { notice: "OTA queued" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  return (
    <div className="bg-clay-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
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

        {(query.notice || query.error) && (
          <ClearSearchParams keys={["notice", "error"]} />
        )}
        {query.notice ? (
          <p className="rounded-2xl border border-tertiary-fixed-dim bg-tertiary-fixed px-4 py-3 text-sm text-on-tertiary-fixed">
            {query.notice}
          </p>
        ) : null}
        {query.error ? (
          <p className="rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container">
            {query.error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-surface-container p-7 shadow-[12px_12px_24px_rgba(87,66,62,0.08),-12px_-12px_24px_rgba(255,255,255,0.9)] lg:col-span-2">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary-container/30 blur-[72px]" />

            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/50 bg-surface shadow-[inset_2px_2px_4px_rgba(255,255,255,0.8),4px_4px_12px_rgba(87,66,62,0.1)]">
                  <IconCpu size={30} className="text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-semibold text-on-surface">Main Switchboard</h2>
                  <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 text-xs text-on-surface-variant shadow-[inset_2px_2px_4px_rgba(87,66,62,0.05),inset_-2px_-2px_4px_rgba(255,255,255,0.9)]">
                    <span className={`h-2.5 w-2.5 rounded-full ${onlineCount > 0 ? "bg-emerald-500" : "bg-stone-400"}`} />
                    {onlineCount > 0 ? "Online" : "Offline"} • ESP32 Node
                  </div>
                </div>
              </div>

              <div className="rounded-full border border-white/40 bg-surface p-3 text-primary shadow-[4px_4px_8px_rgba(87,66,62,0.05),-4px_-4px_8px_rgba(255,255,255,0.8)]">
                {onlineCount > 0 ? <IconWifi size={20} /> : <IconWifiOff size={20} />}
              </div>
            </div>

            <div className="relative z-10 mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/30 bg-surface-container-high p-4 shadow-[inset_4px_4px_8px_rgba(87,66,62,0.06),inset_-4px_-4px_8px_rgba(255,255,255,0.8)]">
                <p className="text-[11px] uppercase tracking-[0.12em] text-outline">IP Address</p>
                <p className="mt-1 text-lg font-semibold text-on-surface">{(primaryDevice?.state?.ip_address as string) || "Unknown"}</p>
              </div>
              <div className="rounded-xl border border-white/30 bg-surface-container-high p-4 shadow-[inset_4px_4px_8px_rgba(87,66,62,0.06),inset_-4px_-4px_8px_rgba(255,255,255,0.8)]">
                <p className="text-[11px] uppercase tracking-[0.12em] text-outline">Firmware</p>
                <p className="mt-1 truncate text-lg font-semibold text-on-surface">{(primaryDevice?.state?.templateId as string) || "No firmware"}</p>
              </div>
              <div className="rounded-xl border border-white/30 bg-surface-container-high p-4 shadow-[inset_4px_4px_8px_rgba(87,66,62,0.06),inset_-4px_-4px_8px_rgba(255,255,255,0.8)]">
                <p className="text-[11px] uppercase tracking-[0.12em] text-outline">Uptime</p>
                <p className="mt-1 text-lg font-semibold text-on-surface">{formatUptime(primaryDevice?.state?.ts as number)}</p>
              </div>
            </div>

            <div className="relative z-10 mt-8 border-t border-outline-variant/35 pt-6">
              <h3 className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                <IconTool size={15} />
                Device Maintenance
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                {primaryDevice ? (
                  <form action={otaAction} className="contents">
                    <input type="hidden" name="device_id" value={primaryDevice.id ?? ""} />
                    <input
                      type="hidden"
                      name="firmware_version_id"
                      value={firmwareVersions[0]?.id ?? ""}
                    />
                    <button
                      type="submit"
                      disabled={!firmwareVersions[0]}
                      className="group flex items-center gap-3 rounded-xl border border-white/40 bg-primary-container p-4 text-on-primary-container shadow-[6px_6px_16px_rgba(165,59,41,0.2),-6px_-6px_16px_rgba(255,255,255,0.9)] transition hover:scale-[1.01] disabled:opacity-60"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/30 shadow-[inset_2px_2px_4px_rgba(255,255,255,0.5)]">
                        <IconCloudDownload size={20} />
                      </span>
                      <span className="text-left">
                        <span className="block text-base font-semibold leading-tight">OTA Update</span>
                        <span className="block text-xs opacity-80">Flash remotely via Wi-Fi</span>
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
          </section>

          <aside className="grid w-full min-w-0 gap-6">
            {envSensorDevice && (
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
            )}


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
          </aside>
        </div>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="clay-raised rounded-3xl p-5">
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-on-surface">Add Switchboard</h2>
                <form action={addDeviceAction} className="mt-3 space-y-3">
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Switchboard name"
                    className="clay-inset w-full rounded-xl border border-white/50 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant"
                  />
                  <select
                    name="firmware_id"
                    className="clay-inset w-full rounded-xl border border-white/50 px-3 py-2 text-sm text-on-surface"
                  >
                    <option value="">Select Firmware (Optional)</option>
                    {firmwareVersions.map((fw) => (
                      <option key={fw.id} value={fw.id}>
                        {fw.template_id}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-semibold">
                    <IconBolt size={16} />
                    Create Node
                  </button>
                </form>
              </div>

              {devices.length > 0 && (
                <div>
                  <h2 className="font-display text-lg font-semibold text-on-surface">Add Appliance</h2>
                  <form action={addApplianceAction} className="mt-3 space-y-3">
                    <input
                      type="text"
                      name="name"
                      required
                      placeholder="Appliance name"
                      className="clay-inset w-full rounded-xl border border-white/50 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant"
                    />
                    <select
                      name="device_id"
                      required
                      className="clay-inset w-full rounded-xl border border-white/50 px-3 py-2 text-sm text-on-surface"
                    >
                      <option value="">Select Switchboard</option>
                      {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                        </option>
                      ))}
                    </select>
                    <select
                      name="type"
                      className="clay-inset w-full rounded-xl border border-white/50 px-3 py-2 text-sm text-on-surface"
                    >
                      <option value="light">light</option>
                      <option value="switch">switch</option>
                      <option value="fan">fan</option>
                      <option value="lock">lock</option>
                      <option value="sensor">sensor</option>
                    </select>
                    <input
                      type="number"
                      name="channel"
                      placeholder="Relay Channel (0-3)"
                      className="clay-inset w-full rounded-xl border border-white/50 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant"
                    />
                    <div className="flex items-center gap-2 px-2 pb-1">
                      <input type="checkbox" name="active_low" value="true" id="active_low" />
                      <label htmlFor="active_low" className="text-sm text-on-surface-variant">Active Low Mapping</label>
                    </div>
                    <button type="submit" className="btn-outline inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold">
                      <IconTool size={16} />
                      Create Appliance
                    </button>
                  </form>
                </div>
              )}
            </div>
          </aside>

          <section className="clay-raised rounded-3xl p-5">
            <h2 className="font-display text-lg font-semibold text-on-surface">Devices</h2>
            {devices.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-high px-4 py-4 text-sm text-on-surface-variant">
                No devices in this room.
              </p>
            ) : (
              <div className="mt-4 grid gap-4">
                {devices.map((device) => {
                  const isOn = coerceBool(device.state?.isOn)
                  return (
                    <article
                      key={device.id}
                      className="rounded-2xl border border-white/55 bg-surface-container-low p-4 shadow-[5px_5px_12px_rgba(87,66,62,0.08),-5px_-5px_12px_rgba(255,255,255,0.9)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-on-surface">{device.name}</h3>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {device.type} · {device.online ? "online" : "offline"} · isOn: {String(isOn)}
                          </p>
                        </div>
                        <form action={toggleDeviceAction}>
                          <input type="hidden" name="device_id" value={device.id ?? ""} />
                          <input type="hidden" name="turn_on" value={isOn ? "0" : "1"} />
                          <button
                            type="submit"
                            className="rounded-full border border-primary-container bg-primary-fixed px-3 py-1 text-xs font-semibold text-on-primary-fixed-variant"
                          >
                            {isOn ? "Turn off" : "Turn on"}
                          </button>
                        </form>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                        <form action={updateDeviceAction} className="flex gap-2">
                          <input type="hidden" name="device_id" value={device.id ?? ""} />
                          <input
                            type="text"
                            name="name"
                            defaultValue={device.name ?? ""}
                            className="clay-inset min-w-0 flex-1 rounded-xl border border-white/50 px-3 py-2 text-sm text-on-surface"
                          />
                          <button type="submit" className="btn-outline rounded-xl px-3 py-2 text-xs font-semibold">
                            Update
                          </button>
                        </form>

                        <form action={deleteDeviceAction}>
                          <input type="hidden" name="device_id" value={device.id ?? ""} />
                          <button
                            type="submit"
                            className="rounded-xl border border-error px-3 py-2 text-xs font-semibold text-error hover:bg-error-container"
                          >
                            Delete
                          </button>
                        </form>

                        {firmwareVersions.length > 0 && (
                          <form action={otaAction} className="flex gap-2">
                            <input type="hidden" name="device_id" value={device.id ?? ""} />
                            <select
                              name="firmware_version_id"
                              className="clay-inset rounded-xl border border-white/50 px-2 py-2 text-xs text-on-surface"
                              defaultValue={firmwareVersions[0]?.id ?? ""}
                            >
                              {firmwareVersions.map((fw) => (
                                <option key={fw.id} value={fw.id}>
                                  {fw.template_id}:{fw.version}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary"
                            >
                              OTA Update
                            </button>
                          </form>
                        )}
                      </div>

                      {/* Associated Appliances */}
                      {(() => {
                        const deviceAppliances = appliances.filter((a) => a.device_id === device.id)
                        if (deviceAppliances.length === 0) return null
                        return (
                          <div className="mt-4 border-t border-white/20 pt-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-outline">
                                Appliances
                              </h4>
                              <span className="h-px flex-1 bg-white/10 mx-3" />
                            </div>
                            <div className="space-y-1.5">
                              {deviceAppliances.map((app) => {
                                const isOn = coerceBool(app.state?.isOn)
                                return (
                                  <div
                                    key={app.id}
                                    className="group relative flex items-center justify-between gap-3 rounded-xl border border-white/40 bg-surface/40 p-2 pl-3 shadow-sm transition hover:bg-surface/60"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-semibold text-on-surface">{app.name}</p>
                                        <span className={`h-1.5 w-1.5 rounded-full ${isOn ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-stone-400"}`} />
                                      </div>
                                      <p className="truncate text-[10px] text-on-surface-variant/80">
                                        {app.type} · Ch {app.channel ?? "?"}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <form action={toggleDeviceAction}>
                                        <input type="hidden" name="device_id" value={device.id ?? ""} />
                                        <input type="hidden" name="channel" value={app.channel ?? ""} />
                                        <input type="hidden" name="turn_on" value={isOn ? "0" : "1"} />
                                        <button
                                          type="submit"
                                          className={`rounded-lg border px-3 py-1 text-[11px] font-bold transition-all ${isOn
                                            ? "border-primary-container bg-primary-fixed text-on-primary-fixed-variant shadow-sm"
                                            : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline hover:bg-surface-container-high"
                                            }`}
                                        >
                                          {isOn ? "On" : "Off"}
                                        </button>
                                      </form>

                                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                        <form action={deleteApplianceAction}>
                                          <input type="hidden" name="appliance_id" value={app.id ?? ""} />
                                          <button
                                            type="submit"
                                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-error/30 bg-error-container/20 text-error hover:bg-error-container/40"
                                            title="Delete"
                                          >
                                            <IconX size={14} />
                                          </button>
                                        </form>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/50 bg-surface-container p-4 shadow-[4px_4px_10px_rgba(87,66,62,0.08),-4px_-4px_10px_rgba(255,255,255,0.9)]">
            <p className="text-xs uppercase tracking-[0.1em] text-on-surface-variant">Devices</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{devices.length}</p>
          </div>
          <div className="rounded-2xl border border-white/50 bg-surface-container p-4 shadow-[4px_4px_10px_rgba(87,66,62,0.08),-4px_-4px_10px_rgba(255,255,255,0.9)]">
            <p className="text-xs uppercase tracking-[0.1em] text-on-surface-variant">Online</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{onlineCount}</p>
          </div>
          <div className="rounded-2xl border border-white/50 bg-surface-container p-4 shadow-[4px_4px_10px_rgba(87,66,62,0.08),-4px_-4px_10px_rgba(255,255,255,0.9)]">
            <p className="text-xs uppercase tracking-[0.1em] text-on-surface-variant">Active</p>
            <p className="mt-2 text-2xl font-semibold text-on-surface">{activeCount}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
