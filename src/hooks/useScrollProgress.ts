import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAPTERS, COMPONENTS, chapterAt, componentAt, clamp } from '../three/story';

/** Native sticky scrolling with one shared, gently smoothed progress value. */
export function useScrollProgress(stageRef: React.RefObject<HTMLElement | null>, onProgress: (progress: number) => void) {
  const progressRef = useRef(0);
  const callback = useRef(onProgress);
  const [reducedMotion, setReducedMotion] = useState(false);
  useLayoutEffect(() => { callback.current = onProgress; }, [onProgress]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => setReducedMotion(media.matches);
    onPreference();
    media.addEventListener('change', onPreference);
    return () => media.removeEventListener('change', onPreference);
  }, []);
  useEffect(() => {
    let frame = 0;
    let resizeTimer = 0;
    let target = 0;
    let previousTime = 0;
    // Mobile browsers resize `window.innerHeight` live as their address bar hides/shows while
    // you scroll (even though the CSS `100svh` sticky container never visually changes size).
    // Reading window.innerHeight on every scroll tick made the progress denominator wobble with
    // zero extra physical scroll -- the exact cause of the "jumps on every scroll" mobile bug.
    // Cache it and only refresh on a settled (debounced) resize, i.e. a real layout change.
    let viewportHeight = window.innerHeight;
    const update = (time: number) => {
      const dt = Math.min((time - (previousTime || time - 16)) / 1000, 0.05);
      previousTime = time;
      const destination = reducedMotion ? (chapterAt(target) === 3 ? COMPONENTS[componentAt(target)].at : CHAPTERS[chapterAt(target)].at) : target;
      progressRef.current = reducedMotion ? destination : progressRef.current + (destination - progressRef.current) * (1 - Math.exp(-14 * dt));
      if (Math.abs(destination - progressRef.current) < 0.0001) progressRef.current = destination;
      callback.current(progressRef.current);
      frame = Math.abs(destination - progressRef.current) > 0.0001 ? requestAnimationFrame(update) : 0;
    };
    const read = () => {
      const element = stageRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      target = clamp(-rect.top / Math.max(1, element.offsetHeight - viewportHeight));
      if (!frame) { previousTime = 0; frame = requestAnimationFrame(update); }
    };
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { viewportHeight = window.innerHeight; read(); }, 180);
    };
    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(onResize);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', onResize);
    };
  }, [stageRef, reducedMotion]);
  const scrollToProgress = useCallback((progress: number) => {
    const element = stageRef.current;
    if (!element) return;
    if (reducedMotion) { progressRef.current = progress; callback.current(progress); }
    const top = window.scrollY + element.getBoundingClientRect().top;
    window.scrollTo({ top: top + progress * (element.offsetHeight - window.innerHeight), behavior: reducedMotion ? 'instant' : 'smooth' });
  }, [stageRef, reducedMotion]);
  return { progressRef, reducedMotion, scrollToProgress };
}
