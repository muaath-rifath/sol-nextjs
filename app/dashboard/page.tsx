import { auth, signOut } from "@/auth"
import {
  type CursorResponse,
  type Home,
  type HomeInvitation,
  type HomeMember,
  type InvitationStatus,
  type Room,
  type RoomDevice,
  solCore,
} from "@/lib/sol-core"
import Image from "next/image"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"

type RawSearchParams = Record<string, string | string[] | undefined>
type DashboardQuery = {
  home?: string
  homesCursor?: string
  membersCursor?: string
  invitesCursor?: string
  inviteStatus?: string
  notice?: string
  error?: string
}

const validStatuses = new Set<InvitationStatus>([
  "pending",
  "accepted",
  "declined",
  "expired",
])

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function buildDashboardHref(query: DashboardQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (!value) {
      continue
    }
    params.set(key, value)
  }
  const encoded = params.toString()
  return encoded ? `/dashboard?${encoded}` : "/dashboard"
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong"
}

function decodeNotice(code: string | undefined): string | null {
  if (!code) {
    return null
  }
  switch (code) {
    case "home-created":
      return "Home created successfully."
    case "invite-sent":
      return "Invitation sent successfully."
    case "invite-cancelled":
      return "Invitation cancelled."
    case "invite-accepted":
      return "Invitation accepted. Welcome to your new home."
    case "home-deleted":
      return "Home deleted."
    default:
      return code
  }
}

function roleTone(role: string | undefined): string {
  switch (role) {
    case "owner":
      return "bg-[color:var(--primary)]/15 text-[color:var(--primary-strong)]"
    case "admin":
      return "bg-[color:var(--secondary-soft)] text-[color:var(--secondary)]"
    default:
      return "bg-slate-200/70 text-slate-700"
  }
}

