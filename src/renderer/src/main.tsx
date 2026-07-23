import './excalidraw-asset-path'
import { getBackendOptions, MultiBackend } from '@minoru/react-dnd-treeview'
import { DndProvider } from 'react-dnd'
import ReactDOM from 'react-dom/client'
import { Router } from 'wouter'
import { useBrowserLocation } from 'wouter/use-browser-location'
import App from './App'
import { LangProvider } from './i18n/lang-context'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <DndProvider backend={MultiBackend} options={getBackendOptions()}>
    <LangProvider>
      <Router hook={useBrowserLocation}>
        <App />
      </Router>
    </LangProvider>
  </DndProvider>
)
