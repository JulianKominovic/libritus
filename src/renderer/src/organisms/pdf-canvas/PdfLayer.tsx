import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import type { PageLayout } from '@renderer/lib/pdf-canvas/PageLayout'
import { worldAABBFromCamera } from '@renderer/lib/pdf-canvas/PageLayout'
import type { PagePool, PageSlot } from '@renderer/lib/pdf-canvas/PagePool'
import type { TextLayerPool, TextLayerSlot } from '@renderer/lib/pdf-canvas/TextLayerPool'
import type { CameraState, PageRect } from '@renderer/lib/pdf-canvas/types'

export type PdfLayerHandle = {
	applyCamera: (camera: CameraState) => void;
};

type PdfLayerProps = {
	layout: PageLayout;
	pool: PagePool;
	textPool: TextLayerPool;
	textSelectMode: boolean;
};

function visibleEqual(a: number[], b: number[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function PageSlotView({
	page,
	slot,
	textSlot,
	textSelectMode,
}: {
	page: PageRect;
	slot?: PageSlot;
	textSlot?: TextLayerSlot;
	textSelectMode: boolean;
}) {
	const canvasHostRef = useRef<HTMLDivElement>(null);
	const textHostRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = canvasHostRef.current;
		if (!host || !slot?.ready) return;

		const canvas = slot.canvas;
		canvas.style.display = "block";
		canvas.style.width = `${page.width}px`;
		canvas.style.height = `${page.height}px`;
		host.replaceChildren(canvas);

		return () => {
			if (canvas.parentElement === host) {
				host.removeChild(canvas);
			}
		};
	}, [slot, slot?.ready, page.width, page.height]);

	useEffect(() => {
		const host = textHostRef.current;
		if (!host || !textSlot?.ready) return;

		const div = textSlot.div;
		host.replaceChildren(div);

		return () => {
			if (div.parentElement === host) {
				host.removeChild(div);
			}
		};
	}, [textSlot, textSlot?.ready]);

	return (
		<div
			className="absolute bg-white shadow-sm"
			style={{
				left: page.x,
				top: page.y,
				width: page.width,
				height: page.height,
			}}
		>
			{slot?.ready ? (
				<div ref={canvasHostRef} className="h-full w-full" />
			) : (
				<div className="h-full w-full animate-pulse bg-neutral-100" />
			)}
			{textSlot?.ready ? (
				<div
					ref={textHostRef}
					className={`absolute inset-0 ${
						textSelectMode ? "pointer-events-auto" : "pointer-events-none"
					}`}
				/>
			) : null}
		</div>
	);
}

/**
 * Readonly visual PDF layer under Excalidraw. Text layer accepts hits only in
 * text-select mode (Excalidraw interactive canvas is made pass-through via CSS).
 * Only mounts canvases / text layers for pages currently tracked by the pools.
 *
 * Camera updates are imperative (`applyCamera`) so pan/zoom does not re-render
 * React — only CSS transform + culling when the visible page set changes.
 */
export const PdfLayer = forwardRef<PdfLayerHandle, PdfLayerProps>(
	function PdfLayer({ layout, pool, textPool, textSelectMode }, ref) {
		const [visible, setVisible] = useState<number[]>([]);
		const [, setTick] = useState(0);

		const worldDivRef = useRef<HTMLDivElement>(null);
		const visibleRef = useRef<number[]>([]);
		const syncGenRef = useRef(0);
		const lastCameraRef = useRef<CameraState | null>(null);

		const layoutRef = useRef(layout);
		const poolRef = useRef(pool);
		const textPoolRef = useRef(textPool);
		layoutRef.current = layout;
		poolRef.current = pool;
		textPoolRef.current = textPool;

		const applyCamera = useCallback((camera: CameraState) => {
			lastCameraRef.current = camera;

			const world = worldDivRef.current;
			if (world) {
				const { scrollX, scrollY, zoom } = camera;
				world.style.transform = `translate(${scrollX * zoom}px, ${scrollY * zoom}px) scale(${zoom})`;
			}

			const currentLayout = layoutRef.current;
			const currentPool = poolRef.current;
			const currentTextPool = textPoolRef.current;

			const aabb = worldAABBFromCamera(
				camera.scrollX,
				camera.scrollY,
				camera.zoom,
				camera.viewportWidth,
				camera.viewportHeight,
			);
			const buffer =
				Math.max(camera.viewportWidth, camera.viewportHeight) /
				Math.max(camera.zoom, 0.01);
			const next = currentLayout.queryVisible(aabb, buffer);

			if (visibleEqual(visibleRef.current, next)) return;

			visibleRef.current = next;
			setVisible(next);

			const gen = ++syncGenRef.current;
			void (async () => {
				await Promise.all([
					currentPool.syncVisible(next),
					currentTextPool.syncVisible(next),
				]);
				if (gen === syncGenRef.current) setTick((t) => t + 1);
			})();
		}, []);

		useImperativeHandle(ref, () => ({ applyCamera }), [applyCamera]);

		useEffect(() => {
			const unsubPool = pool.subscribe(() => setTick((t) => t + 1));
			const unsubText = textPool.subscribe(() => setTick((t) => t + 1));
			return () => {
				unsubPool();
				unsubText();
			};
		}, [pool, textPool]);

		// Session / pool identity changed — re-cull with last camera if any.
		useEffect(() => {
			visibleRef.current = [];
			const cam = lastCameraRef.current;
			if (cam) applyCamera(cam);
		}, [layout, pool, textPool, applyCamera]);

		const pageIndices = new Set([
			...visible,
			...pool.getSlots().map((s) => s.pageIndex),
		]);

		return (
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 overflow-hidden"
				style={{ zIndex: 0 }}
			>
				<div
					ref={worldDivRef}
					className="absolute left-0 top-0 origin-top-left will-change-transform"
				>
					{[...pageIndices].map((pageIndex) => {
						const page = layout.pages[pageIndex];
						if (!page) return null;
						return (
							<PageSlotView
								key={pageIndex}
								page={page}
								slot={pool.getSlot(pageIndex)}
								textSlot={textPool.getSlot(pageIndex)}
								textSelectMode={textSelectMode}
							/>
						);
					})}
				</div>
			</div>
		);
	},
);
