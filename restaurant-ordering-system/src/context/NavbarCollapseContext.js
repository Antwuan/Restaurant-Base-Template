import React, { createContext, useContext, useMemo, useState } from 'react';

const NavbarCollapseContext = createContext({
  collapsed: false,
  setCollapsed: () => {},
});

export function NavbarCollapseProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed]);
  return (
    <NavbarCollapseContext.Provider value={value}>
      {children}
    </NavbarCollapseContext.Provider>
  );
}

export function useNavbarCollapse() {
  return useContext(NavbarCollapseContext);
}
