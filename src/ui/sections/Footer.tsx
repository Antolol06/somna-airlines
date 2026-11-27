import { goToChapter, openCabinMap } from '../../lib/scroll';
import { MotionToggle, SoundToggle } from '../Nav';
import { Brand, Wordmark } from '../Wordmark';
import { SHOWCASE_ENTRY } from '../../data/capsuleShowcase';

export function Footer({ inactive }: { inactive: boolean }) {
  return (
    <footer className="footer" inert={inactive}>
      <div className="footer-top">
        <div className="footer-brand">
          <span className="footer-word">
            <Wordmark />
          </span>
          <span className="footer-tag">Depart. Dream. Arrive.</span>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <button onClick={() => goToChapter('cabin', 0.06)}>Experience</button>
          <button onClick={() => goToChapter('showcase', SHOWCASE_ENTRY)}>The Capsule</button>
          <button onClick={() => goToChapter('globe', 0.2)}>Destinations</button>
          <button onClick={openCabinMap}>Cabin map</button>
          <button onClick={() => goToChapter('booking', 0)}>Book a Dream</button>
        </nav>
        <div className="footer-tools">
          <SoundToggle />
          <MotionToggle />
        </div>
      </div>
      <div className="footer-bottom">
        <p>
          <Brand /> is a fictional airline concept. The aircraft, capsules and cabin configurations are design concepts, not certified aviation designs. All routes, schedules, durations and prices are
          conceptual demonstration data. No flights are offered and no payments are processed.
        </p>
        <p className="annot">
          Earth textures: NASA Blue Marble &amp; Black Marble (public domain) · All other imagery is rendered live in your browser.
        </p>
        <button className="link" onClick={() => goToChapter('hero', 0)}>
          Back to the sky ↑
        </button>
      </div>
    </footer>
  );
}
