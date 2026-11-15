import { useRef, useState } from 'react'
import { GlobeIcon, LoaderCircleIcon, RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import {
  type NetworkProbeResult,
  type NetworkTestResponse,
  useNetworkConfig,
  useTestNetwork,
  useUpdateNetworkConfig
} from '@/api/network'
import { InlineError } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { SettingRow, SettingsSection } from './shared'

export function NetworkSection() {
  const network = useNetworkConfig()
  const updateConfig = useUpdateNetworkConfig()
  const testNetwork = useTestNetwork()
  const inputRef = useRef<HTMLInputElement>(null)

  const config = network.data
  const [userEnabled, setUserEnabled] = useState<boolean | null>(null)
  const [userInput, setUserInput] = useState<string | null>(null)
  const [probe, setProbe] = useState<NetworkTestResponse | null>(null)

  const isEnabled = userEnabled ?? config?.enabled ?? false
  const url = userInput ?? config?.url ?? ''
  const isDirty =
    (userEnabled !== null && userEnabled !== (config?.enabled ?? false)) ||
    (userInput !== null && userInput !== (config?.url ?? ''))
  const disabled = network.isLoading || network.isError || updateConfig.isPending

  function clearProbeResult() {
    setProbe(null)
    testNetwork.reset()
  }

  function handleToggle(checked: boolean) {
    clearProbeResult()
    if (checked) {
      setUserEnabled(true)
    } else {
      if (config?.enabled) {
        updateConfig.mutate(
          { enabled: false, url: normalizeProxyInput(url) },
          {
            onSuccess: () => {
              setUserEnabled(null)
              setUserInput(null)
              toast.success('已关闭网络代理')
            },
            onError: error => {
              toast.error(describeApiError(error))
            }
          }
        )
      } else {
        setUserEnabled(null)
      }
    }
  }

  function handleSave() {
    const normalized = normalizeProxyInput(url)
    if (!normalized) {
      toast.error('请填写代理地址以开启服务')
      inputRef.current?.focus()
      return
    }

    updateConfig.mutate(
      { enabled: isEnabled, url: normalized },
      {
        onSuccess: () => {
          setUserEnabled(null)
          setUserInput(null)
          toast.success(
            isEnabled ? (config?.enabled ? '代理地址已保存' : '已开启网络代理') : '代理设置已保存'
          )
        },
        onError: error => {
          toast.error(describeApiError(error))
        }
      }
    )
  }

  function handleTest() {
    const normalized = normalizeProxyInput(url)
    if (!normalized) {
      toast.error('请先输入要测试的代理地址')
      inputRef.current?.focus()
      return
    }
    clearProbeResult()
    testNetwork.mutate(
      { enabled: true, url: normalized },
      {
        onSuccess: result => {
          setProbe(result)
          showProbeResult(result)
        },
        onError: error => {
          toast.error(describeApiError(error))
        }
      }
    )
  }

  return (
    <SettingsSection icon={<GlobeIcon className="size-4" />} title="网络代理">
      <SettingRow title="启用代理服务" description="将代理除 115 以外的所有网络请求" inline>
        <Switch checked={isEnabled} disabled={disabled} onCheckedChange={handleToggle} />
      </SettingRow>

      {isEnabled ? (
        <>
          <SettingRow title="代理地址" description="支持 HTTP、HTTPS 与 SOCKS5 代理协议">
            <Input
              ref={inputRef}
              autoFocus={userEnabled === true}
              type="text"
              value={url}
              placeholder="http://127.0.0.1:7890"
              disabled={disabled}
              onChange={e => {
                setUserInput(e.target.value)
                clearProbeResult()
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave()
              }}
            />
          </SettingRow>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || testNetwork.isPending}
              onClick={handleTest}
            >
              <RefreshCwIcon className={testNetwork.isPending ? 'animate-spin' : undefined} />
              测试连接
            </Button>
            <Button type="button" size="sm" disabled={disabled || !isDirty} onClick={handleSave}>
              {updateConfig.isPending ? <LoaderCircleIcon className="animate-spin" /> : null}
              保存
            </Button>
          </div>

          {testNetwork.isError ? (
            <InlineError>{describeApiError(testNetwork.error)}</InlineError>
          ) : probe ? (
            <ProbeResult result={probe} />
          ) : null}
        </>
      ) : null}

      {network.isError ? (
        <InlineError>
          后端服务暂不可用，无法读取网络设置。请检查后端服务状态后刷新重试。
        </InlineError>
      ) : null}
    </SettingsSection>
  )
}

function ProbeResult({ result }: { result: NetworkTestResponse }) {
  const available = Number(result.javdb.available) + Number(result.javbus.available)
  const title =
    available === 2 ? '代理连接正常' : available === 1 ? '部分站点无法连接' : '代理连接失败'
  const titleTone =
    available === 2
      ? 'text-emerald-700 dark:text-emerald-300'
      : available === 1
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-red-700 dark:text-red-300'

  return (
    <div aria-live="polite" className="space-y-1 text-xs">
      <p className={`font-medium ${titleTone}`}>上次测试：{title}</p>
      <p className="text-muted-foreground">
        JavDB{' '}
        <span
          className={
            result.javdb.available
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-red-700 dark:text-red-300'
          }
        >
          {describeProbe(result.javdb)}
        </span>
        {' · '}JavBus{' '}
        <span
          className={
            result.javbus.available
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-red-700 dark:text-red-300'
          }
        >
          {describeProbe(result.javbus)}
        </span>
      </p>
    </div>
  )
}

function showProbeResult({ javdb, javbus }: NetworkTestResponse) {
  const description = `JavDB ${describeProbe(javdb)}，JavBus ${describeProbe(javbus)}`
  const available = Number(javdb.available) + Number(javbus.available)
  if (available === 2) toast.success('代理连接正常', { description })
  else if (available === 1) toast.warning('部分站点无法连接', { description })
  else toast.error('代理连接失败', { description })
}

function describeProbe(result: NetworkProbeResult): string {
  return result.available ? `${result.latency_ms ?? 0} ms` : '不可用'
}

function normalizeProxyInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed
  return `http://${trimmed}`
}
