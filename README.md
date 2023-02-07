@MomsFriendlyDevCo/JIT-Build
============================
An Express middleware layer to compile-as-needed single components from various sources.

* Simple express endpoint to make local development quicker
* Compiles files individually rather than an entire site (the downside being inefficiencies and shared code)
* Out-of-the-box support for `.vue`, `.scss` and `<style lang="scss">`


```javascript
import express from 'express';
import {expressMiddleware} from '@momsfriendlydevco/jit-build';

let app = express();

// Serve files from /components as compiled .vue SFCs
app.get('/components/:file', expressMiddleware({
    source: req => `./components/${req.params.file}`, // Where to find the file
    dest: req => `/tmp/esbuild.${req.params.file}.js`, // Write files to destination, post-compile
}))

let server = app.listen(port, null, finish);
```


API
===
All of the below methods are exported from the default module object or as individual modules.

```javascript
// Import from default module object
import {build, expressMiddleware} from '@momsfriendlydevco/jit-build';

// Direct import
import build from '@momsfriendlydevco/jit-build/build';
```


build(esBuildOptions)
---------------------
Trigger a build process.
This is really a wrapper for the main `esbuild.build()` function with some suitable defaults.


buildGlob(globs, options)
-------------------------
Operate individually on all files matched in a glob expression(s).
Returns a promise when compile has completed.

Options are:

| Option        | Type       | Default | Description                                                                                                                                  |
|---------------|------------|---------|----------------------------------------------------------------------------------------------------------------------------------------------|
| `source`      | `Function` |         | Async function to return the source file. Called as `(source, settings)`                                                                     |
| `dest`        | `Function` |         | Async function to return a final destination file. Called as `(source, settings)`                                                            |
| `handle`      | `Function` |         | Async function to determine if we should trigger a build. Called as `(sourcePath)`                                                           |
| `hashMatches` | `Function` |         | Function called as `(session)` to return if the two files are identical. A true response will skip rebuild and serve the last generated file |
| `hashDrift`   | `Number`   | `250`   | Maximum allowed clock drift in milliseconds for the default `options.hashMatches` functionality                                              |
| `minify`      | `Boolean`  | `false` | Whether to minify the output                                                                                                                 |


expressMiddleware(options)
--------------------------
An [Express](http://expressjs.com) middleware factory designed to build components dynamically.

Options are:

| Option                 | Type                 | Default | Description                                                                                                                                                                          |
|------------------------|----------------------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `root`                 | `String` / `Boolean` |         | Root path to constrain source to. All requests will use this as a base path + disallow escaping this directory path prefix. Set to `false if and ONLY IF you know what you are doing |
| `source`               | `Function`           |         | Async function to compute the eventual source / entry point to compile. Called as `(req, res, settings)`                                                                             |
| `dest`                 | `Function`           |         | Async function to compute the eventual destination file. Called as `(req, res, settings)`                                                                                            |
| `handle`               | `Function`           |         | Async function to determine if we should trigger a build. Called as `(session)`                                                                                                      |
| `serveNonHandled=true` | `Boolean`            | `true`  | Whether to serve non-hanadled content                                                                                                                                                |
| `swap`                 | `Function`           |         | Async function to compute the intermediate swap file. Called as `(req, res, settings)`. If omitted uses the temp directory + some entropy                                            |
| `immutable`            | `Boolean`            | `false` | Whether the source files should be compiled once and only once if missing.                                                                                                           |
| `hashMatches`          | `Function`           |         | Function called as `(session)` to return if the two files are identical. A true response will skip rebuild and serve the last generated file                                         |
| `hashDrift`            | `Number`             | `250`   | Maximum allowed clock drift in milliseconds for the default `options.hashMatches` functionality                                                                                      |
| `minify=false`         | `Boolean`            | `false` | Whether to minify the output                                                                                                                                                         |
| `errReport`            | `Function`           |         | Function to output any raised errors to the console. Called as `(err, session)`                                                                                                      |
| `errResponse`          | `Function`           |         | Function to respond back to the requestee on failed errors. Called as `(err, session)`                                                                                               |
| `force`                | `Boolean`            | `false` | If truthy `hashMatches` is ignored, triggering a rebuild every time                                                                                                                  |
| `buildSettings`      | Object             | `{}`  | Additional (Non-esbuild) settings to send to `build()` |


**Notes:**
* The environment variable `JIT_FORCE=1` can also be set to apply `force=true`


formats
-------
A meta object containing some format handling functionality.
These are exported into the `formats` object or importable directly from the default object.

```javascript
// Import formats meta object from default
import {formats} from '@momsfriendlydevco/jit-build';

// Function import from default
import {formats, getFormatFromPath, getOutputPath} from '@momsfriendlydevco/jit-build';

// Direct import
import formats from '@momsfriendlydevco/jit-build/formats';
```


formats.formats
---------------
Collection of supported file formats.


getFormaatFromPath(path)
------------------------
Get the matching formatter from the source file path.


getOutputPath(path)
-------------------
Get the (corrected) output path from the source.
This function corrects file extensions to their correct file equivalent.
