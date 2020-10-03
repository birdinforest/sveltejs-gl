export function process_color(color) {
	if (typeof color === 'number') {
		const r = (color & 0xff0000) >> 16;
		const g = (color & 0x00ff00) >> 8;
		const b = (color & 0x0000ff);

		return new Float32Array([
			r / 255,
			g / 255,
			b / 255
		]);
	}

	return color;
}

export function normalize(out, vector = out) {
	let total = 0;
	for (let i = 0; i < vector.length; i += 1) {
		total += vector[i] * vector[i];
	}

	const mag = Math.sqrt(total);

	out[0] = vector[0] / mag;
	out[1] = vector[1] / mag;
	out[2] = vector[2] / mag;

	return out;
}

export function create_worker(url, fn) {
	const worker = new Worker(url);
	const code = fn.toString().replace(/^(function.+?|.+?=>\s*)\{/g, '').slice(0, -1);

	worker.postMessage(code);

	return worker;
}

export function memoize(fn) {
	const cache = new Map();
	return (...args) => {
		const hash = JSON.stringify(args);
		if (!cache.has(hash)) cache.set(hash, fn(...args));
		return cache.get(hash);
	};
}

export function base64ToBinary(input, charStart) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	const lookup = new Uint8Array(130);
	for (let i = 0; i < chars.length; i++) {
		lookup[chars.charCodeAt(i)] = i;
	}
	// Ignore
	let len = input.length - charStart;
	if (input.charAt(len - 1) === '=') { len--; }
	if (input.charAt(len - 1) === '=') { len--; }

	const uarray = new Uint8Array((len / 4) * 3);

	for (let i = 0, j = charStart; i < uarray.length;) {
		const c1 = lookup[input.charCodeAt(j++)];
		const c2 = lookup[input.charCodeAt(j++)];
		const c3 = lookup[input.charCodeAt(j++)];
		const c4 = lookup[input.charCodeAt(j++)];

		uarray[i++] = (c1 << 2) | (c2 >> 4);
		uarray[i++] = ((c2 & 15) << 4) | (c3 >> 2);
		uarray[i++] = ((c3 & 3) << 6) | c4;
	}

	return uarray.buffer;
}

/**
 * Relative path to absolute path
 * @param  {string} path
 * @param  {string} basePath
 * @return {string}
 * @memberOf clay.core.util
 */
export function relative2absolute (path, basePath) {
	if (!basePath || path.match(/^\//)) {
		return path;
	}
	const pathParts = path.split('/');
	const basePathParts = basePath.split('/');

	let item = pathParts[0];
	while(item === '.' || item === '..') {
		if (item === '..') {
			basePathParts.pop();
		}
		pathParts.shift();
		item = pathParts[0];
	}
	return basePathParts.join('/') + '/' + pathParts.join('/');
}
