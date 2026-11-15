import type { JavDBZone } from '@/api/discover'
import { useDiscoverTags } from '@/api/discover'
import { InlineError } from '@/components/error-state'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { CategoryFilters as CategoryValues, DiscoverSort } from './search'
import { CommonFilterSelect, filterSelectClass } from './common-filter-select'
import { DISCOVER_SORTS as sorts, DISCOVER_ZONES as zones } from './constants'

export const MAIN_CATEGORY = 'main'
// Month requires a year; duration has no slot in the upstream filter mask.
export const UNSUPPORTED_CATEGORIES = new Set(['month', 'duration'])

export function CategoryFilters({
  category,
  updateCategory,
  sort,
  onSortChange
}: {
  category: CategoryValues
  updateCategory: (filters: Partial<CategoryValues>) => void
  sort: DiscoverSort
  onSortChange: (sort: DiscoverSort) => void
}) {
  const { zone, categoryID, tagID, main } = category
  const taxonomy = useDiscoverTags(zone)
  const mainOptions = taxonomy.data?.find(item => item.id === MAIN_CATEGORY)?.tags ?? []
  const categories = (taxonomy.data ?? []).filter(
    item => item.id !== MAIN_CATEGORY && !UNSUPPORTED_CATEGORIES.has(item.id)
  )
  const selectedCategory = categories.find(item => item.id === categoryID) ?? categories[0]
  const effectiveCategoryID = selectedCategory?.id ?? ''

  return (
    <div className="-mx-5 flex min-w-0 [scrollbar-width:none] items-center gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <Select
        value={zone}
        onValueChange={value =>
          updateCategory({ zone: value as JavDBZone, categoryID: '', tagID: '', main: '' })
        }
      >
        <SelectTrigger className={filterSelectClass}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectGroup>
            {zones.map(item => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {taxonomy.isLoading ? (
        <>
          <Skeleton className="h-10 w-32 shrink-0 rounded-full sm:h-9" />
          <Skeleton className="h-10 w-40 shrink-0 rounded-full sm:h-9" />
          <Skeleton className="h-10 w-36 shrink-0 rounded-full sm:h-9" />
        </>
      ) : taxonomy.isError ? (
        <InlineError
          className="shrink-0"
          onRetry={() => taxonomy.refetch()}
          retrying={taxonomy.isFetching}
          retryLabel="重试分类"
        >
          分类加载失败
        </InlineError>
      ) : (
        <>
          <Select
            value={effectiveCategoryID}
            onValueChange={value => updateCategory({ categoryID: value, tagID: '' })}
          >
            <SelectTrigger className={filterSelectClass}>
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectGroup>
                {categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={tagID || 'all'}
            onValueChange={value =>
              updateCategory({
                categoryID: effectiveCategoryID,
                tagID: value === 'all' ? '' : value
              })
            }
          >
            <SelectTrigger className={`${filterSelectClass} min-w-40`}>
              <SelectValue placeholder="全部标签" />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectGroup>
                <SelectItem value="all">全部标签</SelectItem>
                {selectedCategory?.tags.map(tag => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {mainOptions.length > 0 ? (
            <CommonFilterSelect
              options={mainOptions}
              value={main}
              onValueChange={mainValue => updateCategory({ main: mainValue })}
            />
          ) : null}
        </>
      )}

      <div className="shrink-0 sm:ml-auto">
        <Select value={sort} onValueChange={value => onSortChange(value as DiscoverSort)}>
          <SelectTrigger className={`${filterSelectClass} min-w-32`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectGroup>
              {sorts.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  按{item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
