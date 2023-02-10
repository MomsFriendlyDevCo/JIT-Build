import {dirName} from '@momsfriendlydevco/es6';
import fs from 'node:fs/promises';
import {globby} from 'globby';
import {defaults as JITBuildDefaults} from '#lib/build';
import mlog from 'mocha-logger';
import pluginLog from '#plugins/log';

const __dirname = dirName();

before('configure build defaults', ()=>
	Object.assign(JITBuildDefaults, {
		plugins: [
			[pluginLog, {
				logger: mlog.log,
			}],
		],
	})
);

afterEach('clean up temp files', ()=> Promise.resolve()
	.then(()=> globby([
		`${__dirname}/**/*.swp`,
		`${__dirname}/**/*.compiled.*`,
	]))
	.then(paths => Promise.all(paths.map(p =>
		fs.unlink(p)
			.catch(()=> false) // Ignore errors
	)))
)
