import { convertFileSrc } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import {
	exists as existsFs,
	mkdir as mkdirFs,
	readFile as readFileFs,
	writeFile as writeFileFs,
} from "@tauri-apps/plugin-fs";

const workdir = await appLocalDataDir();
await mkdirFs(workdir, { recursive: true }).catch((e) => {
	console.error(e);
});
console.log("workdir", workdir);
export async function writeFile(filename: string, data: Uint8Array) {
	const fullPath = await join(workdir, filename);

	await writeFileFs(fullPath, data, { create: true }).catch((e) => {
		console.error(e);
		throw e;
	});
	return convertFileSrc(fullPath);
}

export async function readFile(filename: string) {
	const fullPath = await join(workdir, filename);
	const fileExists = await existsFs(fullPath).catch((error) => {
		console.log(error);
		return false;
	});
	if (!fileExists) {
		return null;
	}
	return await readFileFs(fullPath).catch((e) => {
		console.error(e);
		throw e;
	});
}
