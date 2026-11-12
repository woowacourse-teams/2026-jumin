import { useEffect, useRef } from 'react';

/**
 * 랜딩 스크롤 영역에 스크롤 연출을 붙인다.
 * - `data-reveal` 요소가 화면에 들어오면 `data-revealed`를 달아 등장 전환을 시작한다.
 * - 스크롤 진행률(0~1)을 `--scroll-progress`로, 맨 위를 벗어났는지를 `data-scrolled`로 알려준다.
 *
 * IntersectionObserver가 없는 환경(테스트용 jsdom 등)에서는 `data-reveal-ready`를 달지 않아
 * 모든 내용이 처음부터 보인다.
 */
export const useLandingScroll = <T extends HTMLElement>() => {
  const scrollerRef = useRef<T>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const scrollable = scroller.scrollHeight - scroller.clientHeight;
      const progress = scrollable > 0 ? scroller.scrollTop / scrollable : 0;
      scroller.style.setProperty('--scroll-progress', progress.toFixed(4));
      scroller.toggleAttribute('data-scrolled', scroller.scrollTop > 8);
    };
    const handleScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(updateProgress);
    };
    updateProgress();
    scroller.addEventListener('scroll', handleScroll, { passive: true });

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute('data-revealed', '');
            observer?.unobserve(entry.target);
          }
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
      );
      for (const target of scroller.querySelectorAll('[data-reveal]')) observer.observe(target);
      scroller.setAttribute('data-reveal-ready', '');
    }

    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return scrollerRef;
};
