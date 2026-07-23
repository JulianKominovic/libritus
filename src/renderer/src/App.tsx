import { motion } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import './App.css'
import { useQuitFlush } from './hooks/use-quit-flush'
import { useRouteTheme } from './hooks/use-route-theme'
import { cn } from './lib/utils'
import HomePage from './pages/home'
import { useSettings } from './stores/settings'
import DragAndDropZone from './templates/drag-and-drop'
import Navbar from './templates/navbar'
import Sidebar from './templates/sidebar'

const Category = lazy(() => import('./pages/category'))
const PdfPage = lazy(() => import('./pages/pdf'))
const SettingsPage = lazy(() => import('./pages/settings'))

const scrollPageClassName = 'px-6 md:px-8 pb-32 overflow-y-auto'

if (import.meta.env.DEV) {
  import('react-scan').then(({ scan }) => scan({ enabled: true }))
}

function App() {
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar)
  useRouteTheme()
  useQuitFlush()
  return (
    <>
      <Navbar />
      <motion.div
        className={cn('grid gap-0 h-[calc(100%-50px)] text-morphing-900')}
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          gridTemplateColumns: showNavigationSidebar ? '300px 1fr' : '0px 1fr'
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 0.3
        }}
        layout="position"
      >
        <Sidebar />
        <Suspense fallback={null}>
          <Switch>
            <Route path="/" key={'home-page'}>
              <DragAndDropZone className={cn(scrollPageClassName, 'min-h-0 h-full')}>
                <HomePage />
              </DragAndDropZone>
            </Route>
            <Route path="/home" key={'settings-page'}>
              <Redirect to="/" />
            </Route>
            <Route path="/category/:categoryId" key={'category-page'}>
              <div className={scrollPageClassName}>
                <Category />
              </div>
            </Route>
            <Route path="/category/:categoryId/:pdfId" key={'pdf-page'}>
              <PdfPage />
            </Route>
            <Route path="/settings" key={'settings-page'}>
              <div className={scrollPageClassName}>
                <SettingsPage />
              </div>
            </Route>
            <Route path="/trash" key={'trash-page'}></Route>
            <Route path="*" key={'not-found-page'}>
              <Redirect to="/" />
            </Route>
          </Switch>
        </Suspense>
      </motion.div>
    </>
  )
}

export default App
