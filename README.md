@MomsFriendlyDevCo/JIT-Build
============================
An Express middleware layer to compile-as-needed single components from various sources.

* Simple express endpoint to make local development quicker
* Compiles files individually rather than an entire site (the downside being inefficiencies and shared code)
* Out-of-the-box support for `.vue`, `.scss` and `<style lang="scss">`


```javascript
import express from 'express';
import jitMiddleware from '@momsfriendlydevco/jit-build';

let app = express();

// Serve files from /components as compiled .vue SFCs
app.get('/components/:file', jitMiddleware({
    source: req => `./components/${req.params.file}`, // Where to find the file
    dest: req => `/tmp/esbuild.${req.params.file}.js`, // Write files to destination, post-compile
}))

let server = app.listen(port, null, finish);
```
