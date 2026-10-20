import { ChevronLeftIcon, ChevronRightIcon, FolderCheckIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { usePanFiles } from '@/api/pan'
import type { OrganizeFolder } from '@/api/organize'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { DirectoryBreadcrumbs } from './directory-breadcrumbs'
import { DirectoryList } from './directory-list'

// PanFolderDialog picks any 115 folder without mounting it.
export function PanFolderDialog({
  accountID,
  title,
  description,
  initialID,
  onPick,
  children
}: {
  accountID: string
  title: string
  description: string
  initialID?: string
  onPick: (folder: OrganizeFolder) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FolderPicker
          accountID={accountID}
          initialID={initialID || '0'}
          onPick={folder => {
            onPick(folder)
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function FolderPicker({
  accountID,
  initialID,
  onPick
}: {
  accountID: string
  initialID: string
  onPick: (folder: OrganizeFolder) => void
}) {
  const [location, setLocation] = useState({ id: initialID, page: 1 })
  const files = usePanFiles(accountID, location.id, location.page)
  const path = files.data?.path.filter(directory => directory.id !== '0') ?? []
  const display = '/' + path.map(directory => directory.name).join('/')

  return (
    <div className="min-w-0 space-y-4">
      <DirectoryBreadcrumbs
        path={files.data?.path}
        currentID={location.id}
        onNavigate={id => setLocation({ id, page: 1 })}
      />
      <DirectoryList files={files} onNavigate={id => setLocation({ id, page: 1 })} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          第 {location.page} 页{files.data ? ` · 共 ${files.data.total} 项` : ''}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={location.page === 1 || files.isFetching}
            onClick={() => setLocation({ id: location.id, page: location.page - 1 })}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!files.data?.has_more || files.isError || files.isFetching}
            onClick={() => setLocation({ id: location.id, page: location.page + 1 })}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={location.id === '0' || !files.data || files.isError || files.isFetching}
          onClick={() => onPick({ id: location.id, path: display })}
        >
          <FolderCheckIcon className="size-4" />
          选择当前目录
        </Button>
      </div>
    </div>
  )
}
