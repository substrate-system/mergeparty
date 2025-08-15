# package name here
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/package/nodejs.yml?style=flat-square)](https://github.com/substrate-system/package/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/icons?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![install size](https://flat.badgen.net/packagephobia/install/@nichoth/session-cookie)](https://packagephobia.com/result?p=@nichoth/session-cookie)
[![gzip size](https://img.shields.io/bundlephobia/minzip/@substrate-system/package?style=flat-square)](https://bundlephobia.com/@substrate-system/name/package/route-event)
[![dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg?style=flat-square)](package.json)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)


`<package description goes here>`

[See a live demo](https://namespace.github.io/package-name/)

<details><summary><h2>Contents</h2></summary>
<!-- toc -->
</details>

## install

Installation instructions

```sh
npm i -S @namespace/package
```

## API

This exposes ESM and common JS via [package.json `exports` field](https://nodejs.org/api/packages.html#exports).

### ESM
```js
import '@namespace/package/module'
```

### Common JS
```js
require('@namespace/package/module')
```

## CSS

### Import CSS

```js
import '@namespace/package-name/css'
```

Or minified:
```js
import '@namespace/package-name/css/min'
```

### Customize CSS via some variables

```css
component-name {
    --example: pink;
}
```

## use

`usage instructions here`

### JS
```js
import '@namespace/package/module'
```

### pre-built JS
This package exposes minified JS files too. Copy them to a location that is
accessible to your web server, then link to them in HTML.

#### copy
```sh
cp ./node_modules/@namespace/package/dist/module.min.js ./public
```

#### HTML
```html
<script type="module" src="./module.min.js"></script>
```
