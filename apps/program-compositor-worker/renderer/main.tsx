import ReactDOM from 'react-dom/client';
import '@stream-io/video-react-sdk/dist/css/styles.css';

import { CompositorApp } from './CompositorApp.tsx';
import { compositorReleaseProvenance } from './release-provenance.ts';
import './styles.css';

document.documentElement.dataset.sourceRevision = compositorReleaseProvenance.source_revision;
console.info('[compositor] release_provenance', compositorReleaseProvenance);

ReactDOM.createRoot(document.getElementById('root')!).render(<CompositorApp />);
