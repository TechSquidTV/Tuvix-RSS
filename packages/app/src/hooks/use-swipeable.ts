import {
  useMotionValue,
  useTransform,
  useAnimation,
  type PanInfo,
  type MotionValue,
} from "motion/react";
import { useCallback, useState } from "react";

export interface SwipeableConfig {
  onSwipeLeft?: () => void | Promise<void>;
  onSwipeRight?: () => void | Promise<void>;
  leftThreshold?: number;
  rightThreshold?: number;
  disabled?: boolean;
}

export interface SwipeableReturn {
  // Motion values
  x: MotionValue<number>;
  // Transforms for visual feedback
  leftActionOpacity: MotionValue<number>;
  leftActionScale: MotionValue<number>;
  rightActionOpacity: MotionValue<number>;
  rightActionScale: MotionValue<number>;
  backgroundOpacity: MotionValue<number>;
  background: MotionValue<string>;
  // Drag handlers
  onDragStart?: () => void;
  onDragEnd: (event: PointerEvent, info: PanInfo) => void;
  // Animation controls
  controls: ReturnType<typeof useAnimation>;
  // State
  isDragging: boolean;
}

const DEFAULT_LEFT_THRESHOLD = 120;
const DEFAULT_RIGHT_THRESHOLD = 120;

export function useSwipeable({
  onSwipeLeft,
  onSwipeRight,
  leftThreshold = DEFAULT_LEFT_THRESHOLD,
  rightThreshold = DEFAULT_RIGHT_THRESHOLD,
  disabled = false,
}: SwipeableConfig): SwipeableReturn {
  const x = useMotionValue(0);
  const controls = useAnimation();
  const [isDragging, setIsDragging] = useState(false);

  // Visual feedback transforms
  // Left action (negative x - swipe left)
  const leftActionOpacity = useTransform(
    x,
    [-leftThreshold, -leftThreshold / 3, 0],
    [1, 0.5, 0]
  );
  const leftActionScale = useTransform(
    x,
    [-leftThreshold, -leftThreshold / 2, 0],
    [1, 0.8, 0.5]
  );

  // Right action (positive x - swipe right)
  const rightActionOpacity = useTransform(
    x,
    [0, rightThreshold / 3, rightThreshold],
    [0, 0.5, 1]
  );
  const rightActionScale = useTransform(
    x,
    [0, rightThreshold / 2, rightThreshold],
    [0.5, 0.8, 1]
  );

  // Background opacity that increases as you swipe in either direction
  const backgroundOpacity = useTransform(
    x,
    [-leftThreshold, -leftThreshold / 2, 0, rightThreshold / 2, rightThreshold],
    [0.5, 0.25, 0, 0.25, 0.5]
  );

  // Dynamic gradient that changes direction and intensity based on swipe
  const background = useTransform(x, (value) => {
    const absValue = Math.abs(value);
    const intensity = Math.min(absValue / 120, 1); // 0 to 1

    if (value > 0) {
      // Swiping right (mark as read) - red gradient from left
      return `linear-gradient(to right, 
        rgba(239, 68, 68, ${intensity * 0.8}) 0%, 
        rgba(220, 38, 38, ${intensity * 0.5}) 50%, 
        rgba(185, 28, 28, 0) 100%)`;
    } else if (value < 0) {
      // Swiping left (save) - gold gradient from right
      return `linear-gradient(to left, 
        rgba(234, 179, 8, ${intensity * 0.8}) 0%, 
        rgba(202, 138, 4, ${intensity * 0.5}) 50%, 
        rgba(161, 98, 7, 0) 100%)`;
    }
    return "transparent";
  });

  const onDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const onDragEnd = useCallback(
    async (_event: PointerEvent, info: PanInfo) => {
      setIsDragging(false);

      if (disabled) {
        await controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 300, damping: 30 },
        });
        return;
      }

      const offset = info.offset.x;
      const velocity = info.velocity.x;

      // Determine if threshold was met
      const swipedLeft = offset < -leftThreshold || velocity < -500;
      const swipedRight = offset > rightThreshold || velocity > 500;

      if (swipedLeft && onSwipeLeft) {
        // Quick animation to show action then snap back
        await controls.start({
          x: -150,
          transition: {
            type: "spring",
            stiffness: 400,
            damping: 25,
            duration: 0.2,
          },
        });
        onSwipeLeft();
        // Snap back to center
        await controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 300, damping: 30 },
        });
      } else if (swipedRight && onSwipeRight) {
        // Quick animation to show action then snap back
        await controls.start({
          x: 150,
          transition: {
            type: "spring",
            stiffness: 400,
            damping: 25,
            duration: 0.2,
          },
        });
        onSwipeRight();
        // Snap back to center
        await controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 300, damping: 30 },
        });
      } else {
        // Snap back to center
        await controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 400, damping: 30 },
        });
      }
    },
    [
      controls,
      disabled,
      leftThreshold,
      rightThreshold,
      onSwipeLeft,
      onSwipeRight,
    ]
  );

  return {
    x,
    leftActionOpacity,
    leftActionScale,
    rightActionOpacity,
    rightActionScale,
    backgroundOpacity,
    background,
    onDragStart,
    onDragEnd,
    controls,
    isDragging,
  };
}
