import React, { useEffect, useRef, useState } from 'react';

const VisionSection: React.FC = () => {
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const visionSection = document.getElementById('vision');
      if (!visionSection || !terminalRef.current) return;
      
      const visionRect = visionSection.getBoundingClientRect();
      const isInVisionSection = visionRect.top <= window.innerHeight && visionRect.bottom >= 0;
      
      if (isInVisionSection) {
        let activeIndex = 0;
        let smallestDistance = Infinity;
        
        sectionRefs.forEach((ref, index) => {
          if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const distance = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
            
            if (distance < smallestDistance) {
              smallestDistance = distance;
              activeIndex = index;
            }
          }
        });
        
        setActiveSection(activeIndex);
        
        // Update terminal position
        const activeRef = sectionRefs[activeIndex].current;
        if (activeRef) {
          const rect = activeRef.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetY = scrollTop + rect.top + (rect.height / 2) - (terminalRef.current.offsetHeight / 2);
          
          terminalRef.current.style.transform = `translateY(${targetY}px)`;
          terminalRef.current.style.opacity = '1';
        }
      } else {
        terminalRef.current.style.opacity = '0';
      }
    };

    window.addEventListener('scroll', handleScroll);
    // Initial check
    setTimeout(handleScroll, 100);
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section id="vision" className="py-24 bg-black relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_24px,rgba(0,255,0,0.03)_25px),linear-gradient(90deg,transparent_24px,rgba(0,255,0,0.03)_25px)] bg-[size:25px_25px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,0,0.1),transparent_70%)]"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-6xl font-bold text-white mb-4">
              The <span className="text-green-400">TKNZ</span> Vision
            </h2>
          </div>
          
          <div className="relative flex">
            <div 
              ref={terminalRef}
              className="fixed left-0 w-16 transition-all duration-500 ease-out opacity-0"
              style={{ top: '50%' }}
            >
              <svg 
                className={`w-16 h-16 text-green-500 transition-all duration-300 ${
                  activeSection === 0 ? 'opacity-100 scale-110' : 'opacity-30 scale-100'
                }`}
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" x2="20" y1="19" y2="19"></line>
              </svg>
            </div>
            
            <div className="flex-1 ml-24 space-y-32">
              <div 
                ref={sectionRefs[0]}
                className={`transition-opacity duration-300 ${
                  activeSection === 0 ? 'opacity-100' : 'opacity-50'
                }`}
              >
                <p className="text-2xl text-gray-300 leading-relaxed">
                  <span className="text-green-400">TKNZ</span> is building the first true trench companion for the modern crypto trader — a full-stack wallet designed for speed, simplicity, and on-chain action.
                </p>
              </div>
              
              <div 
                ref={sectionRefs[1]}
                className={`transition-opacity duration-300 ${
                  activeSection === 1 ? 'opacity-100' : 'opacity-50'
                }`}
              >
                <p className="text-2xl text-gray-300 leading-relaxed">
                  From instant token deployment on <span className="text-green-400">Pump.fun</span> to buying any ticker or contract straight from Twitter, TKNZ brings the power of Solana to your fingertips.
                </p>
              </div>
              
              <div 
                ref={sectionRefs[2]}
                className={`transition-opacity duration-300 ${
                  activeSection === 2 ? 'opacity-100' : 'opacity-50'
                }`}
              >
                <p className="text-2xl text-gray-300 leading-relaxed">
                  Our vision is to make <span className="text-green-400">web3</span> feel like web2: frictionless, fast, and fun. With an integrated treasury powering long-term utility for $TKNZ holders, we're not just launching tokens — we're building the rails for the next era of on-chain creation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default VisionSection;