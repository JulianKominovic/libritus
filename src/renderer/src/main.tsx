import { getBackendOptions, MultiBackend } from '@minoru/react-dnd-treeview'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import { DndProvider } from 'react-dnd'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LangProvider } from './i18n/lang-context'

// import { scan } from "react-scan";
// scan({ enabled: true });

// Set up the worker
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <DndProvider backend={MultiBackend} options={getBackendOptions()}>
    <LangProvider>
      <App />
    </LangProvider>
  </DndProvider>
)
