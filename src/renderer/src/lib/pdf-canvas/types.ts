export type PageSize = {
	width: number;
	height: number;
};

export type PageRect = PageSize & {
	pageIndex: number;
	x: number;
	y: number;
};

export type WorldAABB = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

export type CameraState = {
	scrollX: number;
	scrollY: number;
	zoom: number;
	viewportWidth: number;
	viewportHeight: number;
};
