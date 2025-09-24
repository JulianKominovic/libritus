import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator
} from '@renderer/components/ui/breadcrumb'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { useLang } from '@renderer/i18n/lang-context'
import { usePdfs } from '@renderer/stores/categories'
import { useSettings } from '@renderer/stores/settings'
import { DynamicIcon } from 'lucide-react/dynamic'
import { type ReactNode, useMemo } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { Link, useRoute } from 'wouter'

function Navbar() {
  const [isHome] = useRoute('/')
  const [isCategory, params2] = useRoute('/category/:categoryId')
  const [isPdf, params3] = useRoute('/category/:categoryId/:pdfId')
  const [isSettings] = useRoute('/settings')
  const [isTrash] = useRoute('/trash')
  const [isInfo] = useRoute('/info')
  const { t } = useLang()
  const categories = usePdfs((s) => s.categories)
  const segments = useMemo<
    {
      name: string | ReactNode
      href: string
      suggestions: { id?: string; name?: string | ReactNode; href: string }[]
    }[]
  >(() => {
    if (isSettings) {
      return [{ name: t('settings'), href: '/settings', suggestions: [] }]
    }
    if (isTrash) {
      return [{ name: t('trash'), href: '/trash', suggestions: [] }]
    }
    if (isInfo) {
      return [{ name: t('info'), href: '/info', suggestions: [] }]
    }
    if (isHome) {
      return [{ name: t('home'), href: '/', suggestions: [] }]
    }
    if (isCategory) {
      const category = categories.find((c) => c.id === params2.categoryId)
      return [
        { name: t('home'), href: '/', suggestions: [] },
        {
          name: category?.name || '',
          href: `/category/${category?.id}`,
          suggestions: categories.map((c) => {
            return {
              id: c.id,
              name: (
                <div className="text-sm flex items-center gap-2">
                  <DynamicIcon name={c.icon} size={16} className="text-morphing-900" />
                  {c.name}
                </div>
              ),
              href: `/category/${c.id}`
            }
          })
        }
      ]
    }
    if (isPdf) {
      const category = categories.find((c) => c.id === params3.categoryId)
      const pdf = category?.pdfs.find((p) => p.id === params3.pdfId)
      const pdfs = category?.pdfs || []
      return [
        { name: t('home'), href: '/', suggestions: [] },
        {
          name: category?.name || '',
          href: `/category/${category?.id}`,
          suggestions: categories.map((c) => {
            return {
              id: c.id,
              name: (
                <div className="text-sm flex items-center gap-2">
                  <DynamicIcon name={c.icon} size={16} className="text-morphing-900" />
                  {c.name}
                </div>
              ),
              href: `/category/${c.id}`
            }
          })
        },
        {
          name: pdf?.name || '',
          href: `/category/${category?.id}/${pdf?.id}`,
          suggestions: pdfs.map((p) => ({
            id: p.id,
            name: p.name,
            href: `/category/${category?.id}/${p.id}`
          }))
        }
      ]
    }
    return [{ name: t('home'), href: '/', suggestions: [] }]
  }, [
    isHome,
    isCategory,
    isPdf,
    isSettings,
    isTrash,
    isInfo,
    params2?.categoryId,
    params3?.categoryId,
    params3?.pdfId,
    categories,
    t
  ])
  const setShowNavigationSidebar = useSettings((s) => s.setShowNavigationSidebar)
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar)
  const setShowPdfOutline = useSettings((s) => s.setShowPdfOutline)
  const showPdfOutline = useSettings((s) => s.showPdfOutline)

  return (
    <nav className="w-full h-[50px] flex items-center justify-between px-4 pl-20 window-nav">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="!p-2 aspect-square !size-8 text-muted-foreground"
          onClick={() => window.history.back()}
        >
          <DynamicIcon name={'arrow-left'} />
        </Button>
        <Button
          variant="ghost"
          className="!p-2 aspect-square !size-8 text-muted-foreground -mx-2"
          onClick={() => window.history.forward()}
        >
          <DynamicIcon name={'arrow-right'} />
        </Button>
        <Button
          variant="ghost"
          className="!p-2 aspect-square !size-8 text-muted-foreground"
          onClick={() => setShowNavigationSidebar(!showNavigationSidebar)}
        >
          <DynamicIcon name={showNavigationSidebar ? 'panel-left' : 'panel-left-open'} />
        </Button>
        <Breadcrumb className="overflow-x-auto">
          <BreadcrumbList className="flex-nowrap">
            {segments.map(({ name, suggestions, href }, index) => {
              const isLast = index === segments.length - 1

              return (
                <Fragment key={name + 'seg' + index.toString()}>
                  <BreadcrumbItem className="flex-shrink-0">
                    {suggestions?.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-2 ">
                          {name} <DynamicIcon name="chevron-down" className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {suggestions.map(({ href, id, name }) => (
                            <DropdownMenuItem asChild key={id}>
                              <Link to={href}>{name}</Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <BreadcrumbLink asChild className="flex-shrink-0">
                        <Link to={href}>{name}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator className="flex-shrink-0" />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2">
        {isPdf && (
          <Button
            variant="ghost"
            className="!p-2 aspect-square !size-8 text-muted-foreground"
            onClick={() => setShowPdfOutline(!showPdfOutline)}
          >
            <DynamicIcon name={showPdfOutline ? 'panel-right' : 'panel-right-open'} />
          </Button>
        )}
      </div>
    </nav>
  )
}

export default Navbar
