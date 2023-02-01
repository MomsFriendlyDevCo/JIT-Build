import axios from 'axios';
import {dirName} from '@momsfriendlydevco/es6';
import {expect} from 'chai';
import express from 'express';
import expressLogger from 'express-log-url';
import fsPath from 'node:path';
import JITMiddleware from '#lib/expressMiddleware';

const __dirname = dirName();
const port = 8181;
const url = `http://localhost:${port}`;

describe('@MomsFriendlyDevCo/JIT-Build', ()=> {

	// Server setup {{{
	let server;
	before('setup a server', function(finish) {
		let app = express();
		app.use(expressLogger);
		app.set('log.indent', '      ');

		app.get('/components/:file', JITMiddleware({
			source: req => `${__dirname}/data/${req.params.file}`,
			dest: req => {
				let parsed = fsPath.parse(req.params.file);
				return `${__dirname}/data/${parsed.name}.compiled${parsed.ext}`;
			},
		}))

		server = app.listen(port, null, finish);
	});
	after(()=> server && server.close());
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
