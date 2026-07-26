import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { ContextMenu, ContextMenuTrigger } from '@renderer/components/ui/context-menu'
import { useLang } from '@renderer/i18n/lang-context'
import { flushActiveSession } from '@renderer/lib/pdf-canvas/active-session-flush'
import { recentPdfs } from '@renderer/lib/recentPdfs'
import PdfCardContextMenuContent from '@renderer/organisms/pdf/pdf-card-context-menu-content'
import type { Pdf } from '@renderer/stores/categories'
import { usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'
import { motion } from 'motion/react'
import { Link, useLocation } from 'wouter'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

function fadeInOut(order = 0) {
  return {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.28, delay: order * 0.05, ease: EASE_OUT }
  }
}

const pdfStatPillClassName =
  'px-2 text-morphing-800 h-6 bg-morphing-100/80 border border-morphing-300 backdrop-blur-lg rounded-full flex items-center gap-1 tabular-nums'

function HomePdfCard({
  categoryId,
  categoryName,
  pdf
}: {
  categoryId: string
  categoryName: string
  pdf: Pdf
}) {
  const highlightsNumber = pdf.canvasStats?.highlights
  const notesNumber = pdf.canvasStats?.notes
  const searchesNumber = pdf.canvasStats?.searches
  const essaysNumber = pdf.essays?.length
  return (
    <div className="flex flex-col w-56">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            to={`/category/${categoryId}/${pdf.id}`}
            className="p-0 flex flex-col justify-center items-center h-80 w-56 object-contain bg-morphing-100 relative group pdf-card-content [--radius:16px] transition-transform duration-200 [@media(hover:hover)_and_(pointer:fine)]:hover:scale-105 active:scale-[0.96]"
          >
            <img
              src={pdf.thumbnail || ''}
              alt={pdf.name}
              className="size-full object-cover [outline:1px_solid_rgba(0,0,0,0.1)]"
            />
            <div className="absolute bottom-1.5 text-xs right-1.5 w-fit flex items-center gap-1">
              {essaysNumber && essaysNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="file-pen-line" className="size-4 text-morphing-700" />
                  {essaysNumber}
                </p>
              ) : null}
              {notesNumber && notesNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="message-circle" className="size-4 text-morphing-700" />
                  {notesNumber}
                </p>
              ) : null}
              {searchesNumber && searchesNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="globe" className="size-4 text-morphing-700" />
                  {searchesNumber}
                </p>
              ) : null}
              {highlightsNumber && highlightsNumber > 0 ? (
                <p className={pdfStatPillClassName}>
                  <DynamicIcon name="highlighter" className="size-4 text-morphing-700" />
                  {highlightsNumber}
                </p>
              ) : null}
              <p className={pdfStatPillClassName}>
                {pdf.progress.percentage > 0 ? (
                  `${pdf.progress.percentage.toFixed(0)}%`
                ) : (
                  <i className="font-serif">New</i>
                )}
              </p>
            </div>
          </Link>
        </ContextMenuTrigger>
        <PdfCardContextMenuContent pdf={pdf} categoryId={categoryId} />
      </ContextMenu>
      <Link
        to={`/category/${categoryId}`}
        className="mt-2 text-xs text-muted-foreground truncate transition-transform active:scale-[0.96] hover:text-morphing-800"
      >
        {categoryName}
      </Link>
    </div>
  )
}

