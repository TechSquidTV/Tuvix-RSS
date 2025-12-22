import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useSwipeable, type SwipeableConfig } from "@/hooks/use-swipeable";
import { cn } from "@/lib/utils";

interface SwipeableItemProps extends SwipeableConfig {
  children: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
}

export function SwipeableItem({
  children,
  leftIcon,
  rightIcon,
  onSwipeLeft,
  onSwipeRight,
  leftThreshold,
  rightThreshold,
  disabled,
  className,
}: SwipeableItemProps) {
  const {
    x,
    leftActionOpacity,
    leftActionScale,
    rightActionOpacity,
    rightActionScale,
    background,
    onDragEnd,
    controls,
  } = useSwipeable({
    onSwipeLeft,
    onSwipeRight,
    leftThreshold,
    rightThreshold,
    disabled,
  });

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md w-full max-w-full",
        className
      )}
    >
      {/* Red glow background layer with dynamic gradient */}
      <motion.div
        className="absolute inset-0 rounded-md"
        style={{
          background,
        }}
      />

      {/* Action indicators layer */}
      <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none">
        {/* Right swipe action indicator (appears on left side) */}
        {rightIcon && (
          <motion.div
            className="flex items-center justify-center w-12 h-12 text-white"
            style={{
              opacity: rightActionOpacity,
              scale: rightActionScale,
            }}
          >
            {rightIcon}
          </motion.div>
        )}

        {/* Spacer */}
        <div />

        {/* Left swipe action indicator (appears on right side) */}
        {leftIcon && (
          <motion.div
            className="flex items-center justify-center w-12 h-12 text-white"
            style={{
              opacity: leftActionOpacity,
              scale: leftActionScale,
            }}
          >
            {leftIcon}
          </motion.div>
        )}
      </div>

      {/* Draggable content layer */}
      <motion.div
        drag={disabled ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        dragMomentum={false}
        style={{ x }}
        animate={controls}
        onDragEnd={onDragEnd}
        className="relative z-10 touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
