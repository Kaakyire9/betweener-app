import React from 'react';
import ReactDOM from 'react-dom/client';
import '@stream-io/video-react-sdk/dist/css/styles.css';

import App from './App.tsx';
import { studioReleaseProvenance } from './lib/release-provenance.ts';
import './styles.css';

document.documentElement.dataset.sourceRevision = studioReleaseProvenance.source_revision;
document.documentElement.dataset.manifestVersion = studioReleaseProvenance.manifest_version;
document.documentElement.dataset.resolverVersion = studioReleaseProvenance.resolver_version;
console.info('[studio] release_provenance', studioReleaseProvenance);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
