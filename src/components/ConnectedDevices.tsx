import { asset } from '../lib/asset';
import styles from './ConnectedDevices.module.css';
export function ConnectedDevices({ present = false }: { present?: boolean }) {
  return (
    <div className={styles.devices} aria-label="Smart watch and the PROXIMA mobile app">
      <div className={styles.watchWrap}>
        <div className={styles.watch} role="img" aria-label="Illustration of a smart watch in night mode">
          <div className={styles.strapTop} /><div className={styles.strapBottom} />
          <div className={styles.watchCase}><div className={styles.watchFace}>
            <span className={styles.moon}>☾</span>
            <span className={styles.time}>22:48</span><span className={styles.night}>TIME TO UNWIND</span>
            <span className={styles.watchArc} /><span className={styles.watchDot} />
          </div></div><div className={styles.watchButton} />
        </div>
        {!present && <div className={styles.label}><span>01</span> Your rhythm <small>Smart watch</small></div>}
      </div>
      <div className={styles.phoneWrap}>
        <div className={styles.phone}><img src={asset('/app/app-home.png')} alt="Actual PROXIMA app home screen" fetchPriority="high" /></div>
        {!present && <div className={styles.label}><span>03</span> Your control <small>The PROXIMA app</small></div>}
      </div>
    </div>
  );
}
