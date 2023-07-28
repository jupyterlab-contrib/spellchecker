### 0.8.4 (2023-07-28)

- bug fixes:
  - require JupyterLab 4

### 0.8.3 (2023-06-05)

- bug fixes:
  - fix old status persisting in status bar when switching editors (but not typing anything yet)
  - fix dictionaries not being copied over on install
  - spellcheck in block comments and line comments in languages with C-like syntax
- enhancements:
  - show language in the dialog for enabling spellcheck in current document

### 0.8.2 (2023-06-04)

- fix server extension loading (#131)

### 0.8.1 (2023-06-04)

- fix for PyPI upload (#130)

### 0.8.0 (2023-06-04)

- support JupyterLab 4.0 (#128)
- support optional spellchecking in comments and strings
- click on statusbar item to enable spellchecking

### 0.7.3 (2023-02-08)

- enable spellchecker by default in RST and LaTeX files (#122)
- add IPython to ignore list (#123)
- bump version and builder dev dependency (#124)

### 0.7.2 (2021-10-08)

- fallback to `base_name` if babel crashes (#95)
- bump ansi-regex from 5.0.0 to 5.0.1 (#97)

### 0.7.1 (2021-09-01)

- bump tar from 6.1.5 to 6.1.11 (#92)
- bump url-parse from 1.5.1 to 1.5.3 (#91)
- bump path-parse from 1.0.6 to 1.0.7 (#90)
- add new trove classifiers (#89)
- bump tar from 6.1.0 to 6.1.5 (#88)

### 0.7.0 (2021-07-31)

- added possibility of using remote "online" dictionaries by specifying URLs for `.aff` and `.dic` files (#85)
- added support for translations of the text shown in the interface (#84)
- fixed the behaviour of the dictionary selector when an invalid dictionary is initially set in the settings (#83)
- bumped normalize-uri to 4.5.1 (#82)
- enable strict null checks, switch to modern compilation targets; add more Jupyter projects to spellcheck ignore (#86)

### 0.6.0 (2021-06-01)

- change the dictionary loading mechanism from internal static into a server extension (#69)
  - dictionaries will now be discovered in operating system specific paths if available
  - choice is now possible from one of multiple dictionaries using the same locale
- add the possibility to add custom dictionary (#66)

### 0.5.2 (2021-03-19)

- added a status message while loading a dictionary (#62)

### 0.5.0 (2021-02-28)

- added wavy-underline and dotted-underline themes which allow to customize how misspelt words are highlighted (#53)
- development improvements: added GitHub Actions build check and binder badge (#48), binder bot (#54), and publish workflow (#52)
- fixes: dictionaries were loaded twice, '' characters lead to empty words and problems in the german dictionaries

### 0.4.0 (2021-02-26)

- improved contrast for dark themes (#45)
- migrated to new GitHub organization (#42); the repository is now available under: https://github.com/jupyterlab-contrib/spellchecker
- the extension can now be installed using pip, which means that Node.js is no longer required (#48)
- the "choose language" command is now also accessible from the command palette (#48)
- statusbar and command palette are no longer required for the extension to work (#48)

### 0.3.0 (2021-01-24)

- added JupyterLab 3.0 support (#44)

### 0.2.0 (2020-12-08)

- added German, Portuguese, Spanish and French dictionaries
- fixed "cancel" button in "choose language" dialog window
