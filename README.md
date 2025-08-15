# Merge Party
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/merge-party2/nodejs.yml?style=flat-square)](https://github.com/substrate-system/merge-party2/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/merge-party2?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![install size](https://flat.badgen.net/packagephobia/install/@substrate-system/merge-party2)](https://packagephobia.com/result?p=@substrate-system/merge-party2)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)

Automerge + Partykit.

Based on [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server).

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [API](#api)
  * [ESM](#esm)
  * [Common JS](#common-js)
- [Use](#use)
  * [JS](#js)
- [Develop](#develop)
  * [start a localhost server](#start-a-localhost-server)
  * [start partykit](#start-partykit)
  * [RAM](#ram)

<!-- tocstop -->

</details>

## Install

```sh
npm i -S @substrate-system/merge-party2
```

## API

This exposes ESM and common JS via
[package.json `exports` field](https://nodejs.org/api/packages.html#exports).

### ESM
```js
import { MergeParty } from '@substrate-system/merge-party2'
```

### Common JS
```js
require('@substrate-system/merge-party2')
```

## Use

### JS
```js
import { party } from '@substrate-system/merge-party2'
```

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


### RAM

[Each room has 128 MiB RAM](https://docs.partykit.io/guides/persisting-state-into-storage/)

Should create a partykit room using the automerge document ID as the room name,
to keep memory usage low.

-------

The URL to health check the local server:

```
http://localhost:1999/parties/main/automerge-demo
```

You should see a response

```
👍 All good
```
