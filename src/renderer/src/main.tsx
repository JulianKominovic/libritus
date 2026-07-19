import './excalidraw-asset-path'
import { getBackendOptions, MultiBackend } from '@minoru/react-dnd-treeview'
import { GlobalWorkerOptions } from '@renderer/lib/pdf-canvas/pdfjs'
import 'pdfjs-dist/web/pdf_viewer.css'
import { DndProvider } from 'react-dnd'
import ReactDOM from 'react-dom/client'
import { Router } from 'wouter'
import { useBrowserLocation } from 'wouter/use-browser-location'
import App from './App'
import { LangProvider } from './i18n/lang-context'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <DndProvider backend={MultiBackend} options={getBackendOptions()}>
    <LangProvider>
      <Router hook={useBrowserLocation}>
        <App />
      </Router>
    </LangProvider>
  </DndProvider>
)
// await import('react-scan').then(({ start }) => start())
