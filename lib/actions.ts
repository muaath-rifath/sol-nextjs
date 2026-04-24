"use server"

import { solCore } from "@/lib/sol-core"

export async function getDeviceProvisioning(deviceId: string) {
  try {
    return await solCore.devices.provision(deviceId)
  } catch (error) {
    console.error("failed to get device provisioning", error)
    throw new Error(error instanceof Error ? error.message : "Failed to generate certificates")
  }
}
