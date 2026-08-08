import { autoUpdate, flip, offset, type Placement, shift, useFloating } from '@floating-ui/react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { cn } from '@renderer/lib/utils'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import {
  type ComponentProps,
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'

const VIEWPORT_PADDING = 16
const MENU_OFFSET = 12

type RectBox = {
  top: number
  left: number
  width: number
  height: number
}

type Side = 'top' | 'right' | 'bottom' | 'left'

type ContextMenuContextValue = {
  open: boolean
  layoutId: string
  originRect: RectBox | null
  clampedRect: RectBox | null
  registerTriggerChildren: (children: ReactNode) => void
  getTriggerChildren: () => ReactNode
  setTriggerEl: (node: HTMLDivElement | null) => void
  elevatedRef: (node: HTMLDivElement | null) => void
  setFloating: (node: HTMLDivElement | null) => void
  floatingStyles: CSSProperties
  isPositioned: boolean
  side: Side
  enterOffset: { x: number; y: number }
  spring: { duration: number } | { type: 'spring'; stiffness: number; damping: number }
  fade: { duration: number; ease?: 'easeOut' | 'easeIn' }
  backdropExit: { duration: number; ease?: 'easeOut' | 'easeIn' | 'easeInOut' }
  itemTransition: { duration: number; ease?: 'easeOut' | 'easeIn' }
  reducedMotion: boolean
  backdropMask: CSSProperties | undefined
  mounted: boolean
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null)

function useContextMenu() {
  const context = useContext(ContextMenuContext)
  if (!context) {
    throw new Error('ContextMenu components must be used within ContextMenu')
  }
  return context
}

function clampRectToViewport(rect: DOMRect, padding = VIEWPORT_PADDING): RectBox {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = rect.width
  const height = rect.height

  let top = rect.top
  let left = rect.left

  if (top < padding) top = padding
  if (left < padding) left = padding
  if (top + height > vh - padding) top = Math.max(padding, vh - padding - height)
  if (left + width > vw - padding) left = Math.max(padding, vw - padding - width)

  return { top, left, width, height }
}

function sideFromPlacement(placement: Placement): Side {
  return placement.split('-')[0] as Side
}

function enterOffsetForSide(side: Side) {
  switch (side) {
    case 'right':
      return { x: -8, y: 0 }
    case 'left':
      return { x: 8, y: 0 }
    case 'bottom':
      return { x: 0, y: -8 }
    case 'top':
      return { x: 0, y: 8 }
  }
}

function ContextMenu({
  modal = true,
  onOpenChange,
  backdropClassName,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Root> & {
  backdropClassName?: string
}) {
  const layoutId = useId()
  const reducedMotion = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)
  const [originRect, setOriginRect] = useState<RectBox | null>(null)
  const [clampedRect, setClampedRect] = useState<RectBox | null>(null)
  const [triggerEl, setTriggerEl] = useState<HTMLDivElement | null>(null)
  const [elevatedEl, setElevatedEl] = useState<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [returning, setReturning] = useState(false)
  const triggerChildrenRef = useRef<ReactNode>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const elevatedRef = useCallback((node: HTMLDivElement | null) => {
    setElevatedEl(node)
  }, [])

  const registerTriggerChildren = useCallback((node: ReactNode) => {
    triggerChildrenRef.current = node
  }, [])

  const getTriggerChildren = useCallback(() => triggerChildrenRef.current, [])

  const { refs, floatingStyles, placement, isPositioned } = useFloating({
    open,
    strategy: 'fixed',
    placement: 'right',
    middleware: [
      offset(MENU_OFFSET),
      flip({
        fallbackPlacements: ['left', 'bottom', 'top']
      }),
      shift({ padding: VIEWPORT_PADDING })
    ],
    whileElementsMounted: autoUpdate
  })

  useLayoutEffect(() => {
    if (open && elevatedEl) {
      refs.setReference(elevatedEl)
    }
  }, [open, elevatedEl, refs])

  const handleOpenChange = (next: boolean) => {
    if (next && triggerEl) {
      const rect = triggerEl.getBoundingClientRect()
      setOriginRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      })
      setClampedRect(clampRectToViewport(rect))
      setReturning(false)
    } else if (!next && clampedRect) {
      setReturning(true)
    }
    setOpen(next)
    onOpenChange?.(next)
  }

  const triggerVisible = open || returning

  const side = sideFromPlacement(placement)
  const enterOffset = enterOffsetForSide(side)
  const spring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 500, damping: 30 }
  const fade = reducedMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' as const }
  const backdropExit = reducedMotion
    ? { duration: 0 }
    : { duration: 0.3, ease: 'easeInOut' as const }
  const itemTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: 'easeOut' as const }

  const maskCenter = clampedRect
    ? {
        x: clampedRect.left + clampedRect.width / 2,
        y: clampedRect.top + clampedRect.height / 2
      }
    : { x: 0, y: 0 }

  const backdropMask: CSSProperties | undefined = clampedRect
    ? {
        maskImage: `radial-gradient(circle at ${maskCenter.x}px ${maskCenter.y}px, #000 0%, #000 40%, transparent 100%)`,
        WebkitMaskImage: `radial-gradient(circle at ${maskCenter.x}px ${maskCenter.y}px, #000 0%, #000 40%, transparent 100%)`
      }
    : undefined

  const value = useMemo<ContextMenuContextValue>(
    () => ({
      open: triggerVisible,
      layoutId,
      originRect,
      clampedRect,
      registerTriggerChildren,
      getTriggerChildren,
      setTriggerEl,
      elevatedRef,
      setFloating: refs.setFloating,
      floatingStyles,
      isPositioned,
      side,
      enterOffset,
      spring,
      fade,
      backdropExit,
      itemTransition,
      reducedMotion,
      backdropMask,
      mounted
    }),
    [
      triggerVisible,
      layoutId,
      originRect,
      clampedRect,
      registerTriggerChildren,
      getTriggerChildren,
      elevatedRef,
      refs.setFloating,
      floatingStyles,
      isPositioned,
      side,
      enterOffset,
      spring,
      fade,
      backdropExit,
      itemTransition,
      reducedMotion,
      backdropMask,
      mounted
    ]
  )

  return (
    <ContextMenuContext.Provider value={value}>
      <LayoutGroup>
        <ContextMenuPrimitive.Root
          data-slot="context-menu"
          modal={modal}
          onOpenChange={handleOpenChange}
          {...props}
        >
          {children}

          {mounted &&
            createPortal(
              <>
                <AnimatePresence onExitComplete={() => setReturning(false)}>
                  {open && clampedRect ? (
                    <motion.div
                      key="context-menu-backdrop"
                      aria-hidden
                      data-slot="context-menu-backdrop"
                      className={cn(
                        'fixed inset-0 z-40 bg-morphing-50 backdrop-blur-md',
                        backdropClassName
                      )}
                      style={backdropMask}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: backdropExit }}
                      transition={fade}
                    />
                  ) : null}
                </AnimatePresence>

                {triggerVisible && clampedRect ? (
                  <motion.div
                    ref={elevatedRef}
                    layoutId={layoutId}
                    transition={spring}
                    data-slot="context-menu-elevated-trigger"
                    className="pointer-events-none fixed z-50"
                    style={{
                      top: clampedRect.top,
                      left: clampedRect.left,
                      width: clampedRect.width
                    }}
                  >
                    <div className="pointer-events-none h-full w-full">{getTriggerChildren()}</div>
                  </motion.div>
                ) : null}
              </>,
              document.body
            )}
        </ContextMenuPrimitive.Root>
      </LayoutGroup>
    </ContextMenuContext.Provider>
  )
}

