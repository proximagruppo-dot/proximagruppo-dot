import { asset } from '../../lib/asset';
import styles from './Features.module.css';

const DETAILS = [
  {
    number: '01',
    title: 'A softer presence.',
    body: 'A translucent white diffuser gives the light its shape. A dark ring gives the object its unmistakable silhouette.',
  },
  {
    number: '02',
    title: 'Designed in layers.',
    body: 'The diffuser lifts away from the housing. Inside, the circular light board and control electronics form the heart of the lamp.',
  },
  {
    number: '03',
    title: 'An idea you can hold.',
    body: 'From the enclosure to the electronics, the physical prototype brings the PROXIMA experience off the screen and onto the bedside table.',
  },
];

export function Features() {
  return (
    <section id="features" className={styles.section} aria-labelledby="design-title">
      <div className={styles.heading}>
        <p className={styles.kicker}><span>01 /</span> THE OBJECT</p>
        <h2 id="design-title" className={styles.title}>Quiet on the outside.<br /><span>Considered within.</span></h2>
      </div>
      <div className={styles.layout}>
        <figure className={styles.prototype}>
          <img src={asset('/photos/prototype-lit.webp')} alt="The real PROXIMA prototype illuminated, with a translucent white diffuser and black control ring" width="1200" height="1600" loading="lazy" />
          <figcaption><span className={styles.dot} /> THE WORKING PROTOTYPE <span>01 — 2026</span></figcaption>
        </figure>
        <div className={styles.details}>
          <p className={styles.intro}>One familiar object.<br />A closer connection to your night.</p>
          <div className={styles.list}>
            {DETAILS.map((detail) => (
              <article key={detail.number} className={styles.detail}>
                <span className={styles.number}>{detail.number}</span>
                <div><h3>{detail.title}</h3><p>{detail.body}</p></div>
              </article>
            ))}
          </div>
          <a className={styles.link} href="#specs">Look inside the prototype <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>
  );
}
