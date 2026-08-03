/**
 * EmbedPDF plugin host for canvas text selection (no Viewport / Scroller / Render).
 * Excalidraw owns the camera; PagePool owns page bitmaps.
 */
import { createPluginRegistration } from '@embedpdf/core'
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react'
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react'
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react'

export const EMBEDPDF_CANVAS_PLUGINS = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage, {
    // Marquee fights Excalidraw lasso / empty-gutter selection when pass-through is on.
    marquee: { enabled: false }
  })
]
