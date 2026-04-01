import { NextRequest, NextResponse } from 'next/server'

// This endpoint receives already-fetched Huojian data from the browser
// and returns it in the unified sync format.
// The browser calls the Huojian API directly because v4.url66.me blocks
// server-side requests (403) but allows browser requests.

interface HuojianAccount {
  accountLogin: string
  accountNickName?: string
  accountStatus: number
  newTodayFriend: number
  newTotalFriend: number
}

interface HuojianCounterWorker {
  newTotalFriend: number
  newTodayFriend: number
}

interface HuojianPayload {
  counterWorker: HuojianCounterWorker
  counterCsAccountVo: HuojianAccount[]
}

interface HuojianApiResponse {
  code: number
  data?: HuojianPayload
  counterWorker?: HuojianCounterWorker
  counterCsAccountVo?: HuojianAccount[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { huojian_data } = body as { huojian_data: HuojianApiResponse }

    if (!huojian_data) {
      return NextResponse.json({ success: false, error: 'huojian_data is required' }, { status: 400 })
    }

    // Support both { counterWorker, counterCsAccountVo } and { data: { counterWorker, counterCsAccountVo } }
    const payload: Partial<HuojianPayload> = huojian_data.data || huojian_data
    const counterWorker = payload.counterWorker
    const accounts: HuojianAccount[] = payload.counterCsAccountVo || []

    if (!counterWorker) {
      return NextResponse.json({ success: false, error: 'Invalid huojian data: missing counterWorker' }, { status: 400 })
    }

    const numbers = accounts.map((n: HuojianAccount) => ({
      id: n.accountLogin,
      user: n.accountLogin,
      nickname: n.accountNickName || '',
      online: n.accountStatus,
      sum: n.newTotalFriend,
      day_sum: n.newTodayFriend,
    }))

    const totalSum = counterWorker.newTotalFriend
    const totalDaySum = counterWorker.newTodayFriend
    const totalCount = accounts.length
    const onlineCount = accounts.filter((n: HuojianAccount) => n.accountStatus === 1).length
    const offlineCount = accounts.filter((n: HuojianAccount) => n.accountStatus !== 1).length

    return NextResponse.json({
      success: true,
      data: {
        numbers,
        total_count: totalCount,
        total_sum: totalSum,
        total_day_sum: totalDaySum,
        online_count: onlineCount,
        offline_count: offlineCount,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[huojian sync] error:', error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
