import {
	convertToExcalidrawElements,
	newElementWith,
	viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
	ExcalidrawElement,
	OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const MIN_RECT_AREA = 1;
const HIGHLIGHT_FILL = "#FF00FF";
const HIGHLIGHT_OPACITY = 20;

const NOTE_WIDTH = 180;
const NOTE_HEIGHT = 90;
const NOTE_GAP = 48;

type SceneViewport = Pick<
	AppState,
	"zoom" | "offsetLeft" | "offsetTop" | "scrollX" | "scrollY"
>;

export type PdfHighlightData = {
	pdfHighlight: true;
	text: string;
};

type ClientBox = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

function boxHeight(box: ClientBox): number {
	return box.bottom - box.top;
}

function sameLine(a: ClientBox, b: ClientBox): boolean {
	const aMid = (a.top + a.bottom) / 2;
	const bMid = (b.top + b.bottom) / 2;
	const tolerance = Math.min(boxHeight(a), boxHeight(b)) * 0.5;
	return Math.abs(aMid - bMid) <= tolerance;
}

/**
 * Merge client rects that sit on the same visual text line into one union box
 * per line. pdf.js often emits multiple overlapping spans per row.
 */
function mergeSameLineRects(
	rects: ArrayLike<DOMRectReadOnly>,
): ClientBox[] {
	const boxes: ClientBox[] = [];
	for (let i = 0; i < rects.length; i++) {
		const rect = rects[i];
		if (rect.width * rect.height < MIN_RECT_AREA) continue;
		boxes.push({
			left: rect.left,
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
		});
	}

	boxes.sort((a, b) => a.top - b.top || a.left - b.left);

	const merged: ClientBox[] = [];
	for (const box of boxes) {
		const last = merged[merged.length - 1];
		if (last && sameLine(last, box)) {
			last.left = Math.min(last.left, box.left);
			last.top = Math.min(last.top, box.top);
			last.right = Math.max(last.right, box.right);
			last.bottom = Math.max(last.bottom, box.bottom);
		} else {
			merged.push({ ...box });
		}
	}

	return merged;
}

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

/**
 * Build a sticky-style note with an arrow from the highlight edge to the note.
 *
 * Start is positioned at the highlight but intentionally unbound — highlights
 * are locked, and Excalidraw refuses to bind to locked shapes on rebind.
 *
 * The arrow is elbowed so dragging one endpoint keeps the other ("keep").
 * Straight arrows rebind *both* ends on every drag; the free start then snaps
 * to the note, both ends share one shape, and the arrow collapses.
 */
export function createNoteFromHighlight(
	highlight: OrderedExcalidrawElement,
): {
	newElements: OrderedExcalidrawElement[];
} {
	const quoted =
		typeof highlight.customData?.text === "string"
			? highlight.customData.text.trim()
			: "";
	const noteText = quoted ? `Note\n\n“${quoted}”` : "Note";

	const startX = highlight.x + highlight.width;
	const startY = highlight.y + highlight.height / 2;
	const noteX = startX + NOTE_GAP;
	const noteY = startY - NOTE_HEIGHT / 2;

	const noteElements = convertToExcalidrawElements([
		{
			type: "rectangle",
			id: "pdf-note",
			x: noteX,
			y: noteY,
			width: NOTE_WIDTH,
			height: NOTE_HEIGHT,
			backgroundColor: "#fff3bf",
			strokeColor: "#fab005",
			fillStyle: "solid",
			roughness: 0,
			label: { text: noteText },
		},
	]);

	const note = noteElements.find((el) => el.type === "rectangle");
	if (!note) {
		return { newElements: noteElements };
	}

	// Use actual note bounds (label may have resized the container).
	const endX = note.x;
	const endY = note.y + note.height / 2;

	// Skeleton typings omit `elbowed`; cast so newArrowElement builds a real elbow.
	const [arrow] = convertToExcalidrawElements([
		{
			type: "arrow",
			x: startX,
			y: startY,
			width: endX - startX,
			height: endY - startY,
			strokeColor: "#495057",
			roughness: 0,
			elbowed: true,
		} as ExcalidrawElementSkeleton,
	]);

	if (!arrow || arrow.type !== "arrow") {
		return { newElements: noteElements };
	}

	const boundArrow = newElementWith(arrow, {
		startBinding: null,
		endBinding: {
			elementId: note.id,
			focus: 0,
			gap: 0,
			// Left midline of the note (elbow arrows require fixedPoint).
			fixedPoint: [0, 0.5],
		},
	} as Parameters<typeof newElementWith>[1]);

	const updatedNote = newElementWith(note, {
		boundElements: [
			...(note.boundElements ?? []),
			{ id: boundArrow.id, type: "arrow" as const },
		],
	});

	return {
		newElements: [
			...noteElements.map((el) => (el.id === note.id ? updatedNote : el)),
			boundArrow,
		] as OrderedExcalidrawElement[],
	};
}
