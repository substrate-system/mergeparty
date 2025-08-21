# Merge Party
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/mergeparty/nodejs.yml?style=flat-square)](https://github.com/substrate-system/mergeparty/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/mergeparty?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![install size](https://flat.badgen.net/packagephobia/install/@substrate-system/mergeparty)](https://packagephobia.com/result?p=@substrate-system/mergeparty)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)

Automerge + Partykit.

Based on [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server).

This creates 1 partykit room per document, using the automerge document ID as
the room name.

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Use](#use)
  * [Backend](#backend)
  * [Browser Client](#browser-client)
- [Modules](#modules)
  * [ESM](#esm)
  * [Common JS](#common-js)
- [Develop](#develop)
  * [start a localhost server](#start-a-localhost-server)
  * [start partykit](#start-partykit)

<!-- tocstop -->

</details>

## Install

```sh
npm i -S @substrate-system/mergeparty
```

## Use

Create a backend (the websocket/partykit server) and a browser client.

### Backend

You just need to export a class that extends the `MergeParty` class from this
module.

See [./example_backend](./example_backend/).

```js
import { MergeParty, CORS } from '@substrate-system/mergeparty'

export default class ExampleServer extends MergeParty {
  static async onBeforeConnect (request:Party.Request, _lobby:Party.Lobby) {
    // do authentication in here
  }
}
```

#### HTTP

Also you can make HTTP calls to the server:

```
http://localhost:1999/parties/main/<document-id-here>
```

You should see a response

```
👍 All good
```

##### `/health`

```
http://localhost:1999/parties/main/<document-id-here>/health
```

Response:

```js
{
  "status": "ok",
  "room": "aaa",
  "connectedPeers": 0
}
```

### Browser Client

See [./example/](./example/) for the browser version.

## Modules

This exposes ESM and common JS via
[package.json `exports` field](https://nodejs.org/api/packages.html#exports).

### ESM
```js
import { MergeParty } from '@substrate-system/mergeparty'
```

### Common JS
```js
require('@substrate-system/mergeparty')
```

-----------------

## Develop

### start a localhost server

Use vite + local partykit server.

```sh
npm start
```

### start partykit

```sh
npx partykit dev
```
