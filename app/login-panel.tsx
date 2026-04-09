"use client"

import { useRef, useState, useCallback } from "react"
import "./login.css"

/* ─── password strength helper ──────────────────────────────────────────── */
function calcStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" }
  let s = 0
  if (pw.length >= 8)  s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const labels = ["", "Weak", "Fair", "Good", "Strong"]
  return { score: s as 0|1|2|3|4, label: labels[s] }
}

/* ─── file size helper ───────────────────────────────────────────────────── */
function fmtBytes(n: number) {
  if (n < 1024)        return `${n} B`
  if (n < 1_048_576)   return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1_048_576).toFixed(1)} MB`
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function LoginPanel() {
  const [tab, setTab]         = useState<"login" | "signup">("login")

  /* login state */
  const [loginEmail, setLoginEmail]   = useState("")
  const [loginPw, setLoginPw]         = useState("")
  const [loginMsg, setLoginMsg]       = useState<{ kind: "error"|"success"; text: string } | null>(null)
  const [loginBusy, setLoginBusy]     = useState(false)

  /* signup state */
  const [signupName,  setSignupName]  = useState("")
  const [signupEmail, setSignupEmail] = useState("")
  const [signupPw,    setSignupPw]    = useState("")
  const [signupMsg, setSignupMsg]     = useState<{ kind: "error"|"success"; text: string } | null>(null)
  const [signupBusy, setSignupBusy]   = useState(false)
  const pw = calcStrength(signupPw)

  /* drag-and-drop state */
  const [isDragOver,   setIsDragOver]   = useState(false)
  const [tokenFile,    setTokenFile]    = useState<File | null>(null)
  const [dropError,    setDropError]    = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Tab switch ──────────────────────────────────────────────────────── */
  function switchTab(next: "login" | "signup") {
    setTab(next)
    setLoginMsg(null)
    setSignupMsg(null)
  }

  /* ── Login submit ────────────────────────────────────────────────────── */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginMsg(null)
    if (!loginEmail.trim()) {
      setLoginMsg({ kind: "error", text: "Please enter your email address." }); return
    }
    if (!loginPw) {
      setLoginMsg({ kind: "error", text: "Please enter your password." }); return
    }
    setLoginBusy(true)
    // TODO: replace with real POST /api/auth/login
    await new Promise(r => setTimeout(r, 900))
    setLoginBusy(false)
    setLoginMsg({ kind: "success", text: "Credentials verified — redirecting…" })
  }

  /* ── Sign-up submit ──────────────────────────────────────────────────── */
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setSignupMsg(null)
    if (!signupName.trim()) {
      setSignupMsg({ kind: "error", text: "Please enter your full name." }); return
    }
    if (!signupEmail.trim()) {
      setSignupMsg({ kind: "error", text: "Please enter your email address." }); return
    }
    if (signupPw.length < 8) {
      setSignupMsg({ kind: "error", text: "Password must be at least 8 characters." }); return
    }
    setSignupBusy(true)
    // TODO: replace with real POST /api/auth/signup  (include tokenFile in FormData if present)
    await new Promise(r => setTimeout(r, 1000))
    setSignupBusy(false)
    setSignupMsg({ kind: "success", text: "Account created — check your email to confirm." })
  }

  /* ── Drag & Drop ─────────────────────────────────────────────────────── */
  const ALLOWED_EXT = [".token", ".json", ".key", ".pem", ".txt"]

  function acceptFile(file: File) {
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "")
    if (!ALLOWED_EXT.includes(ext)) {
      setDropError(`Unsupported type "${ext}". Accepted: ${ALLOWED_EXT.join("  ")}`)
      return
    }
    setDropError(null)
    setTokenFile(file)
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    if (!tokenFile) setIsDragOver(true)
  }, [tokenFile])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) acceptFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) acceptFile(file)
  }

  function clearFile(e: React.MouseEvent) {
    e.stopPropagation()
    setTokenFile(null)
    setDropError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  const isOver     = isDragOver && !tokenFile
  const isAccepted = !!tokenFile

  return (
    <div className="ag-panel" id="ag-panel" role="region" aria-label="Authentication Panel">

      {/* ── Brand ── */}
      <div className="ag-panel-brand">
        <div className="ag-panel-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="2.4"/>
            <ellipse cx="12" cy="12" rx="10" ry="3.6"/>
            <ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(60 12 12)"/>
            <ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(120 12 12)"/>
          </svg>
        </div>
        <h1 className="ag-panel-title" id="panel-heading">
          {tab === "login" ? "Welcome Back" : "Create Account"}
        </h1>
        <p className="ag-panel-sub">
          {tab === "login"
            ? "Antigravity — Secure Access Portal"
            : "Join the Antigravity Network"}
        </p>
      </div>

      {/* ── Tab switcher ── */}
      <div className="ag-tabs" role="tablist" aria-label="Authentication mode">
        <button
          id="tab-login"
          role="tab"
          aria-selected={tab === "login"}
          aria-controls="view-login"
          className="ag-tab"
          type="button"
          onClick={() => switchTab("login")}
        >
          Log In
        </button>
        <button
          id="tab-signup"
          role="tab"
          aria-selected={tab === "signup"}
          aria-controls="view-signup"
          className="ag-tab"
          type="button"
          onClick={() => switchTab("signup")}
        >
          Sign Up
        </button>
      </div>

      {/* ════════ LOG IN VIEW ════════ */}
      <div
        id="view-login"
        role="tabpanel"
        aria-labelledby="tab-login"
        className="ag-view"
        data-active={String(tab === "login")}
      >
        <form onSubmit={handleLogin} noValidate>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Email */}
            <div className="ag-field">
              <label htmlFor="login-email" className="ag-label">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="ag-input"
                placeholder="you@example.com"
                autoComplete="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="ag-field">
              <label htmlFor="login-password" className="ag-label">
                Password
                <a href="#" className="ag-forgot" id="forgot-link" tabIndex={0}>
                  Forgot password?
                </a>
              </label>
              <input
                id="login-password"
                type="password"
                className="ag-input"
                placeholder="••••••••••••"
                autoComplete="current-password"
                value={loginPw}
                onChange={e => setLoginPw(e.target.value)}
                required
              />
            </div>

            {/* Message */}
            {loginMsg && (
              <div
                className={`ag-msg ag-msg--${loginMsg.kind}`}
                data-visible="true"
                role="status"
                aria-live="polite"
              >
                {loginMsg.text}
              </div>
            )}

            {/* Submit */}
            <button
              id="btn-login-submit"
              type="submit"
              className="ag-btn-submit"
              disabled={loginBusy}
            >
              {loginBusy ? "Verifying…" : "Log In"}
            </button>

          </div>
        </form>
      </div>

      {/* ════════ SIGN UP VIEW ════════ */}
      <div
        id="view-signup"
        role="tabpanel"
        aria-labelledby="tab-signup"
        className="ag-view"
        data-active={String(tab === "signup")}
      >
        <form onSubmit={handleSignup} noValidate>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Full name */}
            <div className="ag-field">
              <label htmlFor="signup-name" className="ag-label">Full Name</label>
              <input
                id="signup-name"
                type="text"
                className="ag-input"
                placeholder="Ada Lovelace"
                autoComplete="name"
                value={signupName}
                onChange={e => setSignupName(e.target.value)}
                required
              />
            </div>

            {/* Email */}
            <div className="ag-field">
              <label htmlFor="signup-email" className="ag-label">Email Address</label>
              <input
                id="signup-email"
                type="email"
                className="ag-input"
                placeholder="you@example.com"
                autoComplete="email"
                value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                required
              />
            </div>

            {/* Password + strength meter */}
            <div className="ag-field">
              <label htmlFor="signup-password" className="ag-label">Password</label>
              <input
                id="signup-password"
                type="password"
                className="ag-input"
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                value={signupPw}
                onChange={e => setSignupPw(e.target.value)}
                required
              />
              {signupPw && (
                <div className="ag-pw-row" data-strength={String(pw.score)}>
                  <div className="ag-pw-bar" />
                  <div className="ag-pw-bar" />
                  <div className="ag-pw-bar" />
                  <div className="ag-pw-bar" />
                  <span className="ag-pw-label">{pw.label}</span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="ag-divider">
              <span className="ag-divider-text">Access Token File — Optional</span>
            </div>

            {/* ─── Drag & Drop Zone ─── */}
            <div
              id="drop-zone"
              className={`ag-dropzone${isOver ? " is-over" : ""}${isAccepted ? " is-accepted" : ""}`}
              onDragOver={onDragOver}
              onDragEnter={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Drag and drop your access token file here, or click to browse"
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click() } }}
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".token,.json,.key,.pem,.txt"
                className="ag-dz-file-input"
                onChange={onFileInput}
                aria-hidden="true"
                tabIndex={-1}
              />

              {/* Icon */}
              <div className="ag-dz-icon" aria-hidden="true">
                {isAccepted ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                  </svg>
                ) : isOver ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                )}
              </div>

              {isAccepted ? (
                <>
                  <p className="ag-dz-title" style={{ color: "var(--clr-success)" }}>
                    Token file attached
                  </p>
                  <p className="ag-dz-filename">
                    ✓ &nbsp;{tokenFile!.name} &nbsp;({fmtBytes(tokenFile!.size)})
                  </p>
                  <button
                    type="button"
                    style={{
                      background: "var(--clr-surface-3)",
                      color: "var(--txt-secondary)",
                      border: "1px solid var(--clr-border)",
                      borderRadius: "var(--r-xs)",
                      padding: "4px 12px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      marginTop: 2,
                    }}
                    onClick={clearFile}
                    aria-label="Remove file"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <p className="ag-dz-title">
                    {isOver ? "Release to drop" : "Drag & Drop your Token File here"}
                  </p>
                  <p className="ag-dz-hint">
                    {isOver
                      ? "File will be attached automatically"
                      : "or click to browse — .token · .json · .key · .pem"}
                  </p>
                </>
              )}
            </div>

            {/* Drop error */}
            {dropError && (
              <p role="alert" style={{ fontSize: "0.75rem", color: "var(--clr-error)", marginTop: -6 }}>
                {dropError}
              </p>
            )}

            {/* Message */}
            {signupMsg && (
              <div
                className={`ag-msg ag-msg--${signupMsg.kind}`}
                data-visible="true"
                role="status"
                aria-live="polite"
              >
                {signupMsg.text}
              </div>
            )}

            {/* Submit */}
            <button
              id="btn-signup-submit"
              type="submit"
              className="ag-btn-submit"
              disabled={signupBusy}
            >
              {signupBusy ? "Creating Account…" : "Create Account"}
            </button>

          </div>
        </form>
      </div>
    </div>
  )
}
