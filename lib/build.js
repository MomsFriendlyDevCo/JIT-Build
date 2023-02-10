import _ from 'lodash';
import * as esbuild from 'esbuild';
import EventEmitter from 'node:events';
import fs from 'node:fs/promises';
import fsPath from 'node:path';
import {getOutputPath} from '#lib/formats';
import esbuildVue from 'esbuild-vue';
import {sassPlugin as esbuildSass} from 'esbuild-sass-plugin'

import pluginLog from '#plugins/log';

export let defaults = {
	rewriteExport: null,
	root: null,
	sourceStats: null,
	plugins: [
		[pluginLog, {}],
	],
};


/**
* Main ESBuild function used by upstream libraries
* @param {Object} esBuildOptions Options to merge in with ESBuilds default options using _.merge
* @param {Object} [options] Additional options to mutate behaviour
* @param {Function|String} [options.rewriteExport] Function to rewrite `export default X` expressions. If a string use `$<exported>` to indicate the contents of the export, If a function this is called as `(all: String, exported: String)`
* @param {String} [options.root] Optional root prefix to trim when logging filenames
* @param {Object} [options.sourceStats] When logging skip fetching source file stats if supplied here instead
*
* @returns {*} Default return from ESBuild depending on the given options
* @property {Object} [esBuild] The ESBuild response
* @property {String} source The source file
* @property {String} dest The destination file (based on source address)
* @property {Number} [destSize] The final size of the destination string (only if `{write: true}` in `esBuildOptions`)
* @property {Number} buildTime Build time in milliseconds
* @property {Function} writeFile Helper function to write the file to disk
*
* @emits building Adding a new build task path. Called as `(path)`
* @emits built A path build has concluded. Called as `(path)`
*/
export default function build(esBuildOptions, options) {
	let settings = {
		buildEvents: new EventEmitter(), // buildEvents needs creating for each build cycle
		...defaults,
		...options
	};

	if (!esBuildOptions.entryPoints || !esBuildOptions.entryPoints.length) throw new Error('Must specify at least one entryPoint');
	if (esBuildOptions.write && esBuildOptions.write !== false) throw new Error('Build requires {write: false} to function with .vue files');

	let buildStartTime = Date.now();
	return Promise.resolve()
		.then(()=> Promise.all(settings.plugins.map(([func, pluginOptions]) =>
			func({
				pluginOptions,
				esBuildOptions,
				buildOptions: options,
				buildSettings: settings,
				buildEvents: settings.buildEvents,
			})
		)))
		.then(()=> settings.buildEvents.emit('building', esBuildOptions.entryPoints[0]))
		.then(()=> esbuild.build(_.merge({
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
		}, esBuildOptions)))
		.then(esbResponse => {
			let response = {
				esBuild: {
					...esbResponse,
					outputFiles: esbResponse.outputFiles.map(rawFile => {
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
				destSize: esbResponse.outputFiles[0].text.length,
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
					let wfSettings = {
						mkdir: true,
						swapPath: null,
						copyStats: null,
						...options,
					};

					let contents = esbResponse.outputFiles[0].text;

					// Stream to swapfile
					return Promise.resolve()
						.then(()=> wfSettings.mkdir && Promise.all([
							fs.mkdir(fsPath.dirname(path), {recursive: true}),
							wfSettings.swapPath && fs.mkdir(fsPath.dirname(wfSettings.swapPath), {recrusive: true}),
						]))
						.then(()=> fs.writeFile(wfSettings.swapPath || path, contents))
						.then(()=> wfSettings.copyStats && fs.utimes(wfSettings.swapPath || path, wfSettings.copyStats.atime, wfSettings.copyStats.mtime))
						.then(()=> wfSettings.swapPath && fs.rename(wfSettings.swapPath, path))
						.then(()=> settings.buildEvents.emit('built', response))
				},
			};
			return response;
		})
}
