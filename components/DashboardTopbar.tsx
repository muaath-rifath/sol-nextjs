import { auth } from "@/auth"
import { IconBell, IconMenu2, IconSearch, IconSettings } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function DashboardTopbar() {
  const session = await auth()
  if (!session) redirect("/")

  return (
    <header className="fixed top-4 left-4 right-4 z-50 flex h-16 items-center justify-between rounded-full bg-orange-50/50 px-6 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_10px_30px_rgba(255,126,103,0.1)] backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button className="p-1.5 text-stone-400 md:hidden" type="button">
          <IconMenu2 size={20} />
        </button>
        <h1 className="text-xl font-black italic tracking-tight text-orange-600">Zynix Systems</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center rounded-full border border-white/40 bg-white/60 px-4 py-1.5 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.05),inset_-2px_-2px_4px_rgba(255,255,255,0.8)] sm:flex">
          <IconSearch size={14} className="mr-2 text-stone-400" />
          <input className="w-32 bg-transparent text-sm text-stone-600 outline-none transition-all placeholder:text-stone-400 focus:w-48" placeholder="Search devices..." type="text" />
        </div>

        <div className="flex items-center gap-2">
          <button className="relative rounded-full p-1.5 text-stone-400 shadow-[2px_2px_4px_rgba(0,0,0,0.05),-2px_-2px_4px_rgba(255,255,255,0.8)]" type="button">
            <IconBell size={18} />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          <Link
            href="/dashboard/account"
            className="rounded-full p-1.5 text-stone-400 shadow-[2px_2px_4px_rgba(0,0,0,0.05),-2px_-2px_4px_rgba(255,255,255,0.8)]"
          >
            <IconSettings size={18} />
          </Link>
        </div>

        <Link
          href="/dashboard/account"
          className="h-9 w-9 overflow-hidden rounded-full border-2 border-white/50 shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_rgba(255,255,255,0.9)]"
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
  )
}
