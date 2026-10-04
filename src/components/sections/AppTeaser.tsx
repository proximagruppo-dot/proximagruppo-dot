import { useCallback, useEffect, useRef, useState } from 'react';
import { asset } from '../../lib/asset';
import { PairingDiagram, WatchFlowDiagram, DecisionLoopDiagram } from './AppDiagrams';
import styles from './AppTeaser.module.css';

type Beat = {
  id: string;
  index: string;
  eyebrow: string;
  headline: string;
  body: string;
  kind: 'pairing' | 'watch' | 'decision' | 'device';
  image?: { src: string; alt: string };
};

const BEATS: Beat[] = [
  {
    id: 'pairing', index: '01', eyebrow: 'Pairing', kind: 'pairing',
    headline: 'One tap. Then never again.',
    body: 'Pair once. It reconnects itself, forever after.',
  },
  {
    id: 'watch', index: '02', eyebrow: 'The watch', kind: 'watch',
    headline: 'Most of the thinking happens on your wrist.',
    body: 'Your watch quietly decides when you’re asleep — and tells your phone only the verdict.',
  },
  {
    id: 'decision', index: '03', eyebrow: 'The decision', kind: 'decision',
    headline: 'Two minutes of agreement, then the room follows.',
    body: 'Confirmed asleep, the lamp goes fully dark. Properly awake, it comes back on its own.',
  },
  {
    id: 'home', index: '04', eyebrow: 'Home', kind: 'device',
    headline: 'One screen, the whole night’s status.',
    body: 'Automatic or manual, lit or dark — see it all, change it in one tap.',
    image: { src: asset('/app/app-home.png'), alt: 'PROXIMA app Home screen showing Automatic mode active and the lamp connected' },
  },
  {
    id: 'sleep', index: '05', eyebrow: 'The sleep report', kind: 'device',
    headline: 'See the night, not just the result.',
    body: 'A hypnogram of your sleep, next to exactly what the lamp did about it.',
    image: { src: asset('/app/app-sleep.png'), alt: 'PROXIMA app sleep report showing a hypnogram of the night’s sleep stages above a chart of the lamp’s actual activity' },
  },
  {
    id: 'manual', index: '06', eyebrow: 'Manual override', kind: 'device',
    headline: 'Take it back whenever you want.',
    body: 'Flip to Manual and the lamp is entirely yours — on, off, however bright.',
    image: { src: asset('/app/app-manual.png'), alt: 'PROXIMA app Manual screen showing an on/off switch and a brightness slider' },
  },
];

/** Reveals a beat once, the first time it crosses into view. Opacity/transform only, so
 *  nothing else on the page reflows when it fires — avoids the hard-snap pop-in and the
 *  layout-shift classes of bug already hit (and fixed) in the hero section. */
function useRevealNode<T extends HTMLElement>(): [(node: T | null) => void, boolean] {
  const [revealed, setRevealed] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const setNode = useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); observer.current?.disconnect(); }
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    observer.current.observe(node);
  }, []);
  return [setNode, revealed];
}

function Beat({ beat, side, registerNode }: { beat: Beat; side: 'start' | 'end'; registerNode: (node: HTMLLIElement | null) => void }) {
  const [setRevealNode, revealed] = useRevealNode<HTMLLIElement>();
  const isHero = beat.kind === 'decision';
  const classNames = [styles.beat, isHero ? styles.beatHero : '', revealed ? styles.revealed : ''].filter(Boolean).join(' ');
  return (
    <li ref={(node) => { setRevealNode(node); registerNode(node); }} className={classNames} data-side={side}>
      <div className={styles.textCol}>
        <p className={styles.beatEyebrow}><span>{beat.index}</span>{beat.eyebrow}</p>
        <h3 className={styles.beatHeadline}>{beat.headline}</h3>
        <p className={styles.beatBody}>{beat.body}</p>
      </div>
      <div className={styles.visualCol}>
        {beat.kind === 'pairing' && <PairingDiagram />}
        {beat.kind === 'watch' && <WatchFlowDiagram />}
        {beat.kind === 'decision' && <DecisionLoopDiagram />}
        {beat.kind === 'device' && beat.image && (
          <div className={styles.deviceFrame}>
            <span className={styles.deviceNotch} aria-hidden="true" />
            <img src={beat.image.src} alt={beat.image.alt} width="874" height="1900" loading="lazy" className={styles.deviceScreen} />
          </div>
        )}
      </div>
    </li>
  );
}

export function AppTeaser() {
  const beatNodes = useRef<(HTMLLIElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const nodes = beatNodes.current.filter((node): node is HTMLLIElement => node !== null);
    if (!nodes.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const index = beatNodes.current.indexOf(entry.target as HTMLLIElement);
        if (index !== -1) setActiveIndex(index);
      });
    }, { threshold: 0, rootMargin: '-45% 0px -45% 0px' });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="app" className={styles.section} aria-labelledby="app-title">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}><span>02 /</span> THE COMPANION</p>
          <h2 id="app-title" className={styles.title}>Software with one job:<br /><span>disappear until it matters.</span></h2>
        </div>
        <p className={styles.intro}>Six moments from an ordinary night with PROXIMA — what the watch decides, what the lamp does, and what you see when you check in.</p>
      </div>
      <div className={styles.journey}>
        <nav className={styles.rail} aria-hidden="true">
          {BEATS.map((beat, index) => (
            <div key={beat.id} className={index === activeIndex ? `${styles.railItem} ${styles.railItemActive}` : styles.railItem}>
              <span className={styles.railDot} />
              <span className={styles.railLabel}>{beat.index}</span>
            </div>
          ))}
        </nav>
        <ol className={styles.beats}>
          {BEATS.map((beat, index) => (
            <Beat
              key={beat.id}
              beat={beat}
              side={index % 2 === 0 ? 'start' : 'end'}
              registerNode={(node) => { beatNodes.current[index] = node; }}
            />
          ))}
        </ol>
      </div>
      <p className={styles.closingNote}><span aria-hidden="true" /> SIX MOMENTS. ONE SYSTEM.</p>
    </section>
  );
}
