import { auth } from "@/auth"
import { redirect } from "next/navigation"
import LoginPanel from "./login-panel"
import "./login.css"

export const metadata = {
  title: "Antigravity — Access Portal",
  description:
    "Secure login and sign-up portal for the Antigravity system. Authenticate with your credentials or upload an access token file.",
}

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

  const year = new Date().getFullYear()

  return (
    <div className="ag-page">
      {/* ── Gradient background layer (only place gradients live) ── */}
      <div className="ag-bg" aria-hidden="true" />

      {/* ══════════════════════════ HEADER ══════════════════════════ */}
      <header className="ag-header">
        <a className="ag-logo" href="#" id="logo-link" aria-label="Antigravity Home">
          {/* Logo mark — atom / orbit SVG */}
          <div className="ag-logo-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="2.4" />
              <ellipse cx="12" cy="12" rx="10" ry="3.6" />
              <ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(60 12 12)" />
              <ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(120 12 12)" />
            </svg>
          </div>
          <div className="ag-wordmark">
            Antigravity
            <small>System Access Portal</small>
          </div>
        </a>

        <nav className="ag-header-nav" aria-label="Header actions">
          <button className="ag-btn-nav" id="btn-manual" type="button">
            User Manual
          </button>
          <button className="ag-btn-nav" id="btn-help" type="button">
            Ask for Help
          </button>
        </nav>
      </header>

      {/* ══════════════════════════ MAIN ════════════════════════════ */}
      <main className="ag-main">
        <LoginPanel />
      </main>

      {/* ══════════════════════════ FOOTER ══════════════════════════ */}
      <footer className="ag-footer">
        <p className="ag-footer-copy">
          &copy; {year} Antigravity Systems. All rights reserved.
        </p>

        {/* Field status pill */}
        <div className="ag-status-pill" aria-label="Antigravity Field Status">
          <div className="ag-status-dot" aria-hidden="true" />
          <span className="ag-status-label">Antigravity Field Status</span>
          <span className="ag-status-chip">Nominal</span>
        </div>
      </footer>
    </div>
  )
}
