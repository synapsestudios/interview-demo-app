import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Shell, Mode } from './components/Shell';
import { api, Agency } from './api';
import { AdminTemplates } from './pages/AdminTemplates';
import { AdminTemplateDetail } from './pages/AdminTemplateDetail';
import { AgencyScreenings } from './pages/AgencyScreenings';
import { AgencyScreeningDetail } from './pages/AgencyScreeningDetail';
import { AgencyDashboard } from './pages/AgencyDashboard';

export default function App() {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem('mode') as Mode) || 'agency',
  );
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyId, setAgencyId] = useState<string>(() => localStorage.getItem('agencyId') ?? '');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    api.listAgencies().then((list) => {
      setAgencies(list);
      if (!agencyId && list[0]) {
        setAgencyId(list[0].id);
        localStorage.setItem('agencyId', list[0].id);
      }
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('mode', mode);
    if (mode === 'admin' && !location.pathname.startsWith('/admin')) {
      navigate('/admin/templates');
    } else if (mode === 'agency' && !location.pathname.startsWith('/agency')) {
      navigate('/agency/screenings');
    }
  }, [mode]);

  const onAgencyChange = (id: string) => {
    setAgencyId(id);
    localStorage.setItem('agencyId', id);
  };

  return (
    <Shell
      mode={mode}
      onModeChange={setMode}
      agencies={agencies}
      agencyId={agencyId}
      onAgencyChange={onAgencyChange}
    >
      <Routes>
        <Route
          path="/"
          element={<Navigate to={mode === 'admin' ? '/admin/templates' : '/agency/screenings'} replace />}
        />
        <Route path="/admin/templates" element={<AdminTemplates />} />
        <Route path="/admin/templates/:id" element={<AdminTemplateDetail />} />
        <Route path="/agency/screenings" element={<AgencyScreenings agencyId={agencyId} />} />
        <Route path="/agency/screenings/:id" element={<AgencyScreeningDetail />} />
        <Route path="/agency/dashboard" element={<AgencyDashboard agencyId={agencyId} />} />
        <Route
          path="*"
          element={
            <div className="empty">
              Not found.
              <span className="sub">Return via the masthead.</span>
            </div>
          }
        />
      </Routes>
    </Shell>
  );
}
