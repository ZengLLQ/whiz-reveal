import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
// App comes first, so the stylesheets its components import precede these global ones in the cascade
// (docs/architecture.md, "CSS architecture").
import { App } from './App';
import './fonts.css';
import './reset.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
