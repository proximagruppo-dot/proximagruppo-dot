import { asset } from '../../lib/asset';
import styles from './Specs.module.css';

const PARTS = [
  { label: 'The diffuser', value: 'Translucent, removable upper body' },
  { label: 'The housing', value: 'Dark enclosure with a removable lower section' },
  { label: 'The light', value: 'Circular LED board' },
  { label: 'The electronics', value: 'Dedicated control PCB inside the ring' },
  { label: 'The interface', value: 'Home, sleep overview and manual light control' },
];

export function Specs() {
  return (
    <section id="specs" className={styles.section} aria-labelledby="architecture-title">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}><span>03 /</span> THE ARCHITECTURE</p>
          <h2 id="architecture-title" className={styles.title}>Every layer.<br /><span>Part of one idea.</span></h2>
        </div>
        <p className={styles.intro}>A closer look at the pieces that make PROXIMA. The physical prototype, its electronics and its companion interface.</p>
      </div>
      <div className={styles.layout}>
        <figure className={styles.figure}>
          <img src={asset('/photos/prototype-parts.webp')} alt="The actual PROXIMA prototype separated into the dark housing, circular LED assembly and white diffuser" width="1440" height="1080" loading="lazy" />
          <figcaption><span>PROTOTYPE STUDY</span><span>HOUSING / LIGHT / DIFFUSER</span></figcaption>
        </figure>
        <div className={styles.parts}>
          <p className={styles.tableLabel}>A SYSTEM, PIECE BY PIECE</p>
          <dl className={styles.table}>
            {PARTS.map((part) => <div key={part.label} className={styles.row}><dt>{part.label}</dt><dd>{part.value}</dd></div>)}
          </dl>
          <p className={styles.note}>Shown here: the current physical prototype and app interface.</p>
        </div>
      </div>
    </section>
  );
}
