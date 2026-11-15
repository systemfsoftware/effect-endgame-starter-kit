const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

export const newId = (): string => crypto.randomUUID()

export const newCredential = (): string => base64Url(crypto.getRandomValues(new Uint8Array(32)))
