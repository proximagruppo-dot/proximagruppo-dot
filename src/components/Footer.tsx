import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <a href="#top" className={styles.brand} aria-label="PROXIMA, back to top"><span className={styles.mark} aria-hidden="true" /> PROXIMA</a>
      <span className={styles.note}>An object. An app. A connected night.</span>
      <span className={styles.copyright}>© {new Date().getFullYear()} PROXIMA</span>
    </footer>
  );
}