function toTitle(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function deviceLatencyMs(device: RoomDevice): number | null {
  const state = device.state as Record<string, unknown>
  const raw = state.latency_ms ?? state.latencyMs ?? state.ping_ms ?? state.pingMs
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw === "string") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

async function createHomeAction(formData: FormData) {
  "use server"
  const name = String(formData.get("name") ?? "").trim()
  if (!name) {
    redirect(buildDashboardHref({ error: "Home name is required" }))
  }

  try {
    const created = await solCore.homes.create({ name })
    redirect(
      buildDashboardHref({
        home: created.id,
        notice: "home-created",
      }),
    )
  } catch (error) {
    unstable_rethrow(error)
    redirect(buildDashboardHref({ error: errorMessage(error) }))
  }
}

async function inviteByEmailAction(formData: FormData) {
  "use server"
  const homeID = String(formData.get("home_id") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()

  if (!homeID || !email) {
    redirect(
      buildDashboardHref({
        home: homeID || undefined,
        error: "Home and email are required",
      }),
    )
  }

  try {
    await solCore.homes.inviteByEmail(homeID, { email })
    redirect(buildDashboardHref({ home: homeID, notice: "invite-sent" }))
  } catch (error) {
    unstable_rethrow(error)
    redirect(buildDashboardHref({ home: homeID, error: errorMessage(error) }))
  }
}

async function cancelInvitationAction(formData: FormData) {
  "use server"
  const homeID = String(formData.get("home_id") ?? "").trim()
  const invitationID = String(formData.get("invitation_id") ?? "").trim()

  if (!homeID || !invitationID) {
    redirect(
      buildDashboardHref({
        home: homeID || undefined,
        error: "Missing invitation details",
      }),
    )
  }

  try {
    await solCore.homes.cancelInvitation(homeID, invitationID)
    redirect(buildDashboardHref({ home: homeID, notice: "invite-cancelled" }))
  } catch (error) {
    unstable_rethrow(error)
    redirect(buildDashboardHref({ home: homeID, error: errorMessage(error) }))
  }
}

async function deleteHomeAction(formData: FormData) {
  "use server"
  const homeID = String(formData.get("home_id") ?? "").trim()
  if (!homeID) {
    redirect(buildDashboardHref({ error: "Missing home ID" }))
  }
  try {
    await solCore.homes.delete(homeID)
    redirect(buildDashboardHref({ notice: "home-deleted" }))
  } catch (error) {
    unstable_rethrow(error)
    redirect(buildDashboardHref({ home: homeID, error: errorMessage(error) }))
  }
}

async function signOutAction() {
  "use server"
  await signOut({ redirectTo: "/" })
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const session = await auth()
  if (!session) {
    redirect("/")
  }

  const raw = await searchParams
  const query: DashboardQuery = {
    home: first(raw.home),
    homesCursor: first(raw.homesCursor),
    membersCursor: first(raw.membersCursor),
    invitesCursor: first(raw.invitesCursor),
    inviteStatus: first(raw.inviteStatus),
    notice: first(raw.notice),
    error: first(raw.error),
  }

  const statusFilter =
    query.inviteStatus && validStatuses.has(query.inviteStatus as InvitationStatus)
      ? (query.inviteStatus as InvitationStatus)
      : undefined

  let homes: CursorResponse<Home> = { data: [], next_cursor: null, has_more: false }
  let homesError: string | null = null

  try {
    homes = await solCore.homes.list({ cursor: query.homesCursor, limit: 8 })
  } catch (error) {
    homesError = errorMessage(error)
  }

  const activeHomeID = query.home ?? homes.data[0]?.id
  let selectedHome: Home | null = null
  let members: CursorResponse<HomeMember> = { data: [], next_cursor: null, has_more: false }
  let rooms: Room[] = []
  let roomDevices = new Map<string, RoomDevice[]>()
  let invitations: CursorResponse<HomeInvitation> = {
    data: [],
    next_cursor: null,
    has_more: false,
  }
  let selectedHomeError: string | null = null

  if (activeHomeID) {
    try {
      const [home, memberList, roomList] = await Promise.all([
        solCore.homes.get(activeHomeID),
        solCore.homes.listMembers(activeHomeID, {
          cursor: query.membersCursor,
          limit: 8,
        }),
        solCore.rooms.listAll(activeHomeID),
      ])

      selectedHome = home
      members = memberList
      rooms = roomList

      const roomDevicesList = await Promise.all(
        rooms.map(async (room) => {
          try {
            const devices = await solCore.rooms.devices.listAll(activeHomeID, room.id)
            return [room.id, devices] as const
          } catch {
            return [room.id, []] as const
          }
        }),
      )
      roomDevices = new Map(roomDevicesList)

      try {
        invitations = await solCore.homes.listInvitations(activeHomeID, {
          status: statusFilter,
          cursor: query.invitesCursor,
          limit: 8,
        })
      } catch {
        // Member role can't list invitations.
      }
    } catch (error) {
      selectedHomeError = errorMessage(error)
    }
  }

  const baseQuery: DashboardQuery = {
    home: activeHomeID,
    homesCursor: query.homesCursor,
    membersCursor: query.membersCursor,
    invitesCursor: query.invitesCursor,
    inviteStatus: statusFilter,
  }

  const withQuery = (patch: DashboardQuery) => buildDashboardHref({ ...baseQuery, ...patch })
  const notice = decodeNotice(query.notice)
  const canManageInvites = selectedHome?.my_role === "owner" || selectedHome?.my_role === "admin"
  const allDevices = rooms.flatMap((room) => roomDevices.get(room.id) ?? [])
  const onlineDevices = allDevices.filter((device) => device.online).length
  const roomCards = rooms.slice(0, 3).map((room) => {
    const devices = roomDevices.get(room.id) ?? []
    const online = devices.filter((device) => device.online).length
    const latencyValues = devices
      .map((device) => deviceLatencyMs(device))
      .filter((value): value is number => value !== null)
    const avgLatency = latencyValues.length
      ? `${Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)}ms`
      : "--"
    const status =
      devices.length === 0
        ? "No devices"
        : online === 0
          ? "Offline"
          : online === devices.length
            ? "Online"
            : "Degraded"
    const features = devices.slice(0, 3).map((device) => toTitle(String(device.type || "custom")))
    return {
      room,
      status,
      avgLatency,
      devices,
      features,
    }
  })

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top_left,#f6fbff_0%,#f7f7ff_45%,#faf8ff_100%)] text-[color:var(--foreground)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(15,118,110,0.08),transparent_30%,rgba(51,65,85,0.06)_70%,transparent)]" />

      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/72 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[linear-gradient(135deg,var(--primary),var(--primary-strong))]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight">Sol Smart Home</p>
              <p className="truncate text-[11px] uppercase tracking-[0.2em] text-slate-500">Infrastructure Hub</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full bg-[color:var(--secondary-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--secondary)]">
              {homes.data.length} Home{homes.data.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-[color:var(--primary)]/15 px-3 py-1 text-xs font-semibold text-[color:var(--primary-strong)]">
              System Live
            </span>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="relative mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:py-8">
        <aside className="space-y-4 rounded-3xl bg-white/74 p-4 shadow-[0_22px_45px_rgba(19,27,46,0.08)] backdrop-blur-xl lg:p-5">
          <div className="overflow-hidden rounded-2xl">
            <Image
              src="/stitch-glass-house.jpg"
              alt="The Glass House"
              width={1200}
              height={420}
              className="h-32 w-full object-cover"
            />
            <div className="bg-gradient-to-r from-[color:var(--secondary)]/90 to-[color:var(--primary)]/85 p-3 text-white">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Active Site</p>
              <p className="text-sm font-semibold">The Glass House</p>
            </div>
          </div>

          <form action={createHomeAction} className="space-y-2 rounded-2xl bg-[color:var(--surface-low)] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Create Home</p>
            <input
              type="text"
              name="name"
              required
              maxLength={100}
              placeholder="Downtown Apartment"
              className="w-full rounded-xl border-0 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent transition focus:ring-[color:var(--primary)]/45"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-[linear-gradient(120deg,var(--primary),var(--primary-strong))] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105"
            >
              Provision home
            </button>
          </form>

          <div className="space-y-2 rounded-2xl bg-[color:var(--surface-low)] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Homes</p>
            {homesError ? (
              <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{homesError}</p>
            ) : homes.data.length === 0 ? (
              <p className="rounded-xl bg-white px-3 py-3 text-sm text-slate-600">
                No homes yet. Create one to start inviting people.
              </p>
            ) : (
              <div className="space-y-2">
                {homes.data.map((home) => {
                  const active = home.id === activeHomeID
                  return (
                    <Link
                      key={home.id}
                      href={`/dashboard/homes/${home.id}`}
                      className={`block rounded-2xl px-3 py-3 transition ${
                        active
                          ? "bg-[color:var(--primary)]/12 text-[color:var(--primary-strong)]"
                          : "bg-white text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      <p className="text-sm font-semibold">{home.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {home.member_count ?? 0} member{home.member_count === 1 ? "" : "s"} |{" "}
                        {home.my_role ?? "member"}
                      </p>
                    </Link>
                  )
                })}
              </div>
            )}
            {homes.has_more && homes.next_cursor ? (
              <Link
                href={withQuery({ homesCursor: homes.next_cursor, notice: undefined, error: undefined })}
                className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Load more homes
              </Link>
            ) : null}
          </div>
        </aside>

        <section className="space-y-6">
          <div className="overflow-hidden rounded-3xl bg-white/78 p-5 shadow-[0_22px_45px_rgba(19,27,46,0.08)] backdrop-blur-xl sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Sentient Home</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">My Infrastructure</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[color:var(--primary)]/15 px-3 py-1 text-xs font-semibold text-[color:var(--primary-strong)]">
                System Live
              </span>
              <span className="text-sm text-slate-600">
                Welcome back, {session.user?.name ?? "there"}. {onlineDevices}/{allDevices.length} nodes online across {rooms.length} rooms.
              </span>
            </div>
          </div>

          {notice ? (
            <p className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm text-emerald-800">{notice}</p>
          ) : null}
          {query.error ? (
            <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-800">{query.error}</p>
          ) : null}

          {!activeHomeID ? (
            <div className="rounded-3xl bg-white/78 p-10 text-center shadow-[0_22px_45px_rgba(19,27,46,0.08)] backdrop-blur-xl">
              <p className="text-xl font-semibold">No home selected</p>
              <p className="mt-2 text-sm text-slate-600">Create a home from the left panel to activate this dashboard.</p>
            </div>
          ) : selectedHomeError ? (
            <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-800">{selectedHomeError}</p>
          ) : selectedHome ? (
            <>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-3xl bg-white/80 p-5 shadow-[0_22px_45px_rgba(19,27,46,0.08)] backdrop-blur-xl sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{selectedHome.name}</h2>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full px-3 py-1 font-semibold ${roleTone(selectedHome.my_role)}`}>
                          Role: {selectedHome.my_role ?? "member"}
                        </span>
                        <span className="rounded-full bg-[color:var(--secondary-soft)] px-3 py-1 font-semibold text-[color:var(--secondary)]">
                          {selectedHome.member_count ?? 0} members
                        </span>
                      </div>
                    </div>
                    {selectedHome.my_role === "owner" ? (
                      <form action={deleteHomeAction}>
                        <input type="hidden" name="home_id" value={selectedHome.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                        >
                          Delete home
                        </button>
                      </form>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {roomCards.map((node) => (
                      <div key={node.room.id} className="rounded-2xl bg-[color:var(--surface-low)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{node.room.name}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                              node.status === "Online"
                                ? "bg-[color:var(--primary)]/15 text-[color:var(--primary-strong)]"
                                : node.status === "Degraded"
                                  ? "bg-amber-200 text-amber-800"
                                  : "bg-rose-200 text-rose-700"
                            }`}
                          >
                            {node.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {node.features.length > 0 ? node.features.join(" + ") : "No devices provisioned"}
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          {node.devices.length} device{node.devices.length === 1 ? "" : "s"} | latency {node.avgLatency}
                        </p>
                        <Link
                          href={`/dashboard/homes/${selectedHome.id}/rooms/${node.room.id}`}
                          className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Open room
                        </Link>
                      </div>
                    ))}
                    {roomCards.length === 0 ? (
                      <div className="rounded-2xl bg-[color:var(--surface-low)] p-4 text-sm text-slate-600 sm:col-span-2 lg:col-span-3">
                        No rooms found yet. Create rooms and devices from the home pages to populate infrastructure cards.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl bg-white/80 shadow-[0_22px_45px_rgba(19,27,46,0.08)] backdrop-blur-xl">
                  <Image
                    src="/stitch-user-alex-rivera.jpg"
                    alt="Admin profile"
                    width={900}
                    height={360}
                    className="h-36 w-full object-cover"
                  />
                  <div className="p-4">
                    <p className="text-sm font-semibold">Alex Rivera</p>
                    <p className="text-xs text-slate-500">Root Admin</p>
                    <div className="mt-3 h-2 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-[linear-gradient(120deg,var(--primary),var(--primary-strong))]"
                        style={{ width: `${allDevices.length === 0 ? 0 : Math.max(8, Math.round((onlineDevices / allDevices.length) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">Node Usage: {onlineDevices}/{allDevices.length}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl bg-[color:var(--surface-low)] p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold">Members</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {members.data.length} shown
                    </span>
                  </div>

                  {members.data.length === 0 ? (
                    <p className="rounded-xl bg-white px-3 py-3 text-sm text-slate-600">No members found.</p>
                  ) : (
                    <div className="space-y-2">
                      {members.data.map((member) => (
                        <div key={member.user_id} className="rounded-xl bg-white px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{member.user_name}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleTone(member.role)}`}>
                              {member.role}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{member.user_email}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {members.has_more && members.next_cursor ? (
                    <Link
                      href={withQuery({
                        membersCursor: members.next_cursor,
                        notice: undefined,
                        error: undefined,
                      })}
                      className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Load more members
                    </Link>
                  ) : null}
                </div>

                {canManageInvites ? (
                  <div className="rounded-3xl bg-[color:var(--surface-low)] p-4 sm:p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold">Recent Invitations</h3>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        Manage access
                      </span>
                    </div>

                    <form action={inviteByEmailAction} className="mb-3 flex gap-2">
                      <input type="hidden" name="home_id" value={selectedHome.id} />
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="invitee@example.com"
                        className="min-w-0 flex-1 rounded-xl border-0 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent transition focus:ring-[color:var(--primary)]/45"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-[linear-gradient(120deg,var(--primary),var(--primary-strong))] px-3 py-2 text-sm font-semibold text-white"
                      >
                        Invite
                      </button>
                    </form>

                    <div className="mb-3 flex flex-wrap gap-2 text-xs">
                      <Link
                        href={withQuery({ inviteStatus: undefined, invitesCursor: undefined })}
                        className={`rounded-full px-3 py-1 font-semibold ${
                          !statusFilter
                            ? "bg-[color:var(--primary)]/15 text-[color:var(--primary-strong)]"
                            : "bg-white text-slate-700"
                        }`}
                      >
                        all
                      </Link>
                      {Array.from(validStatuses).map((status) => (
                        <Link
                          key={status}
                          href={withQuery({ inviteStatus: status, invitesCursor: undefined })}
                          className={`rounded-full px-3 py-1 font-semibold ${
                            statusFilter === status
                              ? "bg-[color:var(--primary)]/15 text-[color:var(--primary-strong)]"
                              : "bg-white text-slate-700"
                          }`}
                        >
                          {status}
                        </Link>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {invitations.data.length === 0 ? (
                        <p className="rounded-xl bg-white px-3 py-3 text-sm text-slate-600">
                          No invitations for this filter.
                        </p>
                      ) : (
                        invitations.data.map((invitation, index) => (
                          <div key={invitation.id} className="rounded-xl bg-white px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Image
                                  src={index % 2 === 0 ? "/stitch-invite-julian.jpg" : "/stitch-invite-sasha.jpg"}
                                  alt="Invitation profile"
                                  width={64}
                                  height={64}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                                <div>
                                  <p className="text-sm font-semibold">{invitation.invitee_email}</p>
                                  <p className="text-xs text-slate-500">
                                    {invitation.status} | expires {new Date(invitation.expires_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              {invitation.status === "pending" ? (
                                <form action={cancelInvitationAction}>
                                  <input type="hidden" name="home_id" value={selectedHome.id} />
                                  <input type="hidden" name="invitation_id" value={invitation.id} />
                                  <button
                                    type="submit"
                                    className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                                  >
                                    Revoke
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {invitations.has_more && invitations.next_cursor ? (
                      <Link
                        href={withQuery({
                          invitesCursor: invitations.next_cursor,
                          notice: undefined,
                          error: undefined,
                        })}
                        className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Load more invitations
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
