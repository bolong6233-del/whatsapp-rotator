/**
 * ⚠️ A2C云控专用同步接口
 *
 * 本文件仅处理 A2C云控平台的数据同步逻辑。
 * 不要修改 src/app/api/sync/yunkon/route.ts（星河云控）的任何代码。
 *
 * TODO: 待填充 A2C 平台的 API 调用逻辑
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: NextRequest) {
  // 鉴权
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  // TODO: 实现 A2C云控的同步逻辑
  // 1. 从 request body 获取 ticket_link (将参数改为 request: NextRequest，然后 const body = await request.json())
  // 2. 调用 A2C 平台 API
  // 3. 解析返回数据
  // 4. 返回统一格式的响应

  return NextResponse.json({
    success: false,
    error: 'A2C云控同步接口尚未实现',
  }, { status: 501 })
}
