/**
 * Scrub Bar Tests
 *
 * Tests for ScrubBar components including swipe gesture interference prevention
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ScrubBarContainer,
  ScrubBarTrack,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTimeLabel,
} from "../scrub-bar";

describe("ScrubBar", () => {
  describe("ScrubBarContainer", () => {
    it("should render children", () => {
      render(
        <ScrubBarContainer duration={100} value={50}>
          <div data-testid="child">Child content</div>
        </ScrubBarContainer>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("should provide context to children", () => {
      render(
        <ScrubBarContainer duration={100} value={50}>
          <ScrubBarTimeLabel time={50} />
        </ScrubBarContainer>,
      );

      expect(screen.getByText("0:50")).toBeInTheDocument();
    });
  });

  describe("ScrubBarTrack", () => {
    it("should prevent event propagation on pointer down", async () => {
      const mockOnScrub = vi.fn();
      const mockStopPropagation = vi.fn();

      render(
        <ScrubBarContainer duration={100} value={0} onScrub={mockOnScrub}>
          <ScrubBarTrack data-testid="track">
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const track = screen.getByTestId("track");

      // Create a pointer down event with stopPropagation spy
      const pointerDownEvent = new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 50,
      });
      Object.defineProperty(pointerDownEvent, "stopPropagation", {
        value: mockStopPropagation,
      });

      act(() => {
        track.dispatchEvent(pointerDownEvent);
      });

      expect(mockStopPropagation).toHaveBeenCalled();
    });

    it("should call onScrub when clicked", async () => {
      const user = userEvent.setup();
      const mockOnScrub = vi.fn();

      render(
        <ScrubBarContainer duration={100} value={0} onScrub={mockOnScrub}>
          <ScrubBarTrack data-testid="track">
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const track = screen.getByTestId("track");
      await user.pointer({ target: track, keys: "[MouseLeft>]" });

      expect(mockOnScrub).toHaveBeenCalled();
    });

    it("should call onScrubStart when dragging starts", async () => {
      const user = userEvent.setup();
      const mockOnScrubStart = vi.fn();

      render(
        <ScrubBarContainer
          duration={100}
          value={0}
          onScrubStart={mockOnScrubStart}
        >
          <ScrubBarTrack data-testid="track">
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const track = screen.getByTestId("track");
      await user.pointer({ target: track, keys: "[MouseLeft>]" });

      expect(mockOnScrubStart).toHaveBeenCalled();
    });

    it("should call onScrubEnd when dragging ends", async () => {
      const user = userEvent.setup();
      const mockOnScrubEnd = vi.fn();

      render(
        <ScrubBarContainer duration={100} value={0} onScrubEnd={mockOnScrubEnd}>
          <ScrubBarTrack data-testid="track">
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const track = screen.getByTestId("track");
      await user.pointer([
        { target: track, keys: "[MouseLeft>]" },
        { keys: "[/MouseLeft]" },
      ]);

      expect(mockOnScrubEnd).toHaveBeenCalled();
    });
  });

  describe("ScrubBarProgress", () => {
    it("should show correct progress percentage", () => {
      const { container } = render(
        <ScrubBarContainer duration={100} value={25}>
          <ScrubBarTrack>
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const progressBar = container.querySelector(".bg-primary");
      expect(progressBar).toHaveStyle({ width: "25%" });
    });

    it("should show 0% when value is 0", () => {
      const { container } = render(
        <ScrubBarContainer duration={100} value={0}>
          <ScrubBarTrack>
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const progressBar = container.querySelector(".bg-primary");
      expect(progressBar).toHaveStyle({ width: "0%" });
    });

    it("should show 100% when value equals duration", () => {
      const { container } = render(
        <ScrubBarContainer duration={100} value={100}>
          <ScrubBarTrack>
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const progressBar = container.querySelector(".bg-primary");
      expect(progressBar).toHaveStyle({ width: "100%" });
    });

    it("should handle 0 duration safely", () => {
      const { container } = render(
        <ScrubBarContainer duration={0} value={0}>
          <ScrubBarTrack>
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const progressBar = container.querySelector(".bg-primary");
      expect(progressBar).toHaveStyle({ width: "0%" });
    });
  });

  describe("ScrubBarThumb", () => {
    it("should position thumb based on progress", () => {
      const { container } = render(
        <ScrubBarContainer duration={100} value={50}>
          <ScrubBarTrack>
            <ScrubBarThumb />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      const thumb = container.querySelector(".bg-primary");
      expect(thumb).toHaveStyle({ left: "50%" });
    });

    it("should only show thumb for current audio", () => {
      const { container } = render(
        <ScrubBarContainer duration={100} value={50}>
          <ScrubBarTrack>
            <ScrubBarProgress />
          </ScrubBarTrack>
        </ScrubBarContainer>,
      );

      // Thumb should not be rendered if not current audio
      const thumbs = container.querySelectorAll(".h-4.w-4.rounded-full");
      expect(thumbs.length).toBe(0);
    });
  });

  describe("ScrubBarTimeLabel", () => {
    it("should format time correctly", () => {
      render(
        <ScrubBarContainer duration={100} value={0}>
          <ScrubBarTimeLabel time={125} />
        </ScrubBarContainer>,
      );

      expect(screen.getByText("2:05")).toBeInTheDocument();
    });

    it("should format zero time", () => {
      render(
        <ScrubBarContainer duration={100} value={0}>
          <ScrubBarTimeLabel time={0} />
        </ScrubBarContainer>,
      );

      expect(screen.getByText("0:00")).toBeInTheDocument();
    });

    it("should pad seconds with zero", () => {
      render(
        <ScrubBarContainer duration={100} value={0}>
          <ScrubBarTimeLabel time={65} />
        </ScrubBarContainer>,
      );

      expect(screen.getByText("1:05")).toBeInTheDocument();
    });

    it("should support custom format function", () => {
      const customFormat = (time: number) => `${time}s`;

      render(
        <ScrubBarContainer duration={100} value={0}>
          <ScrubBarTimeLabel time={42} format={customFormat} />
        </ScrubBarContainer>,
      );

      expect(screen.getByText("42s")).toBeInTheDocument();
    });
  });

  describe("Swipe Gesture Interference Prevention", () => {
    it("should not propagate pointer events to parent swipeable container", async () => {
      const mockParentHandler = vi.fn();
      const mockOnScrub = vi.fn();

      render(
        <div onPointerDown={mockParentHandler} data-testid="parent">
          <ScrubBarContainer duration={100} value={50} onScrub={mockOnScrub}>
            <ScrubBarTrack data-testid="track">
              <ScrubBarProgress />
            </ScrubBarTrack>
          </ScrubBarContainer>
        </div>,
      );

      const track = screen.getByTestId("track");

      // Simulate pointer down on scrub bar
      const pointerDownEvent = new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 50,
      });

      act(() => {
        track.dispatchEvent(pointerDownEvent);
      });

      // Parent handler should NOT be called because stopPropagation was used
      expect(mockParentHandler).not.toHaveBeenCalled();
      // But onScrub should still work
      expect(mockOnScrub).toHaveBeenCalled();
    });
  });
});
