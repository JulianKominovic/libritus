import './excalidraw-asset-path'
import { getBackendOptions, MultiBackend } from '@minoru/react-dnd-treeview'
import { DndProvider } from 'react-dnd'
import ReactDOM from 'react-dom/client'
import { Router } from 'wouter'
import { useBrowserLocation } from 'wouter/use-browser-location'
import { useHashLocation } from 'wouter/use-hash-location'
import App from './App'
import { LangProvider } from './i18n/lang-context'

// Packaged Electron loads file://…/index.html. On Windows the pathname is
// `/C:/…/index.html`, so path routes never match and Links rewrite to
// `file:///C:/category/…`. Hash location keeps routes as `#/…`.
const useLocation = location.protocol === 'file:' ? useHashLocation : useBrowserLocation

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <DndProvider backend={MultiBackend} options={getBackendOptions()}>
    <LangProvider>
      <Router hook={useLocation}>
        <App />
      </Router>
    </LangProvider>
  </DndProvider>
)
