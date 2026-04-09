import { auth, signIn } from "@/auth"
import { redirect } from "next/navigation"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  const { callbackUrl } = await searchParams

  if (session) {
    redirect(callbackUrl ?? "/dashboard")
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Welcome to Sol
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Manage your home with ease. Sign in to get started.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <form
            action={async () => {
              "use server"
              const { callbackUrl } = await searchParams
              await signIn("keycloak", { redirectTo: callbackUrl ?? "/dashboard" })
            }}
          >
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 text-white transition-colors hover:bg-indigo-500 md:w-[158px]"
            >
              Sign In / Sign Up
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
