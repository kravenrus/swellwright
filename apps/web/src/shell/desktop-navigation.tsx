import { Menu, Menubar } from '@mantine/core';
import type { ElementType } from 'react';
import { PiCaretDownBold } from 'react-icons/pi';
import { Link, matchPath, useLocation } from 'react-router';

import type { NavSection } from '../nav.js';

const NavIcon = ({ icon: Icon }: { icon?: ElementType }) =>
  Icon ? (
    <span aria-hidden className="sw-nav-icon">
      <Icon />
    </span>
  ) : null;

/** A page is active on its own address and below it, so a detail page keeps its section lit. */
const isPathActive = (pathname: string, href: string): boolean =>
  matchPath({ path: href, end: false }, pathname) !== null;

/**
 * The tabs of the header, ported from the panel's DesktopNavigation (src/app/layouts/dashboard/main-layout/navbar):
 * a Menubar that opens on hover, a tab that is a plain link when its section has one page, and a tab with a menu and
 * a caret otherwise. Clicking a tab with a menu goes to its first page. Pages that are planned are listed in the
 * menu, disabled.
 */
export function DesktopNavigation({
  sections,
  label,
}: {
  sections: readonly NavSection[];
  label: string;
}) {
  const { pathname } = useLocation();

  return (
    <Menubar aria-label={label} className="sw-nav" trigger="hover">
      {sections.map((section) => {
        const sectionActive = section.items.some(
          (item) => item.planned !== true && isPathActive(pathname, item.href),
        );
        const [only] = section.items;
        const single = section.items.length === 1 && only?.planned !== true ? only : undefined;

        if (single) {
          return (
            <Menubar.Menu key={section.id}>
              <Menubar.Target
                className="sw-nav-item"
                data-active={sectionActive || undefined}
                {...{ component: Link, to: single.href }}
              >
                <NavIcon icon={section.icon} />
                <span>{section.header}</span>
              </Menubar.Target>
            </Menubar.Menu>
          );
        }

        const first = section.items.find((item) => item.planned !== true);
        return (
          <Menubar.Menu key={section.id} width={250} withinPortal>
            <Menubar.Target
              className="sw-nav-item"
              data-active={sectionActive || undefined}
              {...(first ? { component: Link, to: first.href } : {})}
            >
              <NavIcon icon={section.icon} />
              <span>{section.header}</span>
              <PiCaretDownBold aria-hidden className="sw-caret" size={11} />
            </Menubar.Target>
            <Menubar.Dropdown>
              {section.items.map((item) =>
                item.planned === true ? (
                  <Menu.Item
                    className="sw-menu-item-planned"
                    disabled
                    key={item.id}
                    leftSection={<NavIcon icon={item.icon} />}
                  >
                    {item.name}
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    className={
                      isPathActive(pathname, item.href) ? 'sw-menu-item-active' : undefined
                    }
                    component={Link}
                    key={item.id}
                    leftSection={<NavIcon icon={item.icon} />}
                    to={item.href}
                  >
                    {item.name}
                  </Menu.Item>
                ),
              )}
            </Menubar.Dropdown>
          </Menubar.Menu>
        );
      })}
    </Menubar>
  );
}
