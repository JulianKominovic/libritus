# Product north — research canvas

Canonical product direction for Libritus. Cite this first when deciding features, UX, or AI behavior. Architecture/performance detail: [`docs/architecture/infinite-pdf-canvas.md`](../architecture/infinite-pdf-canvas.md). Roadmap: [`docs/roadmap.md`](../roadmap.md).

---

## What Libritus is

A **desktop research workspace**. The entry point is reading a PDF on an infinite canvas (Excalidraw + virtualized EmbedPDF / PDFium). The PDF is the trigger; the canvas is the **memory of the investigation**.

Not a passive lector. Not a place where AI reads for you.

---

## Three hard rules

### 1. Purpose — read to research

Use the PDF to investigate: annotate, brainstorm, cross-link, capture vocabulary and translations, draw diagrams, record searches, ask AI questions, pin external references (e.g. YouTube). Freeform thinking around the text is the product.

### 2. Canvas owns research

Everything whose trigger was the PDF should live as a **canvas artifact** (scene / session) — thoughts, notes, diagrams, Q&A, links, media you brought in while studying. When you reopen the document later, you should be able to **follow the reasoning** you did then. The user may delete any of it.

Research does **not** belong in another app, and the destination is not a research sidebar: the canvas is the store of work.

**Today:** notes, highlights, arrows, freehand, and **web search captures** (Buscar / Place browser → screenshot on canvas) already live on the canvas — see [`web-search-capture.md`](web-search-capture.md). Sidebar Chat and related chrome are **legacy UX** until research (including AI Q&A) moves onto canvas artifacts — see roadmap.

**Destination:** PDF sidebar = **navigation only** (outline + page thumbs). Find bar / page navigator stay canvas chrome. Settings and embed-queue stay app chrome.

### 3. AI is subordinate

AI must not invade reading or replace critical thinking.

- **Do not** auto-summarize the PDF, auto-highlight text, or auto-mark keywords. Those are **user** tasks that build understanding.
- AI answers only on **explicit ask**.
- The product must **not** encourage “let AI read / summarize / underline for me.” If the user wants that anyway, they can ask in freeform — the app does not promote it.

Background local embedding for retrieval prep is not generative reading; generative output still requires an explicit user ask.

---

## Agent checklist

When proposing or shipping a feature:

1. Does it help research **on the canvas** (or PDF nav chrome)?
2. Does it avoid parking lasting research in a sidebar or external silo (destination)?
3. Does it avoid auto-summarize / auto-highlight / auto-keyword behavior or CTAs that push that use?
