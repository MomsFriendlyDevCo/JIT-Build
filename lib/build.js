import _ from 'lodash';
import * as esbuild from 'esbuild';
import esbuildVue from 'esbuild-vue';

/**
* Main ESBuild function used by upstream libraries
* @param {Object} esBuildOptions Options to merge in with ESBuilds default options using _.merge
* @param {Object} [options] Additional options to mutate behaviour
* @returns {*} Default return from ESBuild depending on the given options
*/
export default function build(esBuildOptions, options) {
	return esbuild.build(_.merge({
		plugins: [
			esbuildVue(),
		],
		minify: settings.minify,
	}, esBuildOptions))
}
