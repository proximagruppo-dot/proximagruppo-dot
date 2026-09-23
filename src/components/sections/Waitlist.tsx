import styles from './Waitlist.module.css';

export function Waitlist() {
  return (
    <section id="contact" className={styles.section} aria-labelledby="closing-title">
      <div className={styles.halo} aria-hidden="true" />
      <p className={styles.kicker}>LIGHT. SLEEP. CONNECTED.</p>
      <h2 id="closing-title" className={styles.title}>A little light.<br /><span>A more considered night.</span></h2>
      <p className={styles.body}>Meet PROXIMA. A bedside lamp, a wearable connection and a companion app — designed as one experience.</p>
      <div className={styles.actions}>
        <a className={styles.primary} href="#top">Experience it again <span aria-hidden="true">↑</span></a>
        <a className={styles.secondary} href="#app">Explore the app <span aria-hidden="true">↗</span></a>
      </div>
      <p className={styles.footnote}>PROXIMA / PRODUCT PRESENTATION</p>
    </section>
  );
}
