export type FirmwareTemplateId = "rgb_led" | "relay_single" | "relay_4ch_gpio" | "env_sensor" | "smart_plug"

export interface FlashConfig {
  wifiSsid: string
  wifiPassword: string
  mqttBrokerUri: string
  deviceId: string
  templateId: FirmwareTemplateId
  templateMode: number
  relayPins: [number, number, number, number]
  relayActiveLowMask: number
}

export const PATCH_SIGNATURE = "SOLCFGv2::ESP32"
export const PATCH_SIGNATURE_V1 = "SOLCFGv1::ESP32"
export const PATCH_SIGNATURE_FIELD_SIZE = 16

export const SLOT_MAP = {
  wifiSsid: { fieldSize: 33, maxLength: 32, label: "Wi-Fi SSID" },
  wifiPassword: { fieldSize: 65, maxLength: 64, label: "Wi-Fi password" },
  mqttBrokerUri: { fieldSize: 129, maxLength: 128, label: "MQTT broker URI" },
  deviceId: { fieldSize: 33, maxLength: 32, label: "Device ID" },
  templateId: { fieldSize: 33, maxLength: 32, label: "Template ID" },
} as const

export const PATCH_BLOB_SIZE =
  PATCH_SIGNATURE_FIELD_SIZE +
  SLOT_MAP.wifiSsid.fieldSize +
  SLOT_MAP.wifiPassword.fieldSize +
  SLOT_MAP.mqttBrokerUri.fieldSize +
  SLOT_MAP.deviceId.fieldSize +
  SLOT_MAP.templateId.fieldSize +
  1 +
  4 +
  1 +
  10

export const FIELD_OFFSETS = {
  wifiSsid: PATCH_SIGNATURE_FIELD_SIZE,
  wifiPassword: PATCH_SIGNATURE_FIELD_SIZE + SLOT_MAP.wifiSsid.fieldSize,
  mqttBrokerUri: PATCH_SIGNATURE_FIELD_SIZE + SLOT_MAP.wifiSsid.fieldSize + SLOT_MAP.wifiPassword.fieldSize,
  deviceId:
    PATCH_SIGNATURE_FIELD_SIZE +
    SLOT_MAP.wifiSsid.fieldSize +
    SLOT_MAP.wifiPassword.fieldSize +
    SLOT_MAP.mqttBrokerUri.fieldSize,
  templateId:
    PATCH_SIGNATURE_FIELD_SIZE +
    SLOT_MAP.wifiSsid.fieldSize +
    SLOT_MAP.wifiPassword.fieldSize +
    SLOT_MAP.mqttBrokerUri.fieldSize +
    SLOT_MAP.deviceId.fieldSize,
  templateMode:
    PATCH_SIGNATURE_FIELD_SIZE +
    SLOT_MAP.wifiSsid.fieldSize +
    SLOT_MAP.wifiPassword.fieldSize +
    SLOT_MAP.mqttBrokerUri.fieldSize +
    SLOT_MAP.deviceId.fieldSize +
    SLOT_MAP.templateId.fieldSize,
  relayPins:
    PATCH_SIGNATURE_FIELD_SIZE +
    SLOT_MAP.wifiSsid.fieldSize +
    SLOT_MAP.wifiPassword.fieldSize +
    SLOT_MAP.mqttBrokerUri.fieldSize +
    SLOT_MAP.deviceId.fieldSize +
    SLOT_MAP.templateId.fieldSize +
    1,
  relayActiveLowMask:
    PATCH_SIGNATURE_FIELD_SIZE +
    SLOT_MAP.wifiSsid.fieldSize +
    SLOT_MAP.wifiPassword.fieldSize +
    SLOT_MAP.mqttBrokerUri.fieldSize +
    SLOT_MAP.deviceId.fieldSize +
    SLOT_MAP.templateId.fieldSize +
    1 +
    4,
} as const

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

function alignUp(value: number, alignment: number): number {
  return (value + alignment - 1) & ~(alignment - 1)
}

function findSignatureOffset(bytes: Uint8Array, signature: string, expectPostZeroBytes = 12): number {
  const encoder = new TextEncoder()
  const signatureBytes = encoder.encode(signature)
  const maxStart = bytes.length - PATCH_SIGNATURE_FIELD_SIZE

  for (let i = 0; i <= maxStart; i++) {
    let matched = true
    for (let j = 0; j < signatureBytes.length; j++) {
      if (bytes[i + j] !== signatureBytes[j]) {
        matched = false
        break
      }
    }

    if (!matched || bytes[i + signatureBytes.length] !== 0) {
      continue
    }

    for (let j = 0; j < expectPostZeroBytes; j++) {
      if (bytes[i + PATCH_SIGNATURE_FIELD_SIZE + j] !== 0) {
        matched = false
        break
      }
    }

    if (matched) {
      return i
    }
  }

  return -1
}

