import { memo, useMemo, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import type { UIMessage } from '@nao/backend/chat';
import type { GroupedMessagePart } from '@/types/ai';
import {
	areGroupedMessagePartArraysEqual,
	areGroupedMessagePartsEqual,
	checkAssistantMessageHasContent,
	filterConciseVisible,
	groupToolCalls,
	isToolGroupPart,
	isToolUIPart,
} from '@/lib/ai';
import { ToolCallsGroup } from '@/components/tool-calls/tool-calls-group';
import { ToolCall } from '@/components/tool-calls';
import { AssistantReasoning } from '@/components/chat-messages/assistant-reasoning';
import { AssistantCompaction } from '@/components/chat-messages/assistant-compaction';
import { AssistantTextWithCitation } from '@/components/chat-messages/citation-text';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { AssistantMessageActions } from '@/components/chat-messages/assistant-message-actions';
import { cn, isLast } from '@/lib/utils';
import { useChatId } from '@/hooks/use-chat-id';
import { useIsCancellingMessage } from '@/hooks/use-is-cancelling-message-store';
import { useToolCallDensity } from '@/hooks/use-tool-call-density';
import { AssistantMessageProvider, useAssistantMessage } from '@/contexts/assistant-message';

export const AssistantMessage = memo(
	({
		message,
		showLoader,
		isSettled,
		isRunning,
		isLastMessage,
		storyIntroMessageId,
	}: {
		message: UIMessage;
		showLoader: boolean;
		isSettled: boolean;
		isRunning: boolean;
		isLastMessage: boolean;
		storyIntroMessageId: string | undefined;
	}) => {
		const chatId = useChatId();
		const [toolCallDensity] = useToolCallDensity();
		const messageParts = useMemo(
			() => groupToolCalls(message.parts, toolCallDensity),
			[message.parts, toolCallDensity],
		);
		const hasContent = useMemo(() => checkAssistantMessageHasContent(message), [message]);
		const isCancelling = useIsCancellingMessage(message.id);
		const isCompacting = message.parts.at(-1)?.type === 'data-compactionSummaryStarted';
		const showActions = message.id !== storyIntroMessageId;
		const hasFeedback = message.feedback != null;

		// Concise mode: hide the model's process (reasoning + technical
		// tool calls) by default, show only substantive output — final
		// text, charts, stories, execute_sql results. Non-technical
		// readers should see straight answers, not "Read columns.md
		// from tabPayrollRun" or "Explored 2 files". The single
		// "Show reasoning" toggle lets curious users peek behind the
		// curtain, mirroring Claude's own chat pattern.
		//
		// While the message is still streaming (`!isSettled`) we always
		// show everything so the user sees live progress. The collapse
		// engages only once the turn is complete.
		const [showReasoning, setShowReasoning] = useState(false);
		const conciseParts = useMemo(() => filterConciseVisible(messageParts), [messageParts]);
		const hasHidden = conciseParts.length < messageParts.length;
		const visibleParts: GroupedMessagePart[] =
			!isSettled || showReasoning ? messageParts : conciseParts;

		if (!message.parts.length && isSettled) {
			return null;
		}

		if (isCancelling && isSettled && !hasContent) {
			return null;
		}

		return (
			<AssistantMessageProvider isSettled={isSettled}>
				<div className={cn('group px-3 flex flex-col gap-2 bg-transparent')}>
					{isSettled && hasHidden && (
						<ReasoningToggle
							open={showReasoning}
							onToggle={() => setShowReasoning((v) => !v)}
						/>
					)}
					<MessageParts parts={visibleParts} />

					{isSettled && !hasContent && (
						<div className='text-muted-foreground italic text-sm'>No response</div>
					)}

					{isCompacting ? <AssistantCompaction /> : showLoader && <TextShimmer showLogo />}

					{chatId && showActions && (
						<AssistantMessageActions
							message={message}
							chatId={chatId}
							className={cn(
								'transition-opacity duration-200',
								isLastMessage
									? isRunning
										? 'hidden'
										: 'opacity-100'
									: hasFeedback
										? 'opacity-100'
										: 'opacity-0 group-hover:opacity-100',
							)}
						/>
					)}
				</div>
			</AssistantMessageProvider>
		);
	},
);

/**
 * The single "Show reasoning" pill at the top of an assistant turn.
 * Renders only when the settled turn actually has hidden process parts —
 * a straight-through answer with no tool use or thinking never shows it.
 */
function ReasoningToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
	return (
		<button
			type='button'
			onClick={onToggle}
			className={cn(
				'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
				'border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
			)}
			aria-expanded={open}
		>
			<Sparkles className='h-3 w-3' />
			{open ? 'Hide reasoning' : 'Show reasoning'}
			<ChevronDown
				className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
			/>
		</button>
	);
}

export const MessageParts = memo(
	({ parts }: { parts: GroupedMessagePart[] }) => {
		const { isSettled } = useAssistantMessage();
		return parts.map((part, i) => {
			return <MessagePart key={i} part={part} isPartSettled={isSettled || !isLast(part, parts)} />;
		});
	},
	(previous, next) => areGroupedMessagePartArraysEqual(previous.parts, next.parts),
);

export const MessagePart = memo(
	({ part, isPartSettled }: { part: GroupedMessagePart; isPartSettled: boolean }) => {
		if (isToolGroupPart(part)) {
			return <ToolCallsGroup parts={part.parts} isSettled={isPartSettled} />;
		}

		if (isToolUIPart(part)) {
			return <ToolCall toolPart={part} />;
		}

		const isPartStreaming = !isPartSettled && 'state' in part && part.state === 'streaming';

		switch (part.type) {
			case 'text':
				return <AssistantTextWithCitation text={part.text} isStreaming={isPartStreaming} />;
			case 'reasoning':
				return <AssistantReasoning text={part.text} isStreaming={isPartStreaming} />;
			case 'data-compaction':
				return <AssistantCompaction part={part.data} />;
			default:
				return null;
		}
	},
	(previous, next) =>
		previous.isPartSettled === next.isPartSettled && areGroupedMessagePartsEqual(previous.part, next.part),
);
