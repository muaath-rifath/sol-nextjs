import { auth, signIn } from "@/auth"
import { redirect } from "next/navigation"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  const { callbackUrl } = await searchParams

  if (session) {
    redirect(callbackUrl ?? "/")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Sol
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in to manage your home
          </p>
        </div>

        <form
          action={async () => {
            "use server"
            const { callbackUrl } = await searchParams
            await signIn("keycloak", { redirectTo: callbackUrl ?? "/" })
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Continue with Keycloak
          </button>
        </form>
      </div>
    </div>
  )
}
