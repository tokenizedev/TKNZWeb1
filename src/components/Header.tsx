import React, { useState, useEffect } from 'react';
import { Menu, X, ChevronDown, ExternalLink, Copy } from 'lucide-react';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const CONTRACT_ADDRESS = "AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump";

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Add effect to handle body scroll
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  const handleDropdownClick = (dropdown: string) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

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
    <header 
      className={`fixed w-full z-40 transition-all duration-300 mt-12 ${
        isScrolled ? 'bg-black/90 backdrop-blur-md py-3' : 'bg-transparent py-5'
      }`}
    >
      <nav className="container mx-auto px-4 flex justify-between items-center">
        <div className="flex items-center group">
          <a href="/" className="block">
            <img 
              src="/assets/logo.png" 
              alt="TKNZ.FUN" 
              className="h-16 w-auto mr-2 transition-transform group-hover:scale-110"
              style={{ borderRadius: '50%', objectFit: 'cover', overflow: 'hidden' }}
            />
          </a>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex space-x-8 items-center">
          {/* Socials Dropdown */}
          <div className="relative">
            <button
              onClick={() => handleDropdownClick('socials')}
              className="text-gray-300 hover:text-green-400 transition-colors flex items-center"
            >
              Socials <ChevronDown className="ml-1 h-4 w-4" />
            </button>
            {activeDropdown === 'socials' && (
              <div className="absolute top-full mt-2 w-48 bg-black/95 backdrop-blur-md border border-green-500/30 rounded-md overflow-hidden">
                <a 
                  href="https://x.com/tknzfun" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 text-gray-300 hover:bg-green-500/10 hover:text-green-400"
                >
                  X (Twitter) <ExternalLink className="ml-2 h-3 w-3" />
                </a>
                <a 
                  href="https://x.com/0Xilef" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 text-gray-300 hover:bg-green-500/10 hover:text-green-400"
                >
                  Dev X <ExternalLink className="ml-2 h-3 w-3" />
                </a>
                <a 
                  href="https://t.me/tknzfun" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 text-gray-300 hover:bg-green-500/10 hover:text-green-400"
                >
                  Telegram <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {/* Token Info Dropdown */}
          <div className="relative">
            <button
              onClick={() => handleDropdownClick('token')}
              className="text-gray-300 hover:text-green-400 transition-colors flex items-center"
            >
              Token Info <ChevronDown className="ml-1 h-4 w-4" />
            </button>
            {activeDropdown === 'token' && (
              <div className="absolute top-full right-0 mt-2 w-[420px] bg-black/95 backdrop-blur-md border border-green-500/30 rounded-md overflow-hidden">
                <div className="px-4 py-3 border-b border-green-500/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-400 text-sm">Contract Address:</p>
                    <button
                      onClick={copyToClipboard}
                      className="text-green-400 hover:text-green-300 flex items-center text-sm"
                    >
                      {copySuccess ? 'Copied!' : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-green-400 font-mono text-sm">{CONTRACT_ADDRESS}</p>
                </div>
                <a 
                  href="https://pump.fun/coin/AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump?include-nsfw=true" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 text-gray-300 hover:bg-green-500/10 hover:text-green-400"
                >
                  Pump.fun <ExternalLink className="ml-2 h-3 w-3" />
                </a>
                <a 
                  href="https://dexscreener.com/solana/da4x4d6rxu7yyaeldfev36tubva3jdzdkzcaevgr1p3p" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 text-gray-300 hover:bg-green-500/10 hover:text-green-400"
                >
                  DexScreener <ExternalLink className="ml-2 h-3 w-3" />
                </a>
                <a 
                  href="https://github.com/tokenizedev/tknzv1" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 text-gray-300 hover:bg-green-500/10 hover:text-green-400"
                >
                  GitHub Extension <ExternalLink className="ml-2 h-3 w-3" />
                </a>
                <a 
                  href="https://github.com/tokenizedev/TKNZWeb" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-2 text-gray-300 hover:bg-green-500/10 hover:text-green-400"
                >
                  GitHub Front-End <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        <a 
          href="https://chromewebstore.google.com/detail/tknz/eejballiemiamlndhkblapmlmjdgaaoi?utm_source=item-share-cb"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:block bg-green-500 hover:bg-green-400 text-black px-6 py-2 rounded-md font-semibold transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/30 relative group"
        >
          <span className="relative z-10">Download TKNZ</span>
          <div className="absolute inset-0 bg-green-400 rounded-md blur-lg opacity-0 group-hover:opacity-50 transition-opacity"></div>
        </a>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden text-white relative z-50"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/95 backdrop-blur-md z-40 pt-24">
          <div className="container mx-auto px-4 py-4 flex flex-col space-y-6 overflow-y-auto max-h-[calc(100vh-6rem)]">
            <div className="border-b border-green-500/30 pb-4">
              <h3 className="text-green-400 mb-2 font-mono">Socials</h3>
              <div className="flex flex-col space-y-2">
                <a 
                  href="https://x.com/tknzfun" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-green-400 flex items-center"
                >
                  X (Twitter) <ExternalLink className="ml-2 h-4 w-4" />
                </a>
                <a 
                  href="https://x.com/0Xilef" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-green-400 flex items-center"
                >
                  Dev X <ExternalLink className="ml-2 h-4 w-4" />
                </a>
                <a 
                  href="https://t.me/tknzfun" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-green-400 flex items-center"
                >
                  Telegram <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </div>
            </div>
            
            <div className="border-b border-green-500/30 pb-4">
              <h3 className="text-green-400 mb-2 font-mono">Token Info</h3>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-gray-400 text-sm">Contract Address:</p>
                  <button
                    onClick={copyToClipboard}
                    className="text-green-400 hover:text-green-300 flex items-center text-sm"
                  >
                    {copySuccess ? 'Copied!' : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-green-400 font-mono text-sm break-all">{CONTRACT_ADDRESS}</p>
              </div>
              <div className="flex flex-col space-y-2">
                <a 
                  href="https://pump.fun/coin/AfyDiEptGHEDgD69y56XjNSbTs23LaF1YHANVKnWpump?include-nsfw=true" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-green-400 flex items-center"
                >
                  Pump.fun <ExternalLink className="ml-2 h-4 w-4" />
                </a>
                <a 
                  href="https://dexscreener.com/solana/da4x4d6rxu7yyaeldfev36tubva3jdzdkzcaevgr1p3p" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-green-400 flex items-center"
                >
                  DexScreener <ExternalLink className="ml-2 h-4 w-4" />
                </a>
                <a 
                  href="https://github.com/tokenizedev/tknzv1" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-green-400 flex items-center"
                >
                  GitHub Extension <ExternalLink className="ml-2 h-4 w-4" />
                </a>
                <a 
                  href="https://github.com/tokenizedev/TKNZWeb" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-green-400 flex items-center"
                >
                  GitHub Front-End <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </div>
            </div>

            <a 
              href="https://chromewebstore.google.com/detail/tknz/eejballiemiamlndhkblapmlmjdgaaoi?utm_source=item-share-cb"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-500 hover:bg-green-400 text-black px-6 py-3 rounded-md font-semibold transition-all text-xl text-center"
              onClick={() => setIsMenuOpen(false)}
            >
              Download TKNZ
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
