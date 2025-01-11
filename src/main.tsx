// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    // Show a prompt to the user to refresh
    const refresh = confirm('Une nouvelle version est disponible. Voulez-vous rafraîchir?');
    if (refresh) updateSW();
  },
  onOfflineReady() {
    // Notify the user that PWA is ready to work offline
    console.log('L\'application est prête pour fonctionner hors ligne.');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
