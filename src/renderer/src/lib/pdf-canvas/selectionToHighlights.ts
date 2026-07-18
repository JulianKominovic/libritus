import { viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
	ExcalidrawElement,
	OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { mergeSameLineRects } from "./mergeSameLineRects";

const MIN_RECT_AREA = 1;
const HIGHLIGHT_FILL = "#FF00FF";
const HIGHLIGHT_OPACITY = 20;

type SceneViewport = Pick<
	AppState,
	"zoom" | "offsetLeft" | "offsetTop" | "scrollX" | "scrollY"
>;

export type PdfHighlightData = {
	pdfHighlight: true;
	text: string;
};

export { mergeSameLineRects } from "./mergeSameLineRects";

export function isPdfHighlight(
	el: ExcalidrawElement,
): el is OrderedExcalidrawElement {
	return el.customData?.pdfHighlight === true;
}

/** Top-most PDF highlight under scene point (later scene index wins). */
export function findPdfHighlightAt(
	elements: readonly OrderedExcalidrawElement[],
	sceneX: number,
	sceneY: number,
): OrderedExcalidrawElement | null {
	let hit: OrderedExcalidrawElement | null = null;
	for (const el of elements) {
		if (el.isDeleted || !isPdfHighlight(el)) continue;
		if (
			sceneX >= el.x &&
			sceneX <= el.x + el.width &&
			sceneY >= el.y &&
			sceneY <= el.y + el.height
		) {
			hit = el;
		}
	}
	return hit;
}

/**
 * Convert the current browser text selection into Excalidraw rectangle
 * skeletons aligned to scene coordinates (one rect per visual line after
 * same-line merge of client rects).
 */
export function selectionToHighlightSkeletons(
	appState: SceneViewport,
): ExcalidrawElementSkeleton[] | null {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return null;
	}

	const text = selection.toString();
	if (!text.trim()) {
		return null;
	}

	const range = selection.getRangeAt(0);
	const lineBoxes = mergeSameLineRects(range.getClientRects());
	const skeletons: ExcalidrawElementSkeleton[] = [];

	for (const box of lineBoxes) {
		const topLeft = viewportCoordsToSceneCoords(
			{ clientX: box.left, clientY: box.top },
			appState,
		);
		const bottomRight = viewportCoordsToSceneCoords(
			{ clientX: box.right, clientY: box.bottom },
			appState,
		);

		const width = bottomRight.x - topLeft.x;
		const height = bottomRight.y - topLeft.y;
		if (width * height < MIN_RECT_AREA) continue;

		skeletons.push({
			type: "rectangle",
			x: topLeft.x,
			y: topLeft.y,
			width,
			height,
			backgroundColor: HIGHLIGHT_FILL,
			fillStyle: "solid",
			strokeColor: "transparent",
			strokeWidth: 0,
			opacity: HIGHLIGHT_OPACITY,
			roughness: 0,
			locked: true,
			customData: {
				pdfHighlight: true,
				text,
			} satisfies PdfHighlightData,
		});
	}

	return skeletons.length > 0 ? skeletons : null;
}
