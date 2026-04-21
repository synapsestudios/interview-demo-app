import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Shell, Mode } from './components/Shell';
import { api, Agency } from './api';
import { AdminTemplates } from './pages/AdminTemplates';
import { AdminTemplateDetail } from './pages/AdminTemplateDetail';
import { AdminTemplateEdit } from './pages/AdminTemplateEdit';
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
      // Reset agencyId if it's missing OR if it's no longer in the list (stale
      // localStorage after a reseed would otherwise cause 500s on downstream writes).
      const stored = localStorage.getItem('agencyId') ?? '';
      const valid = list.some((a) => a.id === stored);
      if (!valid && list[0]) {
        setAgencyId(list[0].id);
        localStorage.setItem('agencyId', list[0].id);
      } else if (valid) {
        setAgencyId(stored);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <Route path="/admin/templates/:id/edit" element={<AdminTemplateEdit />} />
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
