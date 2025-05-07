import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="bg-black border-t border-green-500/20 py-8 relative z-30">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <img 
              src="/assets/logo.png" 
              alt="TKNZ.FUN" 
              className="h-8 w-auto"
            />
          </div>
          <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-6">
            <span className="text-gray-500 text-sm">
              © 2025 TKNZ.FUN. All rights reserved.
            </span>
            <Link
              to="/privacy-policy"
              className="text-gray-500 hover:text-green-400 text-sm transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;