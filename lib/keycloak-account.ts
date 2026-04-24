const ISSUER = process.env.AUTH_KEYCLOAK_ISSUER!

async function accountFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${token}`)
  headers.set("Accept", "application/json")
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const res = await fetch(`${ISSUER}/account${path}`, { ...init, cache: "no-store", headers })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let message = `${res.status}`
    try { message = (JSON.parse(text) as { errorMessage?: string }).errorMessage ?? message } catch {}
    throw new Error(message)
  }
  return res
}

export interface AccountProfile {
  username: string
  email: string
  firstName: string
  lastName: string
}

export interface Credential {
  id?: string
  type: string
  category: string
  displayName: string
  helptext?: string
  createAction?: string
  updateAction?: string
  removeable?: boolean
  userCredentialMetadatas?: { credential: { userLabel?: string } }[]
}

export interface SessionEntry {
  id: string
  ipAddress: string
  started: number
  lastAccess: number
  expires: number
  clients: Record<string, string>
  current?: boolean
}

export interface DeviceSession {
  device: string
  os?: string
  osVersion?: string
  browser?: string
  mobile?: boolean
  current?: boolean
  sessions: SessionEntry[]
}

export interface LinkedAccount {
  connected: boolean
  social: boolean
  providerAlias: string
  providerName: string
  displayName?: string
  linkedUsername?: string
}

export const keycloakAccount = {
  getProfile: (token: string) =>
    accountFetch("", token).then((r) => r.json() as Promise<AccountProfile>),

  updateProfile: (token: string, body: Partial<Pick<AccountProfile, "firstName" | "lastName">>) =>
    accountFetch("", token, { method: "POST", body: JSON.stringify(body) }),

  getCredentials: (token: string) =>
    accountFetch("/credentials", token).then((r) => r.json() as Promise<Credential[]>),

  changePassword: (token: string, body: { currentPassword: string; newPassword: string; confirmation: string }) =>
    accountFetch("/credentials/password", token, { method: "POST", body: JSON.stringify(body) }),

  getSessions: (token: string) =>
    accountFetch("/sessions/devices", token).then((r) => r.json() as Promise<DeviceSession[]>),

  deleteSession: (token: string, sessionId: string) =>
    accountFetch(`/sessions/${sessionId}`, token, { method: "DELETE" }),

  getLinkedAccounts: (token: string) =>
    accountFetch("/linked-accounts", token).then((r) => r.json() as Promise<LinkedAccount[]>),
}
