import React from 'react';
import { partners } from '../data/partners';
import { ExternalLink } from 'lucide-react';

const PartnersSection: React.FC = () => {
  return (
    <section id="partners" className="py-24 bg-black">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            <span className="text-green-400">Partner</span> Ecosystem
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Building the future of tokenization with industry leaders
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {partners.map((partner, index) => (
            <div 
              key={index}
              className="bg-gray-900/50 border border-green-500/20 rounded-xl overflow-hidden transition-all hover:transform hover:scale-105 hover:border-green-400/40 hover:shadow-lg hover:shadow-green-500/10"
            >
              <div className="h-48 overflow-hidden">
                <img 
                  src={partner.logo} 
                  alt={partner.name} 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-white mb-2">{partner.name}</h3>
                <p className="text-gray-300 mb-4 h-16">{partner.description}</p>
                <a 
                  href={partner.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-green-400 hover:text-green-300 transition-colors font-medium"
                >
                  Visit website <ExternalLink size={16} className="ml-1" />
                </a>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-16 text-center">
          <h3 className="text-2xl font-bold text-white mb-6">Ready to Collaborate?</h3>
          <a 
            href="#"
            className="inline-block bg-gradient-to-r from-green-500 to-blue-500 text-black px-8 py-3 rounded-md font-semibold transition-all hover:from-green-400 hover:to-blue-400"
          >
            Become a Partner
          </a>
        </div>
      </div>
    </section>
  );
};

export default PartnersSection;