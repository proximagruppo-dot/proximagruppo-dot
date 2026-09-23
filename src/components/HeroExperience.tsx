import { Component, Suspense, lazy, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { CHAPTERS, COMPONENTS, chapterAt, componentAt, smooth } from '../three/story';
import { asset } from '../lib/asset';
import { ConnectedDevices } from './ConnectedDevices';
import styles from './HeroExperience.module.css';

const Scene = lazy(() => import('../three/Scene').then((module) => ({ default: module.Scene })));

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ModelFallback({ loading = false }: { loading?: boolean }) {
  return <div className={styles.fallback} role="status"><img src={asset('/photos/lamp-1.jpg')} alt="The physical PROXIMA lamp prototype" /><span>{loading ? 'Preparing your product tour…' : 'The PROXIMA prototype · Explore the story below'}</span></div>;
}

export function HeroExperience() {
  const stageRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ chapter: 0, component: 0 });
  const { progressRef, reducedMotion, scrollToProgress } = useScrollProgress(stageRef, (progress) => {
    const chapter = chapterAt(progress);
    const component = componentAt(progress);
    setView((previous) => previous.chapter === chapter && previous.component === component ? previous : { chapter, component });
    const element = stickyRef.current;
    if (element) {
      element.style.setProperty('--devices-opacity', String(1 - smooth(0.055, 0.16, progress)));
      element.style.setProperty('--device-travel', String(smooth(0.025, 0.17, progress) * 320));
      element.style.setProperty('--story-progress', String(progress));
    }
    if (stageRef.current) stageRef.current.dataset.progress = progress.toFixed(4);
  });
  const chapter = CHAPTERS[view.chapter];
  const component = COMPONENTS[view.component];
  return (
    <section id="experience" ref={stageRef} className={styles.stage} data-experience data-chapter={view.chapter} aria-label="Explore the PROXIMA lamp in five chapters">
      <div ref={stickyRef} className={styles.sticky} data-chapter={view.chapter}>
        <div className={styles.ambient} aria-hidden="true" />
        <div className={styles.heading} key={view.chapter}>
          <p className={styles.eyebrow}><span />{chapter.eyebrow}</p>
          <h1>{chapter.title}</h1>
          <p className={styles.description}>{chapter.body}</p>
        </div>
        <div className={styles.visual}>
          <SceneBoundary fallback={<ModelFallback />}>
            <Suspense fallback={<ModelFallback loading />}>
              <Scene progressRef={progressRef} chapter={view.chapter} component={view.component} />
            </Suspense>
          </SceneBoundary>
          <ConnectedDevices />
          <div className={styles.lampLabel} aria-hidden={view.chapter !== 0}><span>02</span> Your light <small>PROXIMA</small></div>
        </div>
        {view.chapter === 1 && <div className={styles.mobileNote}><span>01 / DIFFUSER</span> Soft white light. <span>02 / HOUSING</span> A dark ring for the electronics.</div>}
        {view.chapter === 2 && <div className={styles.modularNote}><span className={styles.noteMark}>↗</span><div><strong>Separate by design.</strong><p>The white diffuser slides up and out. The black ring stays behind.</p></div></div>}
        {view.chapter === 3 && <aside className={styles.componentPanel} aria-label="PCB component explorer">
          <div className={styles.componentCount}><span>INSIDE PROXIMA</span><span>0{view.component + 1} / 06</span></div>
          <div className={styles.componentCopy} key={component.id}><p className={styles.partName}>{component.label}</p><h3>{component.title}</h3><p>{component.body}</p></div>
          <div className={styles.componentButtons} aria-label="Choose a PCB component">
            {COMPONENTS.map((part, index) => <button key={part.id} type="button" aria-label={`Inspect ${part.label}`} aria-pressed={view.component === index} onClick={() => scrollToProgress(part.at)}>{String(index + 1).padStart(2, '0')}</button>)}
          </div>
        </aside>}
        {view.chapter === 4 && <div className={styles.complete}><span className={styles.completeDot} /> One connected experience.<a href="#features">Meet the physical prototype <span>↘</span></a></div>}
        <div className={styles.bottom}>
          <div className={styles.meta}><span>DESIGNED FROM THE INSIDE OUT</span><span>{reducedMotion ? 'REDUCED MOTION' : 'SCROLL TO EXPLORE'} <span aria-hidden="true">↓</span></span></div>
          <nav className={styles.chapters} aria-label="Product story chapters">
            {CHAPTERS.map((item, index) => <button key={item.label} type="button" data-chapter-target={index} aria-current={view.chapter === index ? 'step' : undefined} onClick={() => scrollToProgress(item.at)}><span className={styles.chapterNumber}>0{index + 1}</span><span>{item.label}</span><span className={styles.chapterDot} /></button>)}
          </nav>
          <div className={styles.progress} aria-hidden="true"><span /></div>
        </div>
      </div>
    </section>
  );
}
