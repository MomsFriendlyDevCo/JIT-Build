import _ from 'lodash';
import * as esbuild from 'esbuild';
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
*/
export default function build(esBuildOptions, options) {
	let settings = {
		rewriteExport: null,
		...options,
	};

	let buildStartTime = Date.now();
	return esbuild.build(_.merge({
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
			...(esBuildOptions?.write === false
				? {destSize: response.outputFiles[0].text.length}
				: {}
			),
			buildTime: Date.now() - buildStartTime,
		}))
}
