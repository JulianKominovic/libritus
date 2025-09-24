import type * as React from 'react'
import { DayPicker } from 'react-day-picker'

import { buttonVariants } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  dayClassName,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  dayClassName?: string
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-4',
        caption: 'flex justify-center pt-1 relative items-center w-full',
        caption_label: 'text-sm font-medium text-black/80',
        nav: 'flex items-center gap-1',
        nav_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-10 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-light-muted'
        ),
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-x-1',
        head_row: 'flex',
        head_cell: 'text-black/40 rounded-md w-8 font-medium text-xs',
        row: 'flex w-full mt-2',
        cell: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md',
          props.mode === 'range'
            ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md'
            : '[&:has([aria-selected])]:rounded-md'
        ),
        day: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 p-0 font-normal aria-selected:opacity-100 hover:bg-light-muted',
          dayClassName
        ),
        day_range_start:
          'day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground',
        day_range_end:
          'day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground',
        day_selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        day_today:
          "after:content-['•'] after:absolute after:-bottom-2 after:left-1/2 after:-translate-x-1/2 after:text-dark after:text-lg",
        day_outside: 'day-outside text-black/20 aria-selected:text-black/20',
        day_disabled: 'text-black/20 opacity-50',
        day_range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        day_hidden: 'invisible',
        ...classNames
      }}
      components={
        {
          // IconLeft: ({
          //   className,
          //   ...props
          // }: { className?: string } & React.ComponentProps<typeof DynamicIcon>) => (
          //   <DynamicIcon {...props} name="chevron-left" className={cn('size-4', className)} />
          // ),
          // IconRight: ({
          //   className,
          //   ...props
          // }: { className?: string } & React.ComponentProps<typeof DynamicIcon>) => (
          //   <DynamicIcon {...props} name="chevron-right" className={cn('size-4', className)} />
          // )
        }
      }
      {...props}
    />
  )
}

export { Calendar }
