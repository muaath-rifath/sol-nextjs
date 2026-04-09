import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect("/")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-4xl p-8">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50 mb-4">
          Dashboard
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Welcome to your dashboard, {session.user?.name}!
        </p>
        {/* Add more dashboard content here */}
      </div>
    </div>
  )
}