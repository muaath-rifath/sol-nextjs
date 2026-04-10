import { auth, signIn } from "@/auth"
import { solCore } from "@/lib/sol-core"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"

type InvitationPageSearchParams = Promise<{
  notice?: string
  error?: string
  autoAccept?: string
}>

function invitationHref(token: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (!value) {
      continue
    }
    query.set(key, value)
  }
  const encoded = query.toString()
  return encoded ? `/invitations/${token}?${encoded}` : `/invitations/${token}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong"
}

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: InvitationPageSearchParams
}) {
  const { token } = await params
  const query = await searchParams
  const session = await auth()

  let invitationError: string | null = null
  let invitation = null as Awaited<ReturnType<typeof solCore.invitations.getPublic>> | null

  try {
    invitation = await solCore.invitations.getPublic(token)
  } catch (error) {
    invitationError = errorMessage(error)
  }

  if (session && invitation && invitation.status === "pending" && query.autoAccept === "1") {
    try {
      await solCore.invitations.accept(token)
    } catch (error) {
      redirect(invitationHref(token, { error: errorMessage(error) }))
    }
    redirect("/dashboard?notice=invite-accepted")
  }

  async function acceptAction() {
    "use server"
    if (!(await auth())) {
      await signIn("keycloak", { redirectTo: `/invitations/${token}` })
      return
    }

    try {
      await solCore.invitations.accept(token)
      redirect("/dashboard?notice=invite-accepted")
    } catch (error) {
      unstable_rethrow(error)
      redirect(invitationHref(token, { error: errorMessage(error) }))
    }
  }

  async function declineAction() {
    "use server"
    try {
      await solCore.invitations.declinePublic(token)
      redirect(invitationHref(token, { notice: "Invitation declined" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(invitationHref(token, { error: errorMessage(error) }))
    }
  }

  async function signInAction() {
    "use server"
    await signIn("keycloak", { redirectTo: `/invitations/${token}` })
  }

  async function signUpAction() {
    "use server"
    await signIn("keycloak", { redirectTo: invitationHref(token, { autoAccept: "1" }) })
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#e9fff8_0%,#f8fffd_45%,#fef7f0_100%)] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-stone-200 bg-white/90 p-8 shadow-sm backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Sol Invitation</p>

        {query.notice ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {query.notice}
          </p>
        ) : null}

        {query.error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {query.error}
          </p>
        ) : null}

        {invitationError || !invitation ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <h1 className="text-2xl font-semibold tracking-tight text-rose-900">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-rose-800">
              {invitationError ?? "This invitation was not found or has already expired."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/"
                className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-500"
              >
                Go to sign-in
              </Link>
              {session ? (
                <Link
                  href="/dashboard"
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500"
                >
                  Open dashboard
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-stone-900">
              You were invited to join <span className="text-teal-700">{invitation.home_name}</span>
            </h1>
            <p className="mt-3 text-sm text-stone-600">
              <strong>{invitation.inviter_name}</strong> invited <strong>{invitation.invitee_email}</strong>.
              This invitation expires on {new Date(invitation.expires_at).toLocaleString()}.
            </p>

            {invitation.status === "pending" ? (
              session ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  <form action={acceptAction}>
                    <button
                      type="submit"
                      className="rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-teal-700 hover:to-cyan-700"
                    >
                      Accept invitation
                    </button>
                  </form>
                  <form action={declineAction}>
                    <button
                      type="submit"
                      className="rounded-full border border-rose-300 px-5 py-2.5 text-sm font-semibold text-rose-700 transition hover:border-rose-500"
                    >
                      Decline invitation
                    </button>
                  </form>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  {invitation.invitee_is_user ? (
                    <>
                      <p className="text-sm text-amber-900">
                        Sign in with the invited account email to accept this invitation.
                      </p>
                      <form action={signInAction} className="mt-3">
                        <button
                          type="submit"
                          className="rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
                        >
                          Sign in to continue
                        </button>
                      </form>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-amber-900">
                        Create an account with the invited email. After sign up, we will
                        automatically finish accepting this invitation.
                      </p>
                      <form action={signUpAction} className="mt-3">
                        <button
                          type="submit"
                          className="rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
                        >
                          Sign up to continue
                        </button>
                      </form>
                      <form action={signInAction} className="mt-2">
                        <button
                          type="submit"
                          className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-500"
                        >
                          I already have an account
                        </button>
                      </form>
                    </>
                  )}
                  <form action={declineAction} className="mt-2">
                    <button
                      type="submit"
                      className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-500"
                    >
                      Decline without account
                    </button>
                  </form>
                </div>
              )
            ) : (
              <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm text-stone-800">
                  {invitation.status === "accepted"
                    ? "This invitation was already accepted."
                    : invitation.status === "declined"
                      ? "This invitation was declined."
                      : "This invitation has expired."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard"
                    className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                  >
                    Open dashboard
                  </Link>
                  <Link
                    href="/"
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500"
                  >
                    Go to home
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
