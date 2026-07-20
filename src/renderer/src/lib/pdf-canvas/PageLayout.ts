import type { CameraState, PageRect, PageSize, WorldAABB } from "./types";

const DEFAULT_PAGE_GAP = 24;

export class PageLayout {
	readonly pages: PageRect[];
	readonly totalHeight: number;
	readonly maxWidth: number;
	/** Native PDF pts → world units (1 for Letter-width docs). */
	readonly scale: number;

	constructor(pageSizes: PageSize[], pageGap = DEFAULT_PAGE_GAP, scale = 1) {
		const pages: PageRect[] = [];
		let y = 0;
		let maxWidth = 0;

		for (let i = 0; i < pageSizes.length; i++) {
			const { width, height } = pageSizes[i]!;
			maxWidth = Math.max(maxWidth, width);
			pages.push({
				pageIndex: i,
				x: 0,
				y,
				width,
				height,
			});
			y += height + pageGap;
		}

		this.pages = pages;
		this.totalHeight = pages.length === 0 ? 0 : y - pageGap;
		this.maxWidth = maxWidth;
		this.scale = scale;

		// Center pages horizontally around x=0 column using max width
		for (const page of this.pages) {
			page.x = (maxWidth - page.width) / 2;
		}
	}

	/** Binary search over Y-ordered pages for those intersecting aabb (+buffer). */
	queryVisible(aabb: WorldAABB, buffer = 0): number[] {
		if (this.pages.length === 0) return [];

		const top = aabb.top - buffer;
		const bottom = aabb.bottom + buffer;
		const left = aabb.left - buffer;
		const right = aabb.right + buffer;

		let lo = 0;
		let hi = this.pages.length - 1;
		let first = this.pages.length;

		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const page = this.pages[mid]!;
			if (page.y + page.height >= top) {
				first = mid;
				hi = mid - 1;
			} else {
				lo = mid + 1;
			}
		}

		const visible: number[] = [];
		for (let i = first; i < this.pages.length; i++) {
			const page = this.pages[i]!;
			if (page.y > bottom) break;
			const intersectsX = page.x + page.width >= left && page.x <= right;
			const intersectsY = page.y + page.height >= top && page.y <= bottom;
			if (intersectsX && intersectsY) {
				visible.push(i);
			}
		}
		return visible;
	}

	/**
	 * Page under a world-space point. If the point falls in a gap (or outside
	 * the stack vertically), returns the nearest page by vertical distance.
	 */
	pageIndexAtWorldPoint(_x: number, y: number): number | null {
		const pages = this.pages;
		if (pages.length === 0) return null;

		let lo = 0;
		let hi = pages.length - 1;
		let candidate = 0;

		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const page = pages[mid]!;
			if (y < page.y) {
				hi = mid - 1;
			} else if (y >= page.y + page.height) {
				lo = mid + 1;
			} else {
				return mid;
			}
			candidate = mid;
		}

		// Gap or outside stack: nearest by vertical distance to page body.
		let best = candidate;
		let bestDist = Number.POSITIVE_INFINITY;
		for (let i = Math.max(0, candidate - 1); i <= Math.min(pages.length - 1, candidate + 1); i++) {
			const page = pages[i]!;
			const dist =
				y < page.y
					? page.y - y
					: y > page.y + page.height
						? y - (page.y + page.height)
						: 0;
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		}
		return best;
	}

	/** Primary page for the nav: page containing the viewport center (nearest in gaps). */
	pageIndexForCamera(camera: CameraState): number | null {
		const z = camera.zoom || 1;
		const cx = -camera.scrollX + camera.viewportWidth / (2 * z);
		const cy = -camera.scrollY + camera.viewportHeight / (2 * z);
		return this.pageIndexAtWorldPoint(cx, cy);
	}

	/**
	 * Target scrollY to vertically center a page in the viewport
	 * (keeps caller responsible for scrollX / zoom).
	 */
	scrollForPageCenter(
		pageIndex: number,
		camera: Pick<CameraState, "zoom" | "viewportHeight">,
	): { scrollY: number } | null {
		const page = this.pages[pageIndex];
		if (!page) return null;
		const z = camera.zoom || 1;
		const pageCenterY = page.y + page.height / 2;
		return {
			scrollY: -pageCenterY + camera.viewportHeight / (2 * z),
		};
	}

	/**
	 * Target scrollY to vertically center an arbitrary world Y
	 * (keeps caller responsible for scrollX / zoom).
	 */
	scrollForWorldY(
		worldY: number,
		camera: Pick<CameraState, "zoom" | "viewportHeight">,
	): { scrollY: number } {
		const z = camera.zoom || 1;
		return {
			scrollY: -worldY + camera.viewportHeight / (2 * z),
		};
	}
}

export function worldAABBFromCamera(
	scrollX: number,
	scrollY: number,
	zoom: number,
	viewportWidth: number,
	viewportHeight: number,
): WorldAABB {
	const z = zoom || 1;
	return {
		left: -scrollX,
		top: -scrollY,
		right: -scrollX + viewportWidth / z,
		bottom: -scrollY + viewportHeight / z,
	};
}
