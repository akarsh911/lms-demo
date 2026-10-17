'use client';

import * as React from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { ChevronDown } from 'lucide-react';

import { activeHref, navTrail } from '@/lib/nav/build-nav';
import type { NavItem } from '@/types/nav';

import { navIcons } from './nav-icons';

/** User toggles, remembered only for the branch they were made on. */
interface Overrides {
  trail: string;
  map: ReadonlyMap<string, boolean>;
}

const NO_OVERRIDES: ReadonlyMap<string, boolean> = new Map();

/**
 * The recursive nav list, shared by the permanent sidebar and the mobile
 * drawer. One implementation, two frames. The alternative is two nav trees
 * that drift, which is exactly how a feature ends up reachable on desktop and
 * missing on a phone.
 *
 * Everything it receives is already filtered on the server. There is no
 * entitlement check in this component and there must never be one: a feature
 * the user does not hold produced no NavItem, so it is absent from the markup
 * entirely rather than hidden with CSS or rendered disabled.
 *
 * Items that ARE here are all genuinely held. `disabled` means held but
 * currently inert (a kill switch, `is_enabled = false` on the feature, or a
 * grant switched off), which the user is better off seeing than watching a menu
 * entry vanish mid-session.
 */
export function NavTree({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}): React.ReactElement {
  /**
   * Which groups are open.
   *
   * The DEFAULT is derived, not stored: a group is open when the current page
   * is inside it. That is what makes landing directly on
   * `/p/x/learning/mindmap` show the active row rather than hiding it inside a
   * collapsed group, and it needs no effect to keep in sync.
   *
   * What IS stored is the user's overrides, and they are scoped to the branch
   * they were made on. Toggling a group holds until you navigate somewhere
   * else, at which point the derived default takes over again. The alternative,
   * overrides that outlive navigation, means a group the user once collapsed
   * stays collapsed even when it contains the page they are looking at.
   *
   * Deriving rather than synchronising also keeps this out of an effect. Mirror
   * state into `useState` from a `useEffect` and every navigation costs a
   * second render pass, which is what `react-hooks/set-state-in-effect` is
   * pointing at.
   */
  // A detail page has no row of its own, so it lights the row it sits under.
  const current = React.useMemo(() => activeHref(items, pathname), [items, pathname]);
  const trail = React.useMemo(() => navTrail(items, current), [items, current]);
  const trailKey = trail.join('/');
  const [overrides, setOverrides] = React.useState<Overrides>(() => ({
    trail: trailKey,
    map: new Map(),
  }));

  // Overrides made on a different branch are ignored rather than cleared: this
  // renders during the same pass that the URL changed in, with no write.
  const active = overrides.trail === trailKey ? overrides.map : NO_OVERRIDES;
  const onTrail = React.useMemo(() => new Set(trail), [trail]);

  const isOpen = React.useCallback(
    (key: string): boolean => active.get(key) ?? onTrail.has(key),
    [active, onTrail],
  );

  const toggle = React.useCallback(
    (key: string) => {
      setOverrides((prev) => {
        const map = new Map(prev.trail === trailKey ? prev.map : []);
        map.set(key, !(map.get(key) ?? onTrail.has(key)));
        return { trail: trailKey, map };
      });
    },
    [trailKey, onTrail],
  );

  if (items.length === 0) return <EmptyNav />;

  return (
    <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {items.map((item) => (
        <NavBranch
          key={item.key}
          item={item}
          pathname={current}
          isOpen={isOpen}
          onToggle={toggle}
          onTrail={onTrail}
        />
      ))}
    </List>
  );
}

function NavBranch({
  item,
  pathname,
  isOpen,
  onToggle,
  onTrail,
}: {
  item: NavItem;
  pathname: string;
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
  onTrail: ReadonlySet<string>;
}): React.ReactElement {
  const hasChildren = item.children.length > 0;
  const open = isOpen(item.key);
  // On the branch to the current page, but not the page itself. Rendered as a
  // quieter emphasis so a collapsed group still says "you are in here".
  const onBranch = hasChildren && onTrail.has(item.key) && pathname !== item.href;

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <NavRow
        item={item}
        pathname={pathname}
        hasChildren={hasChildren}
        isOpen={open}
        onBranch={onBranch}
        onToggle={onToggle}
      />

      {hasChildren ? (
        <Collapse in={open} timeout="auto" unmountOnExit id={`nav-group-${item.key}`}>
          <List
            disablePadding
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.25,
              mt: 0.25,
              // The rail. It is what makes two levels legible at a glance
              // without relying on indentation alone.
              ml: 2.75,
              pl: 0.75,
              borderLeft: 1,
              borderColor: 'divider',
              mb: 0.5,
            }}
          >
            {item.children.map((child) => (
              <NavBranch
                key={child.key}
                item={child}
                pathname={pathname}
                isOpen={isOpen}
                onToggle={onToggle}
                onTrail={onTrail}
              />
            ))}
          </List>
        </Collapse>
      ) : null}
    </Box>
  );
}

