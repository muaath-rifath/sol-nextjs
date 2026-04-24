"use server"

import { solCore, type Home } from "@/lib/sol-core"

export interface CreateRoomInput {
  homeId: string
  name: string
  floor?: number
}

export async function createHomeAction(name: string): Promise<Home> {
  return solCore.homes.create({ name })
}

export async function createRoomAction(input: CreateRoomInput) {
  return solCore.rooms.create(input.homeId, {
    name: input.name,
    floor: input.floor,
  })
}

export async function buildFirmwareAction(templateId: string, targetBoard: string) {
  return solCore.firmware.build(templateId, targetBoard)
}

export async function getFirmwareBuildStatusAction(buildId: string) {
  const build = await solCore.firmware.getBuild(buildId)
  // Prevent Next.js Server Action payload size limit crash (e.g. 1MB)
  // by truncating massive compiler logs.
  if (build.logs && build.logs.length > 100000) {
    build.logs =
      "...(earlier logs truncated for performance)...\n" +
      build.logs.slice(-100000)
  }
  return build
}
