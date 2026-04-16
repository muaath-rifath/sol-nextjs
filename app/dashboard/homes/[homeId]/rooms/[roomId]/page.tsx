import { solCore } from "@/lib/sol-core"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"

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

export default async function RoomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string; roomId: string }>
  searchParams: RoomPageSearchParams
}) {
  const { homeId, roomId } = await params
  const query = await searchParams

  const [room, devices, firmwareVersions] = await Promise.all([
    solCore.rooms.get(homeId, roomId),
    solCore.rooms.devices.list(homeId, roomId),
    solCore.firmware.list(),
  ])

  async function addDeviceAction(formData: FormData) {
    "use server"
    const name = String(formData.get("name") ?? "").trim()
    const type = String(formData.get("type") ?? "custom").trim()
    const gpioPin = String(formData.get("gpio_pin") ?? "").trim()
    const channel = String(formData.get("channel") ?? "").trim()
    const activeLow = String(formData.get("active_low") ?? "").trim()

    if (!name) {
      redirect(roomHref(homeId, roomId, { error: "Device name is required" }))
    }

    const metadata: Record<string, string> = {}
    if (gpioPin) metadata.gpio_pin = gpioPin
    if (channel) metadata.channel = channel
    if (activeLow) metadata.active_low = activeLow

    try {
      await solCore.rooms.devices.create(homeId, roomId, { name, type, metadata })
      redirect(roomHref(homeId, roomId, { notice: "Device created" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(roomHref(homeId, roomId, { error: errorMessage(error) }))
    }
  }

  async function toggleDeviceAction(formData: FormData) {
    "use server"
    const deviceID = String(formData.get("device_id") ?? "").trim()
    const turnOn = String(formData.get("turn_on") ?? "") === "1"
    if (!deviceID) {
      redirect(roomHref(homeId, roomId, { error: "Missing device id" }))
    }

    try {
      await solCore.rooms.devices.command(homeId, roomId, deviceID, {
        action: "set_relay",
        params: { isOn: turnOn },
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fffdf6_0%,#f7fcff_45%,#f2fff8_100%)] px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-3xl border border-stone-200 bg-white/90 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Room</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">{room.name}</h1>
              <p className="mt-1 text-sm text-stone-600">Floor: {room.floor ?? "-"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/dashboard/homes/${homeId}`} className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-700">
                Back to home
              </Link>
              <Link
                href={`/dashboard/homes/${homeId}/rooms/${roomId}/flash`}
                className="rounded-full bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Flash Firmware
              </Link>
            </div>
          </div>
        </header>

        {query.notice ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{query.notice}</p>
        ) : null}
        {query.error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{query.error}</p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-stone-200 bg-white/90 p-5">
            <h2 className="text-lg font-semibold text-stone-900">Add Device</h2>
            <form action={addDeviceAction} className="mt-3 space-y-3">
              <input
                type="text"
                name="name"
                required
                placeholder="Device name"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <select name="type" className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm">
                <option value="light">light</option>
                <option value="switch">switch</option>
                <option value="sensor">sensor</option>
                <option value="lock">lock</option>
                <option value="fan">fan</option>
                <option value="custom">custom</option>
              </select>
              <input type="text" name="gpio_pin" placeholder="gpio_pin" className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
              <input type="text" name="channel" placeholder="channel" className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
              <input type="text" name="active_low" placeholder="active_low" className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm" />
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Create device
              </button>
            </form>
          </aside>

          <section className="rounded-3xl border border-stone-200 bg-white/90 p-5">
            <h2 className="text-lg font-semibold text-stone-900">Devices</h2>
            {devices.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                No devices in this room.
              </p>
            ) : (
              <div className="mt-4 grid gap-4">
                {devices.map((device) => {
                  const isOn = coerceBool(device.state?.isOn)
                  return (
                    <article key={device.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-stone-900">{device.name}</h3>
                          <p className="mt-1 text-xs text-stone-600">
                            {device.type} · {device.online ? "online" : "offline"} · isOn: {String(isOn)}
                          </p>
                        </div>
                        <form action={toggleDeviceAction}>
                          <input type="hidden" name="device_id" value={device.id} />
                          <input type="hidden" name="turn_on" value={isOn ? "0" : "1"} />
                          <button
                            type="submit"
                            className="rounded-full border border-cyan-300 px-3 py-1 text-xs font-semibold text-cyan-700"
                          >
                            {isOn ? "Turn off" : "Turn on"}
                          </button>
                        </form>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                        <form action={updateDeviceAction} className="flex gap-2">
                          <input type="hidden" name="device_id" value={device.id} />
                          <input
                            type="text"
                            name="name"
                            defaultValue={device.name}
                            className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
                          />
                          <button
                            type="submit"
                            className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700"
                          >
                            Update
                          </button>
                        </form>

                        <form action={deleteDeviceAction}>
                          <input type="hidden" name="device_id" value={device.id} />
                          <button
                            type="submit"
                            className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700"
                          >
                            Delete
                          </button>
                        </form>

                        <form action={otaAction} className="flex gap-2">
                          <input type="hidden" name="device_id" value={device.id} />
                          <select
                            name="firmware_version_id"
                            className="rounded-xl border border-stone-300 px-2 py-2 text-xs"
                            defaultValue={firmwareVersions[0]?.id}
                          >
                            {firmwareVersions.map((fw) => (
                              <option key={fw.id} value={fw.id}>
                                {fw.template_id}:{fw.version}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
                          >
                            OTA Update
                          </button>
                        </form>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
