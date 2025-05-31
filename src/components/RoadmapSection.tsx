import React from 'react';
import { CheckCircle, Circle, Clock } from 'lucide-react';

const roadmapItems = [
  {
    title: 'Week of June 9th',
    description: [
      'Meteora Integration Complete',
      'V1 Launchpad on TKNZ.FUN'
    ],
    status: 'upcoming',
    highlight: true
  },
  {
    title: 'Week of June 16th',
    description: [
      'TKNZ Holder Premium Features (Customizations, User Defined AI Prompts, Bonding Settings & More)'
    ],
    status: 'upcoming'
  },
  {
    title: 'Week of June 23rd',
    description: [
      'Fully Native Launchpad on TKNZ.FUN'
    ],
    status: 'upcoming'
  },
  {
    title: 'Week of June 30th',
    description: [
      'Mobile Apps in Testing',
      'Multi-Chain Support'
    ],
    status: 'upcoming'
  }
];

const RoadmapSection: React.FC = () => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-6 w-6 text-green-400" />;
      case 'in-progress':
        return <Clock className="h-6 w-6 text-blue-400 animate-pulse" />;
      default:
        return <Circle className="h-6 w-6 text-gray-400" />;
    }
  };

  return (
    <section id="roadmap" className="py-16 bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_24px,rgba(0,255,0,0.03)_25px),linear-gradient(90deg,transparent_24px,rgba(0,255,0,0.03)_25px)] bg-[size:25px_25px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,0,0.1),transparent_70%)]"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            <span className="text-green-400">Road</span>map
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Our journey to revolutionize web3 tokenization
          </p>
        </div>

        {/* Mobile Timeline */}
        <div className="md:hidden relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500 via-blue-500 to-purple-500"></div>
          
          <div className="space-y-8 pl-12">
            {roadmapItems.map((item, index) => (
              <div key={index} className="relative">
                {/* Status indicator */}
                <div className="absolute -left-12 top-0">
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center backdrop-blur-sm ${
                    item.highlight ? 'border-green-500 bg-green-500/20' : 'border-gray-700 bg-gray-800/50'
                  }`}>
                    {getStatusIcon(item.status)}
                  </div>
                </div>

                {/* Content card */}
                <div className="bg-black/30 backdrop-blur-sm border border-green-500/20 rounded-lg p-4">
                  <h3 className={`text-lg font-bold mb-3 ${
                    item.highlight ? 'text-green-400' : 'text-white'
                  }`}>
                    {item.title}
                  </h3>
                  <ul className="space-y-2">
                    {item.description.map((desc, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-300">
                        <span className="text-green-400 text-lg leading-none mt-1">•</span>
                        <span className="text-sm leading-tight">{desc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Circle Layout */}
        <div className="hidden md:block max-w-5xl mx-auto relative">
          {/* Center circle with logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2 border-green-500/30 bg-black/50 overflow-hidden flex items-center justify-center z-20">
            <img 
              src="/assets/logo.png" 
              alt="TKNZ Logo" 
              className="w-24 h-24 object-contain"
            />
          </div>
          
          {/* Roadmap items in a circle */}
          <div className="relative h-[600px]">
            {roadmapItems.map((item, index) => {
              const angle = (index * 360) / roadmapItems.length;
              const radius = 250;
              const x = Math.cos((angle - 90) * (Math.PI / 180)) * radius;
              const y = Math.sin((angle - 90) * (Math.PI / 180)) * radius;

              return (
                <div
                  key={index}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                  }}
                >
                  <div className="relative group w-64">
                    {/* Connector line */}
                    <div 
                      className="absolute top-1/2 left-1/2 h-0.5 bg-gradient-to-r from-green-500/30 to-transparent origin-left"
                      style={{
                        width: `${radius - 120}px`,
                        transform: `rotate(${angle}deg) translateX(-50%)`,
                      }}
                    ></div>

                    {/* Content card */}
                    <div className="relative bg-black/30 backdrop-blur-sm border border-green-500/20 rounded-lg p-4 group-hover:border-green-400/50 transition-all duration-300">
                      {/* Status indicator */}
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center backdrop-blur-sm ${
                          item.highlight ? 'border-green-500 bg-green-500/20' : 'border-gray-700 bg-gray-800/50'
                        }`}>
                          {getStatusIcon(item.status)}
                        </div>
                      </div>

                      <div className="pt-4">
                        <h3 className={`text-lg font-bold mb-3 ${
                          item.highlight ? 'text-green-400' : 'text-white'
                        }`}>
                          {item.title}
                        </h3>
                        <ul className="space-y-2">
                          {item.description.map((desc, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-300">
                              <span className="text-green-400 text-lg leading-none mt-1">•</span>
                              <span className="text-sm leading-tight">{desc}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default RoadmapSection;