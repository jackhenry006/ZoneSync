import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
import { MeshConsole } from './pages/MeshConsole.jsx';
import { CloudDashboard } from './pages/CloudDashboard.jsx';
import { EchoLocateView } from './pages/EchoLocateView.jsx';
import { PulseSeekerView } from './pages/PulseSeekerView.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <div>
        <Navbar />
        <Routes>
          <Route path="/" element={<MeshConsole />} />
          <Route path="/echolocate" element={<EchoLocateView />} />
          <Route path="/pulseseeker" element={<PulseSeekerView />} />
          <Route path="/dashboard" element={<CloudDashboard />} />
          <Route path="/dashboard.html" element={<CloudDashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
