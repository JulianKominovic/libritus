import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";

export type PageNavigatorHandle = {
	/** Update the live 1-based page without re-rendering the parent. */
	setCurrentPage: (page1Based: number) => void;
};

export type PageNavigatorProps = {
	pageCount: number;
	/** Initial 1-based page (live updates go through the handle). */
	initialPage?: number;
	onGoToPage: (page1Based: number) => void;
	onPrev: () => void;
	onNext: () => void;
};

export const PageNavigator = forwardRef<PageNavigatorHandle, PageNavigatorProps>(
	function PageNavigator(
		{ pageCount, initialPage = 1, onGoToPage, onPrev, onNext },
		ref,
	) {
		const currentPageRef = useRef(initialPage);
		const editingRef = useRef(false);
		const skipCommitRef = useRef(false);
		const inputRef = useRef<HTMLInputElement>(null);
		const prevBtnRef = useRef<HTMLButtonElement>(null);
		const nextBtnRef = useRef<HTMLButtonElement>(null);

		const syncChrome = useCallback(
			(page: number) => {
				const prev = prevBtnRef.current;
				const next = nextBtnRef.current;
				const input = inputRef.current;
				if (prev) prev.disabled = page <= 1;
				if (next) next.disabled = page >= pageCount;
				if (input && !editingRef.current) {
					input.value = String(page);
				}
			},
			[pageCount],
		);

		// Disabled state is DOM-driven (avoids React resetting from stale initialPage).
		useEffect(() => {
			syncChrome(currentPageRef.current);
		}, [syncChrome]);

		useImperativeHandle(
			ref,
			() => ({
				setCurrentPage(page1Based: number) {
					const clamped = Math.min(
						pageCount,
						Math.max(1, page1Based),
					);
					if (clamped === currentPageRef.current) return;
					currentPageRef.current = clamped;
					syncChrome(clamped);
				},
			}),
			[pageCount, syncChrome],
		);

		const commit = () => {
			const input = inputRef.current;
			if (!input) return;

			if (skipCommitRef.current) {
				skipCommitRef.current = false;
				editingRef.current = false;
				input.value = String(currentPageRef.current);
				return;
			}

			editingRef.current = false;
			const parsed = Number.parseInt(input.value.trim(), 10);
			if (!Number.isFinite(parsed)) {
				input.value = String(currentPageRef.current);
				return;
			}
			const clamped = Math.min(pageCount, Math.max(1, parsed));
			input.value = String(clamped);
			if (clamped !== currentPageRef.current) {
				onGoToPage(clamped);
			} else {
				syncChrome(clamped);
			}
		};

		return (
			<div className="pointer-events-auto flex items-center gap-1 rounded-md bg-neutral-900 px-1.5 py-1 text-sm font-medium text-white shadow">
				<button
					ref={prevBtnRef}
					type="button"
					aria-label="Previous page"
					className="rounded px-1.5 py-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
					onClick={onPrev}
				>
					◀
				</button>
				<input
					ref={inputRef}
					type="text"
					inputMode="numeric"
					aria-label="Current page"
					defaultValue={String(initialPage)}
					className="w-10 rounded bg-neutral-800 px-1 py-0.5 text-center text-sm text-white outline-none ring-0 focus:bg-neutral-700"
					onFocus={() => {
						editingRef.current = true;
					}}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							(e.target as HTMLInputElement).blur();
						} else if (e.key === "Escape") {
							e.preventDefault();
							skipCommitRef.current = true;
							(e.target as HTMLInputElement).blur();
						}
					}}
				/>
				<span className="px-0.5 text-neutral-400">/</span>
				<span className="min-w-[1.5rem] px-0.5 text-neutral-300 tabular-nums">
					{pageCount}
				</span>
				<button
					ref={nextBtnRef}
					type="button"
					aria-label="Next page"
					className="rounded px-1.5 py-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
					onClick={onNext}
				>
					▶
				</button>
			</div>
		);
	},
);
