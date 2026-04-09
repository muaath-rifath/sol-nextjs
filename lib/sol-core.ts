import { auth } from "@/auth"

const SOL_CORE_URL = process.env.SOL_CORE_URL!

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue
    }
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ""
}

async function getErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) {
    return `${response.status} ${response.statusText}`
  }
  try {
    const parsed = JSON.parse(text) as { error?: string }
    if (parsed.error) {
      return parsed.error
    }
  } catch {
    // Keep original text fallback.
  }
  return text
}

async function solFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await auth()
  if (!session?.accessToken) {
    throw new Error("No active session")
  }

  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  headers.set("Authorization", `Bearer ${session.accessToken}`)

  const response = await fetch(`${SOL_CORE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }
  return response
}

async function solPublicFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${SOL_CORE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }
  return response
}

async function jsonOrNull<T>(response: Response): Promise<T | null> {
  if (response.status === 204) {
    return null
  }
  return (await response.json()) as T
}

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired"
export type MemberRole = "owner" | "admin" | "member"

export interface CursorResponse<T> {
  data: T[]
  next_cursor: string | null
  has_more: boolean
}

export interface Home {
  id: string
  name: string
  owner_id: string
  my_role?: MemberRole
  member_count?: number
  created_at: string
  updated_at: string
}

export interface HomeMember {
  home_id: string
  user_id: string
  role: MemberRole
  invited_by: string | null
  joined_at: string
  user_email: string
  user_name: string
}

export interface HomeInvitation {
  id: string
  home_id: string
  inviter_id: string
  invitee_email: string
  invitee_is_user: boolean
  token?: string
  status: InvitationStatus
  expires_at: string
  created_at: string
}

export interface InvitationDetail {
  id: string
  home_id: string
  home_name: string
  inviter_id: string
  inviter_name: string
  invitee_email: string
  invitee_is_user: boolean
  status: InvitationStatus
  expires_at: string
  created_at: string
}

export const solCore = {
  homes: {
    list: (params?: { cursor?: string; limit?: number }) =>
      solFetch(`/api/v1/homes${buildQuery(params ?? {})}`).then((r) =>
        r.json() as Promise<CursorResponse<Home>>,
      ),
    get: (id: string) =>
      solFetch(`/api/v1/homes/${id}`).then((r) => r.json() as Promise<Home>),
    create: (body: { name: string }) =>
      solFetch("/api/v1/homes", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<Home>),
    listMembers: (id: string, params?: { cursor?: string; limit?: number }) =>
      solFetch(`/api/v1/homes/${id}/members${buildQuery(params ?? {})}`).then((r) =>
        r.json() as Promise<CursorResponse<HomeMember>>,
      ),
    inviteByEmail: (id: string, body: { email: string }) =>
      solFetch(`/api/v1/homes/${id}/invitations`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<HomeInvitation>),
    listInvitations: (
      id: string,
      params?: { status?: InvitationStatus; cursor?: string; limit?: number },
    ) =>
      solFetch(`/api/v1/homes/${id}/invitations${buildQuery(params ?? {})}`).then((r) =>
        r.json() as Promise<CursorResponse<HomeInvitation>>,
      ),
    cancelInvitation: (homeID: string, invitationID: string) =>
      solFetch(`/api/v1/homes/${homeID}/invitations/${invitationID}`, {
        method: "DELETE",
      }).then((r) => jsonOrNull(r)),
    transferOwnership: (homeID: string, userID: string) =>
      solFetch(`/api/v1/homes/${homeID}/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ user_id: userID }),
      }).then((r) => jsonOrNull(r)),
  },

  invitations: {
    getPublic: (token: string) =>
      solPublicFetch(`/api/v1/invitations/${token}`).then((r) =>
        r.json() as Promise<InvitationDetail>,
      ),
    accept: (token: string) =>
      solFetch(`/api/v1/invitations/${token}/accept`, {
        method: "POST",
      }).then((r) => r.json() as Promise<Home>),
    declinePublic: (token: string) =>
      solPublicFetch(`/api/v1/invitations/${token}/decline`, {
        method: "POST",
      }).then((r) => jsonOrNull(r)),
  },

  devices: {
    list: () => solFetch("/api/v1/devices").then((r) => r.json()),
    get: (id: string) => solFetch(`/api/v1/devices/${id}`).then((r) => r.json()),
    create: (body: unknown) =>
      solFetch("/api/v1/devices", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    update: (id: string, body: unknown) =>
      solFetch(`/api/v1/devices/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    delete: (id: string) => solFetch(`/api/v1/devices/${id}`, { method: "DELETE" }),
    command: (id: string, body: unknown) =>
      solFetch(`/api/v1/devices/${id}/command`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
  },

  automations: {
    list: () => solFetch("/api/v1/automations").then((r) => r.json()),
    get: (id: string) => solFetch(`/api/v1/automations/${id}`).then((r) => r.json()),
    create: (body: unknown) =>
      solFetch("/api/v1/automations", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    update: (id: string, body: unknown) =>
      solFetch(`/api/v1/automations/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    delete: (id: string) =>
      solFetch(`/api/v1/automations/${id}`, { method: "DELETE" }),
  },

  firmware: {
    list: () => solFetch("/api/v1/firmware").then((r) => r.json()),
    upload: (formData: FormData) =>
      solFetch("/api/v1/firmware/upload", {
        method: "POST",
        body: formData,
      }).then((r) => r.json()),
  },
}
