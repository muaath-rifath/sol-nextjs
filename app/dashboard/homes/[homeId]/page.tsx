import { auth } from "@/auth"
import { type CursorResponse, type Home, type Room, type RoomDevice, solCore } from "@/lib/sol-core"
import {
  IconArmchair,
  IconBed,
  IconBlind,
  IconChefHat,
  IconDeviceDesktop,
  IconMusic,
  IconShieldLock,
  IconTemperature,
  IconWind,
} from "@tabler/icons-react"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"
import type { ForwardRefExoticComponent, RefAttributes } from "react"
import type { IconProps } from "@tabler/icons-react"

export const dynamic = "force-dynamic"

type HomePageSearchParams = Promise<{
  notice?: string
  error?: string
}>

function homeHref(homeID: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue
    query.set(key, value)
  }
  const encoded = query.toString()
  return encoded ? `/dashboard/homes/${homeID}?${encoded}` : `/dashboard/homes/${homeID}`
}

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

type TablerIcon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>

function roomIcon(name: string): TablerIcon {
  const lower = name.toLowerCase()
  if (lower.includes("living")) return IconArmchair
  if (lower.includes("kitchen")) return IconChefHat
  if (lower.includes("bed")) return IconBed
  if (lower.includes("bath")) return IconBed
  if (lower.includes("garage")) return IconDeviceDesktop
  if (lower.includes("office")) return IconDeviceDesktop
  return IconArmchair
}

