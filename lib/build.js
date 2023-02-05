import _ from 'lodash';
import * as esbuild from 'esbuild';
import {getOutputPath} from '#lib/formats';
import esbuildVue from 'esbuild-vue';
import {sassPlugin as esbuildSass} from 'esbuild-sass-plugin'

/**
* Main ESBuild function used by upstream libraries
* @param {Object} esBuildOptions Options to merge in with ESBuilds default options using _.merge
* @param {Object} [options] Additional options to mutate behaviour
* @returns {*} Default return from ESBuild depending on the given options
*/
export default function build(esBuildOptions, options) {
	return esbuild.build(_.merge({
		plugins: [
			esbuildSass(),
			esbuildVue(),
		],
		minify: false,
	}, esBuildOptions))
		.then(response => ({
			esBuild: response,
			source: esBuildOptions.entryPoints[0],
			dest: getOutputPath(esBuildOptions.entryPoints[0]),
		}))
}
