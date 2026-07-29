'use client';

import { createContext, useContext } from 'react';
import type { AdminRole } from '@/lib/modules/admin/roles';

interface AdminContextValue {
  adminRole: AdminRole;
  jobIds: string[];
}

const AdminContext = createContext<AdminContextValue>({
  adminRole: 'sales_rep',
  jobIds: [],
});

export function AdminContextProvider({
  adminRole,
  jobIds,
  children,
}: AdminContextValue & { children: React.ReactNode }) {
  return (
    <AdminContext.Provider value={{ adminRole, jobIds }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminContext(): AdminContextValue {
  return useContext(AdminContext);
}
