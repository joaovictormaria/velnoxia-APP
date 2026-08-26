import { useEffect, useState } from "react";

type Phase = "typing-first" | "typed-first" | "typing-second" | "typed-both" | "deleting-second" | "deleted-second" | "deleting-first" | "empty";

export function SequentialTypingText({
  firstText,
  secondText,
  className,
  firstClassName,
  secondClassName,
  caretClassName = "text-primary",
  speed = 80,
  deleteSpeed = 45,
  startDelay = 300,
  pauseBetween = 500,
  pauseAfterBoth = 1600,
}: {
  firstText: string;
  secondText: string;
  className?: string;
  firstClassName?: string;
  secondClassName?: string;
  caretClassName?: string;
  speed?: number;
  deleteSpeed?: number;
  startDelay?: number;
  pauseBetween?: number;
  pauseAfterBoth?: number;
}) {
  const [phase, setPhase] = useState<Phase>("typing-first");
  const [firstCount, setFirstCount] = useState(0);
  const [secondCount, setSecondCount] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "typing-first") {
      const delay = firstCount === 0 ? startDelay : speed;
      timer = setTimeout(() => {
        if (firstCount < firstText.length) {
          setFirstCount(firstCount + 1);
        } else {
          setPhase("typed-first");
        }
      }, delay);
    } else if (phase === "typed-first") {
      timer = setTimeout(() => setPhase("typing-second"), pauseBetween);
    } else if (phase === "typing-second") {
      timer = setTimeout(() => {
        if (secondCount < secondText.length) {
          setSecondCount(secondCount + 1);
        } else {
          setPhase("typed-both");
        }
      }, speed);
    } else if (phase === "typed-both") {
      timer = setTimeout(() => setPhase("deleting-second"), pauseAfterBoth);
    } else if (phase === "deleting-second") {
      timer = setTimeout(() => {
        if (secondCount > 0) {
          setSecondCount(secondCount - 1);
        } else {
          setPhase("deleted-second");
        }
      }, deleteSpeed);
    } else if (phase === "deleted-second") {
      timer = setTimeout(() => setPhase("deleting-first"), pauseBetween);
    } else if (phase === "deleting-first") {
      timer = setTimeout(() => {
        if (firstCount > 0) {
          setFirstCount(firstCount - 1);
        } else {
          setPhase("empty");
        }
      }, deleteSpeed);
    } else if (phase === "empty") {
      timer = setTimeout(() => {
        setFirstCount(0);
        setSecondCount(0);
        setPhase("typing-first");
      }, startDelay);
    }

    return () => clearTimeout(timer);
  }, [phase, firstCount, secondCount, firstText.length, secondText.length, speed, deleteSpeed, startDelay, pauseBetween, pauseAfterBoth]);

  const firstDisplayText = firstText.slice(0, firstCount);
  const firstLineBreak = firstDisplayText.length > 14 ? Math.max(firstDisplayText.lastIndexOf(" "), 14) : -1;

  const displayFirstPart = firstLineBreak > 0 ? firstDisplayText.slice(0, firstLineBreak) : firstDisplayText;
  const displayFirstRest = firstLineBreak > 0 ? firstDisplayText.slice(firstLineBreak + 1) : "";

  return (
    <span className="inline-flex flex-col">
      <span className={firstClassName || className}>
        {displayFirstPart}
        {displayFirstRest && <><br />{displayFirstRest}</>}
      </span>
      <span className={secondClassName || className}>{secondText.slice(0, secondCount)}</span>
      {(phase.includes("typing") || phase.includes("deleting")) && (
        <span className={`ml-0.5 animate-caret-blink ${caretClassName}`}>|</span>
      )}
    </span>
  );
}
