import React from 'react';
import { Download, ChevronRight, Clock, Share2, Wallet, ArrowRightLeft, GitBranch as BrandTiktok, Sparkles, Users, Twitter, BarChart3, Rocket } from 'lucide-react';
import { Tweet } from 'react-tweet';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Contract Address Banner */}
      <div className="bg-[#00FF9D] text-black py-2 px-4 text-center font-medium">
        Contract Address: Coming Soon
      </div>

      {/* Navigation */}
      <nav className="bg-black text-white py-4 sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <img 
              src="assets/logo.png" 
              alt="TKNZ Logo" 
              className="h-8"
            />
          </div>
          <button className="bg-[#00FF9D] text-black px-6 py-2 rounded-full flex items-center space-x-2 hover:bg-[#00CC7D] transition-colors">
            <Download className="w-4 h-4" />
            <span>Download the Extension</span>
          </button>
        </div>
      </nav>

      {/* Article Header */}
      <header className="bg-black text-white py-16 border-b border-gray-200">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center space-x-4 text-[#00FF9D] text-sm mb-4">
              <span className="uppercase font-semibold">Breaking News</span>
             
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              TKNZ: Tokenize Anything. Tokenize Everything.
            </h1>
            <div className="flex items-center justify-between text-gray-400 text-sm">
              <div className="flex items-center space-x-4">
                <span>By <a href="#" className="text-[#00FF9D] hover:underline">TKNZ Team</a></span>
                <span>•</span>
                <span>5 min read</span>
              </div>
             
            </div>
          </div>
        </div>
      </header>

      {/* Hero Image */}
      <div className="bg-gray-100 py-8">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <img 
              src="assets/hero.png"
              alt="TKNZ Hero"
              className="w-full rounded-lg shadow-xl"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {/* Left Rail - Navigation */}
          <aside className="md:col-span-1">
            <div className="sticky top-24">
              {/* Social Links */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">TKNZ SOCIALS</h3>
                <div className="flex flex-col space-y-4">
                  <a href="https://x.com/tknzfun" target="_blank" rel="noopener noreferrer" 
                     className="flex items-center space-x-3 text-gray-600 hover:text-[#00FF9D] transition-colors">
                    <Twitter className="w-5 h-5" />
                    <span>Twitter</span>
                  </a>
                   <a href="https://x.com/TopXilef" target="_blank" rel="noopener noreferrer" 
                     className="flex items-center space-x-3 text-gray-600 hover:text-[#00FF9D] transition-colors">
                    <Twitter className="w-5 h-5" />
                    <span>Developer</span>
                  </a>
                  <a href="#" onClick="alert('DexScreener will be updated soon')" rel="noopener noreferrer"
                     className="flex items-center space-x-3 text-gray-600 hover:text-[#00FF9D] transition-colors">
                    <BarChart3 className="w-5 h-5" />
                    <span>Dex Screener</span>
                  </a>
                  <a href="#" onClick="alert('Pump.Fun link will be updated soon')" rel="noopener noreferrer"
                     className="flex items-center space-x-3 text-gray-600 hover:text-[#00FF9D] transition-colors">
                    <Rocket className="w-5 h-5" />
                    <span>Pump.fun</span>
                  </a>
                </div>
              </div>

              {/* Quick Navigation */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Quick Navigation</h3>
                <ul className="space-y-3">
                  {['Announcing the Project', 'The Inspiration Behind TKNZ', 'How to Use TKNZ', "What's Next? The TKNZ Roadmap"].map((section) => (
                    <li key={section}>
                      <a href={`#${section.toLowerCase().replace(/\s+/g, '-')}`} 
                         className="flex items-center text-gray-600 hover:text-[#00FF9D] transition-colors">
                        <ChevronRight className="w-4 h-4 mr-2" />
                        <span className="text-sm">{section}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <article className="md:col-span-3 bg-white rounded-lg shadow-sm p-8">
            <div className="prose lg:prose-lg max-w-none">
              <section id="announcing-the-project">
              <h2 className="text-3xl font-bold mb-6">Tokenize Anything. Tokenize Everything.</h2>
                <p>
                  Introducing TKNZ – a Chrome extension / non-custodial wallet that allows anyone to tokenize anything on the internet in just one click. <i>The fastest way to tokenize any news</i>, social posts or any other content on the internet.
                </p>
                <p>
                  TKNZ empowers users to create their own tokens on Pump.fun directly from any web page or social media post. With this tool, the friction of launching a token is removed. No need to copy paste links or images. Just one click and the content is tokenized onto the blockchain forever!
                </p>
                <p>
                  The extension operates as a non-custodial wallet, ensuring complete user control over their tokens. Launching a token takes mere seconds, requiring no coding skills or prior blockchain knowledge. Users only pay Pump.fun and Solana transaction fees, making it as accessible for anyone.
                </p>
                <p>
                 Launch a token in under 5 seconds with TKNZ. Stop racing to be the first token deployed, <strong>start winning</strong>.
                </p>
              </section>

              <section id="the-inspiration-behind-tknz" className="mt-12">
                <h2 className="text-3xl font-bold mb-6">The Inspiration Behind TKNZ</h2>
                <p>
                  The vision for TKNZ stems from Solana Foundation's call to "tokenize everything," a bold mission to bring blockchain technology into everyday life. The Solana community has rallied around this ethos, with tweets like these sparking the imagination of crypto enthusiasts:
                </p>
                
                <div className="my-8 space-y-8">
                  <div className="dark">
                    <Tweet id="1885051149558112373" />
                  </div>
                  <div className="dark">
                    <Tweet id="1888767403607437479" />
                  </div>
                  <div className="dark">
                    <Tweet id="1885095920116605152" />
                  </div>
                </div>

                <p>
                  Inspired by these declarations, TKNZ takes the concept of tokenization to the next level by making it instantly accessible, fun, and creatively limitless.
                </p>
              </section>

              <section id="how-to-use-tknz" className="mt-12">
                <h2 className="text-3xl font-bold mb-6">How to Use TKNZ</h2>
                <div className="bg-gray-50 p-6 rounded-lg mb-6">
                  <p className="font-medium mb-4">
                    Using TKNZ is effortless. Follow these simple steps:
                  </p>
                  <ol className="list-decimal list-inside space-y-3">
                    <li>Download TKNZ from the Chrome Extension Store. (Link to be added soon!)</li>
                    <li>Upon installation, a non-custodial wallet is automatically generated for you. Export and back up your private key to ensure the security of your wallet.</li>
                    <li>Fund your wallet with Solana to cover transaction fees.</li>
                    <li>Open the extension on any webpage. TKNZ is optimized for news articles and Twitter posts but works across the web.</li>
                    <li>Let TKNZ's AI generate token details, such as the name, ticker, and icon. Want to make it funnier? Click the "Memier" button for a lighthearted twist or customize the details yourself.</li>
                    <li>Click "Create Coin" and watch as your token is instantly launched on Pump.fun.</li>
                  </ol>
                </div>
                <p>
                  With TKNZ, the power to tokenize is at your fingertips, unlocking a world of creativity and possibility.
                </p>
              </section>

              <section id="whats-next-the-tknz-roadmap" className="mt-12">
                <h2 className="text-3xl font-bold mb-6">What's Next? The TKNZ Roadmap</h2>
                <p>
                  TKNZ is just getting started. The team behind the extension is committed to expanding its capabilities based on user feedback and community engagement. Here's a glimpse of what we are thinkng:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {[
                    {
                      title: "Token Gating for Premium Access",
                      description: "Future versions of TKNZ will require holding TKNZ tokens for full functionality. Creating value for $TKNZ holders",
                      icon: <Wallet className="w-12 h-12 text-[#00FF9D]" />
                    },
                    {
                      title: "Robust Wallet Tooling",
                      description: "Users will soon be able to import existing Solana wallets, send and swap tokens fromm their TKNZ wallet",
                      icon: <ArrowRightLeft className="w-12 h-12 text-[#00FF9D]" />
                    },
                    {
                      title: "Integrations with other Launchpads",
                      description: "Allow users to choose which launchpads to utilize for their launches",
                      icon: <ArrowRightLeft className="w-12 h-12 text-[#00FF9D]" />
                    },
                    {
                      title: "Optimization for TikTok",
                      description: "TKNZ aims to tap into TikTok's vast creator ecosystem, making tokenization a viral trend.",
                      icon: <BrandTiktok className="w-12 h-12 text-[#00FF9D]" />
                    },
                    {
                      title: "Enhanced AI Token Generation",
                      description: "Ongoing improvements to AI-generated token names, tickers, and icons for better customization and hilarity.",
                      icon: <Sparkles className="w-12 h-12 text-[#00FF9D]" />
                    },
                    {
                      title: "Community-Driven Features",
                      description: "The TKNZ team is listening. Whatever the community asks for will shape the future of the extension.",
                      icon: <Users className="w-12 h-12 text-[#00FF9D]" />
                    }
                  ].map((feature) => (
                    <div key={feature.title} className="bg-gray-50 p-6 rounded-lg">
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-4">{feature.icon}</div>
                        <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                        <p className="text-gray-600">{feature.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </article>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-black text-white py-12 mt-12">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto flex flex-col items-center">
            <img 
              src="assets/logo.png" 
              alt="TKNZ Logo" 
              className="h-8 mb-4"
            />
            <div className="flex items-center space-x-4 mb-4">
              <a href="/privacy-policy" className="text-gray-400 hover:text-[#00FF9D] transition-colors">Privacy Policy</a>
            </div>
            <p className="text-gray-400">© 2025 TKNZ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;