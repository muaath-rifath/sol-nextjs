import { auth, signIn } from "@/auth"
import { redirect } from "next/navigation"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  const { callbackUrl } = await searchParams

  if (session && session.error !== "RefreshAccessTokenError") {
    redirect(callbackUrl ?? "/dashboard")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,#fff4d9_0%,#fffdf8_48%,#eef8ff_100%)] px-4">
      <main className="w-full max-w-4xl overflow-hidden rounded-3xl border border-amber-200 bg-white/90 shadow-xl backdrop-blur-sm">
        <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
          <section className="space-y-6 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-8 py-10 text-white sm:px-10 sm:py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">Zynix Systems</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">Smart homes, shared clearly.</h1>
            <p className="max-w-md text-sm text-amber-50/95 sm:text-base">
              Create homes when you need them, invite the right people by email, and keep membership
              organized with reliable cursor-based lists.
            </p>
          </section>

          <section className="flex flex-col justify-between px-8 py-10 sm:px-10 sm:py-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900">Sign in to continue</h2>
              <p className="mt-2 text-sm text-stone-600">
                Use your organization account to access homes, invitations, and devices.
              </p>
            </div>

            <form
              action={async () => {
                "use server"
                const { callbackUrl } = await searchParams
                await signIn("zitadel", { redirectTo: callbackUrl ?? "/dashboard" })
              }}
              className="mt-8"
            >
              <button
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-teal-700 hover:to-cyan-700"
              >
                Log in / Sign up
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
