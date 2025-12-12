import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/animate-ui/components/radix/alert-dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";

/**
 * ResponsiveAlertDialog - A responsive alert dialog component that uses AlertDialog on desktop and Drawer on mobile
 *
 * Usage:
 * ```tsx
 * <ResponsiveAlertDialog open={open} onOpenChange={setOpen}>
 *   <ResponsiveAlertDialogContent>
 *     <ResponsiveAlertDialogHeader>
 *       <ResponsiveAlertDialogTitle>Are you sure?</ResponsiveAlertDialogTitle>
 *       <ResponsiveAlertDialogDescription>
 *         This action cannot be undone.
 *       </ResponsiveAlertDialogDescription>
 *     </ResponsiveAlertDialogHeader>
 *     <ResponsiveAlertDialogFooter>
 *       <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
 *       <ResponsiveAlertDialogAction>Continue</ResponsiveAlertDialogAction>
 *     </ResponsiveAlertDialogFooter>
 *   </ResponsiveAlertDialogContent>
 * </ResponsiveAlertDialog>
 * ```
 */

interface ResponsiveAlertDialogContextValue {
  isDesktop: boolean;
}

const ResponsiveAlertDialogContext =
  React.createContext<ResponsiveAlertDialogContextValue>({
    isDesktop: true,
  });

function useResponsiveAlertDialog() {
  const context = React.useContext(ResponsiveAlertDialogContext);
  if (!context) {
    throw new Error(
      "useResponsiveAlertDialog must be used within ResponsiveAlertDialog",
    );
  }
  return context;
}

interface ResponsiveAlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveAlertDialog({
  open,
  onOpenChange,
  children,
}: ResponsiveAlertDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const Component = isDesktop ? AlertDialog : Drawer;

  return (
    <ResponsiveAlertDialogContext.Provider value={{ isDesktop }}>
      <Component open={open} onOpenChange={onOpenChange}>
        {children}
      </Component>
    </ResponsiveAlertDialogContext.Provider>
  );
}

interface ResponsiveAlertDialogContentProps {
  children: React.ReactNode;
  className?: string;
}

function ResponsiveAlertDialogContent({
  children,
  className,
  ...props
}: ResponsiveAlertDialogContentProps) {
  const { isDesktop } = useResponsiveAlertDialog();

  if (isDesktop) {
    return (
      <AlertDialogContent className={className} {...props}>
        {children}
      </AlertDialogContent>
    );
  }

  return (
    <DrawerContent className={className} {...props}>
      {children}
    </DrawerContent>
  );
}

interface ResponsiveAlertDialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

function ResponsiveAlertDialogHeader({
  children,
  className,
  ...props
}: ResponsiveAlertDialogHeaderProps) {
  const { isDesktop } = useResponsiveAlertDialog();

  if (isDesktop) {
    return (
      <AlertDialogHeader className={className} {...props}>
        {children}
      </AlertDialogHeader>
    );
  }

  return (
    <DrawerHeader className={className} {...props}>
      {children}
    </DrawerHeader>
  );
}

interface ResponsiveAlertDialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

function ResponsiveAlertDialogTitle({
  children,
  className,
  ...props
}: ResponsiveAlertDialogTitleProps) {
  const { isDesktop } = useResponsiveAlertDialog();

  if (isDesktop) {
    return (
      <AlertDialogTitle className={className} {...props}>
        {children}
      </AlertDialogTitle>
    );
  }

  return (
    <DrawerTitle className={className} {...props}>
      {children}
    </DrawerTitle>
  );
}

interface ResponsiveAlertDialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

function ResponsiveAlertDialogDescription({
  children,
  className,
  ...props
}: ResponsiveAlertDialogDescriptionProps) {
  const { isDesktop } = useResponsiveAlertDialog();

  if (isDesktop) {
    return (
      <AlertDialogDescription className={className} {...props}>
        {children}
      </AlertDialogDescription>
    );
  }

  return (
    <DrawerDescription className={className} {...props}>
      {children}
    </DrawerDescription>
  );
}

interface ResponsiveAlertDialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

function ResponsiveAlertDialogFooter({
  children,
  className,
  ...props
}: ResponsiveAlertDialogFooterProps) {
  const { isDesktop } = useResponsiveAlertDialog();

  if (isDesktop) {
    return (
      <AlertDialogFooter className={className} {...props}>
        {children}
      </AlertDialogFooter>
    );
  }

  return (
    <DrawerFooter className={className} {...props}>
      {children}
    </DrawerFooter>
  );
}

interface ResponsiveAlertDialogActionProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

function ResponsiveAlertDialogAction({
  children,
  className,
  ...props
}: ResponsiveAlertDialogActionProps) {
  const { isDesktop } = useResponsiveAlertDialog();

  if (isDesktop) {
    return (
      <AlertDialogAction className={className} {...props}>
        {children}
      </AlertDialogAction>
    );
  }

  return (
    <DrawerClose asChild>
      <Button className={className} {...props}>
        {children}
      </Button>
    </DrawerClose>
  );
}

interface ResponsiveAlertDialogCancelProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

function ResponsiveAlertDialogCancel({
  children,
  className,
  ...props
}: ResponsiveAlertDialogCancelProps) {
  const { isDesktop } = useResponsiveAlertDialog();

  if (isDesktop) {
    return (
      <AlertDialogCancel className={className} {...props}>
        {children}
      </AlertDialogCancel>
    );
  }

  return (
    <DrawerClose asChild>
      <Button variant="outline" className={className} {...props}>
        {children}
      </Button>
    </DrawerClose>
  );
}

export {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogTitle,
  ResponsiveAlertDialogDescription,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
};
