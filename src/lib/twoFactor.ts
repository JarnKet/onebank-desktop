/**
 * Identity verification, as b1hybrid's TWOFACTOR page performs it.
 *
 * The page runs `TWOFACTOR/enquiry` itself, offers the channels it is allowed
 * (secret questions, a registered fingerprint, a face scan) and closes with
 * what it verified. Its result shape is b1hybrid's — see
 * `b1hybrid/src/TWOFACTOR/definitions.ts`; do not change it here.
 *
 * In a browser only the question channel is reliable: the bridge answers
 * `isBiometricSupported` with 0, so the page hides the fingerprint button, and
 * the face scan needs a `facerequesttoken` from the core.
 */

import { showPopupForResult } from './utils/helper'

export interface TwoFactorResult {
  isVerified: boolean
  type: 'question' | 'biometric' | 'face'
  ticket: string | null
  answer1?: string
  answer2?: string
  answer3?: string
  biometricSignature?: string
  faceVerifiedToken?: string
}

/** What the core asks for alongside a command the user had to verify. */
export interface TwoFactorProof {
  ticket?: string
  biometric?: string
  faceverifiedtoken?: string
}

/** Null when the user backed out without verifying. */
export async function verifyIdentity(ticket?: string): Promise<TwoFactorResult | null> {
  const result = (await showPopupForResult('TWOFACTOR.html', ticket ? { ticket } : {})) as TwoFactorResult | null
  return result?.isVerified ? result : null
}

export function proofOf(verified: TwoFactorResult): TwoFactorProof {
  return {
    ticket: verified.ticket ?? undefined,
    biometric: verified.biometricSignature,
    faceverifiedtoken: verified.faceVerifiedToken,
  }
}
