import JITBuild from '#lib/build';
import Debug from 'debug';
import fs from 'node:fs/promises';
import fsPath from 'node:path';

const debug = Debug('jit');

/**
* Express middleware factory function
* @param {Object} options Options to configure behaviour
* @param {String|Boolean} options.root Root path to constrain source to. All requests will use this as a base path + disallow escaping this directory path prefix. Set to `false if and ONLY IF you know what you are doing
* @param {Function} options.source Async function to compute the eventual source / entry point to compile. Called as `(req, res, settings)`
* @param {Function} options.dest Async function to compute the eventual destination file. Called as `(req, res, settings)`
* @param {Function} [options.handle] Async function to determine if we should trigger a build. Called as `(session)`
* @param {Boolean} [options.serveNonHandled=true] Whether to serve non-hanadled content
* @param {Function} [options.swap] Async function to compute the intermediate swap file. Called as `(req, res, settings)`. If omitted uses the temp directory + some entropy
* @param {Boolean} [options.immutable=false] Whether the source files should be compiled once and only once if missing.
* @param {Function} [options.hashMatches] Function called as `(session)` to return if the two files are identical. A true response will skip rebuild and serve the last generated file
* @param {Number} [options.hashDrift=250] Maximum allowed clock drift in milliseconds for the default `options.hashMatches` functionality
* @param {Boolean} [options.minify=false] Whether to minify the output
* @param {Function} [options.errReport] Function to output any raised errors to the console. Called as `(err, session)`
* @param {Function} [options.errResponse] Function to respond back to the requestee on failed errors. Called as `(err, session)`
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
			if (!session.destStats) return false; // No dest file - need to rebuild

			let clockDiff = Math.abs(session.sourceStats.mtimeMs - session.destStats.mtimeMs);
			return clockDiff > 0 && clockDiff <= session.settings.hashDrift;
		},
		hashDrift: 250,
		minify: false,
		errReport: err => console.warn('JIT ERROR:', err),
		errResponse: (err, session) => session.res.status(400).send(err.toString()),
		...options,
	};
	if (typeof settings.root != 'string' && typeof settings.root) throw new Error('`root` option must be specified as a base path, set to FALSE to disable ONLY IF YOU KNOW WHAT YOU ARE DOING');
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
			handle: null,
			destPath: null,
			destStats: null,
			swapPath: null,
			hashMatches: null,
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
					.then(()=> fs.stat(session.sourcePath))
					.then(result => session.sourceStats = result),

				Promise.resolve(settings.dest(req, res, settings))
					.then(result => session.destPath = result)
					.then(()=> Promise.all([
						Promise.resolve()
							.then(()=>
								fs.stat(session.destPath).catch(()=> false) // Fetch dest stats
							)
							.then(result => session.destStats = result),

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
					res.sendFile(session.destPath);
					throw 'STOP';
				} else if (!canHandle) {
					res.sendStatus(403);
				} // Implied else - continue on
			})
			.then(()=> settings.immutable || settings.hashMatches(session))
			.then(result => session.hashMatches = result)
			.then(()=> {
				// Handle if the hash is the same - do nothing except echo the existing file {{{
				if (session.hashMatches) {
					debug(`Use cached build for ${session.sourcePath}`);
					res.sendFile(session.destPath);
					throw 'STOP';
				}
				// }}}

				debug(`BUILD ${session.sourcePath}`);
				return JITBuild({
					// Context specific options
					entryPoints: [session.sourcePath],
					write: false,

					// Pass through options
					minify: settings.minif,
				});
			})
			.then(output => {
				// Sanity checks {{{
				if (output.length == 0) {
					throw new Error('No files returned form ESBuild');
				} else if (output.length > 1) {
					throw new Error(`${output.length} files returned form ESBuild - expected only one`);
				}
				// }}}

				let contents =  output.outputFiles[0].text;
				return Promise.all([
					// Send output to browser
					res.send(contents),

					// Stream to swapfile
                    fs.writeFile(session.swapPath, contents)
						.then(()=> fs.utimes(session.swapPath, session.sourceStats.atime, session.sourceStats.mtime)) // Set swap file modified time so next hashMatches collides
						.then(()=> fs.rename(session.swapPath, session.destPath)) // Swap file with new destination
						.then(()=> session.swapPath = null) // Set swapfile to null so we dont have to clean it up
				])
			})
			.catch(e => {
				if (e === 'STOP') return; // Exited out of promise chain above
				settings.errReport(e, session);
				settings.errResponse(e, session);
			})
			.finally(()=> session.swapFile && fs.unlink(session.swapFile).catch(()=> 0)) // Remove swap file if partially created
	};
}
