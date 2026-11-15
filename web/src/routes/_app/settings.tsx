import { createFileRoute } from '@tanstack/react-router'
import { Fragment, type ReactNode, useEffect, useRef } from 'react'

import { AppPage } from '@/components/app-page'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppearanceSection } from '@/features/settings/appearance-section'
import { DataSection } from '@/features/settings/data-section'
import { EmbySection } from '@/features/settings/emby-section'
import { JavDBSection } from '@/features/settings/javdb-section'
import { NetworkSection } from '@/features/settings/network-section'
import { OrganizeSection } from '@/features/settings/organize-section'
import { PanSection } from '@/features/settings/pan-section'
import { PrivacySection } from '@/features/settings/privacy-section'
import { ScrapingSection } from '@/features/settings/scraping-section'
import { SubscriptionSection } from '@/features/settings/subscription-section'
import { TasksSection } from '@/features/settings/tasks-section'

const tabs = [
  {
    id: 'pan',
    label: '115 网盘',
    sections: [<PanSection key="pan" />, <TasksSection key="tasks" />]
  },
  { id: 'organize', label: '整理', sections: [<OrganizeSection key="organize" />] },
  { id: 'emby', label: 'Emby', sections: [<EmbySection key="emby" />] },
  {
    id: 'scraping',
    label: '刮削',
    sections: [<ScrapingSection key="scraping" />, <JavDBSection key="javdb" />]
  },
  {
    id: 'subscription',
    label: '订阅',
    sections: [<SubscriptionSection key="subscription" />]
  },
  { id: 'network', label: '网络', sections: [<NetworkSection key="network" />] },
  {
    id: 'general',
    label: '通用',
    sections: [
      <AppearanceSection key="appearance" />,
      <PrivacySection key="privacy" />,
      <DataSection key="data" />
    ]
  }
] as const satisfies { id: string; label: string; sections: ReactNode[] }[]

type SettingsTab = (typeof tabs)[number]['id']

export const Route = createFileRoute('/_app/settings')({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } =>
    tabs.some(tab => tab.id === search.tab) ? { tab: search.tab as SettingsTab } : {},
  component: SettingsPage
})

function SettingsPage() {
  const { tab = 'pan' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const tabListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = tabListRef.current
    const active = list?.querySelector<HTMLElement>(`[data-settings-tab="${tab}"]`)
    if (!list || !active) return
    const left = active.offsetLeft - (list.clientWidth - active.clientWidth) / 2
    list.scrollTo({
      left: Math.max(0, Math.min(left, list.scrollWidth - list.clientWidth)),
      behavior: 'smooth'
    })
  }, [tab])

  return (
    <AppPage showBackTop={false}>
      <PageHeader title="设置" description="管理应用选项和其他配置" />

      <Tabs
        value={tab}
        className="gap-6"
        onValueChange={value =>
          void navigate({ search: value === 'pan' ? {} : { tab: value as SettingsTab } })
        }
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList
            ref={tabListRef}
            aria-label="设置分类"
            className="h-auto w-max [scrollbar-width:none] flex-row! gap-1 bg-transparent p-0 [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map(item => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                data-settings-tab={item.id}
                className="h-9 w-auto! flex-none rounded-lg px-3 data-active:bg-muted data-active:shadow-none dark:data-active:border-transparent"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map(item => (
          <TabsContent key={item.id} value={item.id} className="min-w-0">
            <Card>
              <CardContent className="space-y-8">
                {item.sections.map((section, index) => (
                  <Fragment key={index}>
                    {index > 0 ? <Separator /> : null}
                    {section}
                  </Fragment>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </AppPage>
  )
}
