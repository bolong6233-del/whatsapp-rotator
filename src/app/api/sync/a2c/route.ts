/**
 * ==============================================================
 * ⚠️ 工单平台隔离原则（接入新云控时必读，不允许违反）
 * --------------------------------------------------------------
 * 1. 每个云控平台（星河云控 / A2C云控 / 海王云控 / 未来新增的）
 *    都是【完全独立】的代码分支，互不依赖、互不共用函数。
 *
 * 2. 维护或新增功能时只允许 **添加** 自己平台的逻辑：
 *      if (order.ticket_type === '<新云控名>') { ... }
 *    严禁修改、重构、抽取其他云控的代码——即便它们看起来"一模一样"。
 *
 * 3. 任何"为了减少重复"的提取/合并函数都视为违规。重复就是隔离的代价。
 *
 * 4. 业务规则速查（所有平台共有的字段语义）：
 *    - work_orders.total_quantity   = 当日进线目标，达到则工单 status=completed
 *    - work_orders.download_ratio   = 单号码当日进线上限，达到则该号码 is_active=false
 *                                     云控次日 day_sum 归零后该号码自动恢复 is_active=true
 *                                     0 表示不限制
 *    - work_orders.status='completed' → 后端 PUT 路由会停用该工单全部号码（按 label 匹配）
 *    - whatsapp_numbers.label = work_orders.ticket_name（工单 ↔ 号码 关联键，不要改）
 *
 * 5. 同步流程时序（不要打乱）：
 *      a) 拉取上游数据
 *      b) INSERT 新号码到 whatsapp_numbers（先入库，后续才能按 label 停用）
 *      c) 按 download_ratio 调整 is_active
 *      d) PUT /api/work-orders/[id] 持久化 sync_* 字段，必要时 status=completed
 *         （后端 PUT 检测到 completed 会按 label 停用全部号码）
 *
 * 6. 当前各平台支持矩阵（更新到 2026-04）：
 *    | 平台      | 同步 | total_quantity 自动完成 | download_ratio 自动停号 |
 *    |-----------|------|------------------------|------------------------|
 *    | 星河云控  |  ✅  |          ✅            |          ✅            |
 *    | 海王云控  |  ✅  |          ✅            |          ✅            |
 *    | A2C云控   |  ❌  |          ❌            |          ❌            |
 * ==============================================================
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
