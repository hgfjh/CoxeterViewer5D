import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import "./tour.css";

export interface TourStep {
  id: string;
  title: string;
  /** Paragraphs of body text. Kept as plain strings so steps stay data. */
  body: string[];
  /**
   * CSS selector for the element to spotlight. When it is missing or not yet
   * rendered (the step's app action may still be loading), the card is
   * centred and the spotlight is hidden.
   */
  target?: string;
  /** Optional short hint shown under the body, e.g. a keyboard shortcut. */
  hint?: string;
}

export type TourCloseReason = "finished" | "skipped";

interface GuidedTourProps<S extends TourStep> {
  steps: readonly S[];
  /** Called on every step entry, including the first, so the app can set up
   * the state that the step talks about. */
  onStepEnter?: (step: S, index: number) => void;
  onClose: (reason: TourCloseReason) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 6;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 12;
const NARROW_VIEWPORT = 700;
// A step's target can appear a few frames after its app action (worker
// results, panels that mount on mode change). Poll briefly, then give up and
// centre the card instead of pointing at nothing.
const TARGET_WAIT_MS = 2500;

function findTarget(selector: string | undefined): HTMLElement | null {
  if (!selector) return null;
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? element : null;
}

function toRect(element: HTMLElement): Rect {
  const r = element.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Place the card beside the target: right, left, below, above, in that order
 * of preference, using the first side with room. If none has room (the target
 * is the full viewer canvas, say), the card sits in the target's lower-left
 * corner. On narrow screens the card is docked to the bottom by CSS instead.
 */
function placeCard(
  target: Rect | null,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): CSSProperties {
  if (!target) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (viewport.height - card.height) / 2),
      left: Math.max(VIEWPORT_MARGIN, (viewport.width - card.width) / 2),
    };
  }
  const maxTop = viewport.height - card.height - VIEWPORT_MARGIN;
  const maxLeft = viewport.width - card.width - VIEWPORT_MARGIN;
  const alignedTop = clamp(target.top, VIEWPORT_MARGIN, maxTop);
  const alignedLeft = clamp(target.left, VIEWPORT_MARGIN, maxLeft);

  const right = target.left + target.width + CARD_GAP;
  if (right + card.width + VIEWPORT_MARGIN <= viewport.width) {
    return { top: alignedTop, left: right };
  }
  const left = target.left - CARD_GAP - card.width;
  if (left >= VIEWPORT_MARGIN) {
    return { top: alignedTop, left };
  }
  const below = target.top + target.height + CARD_GAP;
  if (below + card.height + VIEWPORT_MARGIN <= viewport.height) {
    return { top: below, left: alignedLeft };
  }
  const above = target.top - CARD_GAP - card.height;
  if (above >= VIEWPORT_MARGIN) {
    return { top: above, left: alignedLeft };
  }
  return {
    top: clamp(
      target.top + target.height - card.height - 24,
      VIEWPORT_MARGIN,
      maxTop,
    ),
    left: clamp(target.left + 24, VIEWPORT_MARGIN, maxLeft),
  };
}

/**
 * A step-by-step overlay that spotlights parts of the app. Mount it only
 * while the tour is open; unmounting resets it to the first step.
 *
 * The dimming layer does not capture pointer events, so the reader can try
 * each control while its step is showing. Escape skips the tour; the arrow
 * keys move between steps while focus is in the card. Those keys are caught in
 * the capture phase so the viewer's own camera shortcuts do not also fire.
 */
export function GuidedTour<S extends TourStep>({
  steps,
  onStepEnter,
  onClose,
}: GuidedTourProps<S>) {
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardStyle, setCardStyle] = useState<CSSProperties>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const onStepEnterRef = useRef(onStepEnter);
  useEffect(() => {
    onStepEnterRef.current = onStepEnter;
  }, [onStepEnter]);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (step) onStepEnterRef.current?.(step, index);
  }, [step, index]);

  const measure = useCallback(() => {
    const target = targetRef.current;
    const rect = target && target.isConnected ? toRect(target) : null;
    setTargetRect(rect);
    const card = cardRef.current;
    if (!card) return;
    setCardStyle(
      placeCard(
        rect,
        { width: card.offsetWidth, height: card.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, []);

  // Locate the step target, waiting for it if the step's action is still
  // rendering, then keep the spotlight in sync with layout changes.
  useLayoutEffect(() => {
    if (!step) return;
    targetRef.current = null;
    let frame = 0;
    const started = performance.now();
    const seek = () => {
      const found = findTarget(step.target);
      if (found) {
        targetRef.current = found;
        // On narrow screens the card is docked over the lower half, so the
        // target goes to the top of the screen where the card cannot hide it.
        found.scrollIntoView({
          block: window.innerWidth < NARROW_VIEWPORT ? "start" : "nearest",
          inline: "nearest",
        });
        measure();
        return;
      }
      measure();
      if (step.target && performance.now() - started < TARGET_WAIT_MS) {
        frame = requestAnimationFrame(seek);
      }
    };
    seek();
    const onLayout = () => measure();
    window.addEventListener("resize", onLayout);
    // Sidebars scroll independently; capture catches scrolls in any of them.
    window.addEventListener("scroll", onLayout, true);
    const observer = new ResizeObserver(onLayout);
    if (cardRef.current) observer.observe(cardRef.current);
    const settle = window.setInterval(onLayout, 400);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
      observer.disconnect();
      window.clearInterval(settle);
    };
  }, [step, measure]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [index]);

  const next = useCallback(() => {
    if (isLast) onClose("finished");
    else setIndex((current) => current + 1);
  }, [isLast, onClose]);

  const back = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const inCard =
        event.target instanceof Node &&
        Boolean(cardRef.current?.contains(event.target));
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose("skipped");
      } else if (inCard && event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        next();
      } else if (inCard && event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [next, back, onClose]);

  if (!step) return null;

  const spotlightStyle: CSSProperties | undefined = targetRect
    ? {
        top: targetRect.top - SPOTLIGHT_PADDING,
        left: targetRect.left - SPOTLIGHT_PADDING,
        width: targetRect.width + SPOTLIGHT_PADDING * 2,
        height: targetRect.height + SPOTLIGHT_PADDING * 2,
      }
    : undefined;
  const narrow = window.innerWidth < NARROW_VIEWPORT;

  return createPortal(
    <div className="tour-layer" data-testid="guided-tour">
      {spotlightStyle ? (
        <div className="tour-spotlight" style={spotlightStyle} aria-hidden />
      ) : (
        <div className="tour-scrim" aria-hidden />
      )}
      <div
        ref={cardRef}
        className={`tour-card${narrow ? " tour-card-docked" : ""}`}
        style={narrow ? undefined : cardStyle}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <div className="tour-card-header">
          <span className="tour-progress">
            {index + 1} of {steps.length}
          </span>
          <button
            type="button"
            className="tour-skip"
            onClick={() => onClose("skipped")}
          >
            {isLast ? "Close" : "Skip tour"}
          </button>
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <div id="tour-body" className="tour-body">
          {step.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {step.hint ? <p className="tour-hint">{step.hint}</p> : null}
        </div>
        <div
          className="tour-progress-bar"
          role="progressbar"
          aria-label="Tour progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="tour-actions">
          <button
            type="button"
            className="tour-back"
            onClick={back}
            disabled={index === 0}
          >
            Back
          </button>
          <button type="button" className="tour-next" onClick={next}>
            {isLast ? "Finish" : index === 0 ? "Start tour" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
