import styles from './AppDiagrams.module.css';

/**
 * Beat 1 — Pairing. No screenshot exists for this beat (there is nothing on-screen to
 * capture — the mechanism lives between the phone and the lamp). This is an original,
 * hand-built animation, not a fabricated app screenshot: a signal travels from the phone
 * to the lamp, the lamp flashes once to confirm, then the connection settles into a
 * steady "paired" state — looping to imply the same handshake quietly repeats every time,
 * exactly as the copy describes.
 */
export function PairingDiagram() {
  return (
    <div className={styles.pairing}>
      <div
        className={styles.pairingStage}
        role="img"
        aria-label="Animation: the phone sends a pairing signal to the lamp, the lamp flashes once to confirm, then the connection stays paired on its own"
      >
        <div className={styles.pairPhone} aria-hidden="true"><span className={styles.pairPhoneNotch} /></div>
        <div className={styles.pairLink} aria-hidden="true">
          <span className={styles.pairPulse} />
          <span className={styles.pairPulse} />
          <span className={styles.pairPulse} />
        </div>
        <div className={styles.pairLamp} aria-hidden="true">
          <span className={styles.pairLampGlow} />
          <span className={styles.pairLampFlash} />
          <span className={styles.pairLampDome} />
          <span className={styles.pairLampRing} />
        </div>
      </div>
      <p className={styles.pairStatusWrap} aria-hidden="true">
        <span className={styles.pairStatusConnecting}>Connecting…</span>
        <span className={styles.pairStatusPaired}>Paired</span>
      </p>
    </div>
  );
}

/**
 * Beat 2 — The watch. Also has no screenshot (this logic runs on the watch, mostly while
 * its own screen is off). Instead of a static icon with a caption, the four stages of the
 * detection cycle actually take turns lighting up on a loop, so the sequence is watched
 * happening rather than just read about.
 */
export function WatchFlowDiagram() {
  return (
    <div className={styles.watchFlow}>
      <div
        className={styles.watchGlyph}
        role="img"
        aria-label="Animation: the watch cycles through detecting stillness, confirming with a drop in heart rate, arming itself for motion, then sending the verdict to the phone"
      >
        <span className={styles.watchSweep} aria-hidden="true" />
        <span className={styles.watchMoon} aria-hidden="true">☾</span>
      </div>
    </div>
  );
}

/**
 * Beat 3 — The decision loop (hero beat). The ring is an atmospheric, continuously
 * cycling representation of "two minutes of agreement" — not a literal stopwatch — and
 * the lamp indicator flips between fully on and fully dark with a hard cut, never a
 * fade, because the real decision is binary: no dimming curve ships in the app.
 */
export function DecisionLoopDiagram() {
  return (
    <div
      className={styles.decision}
      role="img"
      aria-label="Animation: the watch and phone agree for two minutes, then the lamp switches fully off; the same rule in reverse brings it back fully on"
    >
      <div className={styles.decisionRing} aria-hidden="true" />
      <div className={styles.decisionOutput} aria-hidden="true">
        <span className={styles.decisionLamp} />
      </div>
    </div>
  );
}
