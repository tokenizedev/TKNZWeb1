import React, { useEffect } from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import AboutSection from './components/AboutSection';
import LiveTicker from './components/LiveTicker';
import VisionSection from './components/VisionSection';
import BuildingWithSection from './components/BuildingWithSection';
import RoadmapSection from './components/RoadmapSection';
import Footer from './components/Footer';

function App() {
  useEffect(() => {
    document.title = 'TKNZ.FUN | Tokenize Anything';
    
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="font-sans">
      <LiveTicker />
      <Header />
      <main>
        <HeroSection />
        <AboutSection />
        <VisionSection />
        <RoadmapSection />
        <BuildingWithSection />
      </main>
      <Footer />
    </div>
  );
}

export default App;