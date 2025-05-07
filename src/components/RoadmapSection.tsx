import React from 'react';
import { CheckCircle, Circle, Clock, Check } from 'lucide-react';

const roadmapItems = [
  {
    title: 'Launch: April 30, 2025',
    description: [
      'TKNZ goes live — the fastest way to tokenize the internet.'
    ],
    status: 'upcoming',
    highlight: true
  },
  {
    title: 'Week 1',
    description: [
      'Complete redesign + rebrand',
      'Isolate any pixel on a page to launch a token',
      'Sidebar companion for seamless browsing'
    ],
    status: 'completed',
    released: true
  },
  {
    title: 'Week 2',
    description: [
      'Full wallet suite: Send, swap, import, and manage multiple wallets',
      'Leaderboard launch + website upgrade'
    ],
    status: 'in-progress'
  },
  {
    title: 'Week 3',
    description: [
      'Buy any token directly from X (Twitter)',
      'Treasury contract launch: Generate utility for $TKNZ holders'
    ],
    status: 'upcoming'
  },
  {
    title: 'Week 4',
    description: [
      'User-managed AI prompt system for smarter metadata',
      'Begin development of the TKNZ mobile app'
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
  
  const getStatusClass = (status: string, highlight: boolean = false) => {
    if (highlight) return 'border-green-500 bg-green-500/20';
    switch (status) {
      case 'completed':
        return 'border-green-500 bg-green-500/10';
      case 'in-progress':
        return 'border-blue-500 bg-blue-500/10';
      default:
        return 'border-gray-700 bg-gray-800/50';
    }
  };
  
  return (
    <section id="roadmap" className="py-24 bg-gradient-to-b from-gray-900 to-black">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            <span className="text-green-400">Road</span>map
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Our journey to revolutionize web3 tokenization
          </p>
        </div>
        
        <div className="max-w-4xl mx-auto relative">
          {/* Vertical line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500 via-blue-500 to-purple-500 transform -translate-x-1/2"></div>
          
          {roadmapItems.map((item, index) => (
            <div 
              key={index}
              className="flex items-start mb-20"
            >
              {/* Content */}
              <div className="w-5/12 pr-8 pt-2">
                <div className="flex items-center gap-2 justify-start mb-4">
                  <h3 className={`text-2xl font-bold ${item.highlight ? 'text-green-400' : 'text-white'}`}>
                    {item.title}
                  </h3>
                  {item.released && (
                    <div className="flex items-center text-green-400 text-sm bg-green-400/10 px-2 py-0.5 rounded">
                      <Check size={16} className="mr-1" />
                      Released
                    </div>
                  )}
                </div>
                <ul className="space-y-4 text-gray-300">
                  {item.description.map((desc, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-green-400 text-lg leading-none mt-1">•</span>
                      <span>{desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Center dot */}
              <div className="w-2/12 flex justify-center relative z-10">
                <div 
                  className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getStatusClass(item.status, item.highlight)}`}
                >
                  {getStatusIcon(item.status)}
                </div>
              </div>
              
              {/* Empty space for alignment */}
              <div className="w-5/12"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RoadmapSection;