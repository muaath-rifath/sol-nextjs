"use client"

import { useRef, useState } from "react"

interface LoginPanelProps {
  /** The Server Action to call when the admin SSO button is clicked */
  adminSignInAction: () => Promise<never>
}

export default function LoginPanel({ adminSignInAction }: LoginPanelProps) {
  const [activeTab, setActiveTab] = useState<"admin" | "member">("admin")
  const [isDragOver, setIsDragOver] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Drag handlers ────────────────────────────── */
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    setFileError(null)

    const file = e.dataTransfer.files[0]
    if (!file) return

    // Validate: only accept .invite / .json / .key files
    const allowed = [".invite", ".json", ".key"]
    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    if (!allowed.includes(ext)) {
      setFileError("Invalid file type. Please drop a valid invitation file (.invite, .json, .key).")
      return
    }
    setDroppedFile(file)
  }

  function handleBrowse() {
    fileInputRef.current?.click()
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    setDroppedFile(file)
  }

  function handleClearFile() {
    setDroppedFile(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="login-panel-card">
      {/* ── Floating orbs ── */}
      <div className="panel-orb panel-orb--cyan" aria-hidden="true" />
      <div className="panel-orb panel-orb--purple" aria-hidden="true" />

      {/* ── Panel Header ── */}
      <div className="panel-header">
        <div className="panel-icon-ring">
          <svg viewBox="0 0 24 24" fill="none" className="panel-icon" aria-hidden="true">
            <path
              d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
              stroke="#00d4ff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M9 22V12h6v10" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="panel-title">System Access</h2>
        <p className="panel-subtitle">AI &amp; IoT Home Automation Platform</p>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="tab-switcher" role="tablist" aria-label="Login mode">
        <button
          id="tab-admin"
          role="tab"
          aria-selected={activeTab === "admin"}
          aria-controls="panel-admin"
          className={`tab-btn ${activeTab === "admin" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("admin")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="tab-icon" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          Admin Access
        </button>
        <button
          id="tab-member"
          role="tab"
          aria-selected={activeTab === "member"}
          aria-controls="panel-member"
          className={`tab-btn ${activeTab === "member" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("member")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="tab-icon" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m-6.36 2.51 4.66-2.51m0 0v-3.03" />
          </svg>
          Invited Member
        </button>
      </div>

      {/* ─────────────── ADMIN TAB ─────────────── */}
      <div
        id="panel-admin"
        role="tabpanel"
        aria-labelledby="tab-admin"
        className={`tab-panel ${activeTab === "admin" ? "tab-panel--visible" : "tab-panel--hidden"}`}
      >
        {/* SSO Sign-in Form (Server Action via hidden form) */}
        <form action={adminSignInAction}>
          <button
            id="admin-sso-btn"
            type="submit"
            className="glow-btn w-full"
            style={{ height: "3.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", fontSize: "1rem" }}
          >
            {/* Keycloak icon */}
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20, flexShrink: 0 }} aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="4" fill="rgba(255,255,255,0.9)" />
            </svg>
            Sign In with SSO
          </button>
        </form>

        <div className="admin-info-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <p className="admin-info-text">
            Authentication is managed securely via your organisation&apos;s identity provider. Credentials are never stored by Sol.
          </p>
        </div>

        {/* Security badges */}
        <div className="security-badges">
          <div className="badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" style={{ width: 14, height: 14 }} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            <span>End-to-End Encrypted</span>
          </div>
          <div className="badge-divider" aria-hidden="true" />
          <div className="badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" style={{ width: 14, height: 14 }} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33" />
            </svg>
            <span>Zero-Knowledge Auth</span>
          </div>
          <div className="badge-divider" aria-hidden="true" />
          <div className="badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" style={{ width: 14, height: 14 }} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
            </svg>
            <span>SSO Verified</span>
          </div>
        </div>
      </div>

      {/* ─────────────── INVITED MEMBER TAB ─────────────── */}
      <div
        id="panel-member"
        role="tabpanel"
        aria-labelledby="tab-member"
        className={`tab-panel ${activeTab === "member" ? "tab-panel--visible" : "tab-panel--hidden"}`}
      >
        {/* Drop zone */}
        <div
          id="drop-zone"
          className={`drop-zone ${isDragOver ? "drop-zone--over" : ""} ${droppedFile ? "drop-zone--accepted" : ""}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowse}
          role="button"
          tabIndex={0}
          aria-label="Drag and drop your invitation file here, or click to browse"
          onKeyDown={(e) => e.key === "Enter" && handleBrowse()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".invite,.json,.key"
            style={{ display: "none" }}
            onChange={handleFileInput}
            aria-hidden="true"
          />

          {droppedFile ? (
            /* File accepted state */
            <div className="drop-accepted">
              <div className="drop-accepted-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" style={{ width: 28, height: 28 }} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="drop-accepted-name">{droppedFile.name}</p>
              <p className="drop-accepted-size">{(droppedFile.size / 1024).toFixed(1)} KB · Invitation file ready</p>
              <button
                type="button"
                className="drop-clear-btn"
                onClick={(e) => { e.stopPropagation(); handleClearFile() }}
                aria-label="Remove file"
              >
                Remove file
              </button>
            </div>
          ) : (
            /* Default / drag-over state */
            <div className="drop-idle">
              <div className={`drop-upload-icon ${isDragOver ? "drop-upload-icon--over" : ""}`}>
                {isDragOver ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="1.5" style={{ width: 32, height: 32 }} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 32, height: 32 }} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                )}
              </div>
              <p className="drop-main-text">
                {isDragOver ? "Release to drop your file" : "Drag & Drop your Invitation File here"}
              </p>
              <p className="drop-sub-text">or <span className="drop-browse-link">browse files</span></p>
              <p className="drop-hint">Accepted: .invite · .json · .key</p>
            </div>
          )}
        </div>

        {/* File error */}
        {fileError && (
          <p className="drop-error" role="alert">{fileError}</p>
        )}

        {/* Submit with file */}
        <button
          id="member-submit-btn"
          type="button"
          className={`glow-btn w-full member-submit-btn ${!droppedFile ? "glow-btn--disabled" : ""}`}
          disabled={!droppedFile}
          style={{ height: "3.5rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", fontSize: "1rem", marginTop: "1rem" }}
          aria-disabled={!droppedFile}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 18, height: 18 }} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          Verify Invitation Token
        </button>

        <p className="member-hint">
          Your invitation file contains a cryptographic token issued by the system administrator.
        </p>
      </div>
    </div>
  )
}
