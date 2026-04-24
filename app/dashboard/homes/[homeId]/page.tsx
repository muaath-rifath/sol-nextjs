import { auth } from "@/auth"
import CreateRoomPopover from "@/components/CreateRoomPopover"
import { type CursorResponse, type Home, type Room, type RoomDevice, solCore } from "@/lib/sol-core"
import {
  IconArmchair,
  IconBell,
  IconBed,
  IconBlind,
  IconChefHat,
  IconDeviceDesktop,
  IconMenu2,
  IconMusic,
  IconSettings,
  IconShieldLock,
  IconSearch,
  IconTemperature,
  IconWind,
} from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"
import type { ForwardRefExoticComponent, RefAttributes } from "react"
import type { IconProps } from "@tabler/icons-react"
import HomeSwitcher from "@/components/HomeSwitcher"

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

  const currentHome = allHomes.data.find((home) => home.id === homeId)

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

  async function createRoomAction(formData: FormData) {
    "use server"
    const name = String(formData.get("name") ?? "").trim()
    const floorRaw = String(formData.get("floor") ?? "").trim()
    const floor = floorRaw ? Number(floorRaw) : undefined

    if (!name) {
      redirect(homeHref(homeId, { error: "Room name is required" }))
    }
    if (floorRaw && Number.isNaN(floor)) {
      redirect(homeHref(homeId, { error: "Floor must be a number" }))
    }

    try {
      await solCore.rooms.create(homeId, { name, floor })
      redirect(homeHref(homeId, { notice: "Room created" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(homeHref(homeId, { error: errorMessage(error) }))
    }
  }

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
            params: { isOn: turnOn },
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

  const navRooms = rooms.slice(0, 5)

  return (
    <div className="bg-background text-on-background selection:bg-primary-container selection:text-on-primary-container min-h-screen antialiased">
      <div className="flex min-h-screen">
        <nav className="fixed left-0 top-0 z-40 hidden h-screen w-72 rounded-r-[50px] border-r border-white/20 bg-stone-100 px-6 py-7 shadow-[20px_0_40px_rgba(0,0,0,0.05)] md:flex md:flex-col">
          <div className="mb-8 px-1">
            <div className="mb-3 px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">Home</p>
              <h2 className="mt-1 truncate text-xl font-bold tracking-tight text-stone-800">
                {currentHome?.name ?? "Select home"}
              </h2>
            </div>
            <HomeSwitcher homes={allHomes.data} activeHomeId={homeId} />
          </div>

          <ul className="flex flex-1 flex-col gap-2 text-base font-semibold">
            <li>
              <Link
                href={`/dashboard/homes/${homeId}`}
                className="m-2 flex items-center rounded-[24px] bg-primary-fixed px-4 py-4 text-primary shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),4px_4px_10px_rgba(0,0,0,0.07)]"
              >
                <IconDeviceDesktop size={18} className="mr-2" />
                Dashboard
              </Link>
            </li>
            {navRooms.length === 0 ? (
              <li>
                <span className="m-2 flex items-center rounded-[24px] p-4 text-stone-400">No rooms yet</span>
              </li>
            ) : (
              navRooms.map((room) => {
                const RoomNavIcon = roomIcon(room.name)
                return (
                  <li key={room.id}>
                    <Link
                      href={`/dashboard/homes/${homeId}/rooms/${room.id}`}
                      className="m-2 flex items-center rounded-[24px] p-4 text-stone-600 transition-colors duration-150 hover:bg-white/60"
                    >
                      <RoomNavIcon size={18} className="mr-2" />
                      {room.name}
                    </Link>
                  </li>
                )
              })
            )}
          </ul>

          <div className="mt-auto">
            <CreateRoomPopover createRoomAction={createRoomAction} />
          </div>
        </nav>

        <main className="relative flex min-h-screen flex-1 flex-col md:ml-72">
          <header className="fixed top-0 z-50 flex w-full items-center justify-between rounded-b-[40px] bg-orange-50/50 px-6 py-4 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_10px_30px_rgba(255,126,103,0.1)] backdrop-blur-md md:w-[calc(100%-18rem)] md:px-8">
            <div className="flex items-center gap-3">
              <button className="p-2 text-stone-400 md:hidden" type="button">
                <IconMenu2 size={20} />
              </button>
              <h1 className="text-2xl font-black italic tracking-tight text-orange-600">Zynix Systems</h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden items-center rounded-full border border-white/40 bg-white/60 px-4 py-2 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,0.8)] sm:flex">
                <IconSearch size={16} className="mr-2 text-stone-400" />
                <input className="w-32 bg-transparent text-sm text-stone-600 outline-none transition-all placeholder:text-stone-400 focus:w-48" placeholder="Search devices..." type="text" />
              </div>

              <div className="flex items-center gap-2">
                <button className="relative rounded-full p-2 text-stone-400 shadow-[2px_2px_4px_rgba(0,0,0,0.05),-2px_-2px_4px_rgba(255,255,255,0.8)]" type="button">
                  <IconBell size={18} />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                </button>
                <Link
                  href="/dashboard/account"
                  className="rounded-full p-2 text-stone-400 shadow-[2px_2px_4px_rgba(0,0,0,0.05),-2px_-2px_4px_rgba(255,255,255,0.8)]"
                >
                  <IconSettings size={18} />
                </Link>
              </div>

              <Link
                href="/dashboard/account"
                className="h-10 w-10 overflow-hidden rounded-full border-2 border-white/50 shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_rgba(255,255,255,0.9)]"
              >
                {session.user?.image ? (
                  <Image alt="User profile" className="h-full w-full object-cover" src={session.user.image} width={40} height={40} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary-container text-xs font-semibold text-on-primary-container">
                    {session.user?.name?.slice(0, 1).toUpperCase() ?? "U"}
                  </div>
                )}
              </Link>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 pt-36 md:p-8 md:pt-36">
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
        </main>
      </div>
    </div>
  )
}
