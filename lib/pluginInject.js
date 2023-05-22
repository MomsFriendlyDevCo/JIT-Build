/**
* Simple ESBuild plugin which injects a path into ESbuild which uses an async function to resolve its contents
* @param {String|RegExp} path The path (or RegExp) to filter by
* @param {Function} A function to run which should resolve to the final, stringified file contents. If the funciton returns an object that is used as the ESBuild onLoad result, otherwise its interpreted as the JS output type
*/
export default function esbuildPluginInject(path, fn) {
	let regexpEscape = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');

	// Compute critera to match a path
	let injectMatcher = {
		filter: path instanceof RegExp
			? path
			: new RegExp('^' + regexpEscape(path) + '$'),
	};

	return {
		name: `FileInject-${path.toString()}`.replace(/[^\w\d]+/g, '_'),
		setup(build) {
			console.log('Setup inject');

			build.onResolve(injectMatcher, args => Promise.resolve({ // Signal we recognise the path
				path: args.path,
				namespace: 'inject',
			}));

			build.onLoad(injectMatcher, ()=> Promise.resolve(fn())
				.then(contents => typeof contents == 'object'
					? contents // Assume its a raw ESbuild onLoad result
					: { // Raw string, assume JS injection
						contents,
						loader: 'js',
					}
				)
			);
		},
	};
}
