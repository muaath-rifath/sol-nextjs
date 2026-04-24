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
