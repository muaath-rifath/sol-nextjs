import { auth } from "@/auth"

const SOL_CORE_URL = process.env.SOL_CORE_URL!

async function solFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await auth()

  if (!session?.accessToken) {
    throw new Error("No active session")
  }

  const response = await fetch(`${SOL_CORE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
      Authorization: `Bearer ${session.accessToken}`,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`sol-core ${response.status}: ${text}`)
  }

  return response
}

export const solCore = {
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
    delete: (id: string) =>
      solFetch(`/api/v1/devices/${id}`, { method: "DELETE" }),
    command: (id: string, body: unknown) =>
      solFetch(`/api/v1/devices/${id}/command`, {
        method: "POST",
        body: JSON.stringify(body),
      }).then((r) => r.json()),
  },

  automations: {
    list: () => solFetch("/api/v1/automations").then((r) => r.json()),
    get: (id: string) =>
      solFetch(`/api/v1/automations/${id}`).then((r) => r.json()),
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
    upload: (formData: FormData) => {
      // Remove Content-Type so fetch sets the multipart boundary automatically
      return solFetch("/api/v1/firmware/upload", {
        method: "POST",
        headers: {} as HeadersInit,
        body: formData,
      }).then((r) => r.json())
    },
  },
}
