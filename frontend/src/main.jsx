import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext';
import { NavigationProvider } from './context/NavigationContext';
import { SocketProvider } from './context/SocketContext';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NavigationProvider>
          <SocketProvider>
            <App />
          </SocketProvider>
        </NavigationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
