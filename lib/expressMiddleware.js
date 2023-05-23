import Debug from 'debug';
import fs from 'node:fs/promises';
import fsPath from 'node:path';
import JITBuild from '#lib/build';
import JITFormats from '#lib/formats';

const debug = Debug('jit');

/**
* Express middleware factory function
* @param {Object} options Options to configure behaviour
* @param {String|Boolean} options.root Root path to constrain source to. All requests will use this as a base path + disallow escaping this directory path prefix. Set to `false if and ONLY IF you know what you are doing
* @param {String} options.rootDir Root path when resolving absolute paths
* @param {Function} options.source Async function to compute the eventual source / entry point to compile. Called as `(req, res, settings)`
* @param {Function} options.dest Async function to compute the eventual destination file. Called as `(req, res, settings)`
* @param {Function} [options.handle] Async function to determine if we should trigger a build. Called as `(session)`
* @param {Boolean} [options.serveNonHandled=true] Whether to serve non-hanadled content
* @param {Function} [options.swap] Async function to compute the intermediate swap file. Called as `(req, res, settings)`. If omitted uses the temp directory + some entropy. Ideally this should be within the same FS mount as dest.
* @param {Boolean} [options.immutable=false] Whether the source files should be compiled once and only once if missing.
* @param {Function} [options.hashMatches] Function called as `(session)` to return if the two files are identical. A true response will skip rebuild and serve the last generated file
* @param {Number} [options.hashDrift=250] Maximum allowed clock drift in milliseconds for the default `options.hashMatches` functionality
* @param {Boolean} [options.minify=false] Whether to minify the output
* @param {Function} [options.errReport] Function to output any raised errors to the console. Called as `(err, session)`
* @param {Function} [options.errResponse] Function to respond back to the requestee on failed errors. Called as `(err, session)`
* @param {Function} [options.errNotFound] Function to respond back to the requestee on non-existant source files. Called as `(session)`
* @param {Function} [options.onBuild] Function to run when initiating a build. Called as `(session)`
* @param {Function} [options.onBuilt] Async function to run when a build has completed. Called as `(session)`
* @param {Function} [options.onSkipBuild] Function to run when a cached build is still valid and will be usesd. Called as `(session)`
* @param {Boolean} [options.force] If truthy `hashMatches` is ignored, triggering a rebuild every time
* @param {Array} [options.plugins] Build setting plugins
* @param {Array<Object>} [options.pluginsAppend] Additional plugins to append to the default set without replacing (NOTE: This differs from esBuildOptions.plugins in that the contents are appended)
* @param {Object} [options.esBuildSettings] Additional (ESBuild specific) settings
* @param {Object} [options.buildSettings] Additonal (non ESBuild) settings to pass to build()
*
* @param {Boolean} [process.env.JIT_FORCE] If set this sets `options.force=true`
*/
export default function expressMiddleware(options) {
	let settings = {
		root: null,
		source: null,
		dest: null,
		swap: ()=> `/tmp/esbuild.${Date.now()}-${Math.ceil(Math.random() * 100000)}.swp`,
		handle: session => [
			'.js',
			'.scss',
			'.vue',
		].includes(fsPath.extname(session.sourcePath)),
		serveNonHandled: true,
		immutable: false,
		hashMatches: session => {
			if (!session.destStats) {
				debug(`Dst "${session.destPath}" NO_EXIST - forcing build`);
				return false; // No dest file - need to rebuild
			} else {
				let clockDiff = Math.abs(session.sourceStats.mtimeMs - session.destStats.mtimeMs);
				if (clockDiff >= 0 && clockDiff <= session.settings.hashDrift) {
					debug(`File "${session.sourcePath}" has clock drift of ${clockDiff}/${session.settings.hashDrift} - reusing`);
					return true;
				} else {
					debug(`File "${session.sourcePath}" has clock drift of ${clockDiff}/${session.settings.hashDrift} - rebuilding`);
					return false;
				}
			}
		},
		hashDrift: 250,
		errReport: err => console.warn('JIT ERROR:', err),
		errResponse: (err, session) => session.res.status(400).send(err.toString()),
		errNotFound: session => session.res.sendStatus(404),
		onBuild: ()=> {},
		onBuilt: ()=> {},
		onSkipBuild: ()=> {},
		force: !! process.env.JIT_FORCE,

		// Pass throughs
		minify: false,
		logger: console.log,

		esBuildSettings: {},
		buildSettings: {},
		...options,
	};
	if (settings.root !== false && typeof settings.root != 'string') throw new Error('`root` option must be specified as a base path, set to FALSE to disable ONLY IF YOU KNOW WHAT YOU ARE DOING');
	if (typeof settings.source != 'function') throw new Error('`source` option must be specified as a function');
	if (typeof settings.dest != 'function') throw new Error('`dest` option must be specified as a function');

	return (req, res) => {
		let session = {
			settings,
			req,
			res,
			root: null,
			sourcePath: null,
			sourceStats: null,
			sourceFormat: null,
			handle: null,
			destPath: null,
			destStats: null,
			swapPath: null,
			hashMatches: null,
			buildResult: null, // Eventual build() response
		};

		Promise.resolve()
			.then(()=> Promise.all([
				Promise.resolve(settings.source(req, res, settings))
					.then(result => {
						if (settings.root) { // Has root path constraints
							session.sourcePath = fsPath.resolve(fsPath.join(settings.root, result));
							if (!session.sourcePath.startsWith(settings.root)) throw new Error('Path cannot be relative');
						} else {
							session.sourcePath = result;
						}
					} )
					.then(()=> Promise.all([
						Promise.resolve()
							.then(()=> fs.stat(session.sourcePath))
							.then(result => session.sourceStats = result)
							.catch(()=> { throw '404' }),

						Promise.resolve()
							.then(()=> JITFormats.getFormatFromPath(session.sourcePath))
							.then(result => session.sourceFormat = result)
							.catch(()=> session.sourceFormat = false)
					])),

				Promise.resolve(settings.dest(req, res, settings))
					.then(result => session.destPath = result)
					.then(()=> Promise.all([
						Promise.resolve()
							.then(()=> fs.stat(session.destPath))
							.then(result => session.destStats = result)
							.catch(()=> session.destStats = false), // Fetch dest stats

						fs.mkdir(fsPath.dirname(session.destPath), {recursive: true}), // Whilst simultaniously ensuring destination dir exists
					])),

				Promise.resolve(settings.swap(req, res, settings))
					.then(result => session.swapPath = result)
					.then(()=> fs.mkdir(fsPath.dirname(session.swapPath), {recursive: true})), // Make sure swap dir exists
			]))
			.then(()=> settings.handle(session))
			.then(canHandle => {
				if (!canHandle && settings.serveNonHandled) {
					debug(`Cant handle ${session.sourcePath} - serving instead`);
					res.sendFile(session.sourcePath, {
						headers: {
							...(session.sourceFormat
								? {'Content-Type': session.sourceFormat.outMimeType}
								: {}
							),
						},
					});
					throw 'STOP';
				} else if (!canHandle) {
					res.sendStatus(403);
				} // Implied else - continue on
			})
			.then(()=>
				settings.immutable ? true
				: settings.force ? false
				: settings.hashMatches(session)
			)
			.then(result => session.hashMatches = result)
			.then(()=> {
				// Handle if the hash is the same - do nothing except echo the existing file {{{
				if (session.hashMatches) {
					debug(`Use cached build for ${session.sourcePath}`);
					settings.onSkipBuild(session);

					res.sendFile(session.destPath, {
						headers: {
							...(session.sourceFormat
								? {'Content-Type': session.sourceFormat.outMimeType}
								: {}
							),
						},
					});
					throw 'STOP';
				}
				// }}}

				debug(`BUILD ${session.sourcePath} (${session.sourceFormat.title}) -> ${session.destPath}`);
				settings.onBuild(session);
				return JITBuild({
					// Context specific options
					entryPoints: [session.sourcePath],

					// Pass through options
					minify: settings.minify,

					...settings.esBuildSettings,
				}, {
					root: settings.root,
					rootDir: settings.rootDir,
					sourceStats: session.sourceStats,
					logger: settings.logger,
					plugins: settings.plugins,
					pluginsAppend: settings.pluginsAppend,
					...settings.buildSettings,
				});
			})
			.then(result => session.buildResult = result)
			.then(()=> {
				// Sanity checks {{{
				if (session.buildResult.esBuild.outputFiles.length == 0) {
					throw new Error('No files returned form ESBuild');
				} else if (session.buildResult.esBuild.outputFiles.length > 1) {
					throw new Error(`${session.buildResult.esBuild.outputFiles.length} files returned form ESBuild - expected only one`);
				}
				// }}}

				let contents = session.buildResult.esBuild.outputFiles[0].text;

				return Promise.all([
					// Send output to browser
					res
						.type(session.sourceFormat.outMimeType)
						.set('Content-Length', contents.length)
						.send(contents),

					session.buildResult.writeFile(session.destPath, {
						mkdir: false, // Handled above
						swapPath: session.swapPath,
						copyStats: session.sourceStats,
					}),

					// Tell onBuilt() we've finished
					settings.onBuilt(session),
				])
			})
			.catch(e => {
				if (e === 'STOP') {
					return; // Exited out of promise chain above
				} else if (e === '404') { // Source not found
					settings.errNotFound(session);
				} else {
					settings.errReport(e, session);
					settings.errResponse(e, session);
				}
			})
			.finally(()=> session.swapPath && fs.unlink(session.swapPath).catch(()=> 0)) // Remove swap file if partially created
	};
}
