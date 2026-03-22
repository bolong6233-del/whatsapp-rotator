import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/agents/[id]/links/[linkId]
// This endpoint has been retired; the admin_random_siphon toggle was removed from the UI.
export async function PATCH() {
  return NextResponse.json({ error: '该功能已停用' }, { status: 410 })
}
