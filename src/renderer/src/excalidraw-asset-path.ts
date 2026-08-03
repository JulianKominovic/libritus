/** Must load before @excalidraw/excalidraw. Fonts served from /fonts (public/). */
window.EXCALIDRAW_ASSET_PATH =
  location.protocol === 'file:' ? new URL('./', document.baseURI).href : `${location.origin}/`
