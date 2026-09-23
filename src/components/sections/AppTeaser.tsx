import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './AppTeaser.module.css';

const SCREENS = [
  {
    id: 'home', label: 'Home', number: '01', image: '/app/app-home.png',
    title: 'An evening at a glance.',
    body: 'A calm home for your lamp. See its current mode and light level, with the evening experience front and centre.',
    alt: 'PROXIMA app home screen showing automatic mode, warm white light and 25 percent brightness',
  },
  {
    id: 'sleep', label: 'Sleep', number: '02', image: '/app/app-sleep.png',
    title: 'See the shape of your night.',
    body: 'Sleep stages and light intensity share one view, alongside a wake-up window you can make your own.',
    alt: 'PROXIMA sleep screen with sleep stage and lamp intensity charts and a wake-up window',
  },
  {
    id: 'light', label: 'Light', number: '03', image: '/app/app-manual.png',
    title: 'A little more. A little less.',
    body: 'Manual controls keep the essentials close. Turn the lamp on or off and adjust its brightness with a simple slider.',
    alt: 'PROXIMA manual light control screen showing an on and off switch and brightness slider',
  },
];

export function AppTeaser() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const screen = SCREENS[active];

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % SCREENS.length;
    else if (event.key === 'ArrowLeft') next = (index + SCREENS.length - 1) % SCREENS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = SCREENS.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <section id="app" className={styles.section} aria-labelledby="app-title">
      <div className={styles.layout}>
        <div className={styles.copy}>
          <p className={styles.kicker}><span>02 /</span> THE COMPANION</p>
          <h2 id="app-title" className={styles.title}>Your night.<br /><span>In a clearer light.</span></h2>
          <p className={styles.body}>The lamp is only part of the story. The PROXIMA app brings light, sleep and everyday control together in one quiet interface.</p>
          <div className={styles.tabs} role="tablist" aria-label="App preview screens">
            {SCREENS.map((item, index) => (
              <button key={item.id} ref={(element) => { tabs.current[index] = element; }} id={`app-tab-${item.id}`} role="tab" type="button" aria-selected={active === index} aria-controls="app-preview-panel" tabIndex={active === index ? 0 : -1} className={active === index ? styles.tabActive : styles.tab} onClick={() => setActive(index)} onKeyDown={(event) => handleKeyDown(event, index)}>
                <span>{item.number}</span>{item.label}
              </button>
            ))}
          </div>
          <div className={styles.screenCopy} aria-live="polite" aria-atomic="true">
            <h3>{screen.title}</h3>
            <p>{screen.body}</p>
          </div>
          <p className={styles.previewLabel}><span /> PROXIMA APP / INTERFACE PREVIEW</p>
        </div>
        <div id="app-preview-panel" role="tabpanel" aria-labelledby={`app-tab-${screen.id}`} tabIndex={0} className={styles.preview}>
          <div className={styles.orbit} aria-hidden="true" />
          <div className={styles.phone}>
            {SCREENS.map((item, index) => <img key={item.id} src={item.image} alt={item.alt} width="874" height="1900" loading="lazy" className={active === index ? styles.screenActive : styles.screen} aria-hidden={active !== index} />)}
          </div>
          <span className={styles.previewIndex} aria-hidden="true">{screen.number} <span>/ 03</span></span>
        </div>
      </div>
    </section>
  );
}