export default async function HomeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string }>
  searchParams: HomePageSearchParams
}) {
  const session = await auth()
  if (!session) redirect("/")

  const { homeId } = await params
  const query = await searchParams

  let allHomes: CursorResponse<Home> = { data: [], next_cursor: null, has_more: false }
  try {
    allHomes = await solCore.homes.list({ limit: 50 })
  } catch {
    // non-fatal
  }

  const rooms = (await solCore.rooms.listAll(homeId).catch(() => [])) as Room[]
  const roomDevices = new Map<string, RoomDevice[]>()

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

  const primaryRoom = rooms[0]
  const devices = primaryRoom ? roomDevices.get(primaryRoom.id) ?? [] : []

  const kitchenRoom =
    rooms.find((room) => room.name.toLowerCase().includes("kitchen")) ?? rooms[1] ?? rooms[0]
  const bedroomRoom =
    rooms.find((room) => room.name.toLowerCase().includes("bed")) ??
    rooms.find((room) => room.id !== kitchenRoom?.id) ??
    rooms[0]

  async function togglePrimaryRoomAction(formData: FormData) {
    "use server"
    const roomID = String(formData.get("room_id") ?? "").trim()
    const turnOn = String(formData.get("turn_on") ?? "") === "1"

    if (!roomID) {
      redirect(homeHref(homeId, { error: "Missing room" }))
    }

    let targetRoom: Room | undefined
    if (roomID === "primary") {
      targetRoom = primaryRoom
    } else {
      targetRoom = rooms.find((room) => room.id === roomID)
    }

    if (!targetRoom) {
      redirect(homeHref(homeId, { error: "Room not found" }))
    }

    const roomIDResolved = targetRoom.id
    const targetDevices = roomDevices.get(roomIDResolved) ?? []
    const controllable = targetDevices.filter((device) =>
      ["light", "switch", "fan"].includes(device.type.toLowerCase()),
    )

    if (controllable.length === 0) {
      redirect(homeHref(homeId, { error: "No controllable devices in this room" }))
    }

    try {
      await Promise.all(
        controllable.map((device) =>
          solCore.rooms.devices.command(homeId, roomIDResolved, device.id, {
            action: "set_relay",
            params: { power: turnOn, channel: 0 },
          }),
        ),
      )
      redirect(homeHref(homeId, { notice: turnOn ? "Room turned on" : "Room turned off" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(homeHref(homeId, { error: errorMessage(error) }))
    }
  }

  const primaryRoomOnCount = devices.filter((device) => coerceBool(device.state?.isOn)).length
  const primaryRoomTurnOn = primaryRoomOnCount === 0

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      {query.notice ? (
        <p className="mb-4 rounded-2xl border border-tertiary-fixed-dim bg-tertiary-fixed px-4 py-3 text-sm text-on-tertiary-fixed">
          {query.notice}
        </p>
      ) : null}
      {query.error ? (
        <p className="mb-4 rounded-2xl border border-error bg-error-container px-4 py-3 text-sm text-on-error-container">
          {query.error}
        </p>
      ) : null}

      <div className="mb-8 px-2">
        <h2 className="font-display text-[40px] font-bold tracking-[-0.02em] text-on-surface">
          Good morning, {session.user?.name?.split(" ")[0] ?? "Alex"}.
        </h2>
        <p className="mt-1 text-lg text-on-surface-variant/80">
          The house is at a comfortable 22°C. No active alerts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <article className="group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-xl border border-white/40 bg-surface-container p-6 shadow-[12px_12px_24px_rgba(27,28,25,0.06),-12px_-12px_24px_rgba(255,255,255,0.9),inset_2px_2px_4px_rgba(255,255,255,0.8),inset_-2px_-2px_4px_rgba(27,28,25,0.02)] md:col-span-2 lg:row-span-2">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary-container/30 blur-3xl transition-transform duration-700 ease-out group-hover:scale-110" />

          <div className="relative z-10 mb-8 flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-primary">
                {primaryRoom ? (
                  (() => {
                    const PrimaryRoomIcon = roomIcon(primaryRoom.name)
                    return <PrimaryRoomIcon size={18} />
                  })()
                ) : (
                    <IconChefHat size={18} />
                )}
                <span className="text-[13px] font-semibold uppercase tracking-[0.05em]">
                  {primaryRoom?.name ?? "No room"}
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-on-surface">Ambient Relax</h3>
            </div>
            <form action={togglePrimaryRoomAction}>
              <input type="hidden" name="room_id" value={primaryRoom?.id ?? ""} />
              <input type="hidden" name="turn_on" value={primaryRoomTurnOn ? "1" : "0"} />
              <button className="flex h-8 w-14 items-center rounded-full bg-surface-variant p-1 shadow-[inset_4px_4px_8px_rgba(27,28,25,0.1),inset_-4px_-4px_8px_rgba(255,255,255,0.7)]" type="submit">
                <span className={`h-6 w-6 rounded-full bg-primary shadow-[2px_2px_4px_rgba(0,0,0,0.2),-2px_-2px_4px_rgba(255,255,255,0.4)] ${primaryRoomTurnOn ? "" : "ml-auto"}`} />
              </button>
            </form>
          </div>

          <div className="relative z-10 flex gap-6">
            <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-white/50 bg-surface-container-low shadow-[10px_10px_20px_rgba(27,28,25,0.05),-10px_-10px_20px_rgba(255,255,255,0.8)]">
              <div className="absolute inset-4 rounded-full border-[12px] border-surface-variant shadow-[inset_4px_4px_8px_rgba(27,28,25,0.05),inset_-4px_-4px_8px_rgba(255,255,255,0.5)]" />
              <div className="absolute inset-4 rotate-45 rounded-full border-[12px] border-transparent border-r-primary-container border-t-primary-container" />
              <span className="text-2xl font-bold text-on-surface">65%</span>
            </div>

            <div className="flex flex-1 flex-col justify-end gap-3">
              <Link
                href={primaryRoom ? roomHref(homeId, primaryRoom.id, {}) : homeHref(homeId, {})}
                className="flex items-center justify-between rounded-lg bg-surface-container p-3 shadow-[4px_4px_8px_rgba(27,28,25,0.05),-4px_-4px_8px_rgba(255,255,255,0.8),inset_1px_1px_2px_rgba(255,255,255,1)]"
              >
                <div className="flex items-center gap-2">
                  <IconBlind size={18} className="text-tertiary" />
                  <span className="text-[13px] font-semibold text-on-surface">Blinds</span>
                </div>
                <span className="text-sm text-on-surface-variant">Open</span>
              </Link>
              <Link
                href={primaryRoom ? roomHref(homeId, primaryRoom.id, {}) : homeHref(homeId, {})}
                className="flex items-center justify-between rounded-lg bg-surface-container p-3 shadow-[4px_4px_8px_rgba(27,28,25,0.05),-4px_-4px_8px_rgba(255,255,255,0.8),inset_1px_1px_2px_rgba(255,255,255,1)]"
              >
                <div className="flex items-center gap-2">
                  <IconMusic size={18} className="text-tertiary" />
                  <span className="text-[13px] font-semibold text-on-surface">Music</span>
                </div>
                <span className="text-sm text-on-surface-variant">Playing</span>
              </Link>
            </div>
          </div>
        </article>

        <article className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-secondary-fixed p-5 text-on-secondary-fixed shadow-[8px_8px_16px_rgba(27,28,25,0.05),-8px_-8px_16px_rgba(255,255,255,0.8),inset_2px_2px_4px_rgba(255,255,255,0.6),inset_-2px_-2px_4px_rgba(132,84,0,0.1)]">
          <IconTemperature size={120} className="pointer-events-none absolute -bottom-10 -right-10 text-secondary/10" />
          <div className="z-10 flex items-start justify-between">
            <span className="text-[13px] uppercase tracking-[0.05em] opacity-80">Climate</span>
            <IconWind size={18} />
          </div>
          <div className="z-10 mt-10">
            <div className="text-[40px] font-bold">22°</div>
            <p className="text-sm opacity-90">Heating to 24°</p>
          </div>
        </article>

        <article className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-white/40 bg-surface-container p-5 text-center shadow-[8px_8px_16px_rgba(27,28,25,0.06),-8px_-8px_16px_rgba(255,255,255,0.9),inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_2px_rgba(27,28,25,0.03)] transition-colors hover:bg-surface-bright">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high shadow-[inset_4px_4px_8px_rgba(27,28,25,0.05),inset_-4px_-4px_8px_rgba(255,255,255,0.6)]">
            <IconShieldLock size={30} className="text-tertiary" />
          </div>
          <h3 className="text-lg font-semibold text-on-surface">Armed</h3>
          <p className="text-sm text-on-surface-variant">All secure</p>
        </article>

        {[
          { slot: "kitchen", room: kitchenRoom },
          { slot: "bedroom", room: bedroomRoom },
        ].map(({ slot, room }) => {
          const miniDevices = room ? roomDevices.get(room.id) ?? [] : []
          const isOn = miniDevices.some((device) => coerceBool(device.state?.isOn))
          const MiniRoomIcon = room ? roomIcon(room.name) : IconChefHat
          return (
            <Link
              key={room?.id ?? slot}
              href={room ? roomHref(homeId, room.id, {}) : homeHref(homeId, {})}
              className="flex flex-col justify-between rounded-xl border border-white/40 bg-surface-container p-5 shadow-[8px_8px_16px_rgba(27,28,25,0.06),-8px_-8px_16px_rgba(255,255,255,0.9),inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_2px_rgba(27,28,25,0.03)]"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-[4px_4px_8px_rgba(27,28,25,0.05),-4px_-4px_8px_rgba(255,255,255,0.8)]">
                  <MiniRoomIcon size={16} className="text-on-surface-variant" />
                </div>
                <div className={`flex h-6 w-10 items-center rounded-full p-1 shadow-[inset_2px_2px_4px_rgba(27,28,25,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.6)] ${isOn ? "justify-end bg-primary-container" : "bg-surface-variant"}`}>
                  <div className={`h-4 w-4 rounded-full shadow-sm ${isOn ? "bg-primary" : "bg-surface-container-highest"}`} />
                </div>
              </div>
              <div>
                <h4 className="text-base font-semibold text-on-surface">{room?.name ?? "Room"}</h4>
                <p className={`text-sm ${isOn ? "text-primary" : "text-on-surface-variant"}`}>{isOn ? "Lights On" : "Off"}</p>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="mt-10">
        <h3 className="mb-3 px-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Quick Scenes</h3>
        <div className="flex flex-wrap gap-3">
          <button className="flex items-center gap-2 rounded-full bg-surface-container px-6 py-3 text-[13px] font-semibold text-on-surface shadow-[6px_6px_12px_rgba(27,28,25,0.05),-6px_-6px_12px_rgba(255,255,255,0.8),inset_1px_1px_2px_rgba(255,255,255,1)]" type="button">
            <IconTemperature size={18} className="text-secondary" />
            Morning Wake
          </button>
          <button className="flex items-center gap-2 rounded-full bg-surface-container px-6 py-3 text-[13px] font-semibold text-on-surface shadow-[6px_6px_12px_rgba(27,28,25,0.05),-6px_-6px_12px_rgba(255,255,255,0.8),inset_1px_1px_2px_rgba(255,255,255,1)]" type="button">
            <IconDeviceDesktop size={18} className="text-tertiary" />
            Focus Mode
          </button>
          <button className="flex items-center gap-2 rounded-full bg-surface-container px-6 py-3 text-[13px] font-semibold text-on-surface shadow-[6px_6px_12px_rgba(27,28,25,0.05),-6px_-6px_12px_rgba(255,255,255,0.8),inset_1px_1px_2px_rgba(255,255,255,1)]" type="button">
            <IconMusic size={18} className="text-primary" />
            Sleep
          </button>
        </div>
      </div>
    </div>
  )
}
