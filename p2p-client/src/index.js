import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// More robust approach to suppress React Router warnings
// This overrides console.warn to filter out specific React Router warnings
const originalConsoleWarn = console.warn;
console.warn = function filterWarnings(...args) {
  // Check if this is a React Router warning
  if (
    args.length > 0 && 
    typeof args[0] === 'string' && 
    (args[0].includes('React Router') || 
     args[0].includes('startTransition') ||
     args[0].includes('relativeSplatPath'))
  ) {
    // Suppress React Router specific warnings
    return;
  }
  
  // Pass through other warnings
  originalConsoleWarn.apply(console, args);
};

// Also try the localStorage approach
try {
  localStorage.setItem('react-router-deprecation-nag', 'true');
} catch (e) {
  // Ignore any localStorage errors
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);