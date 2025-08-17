# Automerge

See [the tutorial docs](https://automerge.org/docs/tutorial/).

## Core Concepts

Two concepts -- [Documents](https://automerge.org/docs/reference/concepts/#documents)
and [Repositories](https://automerge.org/docs/reference/concepts/#repositories).

- **Documents** -- A data structure that supports conflict-free collaboration.
- **Repository** -- A (Repo) knows how & where to store are synchronize
  documents, both locally and over the network.

### The Repo

* creates, modifies, and manages documents locally.
* sends & receives changes to/from others
* merges changes as needed

The repo uses a
[Storage Adapter](https://automerge.org/docs/reference/repositories/storage/).
Synchronization is handled by a
[Network Adapter](https://automerge.org/docs/reference/repositories/networking/).
