import styles from './Nav.module.css';
export function Nav() {
  return <header className={styles.nav}>
    <a href="#top" className={styles.brand} aria-label="PROXIMA home"><svg viewBox="0 0 28 28" width="26" height="26" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="10.5" stroke="currentColor" strokeWidth="1.4" /><ellipse cx="14" cy="14" rx="4.3" ry="10.5" stroke="currentColor" strokeWidth="1.2" transform="rotate(-32 14 14)" /><circle cx="22.1" cy="7.3" r="2.1" fill="var(--accent)" /></svg><span>PROXIMA</span></a>
    <nav className={styles.links} aria-label="Main navigation"><a href="#experience">The experience</a><a href="#features">The object</a><a href="#app">The app</a></nav>
    <a href="#specs" className={styles.cta}>A closer look <span aria-hidden="true">↗</span></a>
  </header>;
}
