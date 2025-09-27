<p align="center"><img src="./app-icon.png" width="256" height="256"/></p>
<h1 align="center">
  Libritus
</h1>
<p align="center">
Modern reading app designed to make reading simple, elegant, and enjoyable. Clean interface for exploring texts, highlighting key parts, and managing your reading experience without distractions. Built for curious minds. AI powered.
</p>

<img width="1840" height="1191" alt="Screenshot 2025-09-16 at 10 12 20 PM" src="https://github.com/user-attachments/assets/77b35121-e2fd-4d7d-8350-a3fca917dfb0" />
<img width="1840" height="1191" alt="Screenshot 2025-09-16 at 8 34 31 PM" src="https://github.com/user-attachments/assets/1f412e7a-4547-44e4-84ee-d04097078e50" />
<img width="1840" height="1191" alt="wikipedia-definitions" src="https://github.com/user-attachments/assets/34391e7e-14a2-49e1-ab86-6843d3ebc857" />
<img width="1840" height="1191" alt="Screenshot 2025-09-16 at 8 36 31 PM" src="https://github.com/user-attachments/assets/44454453-d7f9-4093-8809-927c440066f0" />

![Screenshot 2025-09-16 at 8 42 44 PM](https://github.com/user-attachments/assets/f78e2349-2f89-4647-bba8-ec77fc49bb6e)

## Follow the journey!

I will be uploading any progress in https://jkominovic.dev

## Development

Install yalc and pnpm globally:

```bash
npm i yalc pnpm -g
```

Clone JulianKominovic/libritus and install dependencies:

```bash
git clone git@github.com:JulianKominovic/libritus.git
cd libritus
bun install
```

Clone JulianKominovic/lector and build it:

```bash
git clone git@github.com:JulianKominovic/lector.git
cd lector/packages/lector
pnpm install
pnpm build
yalc publish
cd ../../../
yalc add @anaralabs/lector
```

Start the app (development):

```bash
bun run dev
```

From here, if you want to make changes to the lector package and apply them to the app, you can run:

```bash
cd lector/packages/lector
pnpm build
yalc publish
cd ../../../
yalc update
bun i
```

## Mascot

<img width="400" height="400" alt="Libritus mascot" src="https://github.com/user-attachments/assets/a30341eb-9b83-4227-adb6-95f07a50fc76" />
