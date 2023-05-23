/**
* Change root paths to relative
* @param {String} rootPath The path to make everything root-wise for
* @returns {ESBuildPlugin} An ESBuild compatible plugin
*/
import path from 'node:path';

export default function esbuildPluginRoot(rootPath) {
    return {
        name: 'rootPath',
        setup(build) {
            build.onResolve({ filter: /^\// }, args => {
                return {
                    path: args.path.startsWith(rootPath)
                        ? args.path // Already a root pointer within the root directory - leave alone
                        : path.resolve(rootPath, '.' + args.path) // Transform path portion into relative and translate the whole thing into a root path
                };
            });
        },
    };
}
