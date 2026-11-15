import { useState } from 'react'
import { KeyRoundIcon, LoaderCircleIcon } from 'lucide-react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import { useJavDBAccount, useLoginJavDB } from '@/api/javdb'
import { InlineError } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingRow, SettingsSection } from './shared'

export function JavDBSection() {
  const account = useJavDBAccount()
  const login = useLoginJavDB()
  const [username, setUsername] = useState<string | null>(null)
  const [password, setPassword] = useState('')

  const currentUsername = username ?? account.data?.username ?? ''
  const disabled = account.isLoading || login.isPending
  const loggedIn = account.data?.logged_in === true
  const status = account.isLoading
    ? '正在读取…'
    : loggedIn
      ? '已登录'
      : account.data?.configured
        ? '已配置，首次请求时自动登录'
        : '未登录'

  function handleLogin() {
    const trimmed = currentUsername.trim()
    if (!trimmed) {
      toast.error('请填写 JavDB 用户名')
      return
    }
    if (!password) {
      toast.error('请填写 JavDB 密码')
      return
    }
    login.mutate(
      { username: trimmed, password },
      {
        onSuccess: () => {
          setUsername(null)
          setPassword('')
          toast.success('JavDB 登录成功')
        },
        onError: error => {
          toast.error(describeApiError(error))
        }
      }
    )
  }

  return (
    <SettingsSection icon={<KeyRoundIcon className="size-4" />} title="JavDB 账号">
      <p className="text-xs text-muted-foreground">
        JavDB
        的部分数据需要登录后才能获取。登录失效时会自动用保存的账号续期；账号密码仅保存在本地数据库。
      </p>

      <SettingRow title="登录状态" description={status} inline>
        <Badge variant={loggedIn ? 'success' : 'outline'}>{status}</Badge>
      </SettingRow>

      <SettingRow title="用户名" description="JavDB 账号的用户名或邮箱">
        <Input
          value={currentUsername}
          placeholder="用户名或邮箱"
          disabled={disabled}
          onChange={event => setUsername(event.target.value)}
        />
      </SettingRow>

      <SettingRow title="密码" description="用于登录，并在 Token 过期后自动续期">
        <Input
          type="password"
          value={password}
          placeholder="JavDB 密码"
          disabled={disabled}
          onChange={event => setPassword(event.target.value)}
        />
      </SettingRow>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !currentUsername.trim() || !password}
          onClick={handleLogin}
        >
          {login.isPending ? <LoaderCircleIcon className="animate-spin" /> : null}
          {loggedIn ? '重新登录' : '登录'}
        </Button>
      </div>

      {account.isError ? (
        <InlineError onRetry={() => void account.refetch()} retrying={account.isFetching}>
          JavDB 登录状态读取失败，请重试。
        </InlineError>
      ) : null}
    </SettingsSection>
  )
}