function HomePage() {
  const { t } = useLang()
  const categories = usePdfs((s) => s.categories)
  const createCategory = usePdfs((s) => s.createCategory)
  const [, navigate] = useLocation()

  const recent = recentPdfs(categories)
  const hasPdfs = categories.some((c) => c.pdfs.length > 0)

  const onCreateCategory = () => {
    void createCategory().then(async (category) => {
      await flushActiveSession()
      navigate(`/category/${category.id}`)
    })
  }

  return (
    <main className="p-4 mx-auto max-w-4xl select-none cursor-default">
      {hasPdfs ? (
        <>
          <h1 className="text-6xl font-serif tracking-tighter font-bold text-center text-balance">
            {t('home_welcome')}
          </h1>
          <h2 className="text-2xl px-2 font-sans text-muted-foreground font-medium text-center text-balance mb-12">
            {t('home_welcome_description')}
          </h2>
          <section>
            <div className="flex items-baseline justify-between gap-4 mb-6">
              <h2 className="text-xl font-serif tracking-tighter font-semibold text-balance">
                {t('home_continue_reading')}
              </h2>
              {recent[0] ? (
                <Link
                  to={`/category/${recent[0].categoryId}`}
                  className="text-sm text-muted-foreground hover:text-morphing-800 transition-colors active:scale-[0.96] shrink-0"
                >
                  {t('home_see_all')}
                </Link>
              ) : null}
            </div>
            <ul className="flex flex-wrap gap-8">
              {recent.map(({ categoryId, categoryName, pdf }) => (
                <li key={pdf.id}>
                  <HomePdfCard
                    categoryId={categoryId}
                    categoryName={categoryName}
                    pdf={pdf}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-muted-foreground text-center text-pretty">
              {t('home_drop_hint')}
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={onCreateCategory}
                className="active:scale-[0.96] transition-transform"
              >
                {t('home_create_category')}
              </Button>
            </div>
          </section>
        </>
      ) : (
        <>
          <motion.h1
            className="text-6xl font-serif tracking-tighter font-bold text-center text-balance"
            {...fadeInOut()}
          >
            {t('home_welcome')}
          </motion.h1>
          <motion.h2
            className="text-2xl px-2 font-sans text-muted-foreground font-medium mb-16 text-center text-balance"
            {...fadeInOut(1)}
          >
            {t('home_welcome_description')}
          </motion.h2>
          <section>
            <ul className="flex flex-wrap gap-6">
              <motion.li className="flex flex-col items-center flex-grow w-64" {...fadeInOut(2)}>
                <Badge className="rounded-[50%] size-10 text-2xl font-serif tracking-tighter font-semibold mb-4">
                  1
                </Badge>
                <h3 className="text-xl font-serif tracking-tighter font-semibold text-center mb-1 text-balance">
                  {t('home_step_upload_title')}
                </h3>
                <p className="text-muted-foreground text-center text-pretty">
                  {t('home_step_upload_desc')}
                </p>
              </motion.li>
              <motion.li className="flex flex-col items-center flex-grow w-64" {...fadeInOut(3)}>
                <Badge className="rounded-[50%] size-10 text-2xl font-serif tracking-tighter font-semibold mb-4">
                  2
                </Badge>
                <h3 className="text-xl font-serif tracking-tighter font-semibold text-center mb-1 text-balance">
                  {t('home_step_category_title')}
                </h3>
                <p className="text-muted-foreground text-center text-pretty">
                  {t('home_step_category_desc')}
                </p>
              </motion.li>
              <motion.li className="flex flex-col items-center flex-grow w-64" {...fadeInOut(4)}>
                <Badge className="rounded-[50%] size-10 text-2xl font-serif tracking-tighter font-semibold mb-4">
                  3
                </Badge>
                <h3 className="text-xl font-serif tracking-tighter font-semibold text-center mb-1 text-balance">
                  {t('home_step_read_title')}
                </h3>
                <p className="text-muted-foreground text-center text-pretty">
                  {t('home_step_read_desc')}
                </p>
              </motion.li>
            </ul>
          </section>
          <motion.div className="mt-10 flex justify-center" {...fadeInOut(5)}>
            <Button
              type="button"
              onClick={onCreateCategory}
              className="active:scale-[0.96] transition-transform"
            >
              {t('home_create_category')}
            </Button>
          </motion.div>
        </>
      )}
    </main>
  )
}

export default HomePage
