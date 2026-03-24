/**
 * src/lib/idempotency.ts
 *
 * Server-side idempotency helper for create-type API routes.
 *
 * Why this exists:
 *   When a user clicks "Submit" multiple times (UI glitch, network retry, browser
 *   back-button double-POST), the backend receives duplicate requests. Without
 *   idempotency, each request creates a new record. This module intercepts the
 *   second (and subsequent) requests and returns the cached result from the first
 *   successful execution instead of re-running the business logic.
 *
 * Usage (in an API route POST handler):
 *   1. Call `checkIdempotency(request, user.id, endpoint)`.
 *   2. If it returns `{ reply }`, return that reply immediately (cache hit).
 *   3. Otherwise proceed with the business logic.
 *   4. On success call `markIdempotencySucceeded(key, responseStatus, responseBody, ...)`.
 *   5. On failure call `markIdempotencyFailed(key)`.
 *
 * The Idempotency-Key header must be supplied by the client (a UUID generated
 * per-form-session). Requests without the header bypass idempotency entirely
 * and fall through to the DB unique-constraint safety net (Layer 3).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import crypto from 'crypto'

export interface IdempotencyCheckResult {
  /** When set, the route MUST return this response immediately (cache hit). */
  reply?: NextResponse
  /** The idempotency record id – needed to call markSucceeded/markFailed. */
  recordId?: string
  /** The raw Idempotency-Key value (for logging / passing to mark helpers). */
  key?: string
}

/**
 * Compute a stable SHA-256 hash of a request body object.
 * Keys are sorted recursively so the hash is independent of property insertion
 * order, enabling mismatch detection for "same key, different payload" reuse.
 */
function hashBody(body: unknown): string {
  // Guard against null / primitives (unlikely but safe to handle)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return crypto.createHash('sha256').update(String(body ?? '')).digest('hex')
  }
  // Recursively sort object keys for a stable canonical representation.
  function sortedReplacer(_key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value as object)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (value as Record<string, unknown>)[k]
          return acc
        }, {})
    }
    return value
  }
  const str = JSON.stringify(body, sortedReplacer)
  return crypto.createHash('sha256').update(str).digest('hex')
}

/**
 * Check whether this request should be short-circuited via idempotency.
 *
 * Returns:
 *  - `{ reply }` if a cached response should be returned (caller must return it).
 *  - `{ recordId, key }` if a new idempotency record was inserted (caller must
 *    call markSucceeded/markFailed when the business logic completes).
 *  - `{}` if no Idempotency-Key was provided (caller continues normally).
 */
export async function checkIdempotency(
  request: NextRequest,
  userId: string,
  endpoint: string,
  body: unknown,
): Promise<IdempotencyCheckResult> {
  const idempotencyKey = request.headers.get('Idempotency-Key')
  if (!idempotencyKey) {
    // No key supplied – skip idempotency, rely on DB constraints only.
    return {}
  }

  const supabase = createAdminClient()
  const requestHash = hashBody(body)

  // Check for an existing record with this (user, endpoint, key) tuple.
  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('id, request_hash, status, response_status, response_body')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .eq('idempotency_key', idempotencyKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) {
    // Key reuse with a different payload – this is a client bug; reject it.
    if (existing.request_hash !== requestHash) {
      return {
        reply: NextResponse.json(
          { error: '幂等键冲突：相同 Idempotency-Key 不能用于不同的请求体，请生成新的 key 后重试' },
          { status: 409 },
        ),
      }
    }

    // A concurrent request is already processing; tell the client to retry later.
    if (existing.status === 'processing') {
      return {
        reply: NextResponse.json(
          { error: '检测到重复提交，请稍后重试' },
          { status: 409 },
        ),
      }
    }

    // Previous attempt failed – allow a retry (return no reply so caller can re-run).
    if (existing.status === 'failed') {
      // Reset to processing so a new attempt can proceed.
      await supabase
        .from('idempotency_keys')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      return { recordId: existing.id, key: idempotencyKey }
    }

    // Previous attempt succeeded – return the cached response.
    return {
      reply: NextResponse.json(
        existing.response_body,
        { status: existing.response_status ?? 200 },
      ),
    }
  }

  // First time we see this key – insert a "processing" placeholder atomically.
  const { data: inserted, error: insertError } = await supabase
    .from('idempotency_keys')
    .insert({
      user_id: userId,
      endpoint,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      status: 'processing',
    })
    .select('id')
    .single()

  if (insertError) {
    // Race condition: another process inserted the same key between our SELECT and INSERT.
    // Re-read and handle identically to the "existing" branch above.
    const { data: raceRow } = await supabase
      .from('idempotency_keys')
      .select('id, request_hash, status, response_status, response_body')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (raceRow?.status === 'succeeded') {
      return {
        reply: NextResponse.json(
          raceRow.response_body,
          { status: raceRow.response_status ?? 200 },
        ),
      }
    }
    return {
      reply: NextResponse.json(
        { error: '检测到重复提交，请稍后重试' },
        { status: 409 },
      ),
    }
  }

  return { recordId: inserted.id, key: idempotencyKey }
}

/**
 * Mark an idempotency record as succeeded and cache the response body.
 * Call this after the business logic has completed successfully.
 */
export async function markIdempotencySucceeded(
  recordId: string,
  responseStatus: number,
  responseBody: unknown,
  resourceType?: string,
  resourceId?: string,
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('idempotency_keys')
    .update({
      status: 'succeeded',
      response_status: responseStatus,
      response_body: responseBody,
      resource_type: resourceType ?? null,
      resource_id: resourceId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId)
}

/**
 * Mark an idempotency record as failed.
 * Failed records allow a subsequent retry (same key can be re-used).
 */
export async function markIdempotencyFailed(recordId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('idempotency_keys')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordId)
}

/**
 * Map a Supabase/PostgreSQL error to a user-friendly 409 response for
 * unique-constraint violations (error code 23505).
 * Returns null if the error is not a unique-constraint violation.
 */
export function handleUniqueViolation(
  error: { code?: string; message?: string },
  messages: {
    default?: string
    [constraintHint: string]: string | undefined
  } = {},
): NextResponse | null {
  if (error.code !== '23505') return null

  const msg = error.message ?? ''
  // Match the constraint name from the Postgres error message.
  for (const [hint, friendlyMsg] of Object.entries(messages)) {
    if (hint !== 'default' && msg.includes(hint)) {
      return NextResponse.json({ error: friendlyMsg }, { status: 409 })
    }
  }
  return NextResponse.json(
    { error: messages.default ?? '检测到重复提交，请勿连续点击' },
    { status: 409 },
  )
}
