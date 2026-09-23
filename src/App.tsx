import { Nav } from './components/Nav';
import { HeroExperience } from './components/HeroExperience';
import { Features } from './components/sections/Features';
import { AppTeaser } from './components/sections/AppTeaser';
import { Specs } from './components/sections/Specs';
import { Waitlist } from './components/sections/Waitlist';
import { Footer } from './components/Footer';

function App() {
  return (
    <div id="top">
      <Nav />
      <HeroExperience />
      <Features />
      <AppTeaser />
      <Specs />
      <Waitlist />
      <Footer />
    </div>
  );
}

export default App;
