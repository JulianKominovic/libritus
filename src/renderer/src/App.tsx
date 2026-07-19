import { motion } from 'motion/react'
import { Redirect, Route, Switch } from 'wouter'
import './App.css'
import { useQuitFlush } from './hooks/use-quit-flush'
import { useRouteTheme } from './hooks/use-route-theme'
import { cn } from './lib/utils'
import Category from './pages/category'
import HomePage from './pages/home'
import PdfPage from './pages/pdf'
import SettingsPage from './pages/settings'
import { useSettings } from './stores/settings'
import DragAndDropZone from './templates/drag-and-drop'
import Navbar from './templates/navbar'
import Sidebar from './templates/sidebar'

const scrollPageClassName = 'px-6 md:px-8 pb-32 max-w-5xl overflow-y-auto'
// import('react-scan').then(({ scan }) =>
//   scan({
//     dangerouslyForceRunInProduction: true,
//     enabled: true
//   })
// )
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
        <Switch>
          <Route path="/" key={'home-page'}>
            <DragAndDropZone>
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
      </motion.div>
    </>
  )
}

export default App
