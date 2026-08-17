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
import { browserShow } from '@renderer/integrations/webBrowser'
import { flushActiveSession } from '@renderer/lib/pdf-canvas/active-session-flush'
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

  // Mac traffic lights sit on the left; Windows/Linux overlay controls on the right.
  const isMac = window.electron.process.platform === 'darwin'

  return (
    <nav
      className={
        isMac
          ? 'w-full h-12.5 flex items-center justify-between px-4 pl-22 window-nav fixed inset-x-0 top-0 z-50 bg-linear-to-b from-morphing-100 to-transparent'
          : 'w-full h-12.5 flex items-center justify-between px-4 pr-36 window-nav fixed inset-x-0 top-0 z-50 bg-linear-to-b from-morphing-100 to-transparent'
      }
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="text-morphing-600"
          onClick={() => {
            void flushActiveSession().then(() => window.history.back())
          }}
        >
          <DynamicIcon name={'arrow-left'} />
        </Button>
        <Button
          variant="ghost"
          className="-mx-2 text-morphing-600"
          onClick={() => {
            void flushActiveSession().then(() => window.history.forward())
          }}
        >
          <DynamicIcon name={'arrow-right'} />
        </Button>
        <Button
          variant="ghost"
          className="text-morphing-600"
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
                        <DropdownMenuTrigger className="flex items-center gap-2 text-morphing-600">
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
                      <BreadcrumbLink asChild className="flex-shrink-0 text-morphing-600">
                        <Link to={href}>{name}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && (
                    <BreadcrumbSeparator className="flex-shrink-0 text-morphing-600 fill-morphing-600" />
                  )}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-0">
        {isPdf && (
          <>
            <Button
              variant="ghost"
              className="!size-10 aspect-square !p-2 text-morphing-600"
              aria-label={t('navbar_open_browser_aria')}
              onClick={() => void browserShow()}
            >
              <DynamicIcon name="globe" className="size-4" />
            </Button>
            <Button
              variant="ghost"
              className={
                showPdfOutline
                  ? '!size-10 aspect-square !p-2 bg-morphing-100 text-morphing-700 hover:bg-morphing-200'
                  : '!size-10 aspect-square !p-2 text-morphing-600'
              }
              aria-label={t('navbar_toggle_pdf_sidebar_aria')}
              aria-pressed={showPdfOutline}
              onClick={() => setShowPdfOutline(!showPdfOutline)}
            >
              <DynamicIcon name={showPdfOutline ? 'panel-right' : 'panel-right-open'} />
            </Button>
          </>
        )}
      </div>
    </nav>
  )
}

export default Navbar
