import chalk from 'chalk';
import {formatBytes, formatRelativeTime} from '@momsfriendlydevco/formatters';
import fs from 'node:fs/promises';
import fsPath from 'node:path';

/**
* Simple plugin to output activity
* @param {Object} pluginOptions Specific options for this plugin
* @param {Function} [pluginOptions.logger=console.log] Function used as the log output instead of console.log(). Set to falsy to disable
* @param {Boolean} [pluginOptions.logBuilding=true] Output logs when building
* @param {Boolean} [pluginOptions.logBuilt=true] Output logs when a build finishes
* @param {Function} [pluginOptions.formatPath] How to format incomming path names (defaults to coloring the basename + removing `root` prefix)
*/
export default function JITPluginLog({pluginOptions, buildEvents, buildSettings}) {
	let settings = {
		logger: console.log,
		logBuilding: true,
		logBuilt: true,
		formatPath(path) {
			let fullPath = fsPath.resolve(path);
			if (fullPath.startsWith(buildSettings.root)) fullPath = fullPath.substr(buildSettings.root.length);

			return chalk.cyan(fsPath.dirname(fullPath) + '/') + chalk.bold.cyan(fsPath.basename(fullPath));
		},
		...pluginOptions,
	};

	buildEvents
		.on('building', path => settings.logBuilding && settings.logger(...[
			'Building',
			settings.formatPath(path),
		]))
		.on('built', response => settings.logBuilt && Promise.resolve()
			.then(()=> settings.sourceStats || fs.stat(response.source))
			.then(sourceStats => settings.logger(...[
				'Built',
				settings.formatPath(response.source),
				chalk.gray('(' + formatBytes(sourceStats.size) + ')'),
				'->',
				settings.formatPath(response.dest),
				chalk.gray('(' + formatBytes(response.destSize) + ')'),
				chalk.gray('in', formatRelativeTime(Date.now() - response.buildTime)),
			]))
		)
}
