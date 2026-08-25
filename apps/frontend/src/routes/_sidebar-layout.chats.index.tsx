import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ChatListItem } from '@/components/sidebar-chat-list-item';
import { trpc } from '@/main';

/**
 * Full-page grouped chats list. Nao's stock UI only exposes chats
 * through the sidebar; when Colossal HR hides that sidebar entirely
 * in embed mode, the recall surface has to live somewhere else. This
 * page reuses `trpc.chat.listGrouped` (the exact query the sidebar
 * calls) so groupings and item shape stay in sync, and renders each
 * chat with the same ChatListItem the sidebar uses.
 *
 * Sensible defaults: group by "date" (most-recent-first) and no
 * filters. When a user needs to filter, they can still open a
 * specific chat and drill from there.
 */
export const Route = createFileRoute('/_sidebar-layout/chats/')({
	component: ChatsPage,
});

function ChatsPage() {
	const groupedChats = useQuery({
		...trpc.chat.listGrouped.queryOptions({
			groupBy: 'date',
			filters: [],
		}),
		placeholderData: keepPreviousData,
	});

	const groups = groupedChats.data?.groups ?? [];
	const isEmpty =
		groupedChats.isSuccess && groups.every((g) => g.chats.length === 0);

	return (
		<div className='flex-1 min-h-0 overflow-y-auto'>
			<div className='mx-auto max-w-3xl w-full px-6 py-8'>
				<div className='mb-6'>
					<h1 className='text-2xl font-semibold text-foreground'>Chats</h1>
					<p className='mt-1 text-sm text-muted-foreground'>
						Everything you&apos;ve asked, grouped by date. Click any to reopen.
					</p>
				</div>

				{groupedChats.isLoading && (
					<div className='py-10 text-center text-sm text-muted-foreground'>
						Loading your chats…
					</div>
				)}

				{isEmpty && (
					<div className='rounded-lg border border-border bg-card p-10 text-center'>
						<p className='text-sm font-medium text-foreground'>No chats yet</p>
						<p className='mt-1 text-xs text-muted-foreground'>
							Start a new one from the Ask (AI) tab.
						</p>
					</div>
				)}

				{!isEmpty &&
					groups.map((group) => (
						<div key={group.label} className='mb-8'>
							{group.label && (
								<h2 className='mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
									{group.label}
								</h2>
							)}
							<div className='space-y-1'>
								{group.chats.map((item) =>
									item.kind === 'shared' ? null : (
										<ChatListItem key={item.id} chat={item} />
									),
								)}
							</div>
						</div>
					))}
			</div>
		</div>
	);
}
