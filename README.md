# jupyterlab-spellchecker
![Github Actions Status](https://github.com/jupyterlab-contrib/spellchecker/workflows/Build/badge.svg)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/jupyterlab-contrib/spellchecker/master?urlpath=lab)

A JupyterLab extension highlighting misspelled words in markdown cells within notebooks and in the text files.

![](https://raw.githubusercontent.com/jupyterlab-contrib/spellchecker/master/demo.gif)

The JupyterLab extension is based on [the spellchecker Jupyter Notebook extension](https://github.com/ipython-contrib/jupyter_contrib_nbextensions/tree/master/src/jupyter_contrib_nbextensions/nbextensions/spellchecker) and relies on [Typo.js](https://github.com/cfinke/Typo.js) for the actual spell checking. Spellchecker suggestions are available from the context menu.

The extension provides (Hunspell) [SCOWL](http://wordlist.aspell.net/) dictionaries for:
- American, British, Canadian, and Australian English
- French,
- German (Germany, Austria, Switzerland)
- Portuguese,
- Spanish.

## JupyterLab Version
The extension has been tested up to JupyterLab version 3.0.

## Installation

For JupyterLab 3.x:

```bash
pip install jupyterlab-spellchecker
```

For JupyterLab 2.x:

```bash
jupyter labextension install @ijmbarr/jupyterlab_spellchecker
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlab_spellchecker directory
# Install package in development mode
pip install -e .
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm run build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm run watch
# Run JupyterLab in another terminal
jupyter lab
```

### Before commit

Make sure that eslint passes:

```bash
jlpm run eslint:check
```

If there are any issues it might be possible to autofix them with:

```bash
jlpm run eslint
```
