import { solCore } from "@/lib/sol-core"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"
import FirmwareBuildModal from "@/components/FirmwareBuildModal"

export const dynamic = "force-dynamic"

type FirmwarePageSearchParams = Promise<{
  template_id?: string
  notice?: string
  error?: string
}>

function pageHref(homeID: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue
    query.set(key, value)
  }
  const encoded = query.toString()
  return encoded
    ? `/dashboard/homes/${homeID}/firmware?${encoded}`
    : `/dashboard/homes/${homeID}/firmware`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong"
}

export default async function FirmwarePage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string }>
  searchParams: FirmwarePageSearchParams
}) {
  const { homeId } = await params
  const query = await searchParams
  const templateID = query.template_id?.trim() || undefined

  const [firmwareVersions, rooms] = await Promise.all([
    solCore.firmware.list(templateID).catch(() => []),
    solCore.rooms.listAll(homeId).catch(() => []),
  ])

  const roomDevices = new Map<string, Awaited<ReturnType<typeof solCore.rooms.devices.listAll>>>()
  await Promise.all(
    rooms.map(async (room) => {
      try {
        const devices = await solCore.rooms.devices.listAll(homeId, room.id)
        roomDevices.set(room.id, devices)
      } catch {
        roomDevices.set(room.id, [])
      }
    }),
  )
  const allDevices = Array.from(roomDevices.values()).flat()

  async function uploadAction(formData: FormData) {
    "use server"
    try {
      const template = String(formData.get("template_id") ?? "").trim()
      if (!template) {
        redirect(pageHref(homeId, { error: "template_id is required", template_id: templateID }))
      }

      const uploadData = new FormData()
      uploadData.append("template_id", template)

      const version = String(formData.get("version") ?? "").trim()
      if (version) {
        uploadData.append("version", version)
      }

      const required = ["bootloader", "partition_table", "app"]
      for (const key of required) {
        const file = formData.get(key)
        if (!(file instanceof File) || file.size === 0) {
          redirect(pageHref(homeId, { error: `${key} file is required`, template_id: templateID }))
        }
        uploadData.append(key, file)
      }

      const source = formData.get("source")
      if (source instanceof File && source.size > 0) {
        uploadData.append("source", source)
      }

      await solCore.firmware.upload(uploadData)
      redirect(pageHref(homeId, { notice: "Firmware uploaded", template_id: template }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(pageHref(homeId, { error: errorMessage(error), template_id: templateID }))
    }
  }

  async function otaAction(formData: FormData) {
    "use server"
    try {
      const versionID = String(formData.get("version_id") ?? "").trim()
      const deviceID = String(formData.get("device_id") ?? "").trim()

      if (!versionID || !deviceID) {
        redirect(pageHref(homeId, { error: "version_id and device_id are required", template_id: templateID }))
      }

      // Find the room for this device
      const device = allDevices.find((d) => d.id === deviceID)
      if (!device) {
        redirect(pageHref(homeId, { error: "device not found", template_id: templateID }))
      }

      await solCore.rooms.devices.ota(homeId, device.room_id, device.id, {
        firmware_version_id: versionID,
        idempotency_key: `${device.id}:${versionID}`,
      })
      redirect(pageHref(homeId, { notice: "OTA update queued", template_id: templateID }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(pageHref(homeId, { error: errorMessage(error), template_id: templateID }))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/20 pb-8">
          <div>
            <nav className="mb-4 flex items-center gap-2 text-sm text-stone-500">
              <Link href={`/dashboard/homes/${homeId}`} className="hover:text-primary">Home</Link>
              <span>/</span>
              <span className="text-stone-800">Firmware</span>
            </nav>
            <h1 className="font-display text-4xl font-bold tracking-tight text-stone-900">Firmware Management</h1>
            <p className="mt-2 text-lg text-stone-600">Build, upload, and deploy firmware updates to your devices.</p>
          </div>
          <div className="flex gap-3">
            <FirmwareBuildModal homeId={homeId} />
          </div>
        </header>

        {query.notice ? (
          <div className="rounded-2xl border border-tertiary-fixed-dim bg-tertiary-fixed px-6 py-4 text-on-tertiary-fixed shadow-sm">
            {query.notice}
          </div>
        ) : null}
        {query.error ? (
          <div className="rounded-2xl border border-error bg-error-container px-6 py-4 text-on-error-container shadow-sm">
            {query.error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-800">Available Versions</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-stone-500">Filter by template:</span>
                <select
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  value={templateID ?? ""}
                  onChange={(e) => {
                    const val = e.target.value
                    window.location.href = pageHref(homeId, { template_id: val || undefined })
                  }}
                >
                  <option value="">All templates</option>
                  <option value="switch">Switch</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4">
              {firmwareVersions.length === 0 ? (
                <div className="rounded-3xl border-2 border-dashed border-stone-200 bg-stone-50 py-12 text-center">
                  <p className="text-stone-500">No firmware versions found.</p>
                </div>
              ) : (
                firmwareVersions.map((v) => (
                  <div key={v.id} className="group relative overflow-hidden rounded-3xl border border-white bg-stone-100/50 p-6 shadow-sm transition-all hover:bg-white hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-primary-fixed px-3 py-1 text-xs font-bold text-primary">
                            {v.template_id}
                          </span>
                          <h3 className="font-mono text-lg font-bold text-stone-800">{v.version}</h3>
                        </div>
                        <p className="mt-2 text-sm text-stone-500">
                          Built on {new Date(v.built_at ?? v.created_at).toLocaleString()} · {((v.size_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/api/firmware/download?key=${v.app_key}`}
                          className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          Download Bin
                        </Link>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-stone-200 pt-6">
                      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-400">Deploy to Device</h4>
                      <form action={otaAction} className="flex gap-2">
                        <input type="hidden" name="version_id" value={v.id} />
                        <select
                          name="device_id"
                          required
                          className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="">Select a compatible device...</option>
                          {allDevices
                            .filter((d) => d.online)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.type})
                              </option>
                            ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-xl bg-stone-900 px-6 py-2 text-sm font-bold text-white hover:bg-stone-800"
                        >
                          Push OTA
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-white bg-stone-100 p-8 shadow-sm">
              <h2 className="mb-6 text-xl font-bold text-stone-800">Manual Upload</h2>
              <form action={uploadAction} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500">Template ID</label>
                  <input
                    type="text"
                    name="template_id"
                    required
                    placeholder="e.g. switch"
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500">Version</label>
                  <input
                    type="text"
                    name="version"
                    placeholder="e.g. v1.0.0 (optional)"
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600">Bootloader (.bin)</label>
                    <input type="file" name="bootloader" required className="w-full text-xs text-stone-500 file:mr-4 file:rounded-full file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-stone-700 hover:file:bg-stone-300" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600">Partition Table (.bin)</label>
                    <input type="file" name="partition_table" required className="w-full text-xs text-stone-500 file:mr-4 file:rounded-full file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-stone-700 hover:file:bg-stone-300" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600">Application (.bin)</label>
                    <input type="file" name="app" required className="w-full text-xs text-stone-500 file:mr-4 file:rounded-full file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-stone-700 hover:file:bg-stone-300" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-stone-600">Source Code (.zip, optional)</label>
                    <input type="file" name="source" className="w-full text-xs text-stone-500 file:mr-4 file:rounded-full file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-stone-700 hover:file:bg-stone-300" />
                  </div>
                </div>
                <button type="submit" className="mt-4 w-full rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-on-primary hover:opacity-90">
                  Upload Firmware
                </button>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
