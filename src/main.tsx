import React from 'react';
import ReactDOM from 'react-dom/client';
import GameCanvas from './GameCanvas';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GameCanvas />
  </React.StrictMode>
);
