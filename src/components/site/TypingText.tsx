import { useEffect, useState } from "react";

export function TypingText({
  texts,
  className,
  caretClassName = "text-primary",
  speed = 80,
  deleteSpeed = 45,
  startDelay = 300,
  pauseAfterType = 1600,
  pauseAfterDelete = 400,
}: {
  texts: string[];
  className?: string;
  caretClassName?: string;
  speed?: number;
  deleteSpeed?: number;
  startDelay?: number;
  pauseAfterType?: number;
  pauseAfterDelete?: number;
}) {
  const [textIndex, setTextIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pausedFull" | "deleting" | "pausedEmpty">(
    "typing",
  );

  const text = texts[textIndex] ?? "";

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      const delay = count === 0 ? startDelay : speed;
      timer = setTimeout(() => {
        if (count < text.length) {
          setCount(count + 1);
        } else {
          setPhase("pausedFull");
        }
      }, delay);
    } else if (phase === "pausedFull") {
      timer = setTimeout(() => setPhase("deleting"), pauseAfterType);
    } else if (phase === "deleting") {
      timer = setTimeout(() => {
        if (count > 0) {
          setCount(count - 1);
        } else {
          setPhase("pausedEmpty");
        }
      }, deleteSpeed);
    } else {
      timer = setTimeout(() => {
        setTextIndex((textIndex + 1) % texts.length);
        setPhase("typing");
      }, pauseAfterDelete);
    }

    return () => clearTimeout(timer);
  }, [
    phase,
    count,
    text,
    textIndex,
    texts.length,
    speed,
    deleteSpeed,
    startDelay,
    pauseAfterType,
    pauseAfterDelete,
  ]);

  return (
    <span className="inline-flex items-baseline">
      <span className={className}>{text.slice(0, count)}</span>
      <span className={`ml-0.5 animate-caret-blink ${caretClassName}`}>|</span>
    </span>
  );
}
