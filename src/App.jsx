import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext";
import { SiteProvider } from "./context/SiteContext";
import { AdminPage } from "./pages/AdminPage";
import { CrmPage } from "./pages/CrmPage";
import { HomePage } from "./pages/HomePage";
import { RequisitesPage } from "./pages/RequisitesPage";

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <SiteProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/requisites" element={<RequisitesPage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SiteProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
