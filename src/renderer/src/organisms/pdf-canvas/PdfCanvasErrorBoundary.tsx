import { Component, type ErrorInfo, type ReactNode } from 'react'
import { LangContext, type LangContextType } from '@renderer/i18n/lang-context'
import {
  clearSessionPersistFreeze,
  freezeSessionPersist
} from '@renderer/lib/pdf-canvas/sessionPersistFreeze'

type Props = { children: ReactNode }
type State = { crashed: boolean }

/**
 * On React crash (e.g. max update depth), freeze session writes before the
 * failed tree unmounts so leave-flush cannot overwrite disk with an empty scene.
 */
export class PdfCanvasErrorBoundary extends Component<Props, State> {
  static contextType = LangContext
  declare context: LangContextType
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    freezeSessionPersist()
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('PdfCanvas crashed — session writes frozen', error, info.componentStack)
  }

  private reload = (): void => {
    clearSessionPersistFreeze()
    this.setState({ crashed: false })
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return (
        <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 bg-morphing-50 px-6 text-center">
          <p className="max-w-md text-sm text-morphing-900">
            {this.context.t('error_boundary_message')}
          </p>
          <button
            type="button"
            className="rounded-lg border border-morphing-300 bg-morphing-100 px-3 py-1.5 text-sm text-morphing-900 transition-transform active:scale-[0.96]"
            onClick={this.reload}
          >
            {this.context.t('error_boundary_reload')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
