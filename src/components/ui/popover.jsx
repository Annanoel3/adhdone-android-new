import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

// Every popup has a way out you can see: a Close button at the bottom.
// Before, a popup only went away when you tapped somewhere outside it. Nothing
// on screen said so, and on a phone that tap also lands on whatever is under
// it (Anna, Nov 14 2026: "Lots of pop ups dont go away on their own and have no
// way to exit", with the time box of a daily task open over Mark as Complete).
//   noClose      a popup that already has its own button out (the card's
//                repeat box has Done), or a plain dropdown.
//   closeLabel   other words for the button.
//   closeOnPick  a list of choices that used to stay open after one was
//                picked: any button tapped inside closes it.
// The colours are set here, not taken from the theme: each popup paints its
// own light or dark background, and this has to read on both.
const PopoverContent = React.forwardRef(({ className, align = "center", sideOffset = 4, children, noClose = false, closeLabel = "Close", closeOnPick = false, onClick, ...props }, ref) => {
  const closeRef = React.useRef(null)
  const handleClick = (e) => {
    if (onClick) onClick(e)
    if (!closeOnPick || !closeRef.current) return
    const picked = e.target instanceof Element ? e.target.closest("button") : null
    if (picked && picked !== closeRef.current && !picked.disabled) closeRef.current.click()
  }
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        onClick={handleClick}
        {...props}>
        {children}
        {!noClose && (
          <PopoverPrimitive.Close
            ref={closeRef}
            type="button"
            className="mt-2 block w-full rounded-md bg-purple-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
            {closeLabel}
          </PopoverPrimitive.Close>
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
export const PopoverClose = PopoverPrimitive.Close
