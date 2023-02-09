import _ from 'lodash';
import * as esbuild from 'esbuild';
import {formatBytes, formatRelativeTime} from '@momsfriendlydevco/formatters';
import chalk from 'chalk';
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
* @param {Function} [options.logger=console.log] Function used as the log output instead of console.log(). Set to falsy to disable
* @param {String} [options.root] Optional root prefix to trim when logging filenames
* @param {Boolean} [options.logBuilding=true] Output logs when building
* @param {Boolean} [options.logBuilt=true] Output logs when a build finishes
* @param {Function} [options.logFormatPath] How to format incomming path names (defaults to coloring the basename + removing `root` prefix)
* @param {Object} [options.sourceStats] When logging skip fetching source file stats if supplied here instead
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
		root: null,
		logger: console.log,
		logBuilding: true,
		logBuilt: true,
		logFormatPath(path) {
			let fullPath = fsPath.resolve(path);
			if (fullPath.startsWith(settings.root)) fullPath = fullPath.substr(settings.root.length);

			return chalk.cyan(fsPath.dirname(fullPath) + '/') + chalk.bold.cyan(fsPath.basename(fullPath));
		},
		sourceStats: null,
		...options,
	};

	if (!esBuildOptions.entryPoints || !esBuildOptions.entryPoints.length) throw new Error('Must specify at least one entryPoint');
	if (esBuildOptions.write && esBuildOptions.write !== false) throw new Error('Build requires {write: false} to function with .vue files');

	let buildStartTime = Date.now();
	return Promise.resolve()
		.then(()=> settings.logBuilding && settings.logger(...[
			'Building',
			settings.logFormatPath(esBuildOptions.entryPoints[0]),
		]))
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
						.then(()=> wfSettings.copyStats && fs.utimes(wfSettings.swapPath || path, contents, wfSettings.copyStats.atime, wfSettings.copyStats.mtime))
						.then(()=> wfSettings.swapPath && fs.rename(wfSettings.swapPath, path))
						.then(()=> settings.logger && settings.logBuilt && response.logWrite(path))
				},


				/**
				* Output logging information for a dedstination file
				* @param {String} path The destination file to write to
				*/
				logWrite(path) {
					console.log('DO LOG', {
						logger: settings.logger,
						logBuild: settings.logBuild,
					});

					return Promise.resolve()
						.then(()=> settings.sourceStats || fs.stat(response.source))
						.then(sourceStats => settings.logger(...[
							'Built',
							settings.logFormatPath(esBuildOptions.entryPoints[0]),
							chalk.gray('(' + formatBytes(sourceStats.size) + ')'),
							'->',
							settings.logFormatPath(path),
							chalk.gray('(' + formatBytes(response.destSize) + ')'),
							chalk.gray('in', formatRelativeTime(Date.now() - response.buildTime)),
						]))
				},
			};
			return response;
		})
}
