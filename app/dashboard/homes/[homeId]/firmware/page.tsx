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
    const firmwareVersionID = String(formData.get("firmware_version_id") ?? "").trim()
    const target = String(formData.get("target") ?? "").trim()
    const [roomID, deviceID] = target.split(":")

    if (!firmwareVersionID || !deviceID || !roomID) {
      redirect(pageHref(homeId, { error: "Missing OTA selection", template_id: templateID }))
    }

    try {
      await solCore.rooms.devices.ota(homeId, roomID, deviceID, {
        firmware_version_id: firmwareVersionID,
      })
      redirect(pageHref(homeId, { notice: "OTA queued", template_id: templateID }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(pageHref(homeId, { error: errorMessage(error), template_id: templateID }))
    }
  }

  return (
    <div className="bg-clay-canvas min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-white/60 bg-surface-container-low p-6 shadow-[10px_10px_24px_rgba(87,66,62,0.12),-10px_-10px_24px_rgba(255,255,255,0.92)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Firmware</p>
              <div className="flex items-center gap-3">
                <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-on-surface">Firmware Versions</h1>
                <span className="mt-2 rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant shadow-sm">
                  Source Build Enabled
                </span>
              </div>
            </div>
            <Link href={`/dashboard/homes/${homeId}`} className="btn-outline px-3 py-1.5 text-sm">
              Back to home
            </Link>
          </div>
        </header>

        {query.notice ? (
          <p className="rounded-2xl border border-tertiary-fixed-dim bg-tertiary-fixed px-4 py-3 text-sm text-on-tertiary-fixed">{query.notice}</p>
        ) : null}
        {query.error ? (
          <p className="rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container">{query.error}</p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="clay-raised rounded-3xl p-5">
            <h2 className="font-display text-lg font-semibold text-on-surface">Upload Firmware</h2>
            <form action={uploadAction} className="mt-3 space-y-3">
              <input
                type="text"
                name="template_id"
                defaultValue={templateID}
                required
                placeholder="template_id (e.g. relay_single)"
                className="clay-inset w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface"
              />
              <input
                type="text"
                name="version"
                placeholder="version (optional)"
                className="clay-inset w-full rounded-xl border border-white/55 px-3 py-2 text-sm text-on-surface"
              />
              <label className="block text-xs font-semibold text-on-surface-variant">bootloader</label>
              <input type="file" name="bootloader" accept=".bin" required className="w-full text-sm text-on-surface-variant" />
              <label className="block text-xs font-semibold text-on-surface-variant">partition_table</label>
              <input type="file" name="partition_table" accept=".bin" required className="w-full text-sm text-on-surface-variant" />
              <label className="block text-xs font-semibold text-on-surface-variant">app</label>
              <input type="file" name="app" accept=".bin" required className="w-full text-sm text-on-surface-variant" />
              <label className="block text-xs font-semibold text-on-surface-variant">source (optional)</label>
              <input type="file" name="source" className="w-full text-sm text-on-surface-variant" />
              <button
                type="submit"
                className="btn-primary w-full px-4 py-2 text-sm font-semibold"
              >
                Upload
              </button>
            </form>

            <div className="mt-6 border-t border-white/20 pt-6">
              <h2 className="font-display text-lg font-semibold text-on-surface">Build from Source</h2>
              <p className="mt-1 text-sm text-on-surface-variant mb-4">
                Compile generic firmware directly for a specific board.
              </p>
              <FirmwareBuildModal templateId={templateID} homeId={homeId} />
            </div>
          </aside>

          <section className="clay-raised rounded-3xl p-5">
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Link
                href={pageHref(homeId, {})}
                className={`rounded-full border px-3 py-1 ${templateID ? "border-outline-variant text-on-surface-variant" : "border-primary-fixed-dim bg-primary-fixed text-on-primary-fixed-variant"}`}
              >
                all templates
              </Link>
              {Array.from(new Set(firmwareVersions.map((v) => v.template_id))).map((template) => (
                <Link
                  key={template}
                  href={pageHref(homeId, { template_id: template })}
                  className={`rounded-full border px-3 py-1 ${templateID === template ? "border-primary-fixed-dim bg-primary-fixed text-on-primary-fixed-variant" : "border-outline-variant text-on-surface-variant"}`}
                >
                  {template}
                </Link>
              ))}
            </div>

            {firmwareVersions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-high px-4 py-4 text-sm text-on-surface-variant">
                No firmware versions uploaded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {firmwareVersions.map((version) => (
                  <article key={version.id} className="rounded-2xl border border-white/55 bg-surface-container-low p-4 shadow-[5px_5px_12px_rgba(87,66,62,0.08),-5px_-5px_12px_rgba(255,255,255,0.9)]">
                    <p className="text-sm font-semibold text-on-surface">
                      {version.template_id} · {version.version}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      size: {version.size_bytes ?? 0} bytes · {new Date(version.created_at).toLocaleString()}
                    </p>

                    {allDevices.length > 0 ? (
                      <form action={otaAction} className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="firmware_version_id" value={version.id} />
                        <select
                          name="target"
                          className="clay-inset rounded-xl border border-white/55 px-2 py-2 text-xs text-on-surface"
                          defaultValue={allDevices[0] ? `${allDevices[0].room_id}:${allDevices[0].id}` : ""}
                        >
                          {allDevices.map((device) => (
                            <option key={device.id} value={`${device.room_id}:${device.id}`}>
                              {device.name} ({device.type}) · {device.room_id}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary"
                        >
                          OTA
                        </button>
                      </form>
                    ) : (
                      <p className="mt-2 text-xs text-on-surface-variant">No devices available for OTA.</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  )
}
