import { NextRequest, NextResponse } from 'next/server'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function POST(request: NextRequest) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    const body = await request.json()
    const { work_order_id } = body as { work_order_id?: string }

    if (!work_order_id) {
      return NextResponse.json(
        { success: false, error: 'work_order_id is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Dynamically import the admin client to avoid edge-runtime issues
    const { createAdminClient } = await import('@/lib/supabase-admin')
    const supabase = createAdminClient()

    // Fetch work order details
    const { data: workOrder, error: workOrderError } = await supabase
      .from('work_orders')
      .select('id, ticket_link, account, password, distribution_link_slug, ticket_name, number_type, total_quantity')
      .eq('id', work_order_id)
      .single()

    if (workOrderError || !workOrder) {
      return NextResponse.json(
        { success: false, error: '工单不存在' },
        { status: 404, headers: corsHeaders }
      )
    }

    if (!workOrder.ticket_link) {
      return NextResponse.json(
        { success: false, error: '工单链接未设置' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Launch headless browser
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })

    const page = await browser.newPage()

    // Navigate to ticket link
    await page.goto(workOrder.ticket_link, { waitUntil: 'networkidle2', timeout: 30000 })

    // If the page has a password input, fill it in and submit
    if (workOrder.password) {
      const passwordInput = await page.$('input[type="password"]').catch((err) => {
        console.warn('[a2c-server] Error querying password input:', err)
        return null
      })
      if (passwordInput) {
        await passwordInput.type(workOrder.password)
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch((err) => {
            console.warn('[a2c-server] Navigation after password submit did not complete:', err)
          }),
          passwordInput.press('Enter'),
        ])
      }
    }

    // Wait for the table rows to appear
    await page.waitForSelector('.el-table__body-wrapper table tbody tr', { timeout: 20000 })

    // Extract data via DOM script
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('.el-table__body-wrapper table tbody tr')
      const numbers: Array<{
        phone: string
        seat: string
        status: string
        stat_status: string
        day_done: number
        day_goal: number
        total_done: number
        total_goal: number
      }> = []

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td .cell')
        if (cells.length >= 6) {
          const dayParts = (cells[4]?.textContent?.trim() ?? '').split('/').map((s) => parseInt(s.trim()))
          const totalParts = (cells[5]?.textContent?.trim() ?? '').split('/').map((s) => parseInt(s.trim()))
          numbers.push({
            phone: cells[0]?.textContent?.trim() ?? '',
            seat: cells[1]?.textContent?.trim() ?? '',
            status: cells[2]?.textContent?.trim() ?? '',
            stat_status: cells[3]?.textContent?.trim() ?? '',
            day_done: dayParts[0] || 0,
            day_goal: dayParts[1] || 0,
            total_done: totalParts[0] || 0,
            total_goal: totalParts[1] || 0,
          })
        }
      })

      return {
        total_count: numbers.length,
        numbers,
        total_day_sum: numbers.reduce((s, n) => s + n.day_done, 0),
        total_sum: numbers.reduce((s, n) => s + n.total_done, 0),
        online_count: numbers.filter((n) => n.status === '有效').length,
        offline_count: numbers.filter((n) => n.status !== '有效').length,
      }
    })

    // Persist via the existing A2C sync endpoint
    const origin = request.nextUrl.origin
    const syncRes = await fetch(`${origin}/api/sync/a2c`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_order_id, ...data }),
    })

    const syncResult = await syncRes.json()

    if (!syncResult.success) {
      return NextResponse.json(
        { success: false, error: syncResult.error || '同步失败' },
        { status: 500, headers: corsHeaders }
      )
    }

    return NextResponse.json({ success: true, data: syncResult.data }, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('[a2c-server] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: corsHeaders }
    )
  } finally {
    if (browser) {
      await browser.close().catch((err) => {
        console.error('[a2c-server] Failed to close browser:', err)
      })
    }
  }
}