function NavRow({
  item,
  pathname,
  hasChildren,
  isOpen,
  onBranch,
  onToggle,
}: {
  item: NavItem;
  pathname: string;
  hasChildren: boolean;
  isOpen: boolean;
  onBranch: boolean;
  onToggle: (key: string) => void;
}): React.ReactElement {
  const Icon = navIcons[item.icon] ?? navIcons.home;
  const selected = item.href !== null && pathname === item.href;
  const isDisabled = item.state === 'disabled';
  const nested = item.depth > 0;

  const label = (
    <>
      {/* `color: inherit`: the icons were MUI's default near-black at 54%
          opacity beside brand-grey labels, so every row read as two colours. */}
      <ListItemIcon sx={{ minWidth: nested ? 30 : 34, color: 'inherit' }}>
        {Icon ? <Icon size={nested ? 16 : 18} /> : null}
      </ListItemIcon>
      <ListItemText
        primary={item.title}
        slotProps={{
          primary: {
            variant: 'body2',
            sx: {
              fontSize: nested ? '0.82rem' : '0.875rem',
              fontWeight: selected || onBranch ? 600 : 500,
              letterSpacing: '-0.005em',
            },
          },
        }}
      />
    </>
  );

  const rowSx = {
    py: nested ? 0.5 : 0.75,
    pl: nested ? 1.25 : 1.5,
    pr: 1.25,
    // The branch holding the current page is weighted, not coloured: red on a group name reads as an error.
    ...(onBranch ? { color: 'text.primary' } : null),
  } as const;

  const chevron = (
    <ChevronDown
      size={16}
      style={{
        flex: '0 0 auto',
        transform: isOpen ? undefined : 'rotate(-90deg)',
        transition: 'transform 150ms',
      }}
    />
  );

  /**
   * A group with no page of its own is a disclosure control and nothing else.
   *
   * `emerge.learning` has two children and both are sidebar routes, so it owns
   * no content: its page would list links the sidebar is already showing. The
   * whole row therefore toggles, which is also the larger target. It is not
   * rendered `disabled` even when the feature is, because there is no
   * destination to withhold and greying it out would strand the live children
   * underneath.
   */
  if (item.href === null) {
    return (
      <ListItemButton
        onClick={() => onToggle(item.key)}
        aria-expanded={isOpen}
        aria-controls={`nav-group-${item.key}`}
        sx={rowSx}
      >
        {label}
        {chevron}
      </ListItemButton>
    );
  }

  // Rendered as two distinct elements rather than one with conditional props: a
  // disabled item must not be an anchor at all, or it stays middle-clickable
  // despite looking inert.
  //
  // It IS still focusable, and says why. `disabled` removed it from the tab
  // order and dimmed it to about 2:1, so the row a student most needs
  // explained — "why can't I open Flashcards?" — was the one they could
  // neither reach nor read.
  const row = isDisabled ? (
    <ListItemButton
      component="div"
      aria-disabled="true"
      tabIndex={0}
      title={`${item.title} is switched off for your account`}
      sx={{ ...rowSx, color: 'text.secondary', cursor: 'default', '&:hover': { backgroundColor: 'transparent' } }}
    >
      {label}
      <Box component="span" sx={visuallyHidden}>
        (switched off for your account)
      </Box>
    </ListItemButton>
  ) : (
    <ListItemButton component={Link} href={item.href} selected={selected} sx={rowSx}>
      {label}
    </ListItemButton>
  );

  if (!hasChildren) return row;

  /**
   * A group that DOES have a page is a link AND a disclosure, as two controls.
   *
   * Making the whole row toggle would cost the page; making the whole row
   * navigate would make the group unopenable while you are standing on it. The
   * chevron gets its own button and its own accessible name, and it keeps
   * working when the row beside it is disabled, so a killed parent never puts
   * its live children out of reach.
   */
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>{row}</Box>
      <IconButton
        size="small"
        onClick={() => onToggle(item.key)}
        aria-expanded={isOpen}
        aria-controls={`nav-group-${item.key}`}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.title}`}
        sx={{
          flex: '0 0 auto',
          color: 'text.secondary',
          transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: (theme) => theme.transitions.create('transform'),
        }}
      >
        <ChevronDown size={16} />
      </IconButton>
    </Box>
  );
}

/** Visually hidden, still read aloud. Strings: in `sx`, a width of 1 means 100%. */
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/**
 * An empty sidebar is alarming: it reads as "I have been removed". Say what is
 * actually true instead of rendering nothing.
 */
function EmptyNav(): React.ReactElement {
  return (
    <Box sx={{ px: 1.5, py: 3 }}>
      <Typography variant="subtitle2" gutterBottom>
        Nothing enabled yet
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Your account is active, but no features have been switched on for it. Your
        school administrator can enable them.
      </Typography>
    </Box>
  );
}