function ContextMenuTrigger({ className, children, ref, ...props }: ComponentProps<'div'>) {
  const { open, layoutId, originRect, spring, setTriggerEl, registerTriggerChildren } =
    useContextMenu()

  registerTriggerChildren(children)

  const triggerRef = useCallback(
    (node: HTMLDivElement | null) => {
      setTriggerEl(node)
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref, setTriggerEl]
  )

  return (
    <ContextMenuPrimitive.Trigger asChild>
      <div
        ref={triggerRef}
        data-slot="context-menu-trigger"
        className={cn('inline-block outline-none', open && 'invisible', className)}
        style={
          open && originRect ? { width: originRect.width, height: originRect.height } : undefined
        }
        {...props}
      >
        {!open ? (
          <motion.div layoutId={layoutId} transition={spring} className="w-full min-w-0">
            {children}
          </motion.div>
        ) : (
          <div aria-hidden style={{ width: originRect?.width, height: originRect?.height }} />
        )}
      </div>
    </ContextMenuPrimitive.Trigger>
  )
}

function ContextMenuContent({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  const { setFloating, floatingStyles, isPositioned, side, reducedMotion } = useContextMenu()

  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className="z-60 overflow-visible border-0 bg-transparent p-0 shadow-none outline-none"
        onCloseAutoFocus={(event) => event.preventDefault()}
        {...props}
      >
        <motion.div
          ref={setFloating}
          key={side}
          style={{
            ...floatingStyles,
            visibility: isPositioned ? 'visible' : 'hidden'
          }}
          className={cn('z-60 min-w-48 bg-transparent p-1', className)}
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: reducedMotion ? 0 : 0.03
              }
            }
          }}
        >
          {children}
        </motion.div>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = 'default',
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  const { enterOffset, itemTransition } = useContextMenu()

  return (
    <motion.div
      variants={{
        hidden: {
          opacity: 0,
          ...enterOffset
        },
        show: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: itemTransition
        }
      }}
    >
      <ContextMenuPrimitive.Item
        data-slot="context-menu-item"
        data-inset={inset}
        data-variant={variant}
        className={cn(
          'flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none',
          'text-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground',
          'active:scale-[0.98] transition-transform duration-150',
          'data-disabled:pointer-events-none data-disabled:opacity-50',
          'data-inset:pl-8',
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          variant === 'destructive' &&
            'text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive [&_svg]:text-destructive',
          className
        )}
        {...props}
      >
        {children}
      </ContextMenuPrimitive.Item>
    </motion.div>
  )
}

function ContextMenuGroup({ ...props }: ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        'px-2.5 py-1.5 text-sm font-medium text-muted-foreground data-inset:pl-8',
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  const { itemTransition } = useContextMenu()

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: itemTransition }
      }}
    >
      <ContextMenuPrimitive.Separator
        data-slot="context-menu-separator"
        className={cn('my-1 h-px bg-border', className)}
        {...props}
      />
    </motion.div>
  )
}

function ContextMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        'ml-auto font-mono text-[10px] tracking-widest text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
}