export function recomputeEspImageChecksum(bytes: Uint8Array): void {
  const ESP_IMAGE_MAGIC = 0xe9
  const ESP_IMAGE_HEADER_SIZE = 24
  const ESP_IMAGE_SEGMENT_HEADER_SIZE = 8
  const ESP_CHECKSUM_MAGIC = 0xef

  if (bytes.length < ESP_IMAGE_HEADER_SIZE || bytes[0] !== ESP_IMAGE_MAGIC) {
    throw new Error("Patched firmware is not a valid ESP image (bad magic).")
  }

  const segmentCount = bytes[1]
  let pos = ESP_IMAGE_HEADER_SIZE
  let checksum = ESP_CHECKSUM_MAGIC

  for (let i = 0; i < segmentCount; i++) {
    if (pos + ESP_IMAGE_SEGMENT_HEADER_SIZE > bytes.length) {
      throw new Error("ESP image is truncated before segment header.")
    }

    const dataLength = readUInt32LE(bytes, pos + 4)
    const dataStart = pos + ESP_IMAGE_SEGMENT_HEADER_SIZE
    const dataEnd = dataStart + dataLength

    if (dataEnd > bytes.length) {
      throw new Error("ESP image is truncated inside segment data.")
    }

    for (let j = dataStart; j < dataEnd; j++) {
      checksum ^= bytes[j]
    }

    pos = dataEnd
  }

  const checksumOffset = alignUp(pos + 1, 16) - 1
  if (checksumOffset >= bytes.length) {
    throw new Error("ESP image is truncated before checksum byte.")
  }

  bytes[checksumOffset] = checksum
}

export function findConfigBlobOffset(bytes: Uint8Array): number {
  const v2 = findSignatureOffset(bytes, PATCH_SIGNATURE, 12)
  if (v2 >= 0) return v2
  const v1 = findSignatureOffset(bytes, PATCH_SIGNATURE_V1, 12)
  if (v1 >= 0) return v1
  return -1
}

function writeStringField(
  bytes: Uint8Array,
  blobOffset: number,
  fieldOffset: number,
  fieldSize: number,
  label: string,
  maxLength: number,
  value: string,
  encoder: TextEncoder,
): void {
  const valueBytes = encoder.encode(value)
  if (valueBytes.length > maxLength) {
    throw new Error(`${label} exceeds ${maxLength} bytes (UTF-8).`)
  }
  const start = blobOffset + fieldOffset
  bytes.fill(0, start, start + fieldSize)
  bytes.set(valueBytes, start)
}

export async function patchFirmware(bytes: Uint8Array, config: FlashConfig): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const blobOffset = findConfigBlobOffset(bytes)
  if (blobOffset < 0) {
    throw new Error("Firmware is missing runtime config blob. Build firmware first.")
  }
  if (blobOffset + PATCH_BLOB_SIZE > bytes.length) {
    throw new Error("Firmware runtime config blob is smaller than expected for v2 template mode.")
  }

  const signatureBytes = encoder.encode(PATCH_SIGNATURE)
  bytes.fill(0, blobOffset, blobOffset + PATCH_SIGNATURE_FIELD_SIZE)
  bytes.set(signatureBytes, blobOffset)

  writeStringField(bytes, blobOffset, FIELD_OFFSETS.wifiSsid, SLOT_MAP.wifiSsid.fieldSize, SLOT_MAP.wifiSsid.label, SLOT_MAP.wifiSsid.maxLength, config.wifiSsid, encoder)
  writeStringField(bytes, blobOffset, FIELD_OFFSETS.wifiPassword, SLOT_MAP.wifiPassword.fieldSize, SLOT_MAP.wifiPassword.label, SLOT_MAP.wifiPassword.maxLength, config.wifiPassword, encoder)
  writeStringField(bytes, blobOffset, FIELD_OFFSETS.mqttBrokerUri, SLOT_MAP.mqttBrokerUri.fieldSize, SLOT_MAP.mqttBrokerUri.label, SLOT_MAP.mqttBrokerUri.maxLength, config.mqttBrokerUri, encoder)
  writeStringField(bytes, blobOffset, FIELD_OFFSETS.deviceId, SLOT_MAP.deviceId.fieldSize, SLOT_MAP.deviceId.label, SLOT_MAP.deviceId.maxLength, config.deviceId, encoder)
  writeStringField(bytes, blobOffset, FIELD_OFFSETS.templateId, SLOT_MAP.templateId.fieldSize, SLOT_MAP.templateId.label, SLOT_MAP.templateId.maxLength, config.templateId, encoder)

  const templateMode = Number(config.templateMode)
  if (!Number.isInteger(templateMode) || templateMode < 0 || templateMode > 255) {
    throw new Error("Template mode must be an integer between 0 and 255.")
  }
  bytes[blobOffset + FIELD_OFFSETS.templateMode] = templateMode

  if (!Array.isArray(config.relayPins) || config.relayPins.length !== 4) {
    throw new Error("relayPins must include exactly 4 entries.")
  }
  for (let i = 0; i < 4; i++) {
    const pin = Number(config.relayPins[i])
    if (!Number.isInteger(pin) || pin < 0 || pin > 255) {
      throw new Error(`Relay pin at channel ${i + 1} must be an integer between 0 and 255.`)
    }
    bytes[blobOffset + FIELD_OFFSETS.relayPins + i] = pin
  }

  const activeLowMask = Number(config.relayActiveLowMask)
  if (!Number.isInteger(activeLowMask) || activeLowMask < 0 || activeLowMask > 255) {
    throw new Error("Relay active-low mask must be an integer between 0 and 255.")
  }
  bytes[blobOffset + FIELD_OFFSETS.relayActiveLowMask] = activeLowMask
  bytes.fill(0, blobOffset + FIELD_OFFSETS.relayActiveLowMask + 1, blobOffset + PATCH_BLOB_SIZE)

  recomputeEspImageChecksum(bytes)

  if (bytes[23] === 1) {
    const hashBuf = await crypto.subtle.digest("SHA-256", bytes.slice(0, bytes.length - 32))
    bytes.set(new Uint8Array(hashBuf), bytes.length - 32)
  }

  return bytes
}
