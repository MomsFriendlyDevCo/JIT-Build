import fsPath from 'node:path';

export let formats = [
	{
		title: 'JavaScript',
		ext: ['.js'],
		outExt: '.js',
		outMimeType: 'text/javascript',
	},
	{
		title: 'Vue SFC',
		ext: ['.vue'],
		outExt: '.js',
		outMimeType: 'text/javascript',
	},
	{
		title: 'SASS / SCSS',
		ext: ['.scss'],
		outExt: '.css',
		outMimeType: 'text/css',
	},
];

export function getFormatFromPath(path) {
	let pathExt = fsPath.extname(path);
	let format = formats.find(f => f.ext.includes(pathExt));
	if (!format) throw new Error(`Unable to determine supported format from path "${path}"`);
	return format;
}


/**
* Compute the probable output path from the input source path
* @param {String} source The full input path
* @param {Object} [options] Options to mutate behaviour
* @param {Boolean} [options.preserveExt=false] Keep orignal file extension
* @returns {String} The destination path
*/
export function getOutputPath(source, options) {
	let settings = {
		preserveExt: false,
		...options,
	};

	let parsed = fsPath.parse(source);

	let format = getFormatFromPath(source);

	if (!settings.preserveExt)
		parsed.ext = format.outExt;

	return fsPath.format(parsed);
}


export default {
	formats,
	getFormatFromPath,
	getOutputPath,
}
