import axios from 'axios';
import {dirName} from '@momsfriendlydevco/es6';
import {expect} from 'chai';
import express from 'express';
import expressLogger from 'express-log-url';
import fs from 'node:fs/promises';
import fsPath from 'node:path';
import {globby} from 'globby';
import JITMiddleware from '#lib/expressMiddleware';
import mlog from 'mocha-logger';

const __dirname = dirName();
const port = 8181;
const url = `http://localhost:${port}`;

describe('@MomsFriendlyDevCo/JIT-Build/expressMiddleware', ()=> {

	// Server setup {{{
	let server;
	before('setup a server', function(finish) {
		let app = express();
		app.use(expressLogger);
		app.set('log.indent', '      ');

		app.get('/components/:file', JITMiddleware({
			root: __dirname,
			source: req => `data/${req.params.file}`,
			dest: req => {
				let parsed = fsPath.parse(req.params.file);
				return `${__dirname}/data/${parsed.name}.compiled${parsed.ext}`;
			},
			swap: req => `${__dirname}/data/esbuild.${req.params.file}.${Date.now()}-${Math.ceil(Math.random() * 100000)}.swp`,
			logger: mlog.log,
		}))

		server = app.listen(port, null, finish);
	});
	after(()=> server && server.close());
	// }}}

	// Clean up temp files {{{
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
	// }}}

	it('should serve a compiled .vue file', ()=>
		axios.get(`${url}/components/widgets.vue`)
			.then(({data}) => {
				expect(data).to.be.a('string');
				expect(data).to.match(/^export default __vue_component__;$/m);
			})
	)

	it('should serve a compiled .scss file', ()=>
		axios.get(`${url}/components/doodahs.scss`)
			.then(({data}) => {
				expect(data).to.be.a('string');
				expect(data).to.match(/^\.doodahs \.thing {$/m);
			})
	)

});
