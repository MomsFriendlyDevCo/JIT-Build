import axios from 'axios';
import {dirName} from '@momsfriendlydevco/es6';
import {expect} from 'chai';
import express from 'express';
import expressLogger from 'express-log-url';
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

		app.get('/api/components/:file', JITMiddleware({
			source: req => `${__dirname}/data/${req.params.file}`,
			dest: req => `/tmp/esbuild.${req.params.file}.js`,
		}))

		// FIXME: Routes
		server = app.listen(port, null, finish);
	});
	after(()=> server && server.close());
	// }}}

	it('should serve a compiled .vue file', ()=>
		axios.get(`${url}/api/components/widgets.vue`)
			.then(({data}) => {
				expect(data).to.be.a('string');
				console.log('GOT', data);
			})
	)

});
