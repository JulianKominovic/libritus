import { DynamicIcon, type IconName } from 'lucide-react/dynamic'

type EmbedActivateHintProps = {
  label: string
  icon: IconName
}

/**
 * Centered activate cue for inactive note / search-placeholder embeds.
 * Hidden until host sets `data-activate-hint-hover` on the embed root (CSS :hover
 * cannot work — inactive embeddables are pointer-events: none under the canvas).
 * Counter-scales via `--canvas-zoom` so screen size stays flat under Excalidraw zoom.
 * pointer-events-none — paint only; edge drag and center click stay on Excalidraw.
 */
export function EmbedActivateHint({ label, icon }: EmbedActivateHintProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.2,0,0,1)] [[data-activate-hint-hover]_&]:opacity-100"
      aria-hidden
      data-embed-activate-hint
    >
      <span
        className="flex origin-center items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs text-neutral-600 shadow-lg shadow-neutral-900/20 ring-1 ring-black/5"
        style={{ transform: 'scale(calc(1 / var(--canvas-zoom, 1)))' }}
      >
        <DynamicIcon name={icon} className="size-3.5 shrink-0" />
        {label}
      </span>
    </div>
  )
}
