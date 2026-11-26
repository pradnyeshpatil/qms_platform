import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Legacy button API (variant/size/asChild) rendered in the new design, so older pages match the kit. */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'text-white bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 bg-[length:140%_100%] bg-left shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_8px_18px_-6px_rgb(99_70_229/0.65)] hover:bg-right',
        outline: 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50 hover:ring-slate-300',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        destructive: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
      },
      size: { default: 'h-10 px-4 text-sm', sm: 'h-8 px-3 text-[13px]' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  },
)
Button.displayName = 'Button'
