# jupyterlab_spellchecker

A spell checker extension for markdown cells in jupyterlab notebooks. 

Highlights misspelled words.

Based entirely on [this jupyter notebook extension](https://github.com/ipython-contrib/jupyter_contrib_nbextensions/tree/master/src/jupyter_contrib_nbextensions/nbextensions/spellchecker).

Uses [Typo.js](https://github.com/cfinke/Typo.js) under the hood for spell checking. 

Currently only uses the `en_US` dictionary loaded from the [jsdelivr.net cdn](https://www.jsdelivr.com/).

## Prerequisites

* JupyterLab

## Installation

```bash
jupyter labextension install @ijmbarr/jupyterlab_spellchecker
```

## Development

For a development install (requires npm version 4 or later), do the following in the repository directory:

```bash
npm install
npm run build
jupyter labextension link .
```

To rebuild the package and the JupyterLab app:

```bash
npm run build
jupyter lab build
```

