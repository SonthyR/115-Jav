import { isTaskActive, type ScanTask } from '@/api/tasks'

const statusLabels = {
  queued: '等待扫描',
  running: '扫描中',
  done: '处理完成',
  failed: '处理失败'
}

export function scanStatus(task: ScanTask) {
  if (!isTaskActive(task)) return statusLabels[task.status]
  if (task.paused) return task.status === 'running' ? '正在保存进度并暂停' : '已暂停'
  if (task.retry_at || (task.status === 'queued' && task.scan.metadata_retrying)) {
    return '等待自动重试'
  }
  const stage = scanStage(task)
  if (task.scan.metadata_total > 0) {
    if (task.status === 'queued') return '等待刮削'
    return stage === 'artwork' ? '写入元数据' : '刮削中'
  }
  if (task.status === 'running' && stage === 'reconciling') return '核对中'
  return statusLabels[task.status]
}

export function scanStage(task: ScanTask): ScanTask['scan']['stage'] {
  if (!isTaskActive(task)) return task.status === 'done' ? 'done' : task.scan.stage
  if (task.scan.metadata_total > 0) return task.scan.stage === 'artwork' ? 'artwork' : 'scraping'
  return task.scan.stage === 'done' ? 'reconciling' : task.scan.stage
}

// scanKind names what a scan task does, so the startup check of the local
// export folder is not mistaken for a full 115 scan.
export function scanKind(task: ScanTask) {
  if (task.source.account_id === 'local') return 'Emby 本地目录检查'
  if (task.movie_id) return `${task.code ?? ''} 重新刮削`.trim()
  if (task.offline_task_id) return `${task.code ?? ''} 离线下载入库`.trim()
  if (task.code) return `${task.code} 整理入库`
  if (task.rebuild) return '全量重建'
  return task.scan.quick ? '115 快速同步' : '115 同步'
}

// scanDuration is the time since the task was created, or until it finished.
export function scanDuration(task: ScanTask, now = Date.now()) {
  const end = isTaskActive(task) ? now : new Date(task.updated_at).getTime()
  const seconds = Math.max(0, Math.round((end - new Date(task.created_at).getTime()) / 1000))
  const text =
    seconds < 60
      ? `${seconds} 秒`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
        : `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`
  return isTaskActive(task) ? `已用 ${text}` : `用时 ${text}`
}

export function scanCount(task: ScanTask) {
  if (task.source.account_id === 'local' && task.scan.metadata_total === 0) {
    return task.status === 'done' ? `新导入 ${task.scan.movies} 部` : '检查导出文件'
  }
  const count =
    task.scan.metadata_total > 0
      ? `${task.scan.metadata_completed} / ${task.scan.metadata_total} 部`
      : `识别到 ${task.scan.movies} 部`
  const retrying = task.scan.metadata_retrying ?? 0
  const failed = task.scan.metadata_failed ?? 0
  return `${count}${retrying ? ` · ${retrying} 部等待重试` : ''}${failed ? ` · ${failed} 部失败` : ''}`
}
