import {vec3, vec4} from 'gl-matrix';

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

/**
 * Geometry utility: Generate normals per vertex.
 * @param {Geometry} geometry
 * https://github.com/pissang/claygl/blob/master/src/Geometry.js
 */
export function generateVertexNormals(geometry) {
  let vertexCount;

  if(geometry && geometry.attributes.position && geometry.attributes.position.data) {
  	vertexCount = geometry.attributes.position.data.length / geometry.attributes.position.count;
	}

	if (!vertexCount) {
		return;
	}

	const indices = geometry.index;
	const attributes = geometry.attributes;
	const positions = attributes.position.data;
	let normals = attributes.normal.data;

	if (!normals || normals.length !== positions.length) {
		// FIXME: Type match
		normals = attributes.normal.data = new Float32Array(positions.length);
	}
	else {
		// Reset
		for (let i = 0; i < normals.length; i++) {
			normals[i] = 0;
		}
	}

	const p1 = vec3.create();
	const p2 = vec3.create();
	const p3 = vec3.create();

	const v21 = vec3.create();
	const v32 = vec3.create();

	const n = vec3.create();

	let len = indices ? indices.length : vertexCount;
	let i1, i2, i3;
	for (let f = 0; f < len;) {
		if (indices) {
			i1 = indices[f++];
			i2 = indices[f++];
			i3 = indices[f++];
		}
		else {
			i1 = f++;
			i2 = f++;
			i3 = f++;
		}

		vec3.set(p1, positions[i1*3], positions[i1*3+1], positions[i1*3+2]);
		vec3.set(p2, positions[i2*3], positions[i2*3+1], positions[i2*3+2]);
		vec3.set(p3, positions[i3*3], positions[i3*3+1], positions[i3*3+2]);

		vec3.sub(v21, p1, p2);
		vec3.sub(v32, p2, p3);
		vec3.cross(n, v21, v32);
		// Already be weighted by the triangle area
		for (let i = 0; i < 3; i++) {
			normals[i1*3+i] = normals[i1*3+i] + n[i];
			normals[i2*3+i] = normals[i2*3+i] + n[i];
			normals[i3*3+i] = normals[i3*3+i] + n[i];
		}
	}

	for (let i = 0; i < normals.length;) {
		vec3.set(n, normals[i], normals[i+1], normals[i+2]);
		vec3.normalize(n, n);
		normals[i++] = n[0];
		normals[i++] = n[1];
		normals[i++] = n[2];
	}
	this.dirty();
}

/**
 * Generate tangents attributes.
 * https://github.com/pissang/claygl/blob/master/src/Geometry.js
 * @param {Geometry} geometry
 */
export function generateTangents (geometry) {
	let vertexCount;

	if(geometry && geometry.attributes.position && geometry.attributes.position.data) {
		vertexCount = geometry.attributes.position.data.length / geometry.attributes.position.count;
	}

	if (!vertexCount) {
		return;
	}

	const nVertex = vertexCount;
	const attributes = this.attributes;
	if (!attributes.tangent.data) {
		attributes.tangent.data = new Float32Array(nVertex * 4);
	}
	const texcoords = attributes.uv.data;
	const positions = attributes.position.data;
	const tangents = attributes.tangent.data;
	const normals = attributes.normal.value;

	if (!texcoords) {
		console.warn('Geometry without texcoords can\'t generate tangents.');
		return;
	}

	const tan1 = [];
	const tan2 = [];
	for (let i = 0; i < nVertex; i++) {
		tan1[i] = [0.0, 0.0, 0.0];
		tan2[i] = [0.0, 0.0, 0.0];
	}

	const sdir = [0.0, 0.0, 0.0];
	const tdir = [0.0, 0.0, 0.0];
	const indices = this.index;

	const len = indices ? indices.length : vertexCount;
	let i1, i2, i3;
	for (let i = 0; i < len;) {
		if (indices) {
			i1 = indices[i++];
			i2 = indices[i++];
			i3 = indices[i++];
		}
		else {
			i1 = i++;
			i2 = i++;
			i3 = i++;
		}

		const st1s = texcoords[i1 * 2],
			st2s = texcoords[i2 * 2],
			st3s = texcoords[i3 * 2],
			st1t = texcoords[i1 * 2 + 1],
			st2t = texcoords[i2 * 2 + 1],
			st3t = texcoords[i3 * 2 + 1],

			p1x = positions[i1 * 3],
			p2x = positions[i2 * 3],
			p3x = positions[i3 * 3],
			p1y = positions[i1 * 3 + 1],
			p2y = positions[i2 * 3 + 1],
			p3y = positions[i3 * 3 + 1],
			p1z = positions[i1 * 3 + 2],
			p2z = positions[i2 * 3 + 2],
			p3z = positions[i3 * 3 + 2];

		const x1 = p2x - p1x,
			x2 = p3x - p1x,
			y1 = p2y - p1y,
			y2 = p3y - p1y,
			z1 = p2z - p1z,
			z2 = p3z - p1z;

		const s1 = st2s - st1s,
			s2 = st3s - st1s,
			t1 = st2t - st1t,
			t2 = st3t - st1t;

		const r = 1.0 / (s1 * t2 - t1 * s2);
		sdir[0] = (t2 * x1 - t1 * x2) * r;
		sdir[1] = (t2 * y1 - t1 * y2) * r;
		sdir[2] = (t2 * z1 - t1 * z2) * r;

		tdir[0] = (s1 * x2 - s2 * x1) * r;
		tdir[1] = (s1 * y2 - s2 * y1) * r;
		tdir[2] = (s1 * z2 - s2 * z1) * r;

		vec3.add(tan1[i1], tan1[i1], sdir);
		vec3.add(tan1[i2], tan1[i2], sdir);
		vec3.add(tan1[i3], tan1[i3], sdir);
		vec3.add(tan2[i1], tan2[i1], tdir);
		vec3.add(tan2[i2], tan2[i2], tdir);
		vec3.add(tan2[i3], tan2[i3], tdir);
	}
	const tmp = vec3.create();
	const nCrossT = vec3.create();
	const n = vec3.create();
	for (let i = 0; i < nVertex; i++) {
		n[0] = normals[i * 3];
		n[1] = normals[i * 3 + 1];
		n[2] = normals[i * 3 + 2];
		const t = tan1[i];

		// Gram-Schmidt orthogonalize
		vec3.scale(tmp, n, vec3.dot(n, t));
		vec3.sub(tmp, t, tmp);
		vec3.normalize(tmp, tmp);
		// Calculate handedness.
		vec3.cross(nCrossT, n, t);
		tangents[i * 4] = tmp[0];
		tangents[i * 4 + 1] = tmp[1];
		tangents[i * 4 + 2] = tmp[2];
		// PENDING can config ?
		tangents[i * 4 + 3] = vec3.dot(nCrossT, tan2[i]) < 0.0 ? -1.0 : 1.0;
	}
	this.dirty();
}
