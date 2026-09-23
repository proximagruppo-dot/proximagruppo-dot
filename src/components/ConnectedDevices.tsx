import { asset } from '../lib/asset';
import styles from './ConnectedDevices.module.css';
export function ConnectedDevices() {
  return (
    <div className={styles.devices} aria-label="Samsung Galaxy Watch and the PROXIMA mobile app">
      <div className={styles.watchWrap}>
        <div className={styles.watch} role="img" aria-label="Illustration of a Samsung Galaxy Watch in night mode">
          <div className={styles.strapTop} /><div className={styles.strapBottom} />
          <div className={styles.watchCase}><div className={styles.watchFace}>
            <span className={styles.samsung}>SAMSUNG</span><span className={styles.moon}>☾</span>
            <span className={styles.time}>22:48</span><span className={styles.night}>TIME TO UNWIND</span>
            <span className={styles.watchArc} /><span className={styles.watchDot} />
          </div></div><div className={styles.watchButton} />
        </div>
        <div className={styles.label}><span>01</span> Your rhythm <small>Samsung Galaxy Watch</small></div>
      </div>
      <div className={styles.phoneWrap}>
        <div className={styles.phone}><img src={asset('/app/app-home.png')} alt="Actual PROXIMA app home screen" fetchPriority="high" /></div>
        <div className={styles.label}><span>03</span> Your control <small>The PROXIMA app</small></div>
      </div>
    </div>
  );
}
