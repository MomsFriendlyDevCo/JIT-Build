/**
* Change root paths to relative
*
* Absolute file system paths outside of root are allowed by using two slashes at the start of the path
* This (somewhat weird) way to access "real" root files is used because there is a tradeoff when trying to figure out if a path is already root or "looks" relative
* By explicitly specifyin the double slash we can avoid paging the filesystem to find out and maintain resolution speed
*
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
                    path: args.path.startsWith(rootPath) ? args.path // Already a root pointer within the root directory - leave alone
                        : args.path.startsWith('//') ? args.path.substr(1) // Absolute elsewhere-on-filesystem path
                        : path.resolve(rootPath, '.' + args.path) // Transform path portion into relative and translate the whole thing into a root path
                };
            });
        },
    };
}
