import React from 'react';
import { ExternalLink } from 'lucide-react';

const partners = [
  {
    name: 'Dev.fun',
    logo: '/assets/devfun.png',
    link: 'https://dev.fun'
  },
  {
    name: 'Buidl',
    logo: '/assets/buidl.jpg',
    link: 'https://x.com/buidldao_'
  },
  {
    name: 'Meteora',
    logo: '/assets/meteora.png',
    link: 'https://www.meteora.ag/'
  },
  {
    name: 'Solana',
    logo: '/assets/solana.png',
    link: 'https://solana.com'
  }
];

const BuildingWithSection: React.FC = () => {
  return (
    <section className="py-24 bg-black relative overflow-hidden">
      {/* Move decorative elements to a lower z-index */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_24px,rgba(0,255,0,0.03)_25px),linear-gradient(90deg,transparent_24px,rgba(0,255,0,0.03)_25px)] bg-[size:25px_25px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,0,0.1),transparent_70%)]"></div>
      </div>

      <div className="container mx-auto px-4 relative z-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Building <span className="text-green-400">With</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Powered by the best protocols in web3
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {partners.map((partner, index) => (
            <a
              key={index}
              href={partner.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative bg-black/50 backdrop-blur-sm border border-green-500/20 rounded-xl p-6 transition-all hover:border-green-400/50 hover:scale-105 hover:shadow-lg hover:shadow-green-500/20 z-30"
            >
              <div className="aspect-square rounded-lg overflow-hidden mb-4 bg-black/30 p-4 flex items-center justify-center">
                <img
                  src={partner.logo}
                  alt={partner.name}
                  className="w-full h-full object-contain transition-all group-hover:scale-110 group-hover:rotate-3"
                />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white group-hover:text-green-400 transition-colors">
                  {partner.name}
                </h3>
                <ExternalLink className="text-gray-400 group-hover:text-green-400 transition-colors" size={20} />
              </div>
              
              {/* Glow effect */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-purple-500 rounded-xl opacity-0 group-hover:opacity-20 transition-opacity -z-10 blur-xl"></div>
              
              {/* Animated border */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-500 via-purple-500 to-green-500 opacity-0 group-hover:opacity-30 transition-opacity animate-gradient-x"></div>
            </a>
          ))}
        </div>

        {/* Decorative elements with lower z-index */}
        <div className="absolute top-1/4 left-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl z-10"></div>
        <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl z-10"></div>
      </div>
    </section>
  );
};

export default BuildingWithSection;