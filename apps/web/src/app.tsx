import { IconBell, IconSearch, IconUser } from '@tabler/icons-react';
import { useState } from 'react';

import { AppHeader, HeaderIconButton } from '@swellwright/ui';

import { NAV_SECTIONS } from './nav.js';
import { Overview } from './overview.js';

export function App() {
  const [activeId, setActiveId] = useState('overview');
  return (
    <>
      <AppHeader
        activeId={activeId}
        controls={
          <>
            <HeaderIconButton icon={IconSearch} label="Search and commands" />
            <HeaderIconButton icon={IconBell} label="Alerts" />
            <HeaderIconButton icon={IconUser} label="Account" />
          </>
        }
        onNavigate={setActiveId}
        sections={NAV_SECTIONS}
      />
      <main className="sw-page">{activeId === 'overview' ? <Overview /> : null}</main>
    </>
  );
}
