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
        month_caption: 'flex justify-center pt-1 relative items-center w-full',
        caption_label: 'text-sm font-medium text-morphing-800',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'absolute left-1 size-10 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-morphing-100'
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'absolute right-1 size-10 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-morphing-100'
        ),
        month_grid: 'w-full border-collapse space-x-1',
        weekdays: 'flex',
        weekday: 'text-morphing-600 rounded-md w-8 font-medium text-xs',
        week: 'flex w-full mt-2',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md',
          props.mode === 'range'
            ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md'
            : '[&:has([aria-selected])]:rounded-md'
        ),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 p-0 font-normal aria-selected:opacity-100 hover:bg-morphing-100',
          dayClassName
        ),
        range_start:
          'day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground',
        range_end: 'day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground',
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today:
          "after:content-['•'] after:absolute after:-bottom-2 after:left-1/2 after:-translate-x-1/2 after:text-morphing-900 after:text-lg",
        outside: 'day-outside text-morphing-400 aria-selected:text-morphing-400',
        disabled: 'text-morphing-400 opacity-50',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames
      }}
      {...props}
    />
  )
}

export { Calendar }
