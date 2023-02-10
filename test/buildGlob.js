import {dirName} from '@momsfriendlydevco/es6';
import {expect} from 'chai';
import fs from 'node:fs/promises';
import fsPath from 'node:path';
import JITBuildGlob from '#lib/buildGlob';
import './setup.js';

const __dirname = dirName();

describe('@MomsFriendlyDevCo/JIT-Build/buildGlob', ()=> {

	it('should build a .vue file by glob', ()=>
		JITBuildGlob(`${__dirname}/data/*.vue`, {
			swap: path => `${__dirname}/data/esbuild.${fsPath.basename(path)}.${Date.now()}-${Math.ceil(Math.random() * 100000)}.swp`,
		})
			.then(()=> fs.readFile(`${__dirname}/data/widgets.compiled.js`, 'utf8'))
			.then(contents => {
				expect(contents).to.match(/const __vue_script__ = {/);
			})
	)

	it('should build a .scss file', ()=>
		JITBuildGlob(`${__dirname}/data/*.scss`, {
			swap: path => `${__dirname}/data/esbuild.${fsPath.basename(path)}.${Date.now()}-${Math.ceil(Math.random() * 100000)}.swp`,
		})
			.then(()=> fs.readFile(`${__dirname}/data/doodahs.compiled.css`, 'utf8'))
			.then(contents => {
				expect(contents).to.match(/.doodahs .thing {/);
			})
	)

});
