import React from 'react';
import { Zap, Globe, Clock as Click, Sparkles } from 'lucide-react';

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="py-24 bg-gradient-to-b from-black to-gray-900">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            What is <span className="text-green-400">TKNZ</span>?
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            TKNZ is the fastest and simplest way to create a token from anything on the internet.
Highlight any part of a webpage, tweet, or article—click once, and it's on the blockchain.
No setup. No coding. Just TKNZ it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1">
            <div className="bg-black/50 backdrop-blur-md border border-green-500/20 rounded-xl p-8 space-y-8">
              <div className="flex items-start space-x-4">
                <div className="bg-green-400/10 p-3 rounded-lg">
                  <Globe className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Tokenize The Internet</h3>
                  <p className="text-gray-300">
                    Turn tweets, articles, memes—anything you see online—into a token in seconds.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-green-400/10 p-3 rounded-lg">
                  <Click className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Your Trench Companion</h3>
                  <p className="text-gray-300">
                    The TKNZ Sidebar stays with you as you browse, ready to tokenize whatever catches your eye.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-green-400/10 p-3 rounded-lg">
                  <Click className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">One-Click Simplicity</h3>
                  <p className="text-gray-300">
                    No setup. No friction. Just click and launch. That's it.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-green-400/10 p-3 rounded-lg">
                  <Zap className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">AI-Powered Metadata</h3>
                  <p className="text-gray-300">
                    Our parser uses AI to instantly extract and format titles, images, and descriptions for your token—zero manual input needed.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="bg-green-400/10 p-3 rounded-lg">
                  <Sparkles className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Web3 Wallet Built In</h3>
                  <p className="text-gray-300">
                    Manage, send, and swap tokens—all from the extension. No extra tabs required. <i>(Launching Soon)</i>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 md:order-2 relative">
            <div className="relative border-2 border-green-500/30 rounded-lg overflow-hidden shadow-2xl shadow-green-500/10">
              <div className="absolute top-0 left-0 right-0 h-6 bg-black flex items-center px-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                </div>
              </div>
              <div className="pt-6">
                <video
                  className="w-full h-auto rounded-b-lg"
                  preload="metadata"
                  width="100%"
                  poster="/assets/video/demotknz_poster.webp"
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                >
                  <source src="/assets/video/hls/demotknz.m3u8" type="application/x-mpegURL" /> 
                  <source src="/assets/video/demotknz.webm" type="video/webm" />
                  <source src="/assets/video/demotknz.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="absolute top-2 right-2 bg-green-500/80 text-xs text-black font-mono py-1 px-2 rounded">
                TKNZ v1.0
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute -top-8 -left-8 w-32 h-32 bg-green-500/20 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl"></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;