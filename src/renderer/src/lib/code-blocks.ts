import hljs from "highlight.js/lib/common";

export const highlightCodeblocks = (content: string) => {
	const doc = new DOMParser().parseFromString(content, "text/html");
	for (const el of doc.querySelectorAll("pre code")) {
		// https://highlightjs.readthedocs.io/en/latest/api.html?highlight=highlightElement#highlightelement
		// @ts-expect-error - TODO: fix this
		hljs.highlightElement(el);
	}
	return new XMLSerializer().serializeToString(doc);
};
