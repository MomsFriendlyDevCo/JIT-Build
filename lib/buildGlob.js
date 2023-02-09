import _ from 'lodash';
import Debug from 'debug';
import fs from 'node:fs/promises';
import fsPath from 'node:path';
import {getFormatFromPath} from '#lib/formats';
import {globby} from 'globby';
import JITBuild from '#lib/build';

const debug = Debug('jit');


/**
* Compile a recursive glob of found files outputting the destination files
* This process is intended as a pre-deploy process for servers
* @param {Object} options Options to configure behaviour
* @param {Function} [options.source] Async function to return the source file. Called as `(source, settings)`
* @param {Function} [options.dest] Async function to return a final destination file. Called as `(source, settings)`
* @param {Function} [options.handle] Async function to determine if we should trigger a build. Called as `(sourcePath)`
* @param {Function} [options.hashMatches] Function called as `(session)` to return if the two files are identical. A true response will skip rebuild and serve the last generated file
* @param {Number} [options.hashDrift=250] Maximum allowed clock drift in milliseconds for the default `options.hashMatches` functionality
* @param {Boolean} [options.minify=false] Whether to minify the output
* @returns {Promise} A promise which resolves when the operation has completed
*/
export default function buildGlob(glob, options) {
	let settings = {
		source(path) {
			return path;
		},
		dest(source) {
			let parsed = fsPath.parse(source);
			parsed.name += '.compiled';
			parsed.ext = getFormatFromPath(source).outExt;
			delete parsed.base; // Remove base otherwise fsPath.format gets upset
			return fsPath.format(parsed);
		},
		swap: ()=> `/tmp/esbuild.${Date.now()}-${Math.ceil(Math.random() * 100000)}.swp`,
		handle: path => [
			'.js',
			'.scss',
			'.vue',
		].includes(fsPath.extname(path)),
		hashMatches: session => {
			if (!session.destStats) {
				return false; // No dest file - need to rebuild
			}

			let clockDiff = Math.abs(session.sourceStats.mtimeMs - session.destStats.mtimeMs);
			return clockDiff <= session.settings.hashDrift;
		},
		hashDrift: 250,
		minify: false,
		...options,
	};

	return Promise.resolve()
		.then(()=> globby(glob))
		.then(paths => paths.flat())
		.then(paths => _.uniq(paths))
		.then(paths => Promise.all(
			paths.map(path => {
				let session = {
					settings,
					sourcePath: null,
					sourceStats: null,
					destPath: null,
					destStats: null,
				};

				return Promise.resolve()
					.then(()=> settings.handle(path))
					.then(canHandle => {
						if (!canHandle) throw 'STOP';
					})
					.then(()=> Promise.all([
						Promise.resolve(settings.source(path, settings))
							.then(result => session.sourcePath = result)
							.then(()=> fs.stat(session.sourcePath))
							.then(result => session.sourceStats = result),

						Promise.resolve(settings.dest(path, settings))
							.then(result => session.destPath = result)
							.then(()=> Promise.all([
								Promise.resolve()
									.then(()=>
										fs.stat(session.destPath).catch(()=> false) // Fetch dest stats
									)
								.then(result => session.destStats = result),

								fs.mkdir(fsPath.dirname(session.destPath), {recursive: true}), // Whilst simultaniously ensuring destination dir exists
							])),
					]))
					.then(()=> settings.hashMatches(session))
					.then(hashMatches => {
						if (hashMatches) throw 'STOP'; // Hash already matches - do nothinng
					})
					.then(()=> debug(`BUILD ${session.sourcePath}`))
					.then(()=> JITBuild({
						// Context specific options
						entryPoints: [session.sourcePath],

						// Pass through options
						minify: settings.minify,
					}))
					.then(response => response.writeFile(session.destPath))
					.catch(e => {
						if (e === 'STOP') return;
						throw e;
					})
			})
		))
}
