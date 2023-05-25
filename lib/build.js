import _ from 'lodash';
import * as esbuild from 'esbuild';
import EventEmitter from 'node:events';
import fs from 'node:fs/promises';
import fsPath from 'node:path';
import {getOutputPath} from '#lib/formats';

// ESBuild plugins
import esbuildVue from 'esbuild-vue';
import esbuildRoot from '#lib/pluginRoot';
import {sassPlugin as esbuildSass, postcssModules} from 'esbuild-sass-plugin'

import pluginLog from '#plugins/log';


/**
* Build function defaults
* @type {Object}
*/
export let defaults = {
	rewriteExport: null,
	root: null,
	sourceStats: null,
	preserveExt: true,
	plugins: [
		[pluginLog, {}],
	],
	pluginsAppend: [],
};


/**
* Main ESBuild function used by upstream libraries
*
* @param {Object} esBuildOptions Options to merge in with ESBuilds default options using _.merge
*
* @param {Object} [options] Additional options to mutate behaviour
* @param {Function|String} [options.rewriteExport] Function to rewrite `export default X` expressions. If a string use `$<exported>` to indicate the contents of the export, If a function this is called as `(all: String, exported: String)`
* @param {String} [options.root] Optional root prefix to trim when logging filenames
* @param {String} [options.rootDir] Remap the '/' absolute path to this directory
* @param {Object} [options.sourceStats] When logging skip fetching source file stats if supplied here instead
* @param {Array<Object>} [options.pluginsAppend] Additional plugins to append to the default set without replacing (NOTE: This differs from esBuildOptions.plugins in that the contents are appended)
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
		...options,
	};

	// Argument sanity checks {{{
	if (
		!esBuildOptions.stdin
		&& (
			!esBuildOptions.entryPoints
			|| !esBuildOptions.entryPoints.length
		)
	) throw new Error('Must specify at least one entryPoint');
	// }}}

	if (
		esBuildOptions.entryPoints
		&& esBuildOptions.write
		&& esBuildOptions.write !== false
	)
		throw new Error('Build requires {write: false} to function with .vue files');

	let buildStartTime = Date.now();
	return Promise.resolve()
		.then(()=> Promise.all((settings.plugins ?? defaults.plugins).map(rawPlugin => {
			// Argument mangling {{{
			let func, pluginOptions;
			if (typeof rawPlugin == 'function') { // Just given plugin - assume no options
				[func, pluginOptions] = [rawPlugin, {}];
			} else if (Array.isArray(rawPlugin)) {
				[func, pluginOptions] = rawPlugin;
			} else {
				throw new Error('Unknown `plugin` format');
			}
			// }}}
			return func({
				pluginOptions,
				esBuildOptions,
				buildOptions: options,
				buildSettings: settings,
				buildEvents: settings.buildEvents,
			})
		})))
		.then(()=> esBuildOptions.entryPoints && settings.buildEvents.emit('building', esBuildOptions.entryPoints[0]))
		.then(()=> _.merge({
			write: false,
			plugins: [
				...(settings.rootDir ? [esbuildRoot(settings.rootDir)] : []),
				esbuildVue({
					// production: false, // Dont set this to true as for some reason the ESBuild module doesn't return any contents down the chain - MC 2023-05-23
				}),
				esbuildSass({
					...(esBuildOptions.bundle && {
						type: 'style', // Required to correctly bundle output CSS -> <style> injection
						transform: postcssModules({ // Transform inline CSS / SCSS etc into a downstream ESBuild module so it can be wrapped into one JS file
							// NOTE: The postcss handler crashes if its not handled an empty options object
						}),
					}),
				}),
				...(settings.pluginsAppend || []),
			],
			minify: false,
			sourcemap: false,
			sourcesContent: false,
			...(settings.rootDir && {absWorkingDir: settings.rootDir}),
		}, esBuildOptions))
		.then(esbOpts => esbuild.build(esbOpts))
		.then(esbResponse => {
			if (esBuildOptions.write) return; // Skip trying to optimize if we're writing directly to disk anyway

			let response = {
				esBuild: {
					...esbResponse,
					outputFiles: esbResponse.outputFiles.map(rawFile => {
						let file = {
							format: 'raw',
							text: rawFile.text
						};
						if (settings.rewriteExport) file.text = file.text.replace(/(?<=^|;)export default (?<exported>.+?);/m, settings.rewriteExport);

						return file;
					}),
				},
				source: esBuildOptions.stdin
					? 'STDIN'
					: esBuildOptions.entryPoints[0],
				dest: esBuildOptions.outdir
					? esBuildOptions.outdir
					: getOutputPath(esBuildOptions.entryPoints[0], {preserveExt: settings.preserveExt}),
				destSize: esbResponse.outputFiles[0].text.length,
				buildTime: Date.now() - buildStartTime,

				/**
				* Utility function to write the file to disk (optionally via a swapfile)
				* @param {String} path The path to write to
				* @param {Object} {options} Options to mutate behaviour
				* @param {Boolean} [options.mkdir=true] Create directory structure for destination + swap files
				* @param {String} [options.swapPath] Copy via a swap path (i.e. write swap, set attributes then move over destination)
				* @param {Object} [options.copyStats] Copy various stats into new file (i.e atime + mtime)
				* @param {Number} [options.index] Specify which output file to write, if unspecifed the first file is used if there is only one - otherwise an error is thrown
				* @returns {Promise} A promise which resolves when the operation has completed
				*/
				writeFile(path, options) {
					let wfSettings = {
						mkdir: true,
						swapPath: null,
						copyStats: null,
						index: null,
						...options,
					};
					if (wfSettings.index === null) { // Auto-detect file to write - use only one if thats all we have
						if (response.esBuild.outputFiles.length == 1) {
							wfSettings.index = 0;
						} else {
							throw new Error('Multiple output files returned by ESbuild. Specify the index explicitly to writeFile() if you want only one');
						}
					}

					let contents = response.esBuild.outputFiles[wfSettings.index].text;

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
