import { auth, signIn } from "@/auth"
import { redirect } from "next/navigation"
import Image from "next/image"
import LoginPanel from "./login-panel"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const session = await auth()
  const { callbackUrl } = await searchParams

  if (session) {
    redirect(callbackUrl ?? "/dashboard")
  }

  /* ── Server Action: admin SSO ── */
  async function adminSignIn() {
    "use server"
    const { callbackUrl: cb } = await searchParams
    await signIn("keycloak", { redirectTo: cb ?? "/dashboard" })
  }

  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>
      ),
      label: "AI Voice Control",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
      label: "Smart Energy Management",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
        </svg>
      ),
      label: "Adaptive Security",
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856A9.002 9.002 0 0 1 12 9a9 9 0 0 1 6.894 2.856M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      ),
      label: "360° IoT Integration",
    },
  ]

  const stats = [
    { value: "200+", label: "Smart Devices" },
    { value: "99.9%", label: "Uptime" },
    { value: "40%", label: "Energy Saved" },
  ]

  const statusItems = [
    { label: "Indoor Temp", value: "22.4°C", color: "#00d4ff" },
    { label: "Humidity", value: "58%", color: "#7c3aed" },
    { label: "Air Quality", value: "Good", color: "#22c55e" },
    { label: "Security", value: "Armed", color: "#f59e0b" },
    { label: "Energy Today", value: "14.2 kWh", color: "#00d4ff" },
    { label: "Active Devices", value: "24 online", color: "#22c55e" },
  ]

  return (
    <div className="page-root">

      {/* ═══════════════ BACKGROUND ═══════════════ */}
      <div className="page-bg" aria-hidden="true">
        <Image
          src="/smart-home-bg.png"
          alt="Smart Home Interior"
          fill
          priority
          className="object-cover"
          style={{ objectPosition: "center" }}
        />
        <div className="page-bg-overlay" />
        <div className="page-bg-fade" />
      </div>

      {/* ── Ambient orbs ── */}
      <div className="ambient-orb ambient-orb--cyan" aria-hidden="true" />
      <div className="ambient-orb ambient-orb--purple" aria-hidden="true" />
      {/* Extra subtle orbs for depth */}
      <div className="ambient-orb ambient-orb--teal" aria-hidden="true" />

      {/* ═══════════════ HEADER ═══════════════ */}
      <header className="site-header glass-card" role="banner">
        {/* Logo */}
        <div className="header-logo" aria-label="Zynix Sol AI Home Automation">
          <div className="logo-icon-wrap" aria-hidden="true">
            <div className="logo-icon-bg" />
            <svg viewBox="0 0 24 24" fill="none" className="logo-icon-svg">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 22V12h6v10" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="logo-text text-gradient">Zynix Sol</span>
          <div className="logo-live-badge" aria-label="System live">
            <span className="dot-live" aria-hidden="true" />
            <span className="logo-live-text">Live</span>
          </div>
        </div>

        {/* Nav actions */}
        <nav className="header-nav" role="navigation" aria-label="Support links">
          <a
            id="user-manual-link"
            href="#manual"
            className="header-nav-btn"
            aria-label="Open user manual"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="header-nav-icon" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            <span>User Manual</span>
          </a>
          <a
            id="help-support-link"
            href="#support"
            className="header-nav-btn header-nav-btn--primary"
            aria-label="Open help and support"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="header-nav-icon" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
            </svg>
            <span>Help &amp; Support</span>
          </a>
        </nav>
      </header>

      {/* ═══════════════ MAIN ═══════════════ */}
      <main className="page-main" role="main">

        {/* ── Left info panel ── */}
        <section className="info-panel" aria-label="Product highlights">
          <div className="animate-slide-in-left">

            {/* Tagline chip */}
            <div className="tagline-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="1.5" className="tagline-chip-icon" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              <span className="tagline-chip-text">AI-Powered · IoT-Connected · Fully Automated</span>
            </div>

            {/* Headline */}
            <h1 className="info-headline">
              <span className="info-headline-plain">Your Home,</span>
              <br />
              <span className="text-shimmer">Intelligently</span>
              <br />
              <span className="info-headline-plain">Automated.</span>
            </h1>

            <p className="info-description">
              Experience the future of living. Sol connects every device, sensor, and system
              in your home into one seamless, AI-driven ecosystem.
            </p>
          </div>

          {/* Feature pills */}
          <div className="feature-grid animate-float-up-delay-1">
            {features.map((f) => (
              <div key={f.label} className="feature-pill glass-card">
                <span className="feature-pill-icon">{f.icon}</span>
                <span className="feature-pill-label">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="stats-row animate-float-up-delay-2">
            {stats.map((s) => (
              <div key={s.label} className="stat-item">
                <span className="stat-value text-gradient">{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Right: Login Panel ── */}
        <section className="login-section" aria-label="Login">
          <div className="animate-float-up">
            <LoginPanel adminSignInAction={adminSignIn} />
          </div>
        </section>

      </main>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="site-footer" role="contentinfo">
        {/* IoT status ticker */}
        <div className="footer-ticker">
          <span className="footer-ticker-label">System Status</span>
          <div className="footer-ticker-items">
            {statusItems.map((item) => (
              <div key={item.label} className="footer-ticker-item">
                <span className="footer-ticker-value" style={{ color: item.color }}>{item.value}</span>
                <span className="footer-ticker-key">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="footer-nominal">
            <span className="dot-live" style={{ width: 6, height: 6 }} aria-hidden="true" />
            <span className="footer-nominal-text">All systems nominal</span>
          </div>
        </div>

        {/* Copyright + ESP-32 status */}
        <div className="footer-bar">
          <p className="footer-copy">
            © 2026 Zynix Systems &middot; All rights reserved &middot;{" "}
            <a href="#privacy" className="footer-link">Privacy Policy</a>
          </p>

          {/* ESP-32 hardware node indicator */}
          <div className="footer-hw-status" aria-label="Hardware node status: ESP-32 connected">
            <div className="footer-hw-dot-ring" aria-hidden="true">
              <span className="dot-live" style={{ width: 7, height: 7 }} />
            </div>
            <span className="footer-hw-label">Hardware Node:</span>
            <span className="footer-hw-value">ESP-32 Connected</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
