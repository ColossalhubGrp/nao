import { createContext, useContext, useCallback, useState } from 'react';
import { useMemoObject } from '@/hooks/useMemoObject';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { createLocalStorage } from '@/lib/local-storage';
import { useIsMobile } from '@/hooks/use-is-mobile';

type SidebarContextValue = {
	isMobile: boolean;
	isCollapsed: boolean;
	isMobileOpen: boolean;
	toggle: (opts?: { persist?: boolean }) => void;
	collapse: (opts?: { persist?: boolean }) => void;
	expand: (opts?: { persist?: boolean }) => void;
	openMobile: () => void;
	closeMobile: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const useSidebar = () => {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error('useSidebar must be used within a SidebarProvider');
	}
	return context;
};

const storage = createLocalStorage<'true' | 'false'>('sidebar-collapsed', 'false');

/**
 * True when this SPA is loaded inside Colossal HR's `/analytics/ask`
 * iframe (see the `?embed=1` bootstrap in `main.tsx`). Used to force
 * the sidebar into its collapsed state on mount — the host app already
 * has its own left nav, and nao's chats/stories list belongs behind
 * a single toggle rather than duplicated permanently.
 */
const isColossalEmbed = () => {
	if (typeof document === 'undefined') return false;
	return document.documentElement.classList.contains('colossal-embed');
};

export const SidebarProvider = ({ children }: { children: React.ReactNode }) => {
	const isMobile = useIsMobile();
	const [isCollapsedRaw, setIsCollapsed] = useLocalStorage(storage);
	const [isMobileOpen, setIsMobileOpen] = useState(false);
	// Embed mode: force-collapse on mount so HR admins never see the
	// nao inner sidebar competing with Colossal's own left rail. We
	// only override the FIRST render — if the user manually expands
	// during the session, `didManuallyToggle` flips and the stored
	// preference takes over. Reload → forced-collapsed again.
	const didMountInEmbed = useState(isColossalEmbed())[0];
	const [didManuallyToggle, setDidManuallyToggle] = useState(false);
	const isCollapsed =
		didMountInEmbed && !didManuallyToggle ? 'true' : isCollapsedRaw;

	const toggle: SidebarContextValue['toggle'] = useCallback(
		(opts) => {
			if (isMobile) {
				setIsMobileOpen((prev) => !prev);
				return;
			}
			setDidManuallyToggle(true);
			setIsCollapsed((prev) => (prev === 'true' ? 'false' : 'true'), opts);
		},
		[setIsCollapsed, isMobile],
	);

	const collapse: SidebarContextValue['collapse'] = useCallback(
		(opts) => {
			setDidManuallyToggle(true);
			setIsCollapsed('true', opts);
		},
		[setIsCollapsed],
	);

	const expand: SidebarContextValue['expand'] = useCallback(
		(opts) => {
			setDidManuallyToggle(true);
			setIsCollapsed('false', opts);
		},
		[setIsCollapsed],
	);

	const openMobile = useCallback(() => setIsMobileOpen(true), []);
	const closeMobile = useCallback(() => setIsMobileOpen(false), []);

	return (
		<SidebarContext.Provider
			value={useMemoObject({
				isMobile,
				isCollapsed: isCollapsed === 'true',
				isMobileOpen,
				toggle,
				collapse,
				expand,
				openMobile,
				closeMobile,
			})}
		>
			{children}
		</SidebarContext.Provider>
	);
};
