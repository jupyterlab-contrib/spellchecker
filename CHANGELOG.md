### 0.6.0
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
