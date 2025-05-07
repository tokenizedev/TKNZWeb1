import React from 'react';
import { Link } from 'react-router-dom';

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Contract Address Banner */}
   

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-8">
          <div className="prose lg:prose-lg max-w-none">
            <h1 className="text-4xl font-bold mb-8">Privacy Policy for TKNZ</h1>
            <p className="text-gray-600 mb-8">Effective Date: February 16, 2025</p>

            <p className="mb-6">
              At TKNZ, we are committed to protecting your privacy. This Privacy Policy outlines how we collect, use, and safeguard your information when you use our Chrome extension.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Information We Collect</h2>
            <p className="mb-4">
              When you use the TKNZ extension, we may collect certain information to provide and improve our services. This includes:
            </p>
            <ul className="list-disc pl-6 mb-6">
              <li className="mb-2">
                <strong>Wallet Addresses:</strong> Collected to enable token creation and wallet functionality within the extension.
              </li>
              <li className="mb-2">
                <strong>Tokens Created:</strong> Logged to improve service features and maintain accurate transaction records.
              </li>
              <li className="mb-2">
                <strong>Basic Analytics Metrics:</strong> Non-personally identifiable data, such as usage patterns and error logs, to help us improve the extension's performance and user experience.
              </li>
            </ul>
            <p className="mb-6">
              We do not collect private keys, passwords, or any sensitive personal information. Private keys remain stored securely on your device and are never shared with us.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">How We Use Your Information</h2>
            <p className="mb-4">The information we collect is used for the following purposes:</p>
            <ul className="list-disc pl-6 mb-6">
              <li>To provide and enhance the functionality of the TKNZ extension.</li>
              <li>To analyze usage trends and gather feedback for future updates.</li>
              <li>To ensure a seamless and secure user experience.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">Data Sharing and Security</h2>
            <ul className="list-disc pl-6 mb-6">
              <li className="mb-2">
                <strong>Data Sharing:</strong> We do not sell, rent, or share your information with third parties, except when required by law.
              </li>
              <li className="mb-2">
                <strong>Data Security:</strong> We implement industry-standard measures to protect the data we collect. However, no system is completely secure, and users should take precautions to protect their information.
              </li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">Your Responsibilities</h2>
            <p className="mb-4">As a user of TKNZ, you are responsible for:</p>
            <ul className="list-disc pl-6 mb-6">
              <li>Safeguarding your private keys and wallet backup phrases.</li>
              <li>Ensuring the secure use of the extension on your device.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">Changes to This Privacy Policy</h2>
            <p className="mb-6">
              We may update this Privacy Policy from time to time to reflect changes in our practices or for legal and operational reasons. Any updates will be posted within the extension or on our website.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Contact Us</h2>
            <p className="mb-6">
              If you have any questions or concerns about this Privacy Policy or how we handle your information, feel free to reach out:
              <br />
              Email: <a href="mailto:privacy@tknz.app" className="text-[#00FF9D] hover:underline">TokenizeDev@gmail.com</a>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-12 mt-12">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto flex flex-col items-center">
            <img 
              src="/assets/logo.png" 
              alt="TKNZ Logo" 
              className="h-8 mb-4"
            />
            <div className="flex items-center space-x-4 mb-4">
              <Link to="/" className="text-gray-400 hover:text-[#00FF9D] transition-colors">
                Home
              </Link>
              <Link to="/privacy-policy" className="text-gray-400 hover:text-[#00FF9D] transition-colors">
                Privacy Policy
              </Link>
            </div>
            <p className="text-gray-400">© 2025 TKNZ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PrivacyPolicy;