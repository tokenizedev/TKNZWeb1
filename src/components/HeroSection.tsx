import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, Copy, Check } from 'lucide-react';

const HeroSection: React.FC = () => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const CONTRACT_ADDRESS = "AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump";
  
  useEffect(() => {
    const titleElement = titleRef.current;
    if (!titleElement) return;
    
    // Simple glitch effect
    const glitchInterval = setInterval(() => {
      titleElement.classList.add('glitch');
      setTimeout(() => {
        titleElement.classList.remove('glitch');
      }, 200);
    }, 3000);
    
    return () => clearInterval(glitchInterval);
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <section className="relative overflow-hidden min-h-screen bg-black flex items-center pt-32">
      {/* Animated background grid */}
      <div className="absolute inset-0 grid-bg"></div>
      
      {/* Matrix-like falling characters */}
      <div className="matrix-rain absolute inset-0 opacity-20"></div>
      
      <div className="container mx-auto px-4 relative z-10 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 
            ref={titleRef}
            className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 text-white glitch-container"
          >
            <span className="text-green-400">TKNZ</span> Turns the Web Into Your <span className="text-green-400">Trenches</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed">
            Deploy tokens instantly from any site.
            <br className="hidden md:block" />
            Swap any ticker or contract in seconds.
            <br className="hidden md:block" />
            <span className="text-green-400">Deploy. Swap. Win.</span>
          </p>
          
          <div className="flex flex-col items-center gap-4">
            <a 
              href="https://chromewebstore.google.com/detail/tknz/eejballiemiamlndhkblapmlmjdgaaoi?utm_source=item-share-cb"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-500 hover:bg-green-400 text-black px-8 py-3 rounded-md font-semibold transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/30 flex items-center justify-center w-full sm:w-auto"
            >
              Launch a Token
              <ArrowRight size={20} className="ml-2" />
            </a>

            <a 
              href="https://dexscreener.com/solana/da4x4d6rxu7yyaeldfev36tubva3jdzdkzcaevgr1p3p"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-transparent hover:bg-white/10 text-white border border-green-500/50 px-8 py-3 rounded-md font-semibold transition-all w-full sm:w-auto flex items-center justify-center"
            >
              Buy $TKNZ
              <ExternalLink size={20} className="ml-2" />
            </a>

           <div className="ticker-item bg-black/70 backdrop-blur-sm border border-green-500/30 rounded-md p-3 mt-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 relative overflow-hidden transition-all hover:border-green-400/50 max-w-full hover:scale-[1.02]">
             <div className="flex items-center gap-2 relative z-10">
               <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border border-green-500/50">
                 <img src="/assets/logo.png" alt="TKNZ Logo" className="w-full h-full object-cover"/>
               </div>
               <span className="text-gray-400 text-sm">Contract:</span>
             </div>
             <div className="flex flex-1 items-center gap-2 w-full overflow-hidden relative z-10">
               <code className="text-green-400 font-mono text-sm truncate">{CONTRACT_ADDRESS}</code>
               <button 
                 onClick={copyToClipboard}
                 className="text-green-400 hover:text-green-300 p-1.5 rounded transition-colors flex-shrink-0 hover:bg-green-500/10"
                 aria-label="Copy contract address"
               >
                 {copySuccess ? <Check size={18} /> : <Copy size={18} />}
               </button>
             </div>
           </div>
          </div>
        </div>
      </div>
      
      {/* Scroll indicator */}
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 flex flex-col items-center pb-8">
        <span className="text-gray-400 text-sm mb-4">Scroll Down</span>
        <div className="w-6 h-10 border-2 border-green-500/50 rounded-full flex justify-center">
          <div className="w-1.5 h-3 bg-green-400 rounded-full animate-pulse-down mt-2"></div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;