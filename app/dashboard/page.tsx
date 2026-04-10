import { auth, signOut } from "@/auth"
import {
  type CursorResponse,
  type Home,
  type HomeInvitation,
  type HomeMember,
  type InvitationStatus,
  solCore,
} from "@/lib/sol-core"
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
    default:
      return code
  }
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
  let invitations: CursorResponse<HomeInvitation> = {
    data: [],
    next_cursor: null,
    has_more: false,
  }
  let selectedHomeError: string | null = null

  if (activeHomeID) {
    try {
      const [home, memberList, invitationList] = await Promise.all([
        solCore.homes.get(activeHomeID),
        solCore.homes.listMembers(activeHomeID, {
          cursor: query.membersCursor,
          limit: 8,
        }),
        solCore.homes.listInvitations(activeHomeID, {
          status: statusFilter,
          cursor: query.invitesCursor,
          limit: 8,
        }),
      ])

      selectedHome = home
      members = memberList
      invitations = invitationList
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff6e5_0%,#fffcf7_42%,#f6fbff_100%)] px-4 py-8 text-stone-900 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-3xl border border-amber-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                Sol Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
                Welcome back, {session.user?.name ?? "there"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-stone-600 sm:text-base">
                Homes are created only when you need them. Invite members, review active invites, and
                move through long lists with cursor pagination.
              </p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-500 hover:text-stone-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {notice ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        {query.error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {query.error}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-3xl border border-stone-200 bg-white/85 p-5 shadow-sm backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-stone-900">Create Home</h2>
            <form action={createHomeAction} className="space-y-3">
              <input
                type="text"
                name="name"
                required
                maxLength={100}
                placeholder="e.g. Downtown Apartment"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-amber-500"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-amber-600 hover:to-orange-600"
              >
                Create home
              </button>
            </form>

            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Homes</h3>
              {homesError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {homesError}
                </p>
              ) : homes.data.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-sm text-stone-600">
                  No homes yet. Create your first one to start inviting people.
                </p>
              ) : (
                <div className="space-y-2">
                  {homes.data.map((home) => {
                    const active = home.id === activeHomeID
                    return (
                      <Link
                        key={home.id}
                        href={withQuery({
                          home: home.id,
                          membersCursor: undefined,
                          invitesCursor: undefined,
                          notice: undefined,
                          error: undefined,
                        })}
                        className={`block rounded-2xl border px-3 py-3 transition ${
                          active
                            ? "border-amber-400 bg-amber-50"
                            : "border-stone-200 bg-white hover:border-stone-300"
                        }`}
                      >
                        <p className="text-sm font-semibold text-stone-900">{home.name}</p>
                        <p className="mt-1 text-xs text-stone-600">
                          {home.member_count ?? 0} member{home.member_count === 1 ? "" : "s"} · role {" "}
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
                  className="mt-2 inline-flex rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-500"
                >
                  Load more homes
                </Link>
              ) : null}
            </div>
          </aside>

          <section className="space-y-4 rounded-3xl border border-stone-200 bg-white/85 p-5 shadow-sm backdrop-blur-sm">
            {!activeHomeID ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
                <p className="text-lg font-semibold text-stone-800">No home selected</p>
                <p className="mt-2 text-sm text-stone-600">
                  Create a home from the left panel to unlock members and invitations.
                </p>
              </div>
            ) : selectedHomeError ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {selectedHomeError}
              </p>
            ) : selectedHome ? (
              <>
                <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
                  <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                    {selectedHome.name}
                  </h2>
                  <p className="mt-1 text-sm text-stone-600">
                    Role: {selectedHome.my_role ?? "member"} · {selectedHome.member_count ?? 0} members
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-stone-900">Members</h3>
                    <div className="mt-3 space-y-2">
                      {members.data.length === 0 ? (
                        <p className="text-sm text-stone-600">No members found.</p>
                      ) : (
                        members.data.map((member) => (
                          <div
                            key={member.user_id}
                            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
                          >
                            <p className="text-sm font-medium text-stone-900">{member.user_name}</p>
                            <p className="text-xs text-stone-600">
                              {member.user_email} · {member.role}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    {members.has_more && members.next_cursor ? (
                      <Link
                        href={withQuery({
                          membersCursor: members.next_cursor,
                          notice: undefined,
                          error: undefined,
                        })}
                        className="mt-3 inline-flex rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-500"
                      >
                        Load more members
                      </Link>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-stone-900">Invitations</h3>
                    <form action={inviteByEmailAction} className="mt-3 flex gap-2">
                      <input type="hidden" name="home_id" value={selectedHome.id} />
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="invitee@example.com"
                        className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                      >
                        Invite
                      </button>
                    </form>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Link
                        href={withQuery({ inviteStatus: undefined, invitesCursor: undefined })}
                        className={`rounded-full border px-3 py-1 ${
                          !statusFilter
                            ? "border-amber-400 bg-amber-50 text-amber-800"
                            : "border-stone-300 text-stone-700"
                        }`}
                      >
                        all
                      </Link>
                      {Array.from(validStatuses).map((status) => (
                        <Link
                          key={status}
                          href={withQuery({ inviteStatus: status, invitesCursor: undefined })}
                          className={`rounded-full border px-3 py-1 ${
                            statusFilter === status
                              ? "border-amber-400 bg-amber-50 text-amber-800"
                              : "border-stone-300 text-stone-700"
                          }`}
                        >
                          {status}
                        </Link>
                      ))}
                    </div>

                    <div className="mt-3 space-y-2">
                      {invitations.data.length === 0 ? (
                        <p className="text-sm text-stone-600">No invitations for this filter.</p>
                      ) : (
                        invitations.data.map((invitation) => (
                          <div
                            key={invitation.id}
                            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
                          >
                            <p className="text-sm font-medium text-stone-900">{invitation.invitee_email}</p>
                            <p className="mt-0.5 text-xs text-stone-600">
                              {invitation.status} · expires {" "}
                              {new Date(invitation.expires_at).toLocaleDateString()}
                            </p>
                            {invitation.status === "pending" ? (
                              <form action={cancelInvitationAction} className="mt-2">
                                <input type="hidden" name="home_id" value={selectedHome.id} />
                                <input type="hidden" name="invitation_id" value={invitation.id} />
                                <button
                                  type="submit"
                                  className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-500"
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : null}
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
                        className="mt-3 inline-flex rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-500"
                      >
                        Load more invitations
                      </Link>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
