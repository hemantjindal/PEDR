import { canStoreSecrets } from '../secrets'
import { google } from './google'
import { microsoft } from './microsoft'
import type { Provider, ProviderId } from './types'

export { ProviderError } from './types'
export type { Provider, ProviderId } from './types'

/** Microsoft first: it is what UK practice actually runs on. */
export const PROVIDERS: Provider[] = [microsoft, google]

export function getProvider(id: string): Provider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

/**
 * The ones this deployment can actually offer.
 *
 * A provider needs client credentials, and the whole feature needs an
 * encryption key — without one there is nowhere safe to put a refresh token, so
 * the honest answer is to offer nothing rather than store a live credential in
 * plain text.
 */
export function availableProviders(): Provider[] {
  if (!canStoreSecrets()) return []
  return PROVIDERS.filter((p) => p.configured())
}

export function connectorsAvailable(): boolean {
  return availableProviders().length > 0
}

/**
 * Why there is nothing to connect to, in words worth showing somebody.
 * Null when connecting is available.
 */
export function unavailableReason(): string | null {
  if (connectorsAvailable()) return null
  if (!canStoreSecrets()) {
    return 'Connecting an account is switched off on this deployment: there is no encryption key set, and calendar credentials are not stored without one.'
  }
  return 'Connecting an account is not set up on this deployment yet.'
}

export function isProviderId(value: string): value is ProviderId {
  return PROVIDERS.some((p) => p.id === value)
}
