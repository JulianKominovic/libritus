import clsx from 'clsx'
import { useId } from 'react'
import type { Keys } from '../../lib/keymaps.ts'

type Props = {
  keys: (typeof Keys | React.ReactNode | string)[]
} & React.HTMLAttributes<HTMLElement>

const Shortcut = ({ keys, ...rest }: Props) => {
  const id = useId()
  return (
    <kbd
      {...rest}
      className={clsx(
        'inline-flex items-center gap-0.5 leading-none font-medium font-sans text-xs tabular-nums bg-black/10 rounded text-black p-0.5',
        rest.className
      )}
    >
      {keys.map((k, i) => (
        <span key={id + i}>{k as any}</span>
      ))}
    </kbd>
  )
}

export default Shortcut
