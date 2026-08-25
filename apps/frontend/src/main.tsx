import './styles.css';
import 'katex/dist/katex.min.css';
import { StrictMode } from 'react';

// ─── Colossal HR embed mode ─────────────────────────────────────────
// When nao is loaded inside Colossal HR's /analytics/ask iframe with
// `?embed=1`, stamp `colossal-embed` on <html> so styles.css can hide
// the surfaces that would otherwise duplicate the host chrome:
//   * the bottom sidebar user card  (identity already in Colossal top-right)
//   * the "Latest story" section on the empty state
//   * `+` / mic / model-picker in the input row (analytics-only tenant)
// Also persisted to sessionStorage so client-side navigations don't
// need the query string to keep the mode active.
(() => {
	try {
		const url = new URL(window.location.href);
		const paramSet = url.searchParams.get('embed') === '1';
		const stored = sessionStorage.getItem('colossal-embed') === '1';
		const enable = paramSet || stored;
		if (paramSet) sessionStorage.setItem('colossal-embed', '1');
		if (enable) document.documentElement.classList.add('colossal-embed');
	} catch {
		/* running outside a browser (SSR, tests) — no-op */
	}
})();
import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import superjson from 'superjson';
import { PostHogProvider } from './contexts/posthog.provider';
import { ThemeProvider } from './contexts/theme.provider';
import { McpProvider } from './contexts/mcp';
import { TooltipProvider } from './components/ui/tooltip';
import { getActiveProjectId } from './lib/active-project';
import { routeTree } from './routeTree.gen';
import reportWebVitals from './reportWebVitals';
import type { TrpcRouter } from '@nao/backend/trpc';

// Register the router instance for type safety
declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
	interface HistoryState {
		fromMessageSend?: boolean;
		openStorySlug?: string;
	}
}

// Create a new router instance
const router = createRouter({
	routeTree,
	context: {},
	defaultPreload: 'intent',
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 0,
});

/** Query client for state management */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: false,
			staleTime: 5 * 60 * 1000, // 5 minutes
		},
	},
});

/** TRPC client for typed requests to the backend */
export const trpcClient = createTRPCClient<TrpcRouter>({
	links: [
		loggerLink(),
		httpBatchLink({
			url: '/api/trpc',
			transformer: superjson,
			headers() {
				const activeProjectId = getActiveProjectId();
				return activeProjectId ? { 'x-nao-project-id': activeProjectId } : {};
			},
		}),
	],
});

/** TRPC proxy that uses the trpc and query client */
export const trpc = createTRPCOptionsProxy<TrpcRouter>({
	client: trpcClient,
	queryClient,
});

// Render the app
const rootElement = document.getElementById('app')!;
if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<ThemeProvider>
				<QueryClientProvider client={queryClient}>
					<McpProvider>
						<PostHogProvider>
							<TooltipProvider>
								<RouterProvider router={router} />
							</TooltipProvider>
						</PostHogProvider>
					</McpProvider>
				</QueryClientProvider>
			</ThemeProvider>
		</StrictMode>,
	);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
