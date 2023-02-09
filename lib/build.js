import _ from 'lodash';
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import fsPath from 'node:path';
import {getOutputPath} from '#lib/formats';
import esbuildVue from 'esbuild-vue';
import {sassPlugin as esbuildSass} from 'esbuild-sass-plugin'

/**
* Main ESBuild function used by upstream libraries
* @param {Object} esBuildOptions Options to merge in with ESBuilds default options using _.merge
* @param {Object} [options] Additional options to mutate behaviour
* @param {Function|String} [options.rewriteExport] Function to rewrite `export default X` expressions. If a string use `$<exported>` to indicate the contents of the export, If a function this is called as `(all: String, exported: String)`
*
* @returns {*} Default return from ESBuild depending on the given options
* @property {Object} [esBuild] The ESBuild response
* @property {String} source The source file
* @property {String} dest The destination file (based on source address)
* @property {Number} [destSize] The final size of the destination string (only if `{write: true}` in `esBuildOptions`)
* @property {Number} buildTime Build time in milliseconds
* @property {Function} writeFile Helper function to write the file to disk
*/
export default function build(esBuildOptions, options) {
	let settings = {
		rewriteExport: null,
		...options,
	};

	if (esBuildOptions.write && esBuildOptions.write !== false) throw new Error('Build requires {write: false} to function with .vue files');

	let buildStartTime = Date.now();
	return esbuild.build(_.merge({
		write: false,
		plugins: [
			esbuildSass(),
			esbuildVue({
				production: true, // Disables sourcemaps which screw up front end rendering
			}),
		],
		minify: false,
		sourcemap: false,
		sourcesContent: false,
	}, esBuildOptions))
		.then(response => ({
			esBuild: {
				...response,
				outputFiles: response.outputFiles.map(rawFile => {
					let file = {
						format: 'raw',
						text: rawFile.text

					};
					if (settings.rewriteExport) file.text = file.text.replace(/^export default (?<exported>.*?);$/m, settings.rewriteExport);

					return file;
				}),
			},
			source: esBuildOptions.entryPoints[0],
			dest: getOutputPath(esBuildOptions.entryPoints[0]),
			destSize: response.outputFiles[0].text.length,
			buildTime: Date.now() - buildStartTime,

			/**
			* Utility function to write the file to disk (optionally via a swapfile)
			* @param {String} path The path to write to
			* @param {Object} {options} Options to mutate behaviour
			* @param {Boolean} [options.mkdir=true] Create directory structure for destination + swap files
			* @param {String} [options.swapPath] Copy via a swap path (i.e. write swap, set attributes then move over destination)
			* @param {Object} [options.copyStats] Copy various stats into new file (i.e atime + mtime)
			* @returns {Promise} A promise which resolves when the operation has completed
			*/
			writeFile(path, options) {
				let settings = {
					mkdir: true,
					swapPath: null,
					copyStats: null,
					...options,
				};

				let contents = response.outputFiles[0].text;

				// Stream to swapfile
				return Promise.resolve()
					.then(()=> settings.mkdir && Promise.all([
						fs.mkdir(fsPath.dirname(path), {recursive: true}),
						settings.swapPath && fs.mkdir(fsPath.dirname(settings.swapPath), {recrusive: true}),
					]))
					.then(()=> fs.writeFile(settings.swapPath || path, contents))
					.then(()=> settings.copyStats && fs.utimes(settings.swapPath || path, contents, settings.copyStats.atime, settings.copyStats.mtime))
					.then(()=> settings.swapPath && fs.rename(settings.swapPath, path))
			},
		}))
}
