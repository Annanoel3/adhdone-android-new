import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref} />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props} />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props} />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
    {...props} />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

// ── The app's own alert / confirm ───────────────────────────────────────────
// The browser's alert() and confirm() come up as Android's grey system box with
// "adhdone.space says" across the top (Anna, Oct 3 2026). These show the same
// messages inside the app. AppDialogHost is mounted once (in the Layout); while
// it is, window.alert is routed here too, so every alert(...) in the app lands
// in this box without each call site changing. confirm() can't be swapped the
// same way (it has to block for an answer), so those call sites use appConfirm.
// The first line of a message is the title; any lines after it are the body.
const dialogListeners = new Set();
let dialogSeq = 0;
function requestDialog(req) {
  return new Promise((resolve) => {
    const item = { id: ++dialogSeq, ...req, resolve };
    dialogListeners.forEach((fn) => fn(item));
  });
}

function splitMessage(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
  return { title: lines[0] || 'ADHDone', body: lines.slice(1).join('\n') };
}

function appAlert(message, { okText = 'OK' } = {}) {
  const { title, body } = splitMessage(message);
  return requestDialog({ kind: 'alert', title, body, okText }).then(() => undefined);
}

function appConfirm(message, { okText = 'OK', cancelText = 'Cancel', destructive = false } = {}) {
  const { title, body } = splitMessage(message);
  return requestDialog({ kind: 'confirm', title, body, okText, cancelText, destructive });
}

function AppDialogHost() {
  const [queue, setQueue] = React.useState([]);
  React.useEffect(() => {
    const onRequest = (item) => setQueue((q) => [...q, item]);
    dialogListeners.add(onRequest);
    const nativeAlert = window.alert;
    window.alert = (message) => { appAlert(message); };
    return () => {
      dialogListeners.delete(onRequest);
      window.alert = nativeAlert;
    };
  }, []);

  const current = queue[0];
  const settle = (value) => {
    if (!current) return;
    current.resolve(value);
    setQueue((q) => q.slice(1));
  };
  // The buttons answer and move the queue on themselves; Radix must not close
  // the box behind them (preventDefault), or the next message in line would be
  // answered by that same close. Escape / a tap outside is a "no".
  const answer = (value) => (e) => { e.preventDefault(); settle(value); };

  return (
    <AlertDialog open={!!current} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent className="max-w-sm w-[calc(100vw-2rem)] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-left">{current?.title}</AlertDialogTitle>
          {current?.body ? (
            <AlertDialogDescription className="text-left whitespace-pre-line">{current.body}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {current?.kind === 'confirm' && (
            <AlertDialogCancel onClick={answer(false)}>{current.cancelText}</AlertDialogCancel>
          )}
          <AlertDialogAction onClick={answer(true)} className={current?.destructive ? 'bg-red-600 hover:bg-red-700 text-white' : ''}>
            {current?.okText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AppDialogHost,
  appAlert,
  appConfirm,
}
