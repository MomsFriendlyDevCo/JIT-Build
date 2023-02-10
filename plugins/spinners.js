import chalk from 'chalk';
import {formatBytes, formatRelativeTime} from '@momsfriendlydevco/formatters';
import fsPath from 'node:path';
import Spinnies from 'spinnies';

let spinners = new Spinnies();

/**
* More advanced CLI reporting plugin with fancy spinners
* @param {Object} pluginOptions Specific options for this plugin
* @param {Function} [pluginOptions.formatPath] How to format incomming path names (defaults to coloring the basename + removing `root` prefix)
*/
export default function({pluginOptions, buildEvents, buildSettings}) {
	let settings = {
		spinnerFormatPath(path) {
			let fullPath = fsPath.resolve(path);
			if (fullPath.startsWith(buildSettings.root)) fullPath = fullPath.substr(buildSettings.root.length);

			return chalk.cyan(fsPath.dirname(fullPath) + '/') + chalk.bold.cyan(fsPath.basename(fullPath));
		},
		...pluginOptions,
	};

	buildEvents
		.on('building', path =>
			spinners.add(path, {text: `Building ${settings.spinnerFormatPath(path)}`})
		)
		.on('built', ({source, dest, destSize, buildTime}) =>
			spinners.succeed(source, {text: `Built ${settings.spinnerFormatPath(source)} -> ${fsPath.basename(dest)} (${formatBytes(destSize)} / ${formatRelativeTime(Date.now() - buildTime)})`})
		)
}
