import { createContext, useContext } from "react";

export const AdminLogoutContext = createContext(null);

export function useAdminLogout() {
  return useContext(AdminLogoutContext);
}
