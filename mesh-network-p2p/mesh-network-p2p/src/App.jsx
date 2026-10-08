import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
import { ConnectX } from './pages/ConnectX.jsx';
import { AiClassifierView } from './pages/AiClassifierView.jsx';
import { EvoSenseView } from './pages/EvoSenseView.jsx';
import { InertiaSenseView } from './pages/InertiaSenseView.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <div>
        <Navbar />
        <Routes>
          <Route path="/" element={<ConnectX />} />
          <Route path="/connectx" element={<ConnectX />} />
          <Route path="/echolocate" element={<EvoSenseView />} />
          <Route path="/evosense" element={<EvoSenseView />} />
          <Route path="/pulseseeker" element={<InertiaSenseView />} />
          <Route path="/inertiasense" element={<InertiaSenseView />} />
          <Route path="/classifier" element={<AiClassifierView />} />
          <Route path="/ai-classifier" element={<AiClassifierView />} />
          <Route path="/dashboard" element={<AiClassifierView />} />
          <Route path="/dashboard.html" element={<AiClassifierView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
