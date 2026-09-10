import React from 'react';
import ReactDOM from 'react-dom/client';
import '@stream-io/video-react-sdk/dist/css/styles.css';

import App from './App.tsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
