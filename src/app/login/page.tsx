export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import LoginClient from './LoginClient'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const isTimeout = params?.timeout === '1'
  return <LoginClient isTimeout={isTimeout} />
}
