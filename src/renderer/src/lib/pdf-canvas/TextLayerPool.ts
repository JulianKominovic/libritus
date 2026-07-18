import { TextLayer, setLayerDimensions } from "./pdfjs";
import type { PdfDocument } from "./PdfDocument";

const DEFAULT_POOL_SIZE = 12;
/** Text layer is laid out in page CSS units; camera zoom is applied by the parent transform. */
const TEXT_LAYER_SCALE = 1;

export type TextLayerSlot = {
	pageIndex: number;
	div: HTMLDivElement;
	ready: boolean;
	lastUsed: number;
};

type ActiveJob = {
	pageIndex: number;
	layer: TextLayer;
	generation: number;
};

export type TextLayerPoolOptions = {
	poolSize?: number;
};

/**
 * Fixed pool of pdf.js text layers. Only builds for the visible page set and
 * evicts LRU slots — never mounts text DOM for the whole document.
 */
export class TextLayerPool {
	private readonly slots = new Map<number, TextLayerSlot>();
	private readonly jobs = new Map<number, ActiveJob>();
	private readonly poolSize: number;
	private generation = 0;
	private clock = 0;
	private lastVisibleKey = "";
	private listeners = new Set<() => void>();

	constructor(
		private doc: PdfDocument,
		options: TextLayerPoolOptions = {},
	) {
		this.poolSize = options.poolSize ?? DEFAULT_POOL_SIZE;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	getSlot(pageIndex: number): TextLayerSlot | undefined {
		return this.slots.get(pageIndex);
	}

	async syncVisible(visibleIndices: number[]): Promise<void> {
		const visibleKey = visibleIndices.join(",");
		const visible = new Set(visibleIndices);

		// Zoom-only camera updates keep the same page set — don't bump generation
		// or restart in-flight text builds (layout is scale-1; camera scales the parent).
		if (visibleKey === this.lastVisibleKey) {
			for (const pageIndex of visibleIndices) {
				const slot = this.slots.get(pageIndex);
				if (slot) slot.lastUsed = ++this.clock;
			}
			return;
		}
		this.lastVisibleKey = visibleKey;

		this.generation += 1;
		const gen = this.generation;

		for (const [pageIndex, job] of this.jobs) {
			if (!visible.has(pageIndex)) {
				job.layer.cancel();
				this.jobs.delete(pageIndex);
			}
		}

		for (const [pageIndex, slot] of this.slots) {
			if (!visible.has(pageIndex)) continue;
			slot.lastUsed = ++this.clock;
		}

		this.evictUntil(visible.size);

		const builds: Promise<void>[] = [];
		for (const pageIndex of visibleIndices) {
			const existing = this.slots.get(pageIndex);
			if (existing?.ready) {
				existing.lastUsed = ++this.clock;
				continue;
			}

			if (!this.slots.has(pageIndex) && this.slots.size >= this.poolSize) {
				this.evictOne(visible);
			}

			builds.push(this.buildSlot(pageIndex, gen));
		}

		await Promise.all(builds);
	}

	private evictUntil(needed: number): void {
		const capacity = Math.max(this.poolSize, needed);
		while (this.slots.size > capacity) {
			this.evictOne(new Set());
		}
	}

	private evictOne(keep: Set<number>): void {
		let victim: TextLayerSlot | null = null;
		for (const slot of this.slots.values()) {
			if (keep.has(slot.pageIndex)) continue;
			if (!victim || slot.lastUsed < victim.lastUsed) {
				victim = slot;
			}
		}
		if (!victim) return;

		const job = this.jobs.get(victim.pageIndex);
		if (job) {
			job.layer.cancel();
			this.jobs.delete(victim.pageIndex);
		}
		victim.div.replaceChildren();
		this.slots.delete(victim.pageIndex);
	}

	private async buildSlot(pageIndex: number, gen: number): Promise<void> {
		let slot = this.slots.get(pageIndex);
		if (!slot) {
			const div = document.createElement("div");
			div.className = "textLayer";
			div.style.setProperty("--total-scale-factor", String(TEXT_LAYER_SCALE));
			div.style.setProperty("--scale-round-x", "1px");
			div.style.setProperty("--scale-round-y", "1px");
			slot = {
				pageIndex,
				div,
				ready: false,
				lastUsed: ++this.clock,
			};
			this.slots.set(pageIndex, slot);
		} else {
			slot.ready = false;
			slot.lastUsed = ++this.clock;
			slot.div.replaceChildren();
		}

		const existingJob = this.jobs.get(pageIndex);
		if (existingJob) {
			existingJob.layer.cancel();
			this.jobs.delete(pageIndex);
		}

		try {
			const page = await this.doc.getPage(pageIndex);
			if (gen !== this.generation || !this.slots.has(pageIndex)) return;

			const viewport = page.getViewport({ scale: TEXT_LAYER_SCALE });
			setLayerDimensions(slot.div, viewport);

			const layer = new TextLayer({
				textContentSource: page.streamTextContent({
					includeMarkedContent: true,
					disableNormalization: true,
				}),
				container: slot.div,
				viewport,
			});
			this.jobs.set(pageIndex, { pageIndex, layer, generation: gen });

			await layer.render();
			this.jobs.delete(pageIndex);

			if (gen !== this.generation || !this.slots.has(pageIndex)) return;

			const endOfContent = document.createElement("div");
			endOfContent.className = "endOfContent";
			slot.div.append(endOfContent);

			slot.ready = true;
			this.notify();
		} catch (err) {
			this.jobs.delete(pageIndex);
			const name = err instanceof Error ? err.name : "";
			if (name === "AbortException" || name === "RenderingCancelledException") {
				return;
			}
			console.error(`Failed to build text layer for page ${pageIndex}`, err);
		}
	}

	destroy(): void {
		for (const job of this.jobs.values()) {
			job.layer.cancel();
		}
		this.jobs.clear();
		for (const slot of this.slots.values()) {
			slot.div.replaceChildren();
		}
		this.slots.clear();
		this.listeners.clear();
		this.lastVisibleKey = "";
	}
}
