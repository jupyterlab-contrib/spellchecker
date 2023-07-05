import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { LabIcon } from '@jupyterlab/ui-components';
import {
  ICommandPalette,
  InputDialog,
  Dialog,
  showDialog,
  ReactWidget
} from '@jupyterlab/apputils';
import { Menu } from '@lumino/widgets';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStatusBar, TextItem } from '@jupyterlab/statusbar';
import {
  IEditorExtensionRegistry,
  EditorExtensionRegistry,
  IEditorLanguageRegistry
} from '@jupyterlab/codemirror';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';

import { requestAPI } from './handler';

import '../style/index.css';
import spellcheckSvg from '../style/icons/ic-baseline-spellcheck.svg';

export const spellcheckIcon = new LabIcon({
  name: 'spellcheck:spellcheck',
  svgstr: spellcheckSvg
});
import { linter, Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import {
  SelectionRange,
  StateField,
  StateEffect,
  StateEffectType
} from '@codemirror/state';
import { IterMode } from '@lezer/common';

declare function require(name: string): any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Typo = require('typo-js');

const enum CommandIDs {
  applySuggestion = 'spellchecker:apply-suggestion',
  ignoreWord = 'spellchecker:ignore',
  toggle = 'spellchecker:toggle-check-spelling',
  updateSuggestions = 'spellchecker:update-suggestions',
  chooseLanguage = 'spellchecker:choose-language'
}

interface IWord {
  range: SelectionRange;
  text: string;
}

interface IContext {
  editorView: EditorView;
  offset: number;
}

/**
 * Dictionary data defined by a pair of Hunspell .aff and .dic files.
 * More than one dictionary may exist for a given language.
 */
interface IDictionary extends ReadonlyPartialJSONObject {
  /**
   * Identifier of the dictionary consisting of the filename without the .aff/.dic suffix
   * and path information if needed to distinguish from other dictionaries.
   */
  id: string;
  /**
   * BCP 47 code identifier.
   * Absent for online dictionaries.
   */
  code?: string;
  /**
   * Display name, usually in the form "Language (Region)".
   */
  name: string;
  /**
   * Path to the .aff file.
   */
  aff: string;
  /**
   * Path to the .dic file.
   */
  dic: string;
  /**
   * Indicated whether the dictionary is online.
   */
  isOnline: boolean;
}

interface ILanguageManagerResponse {
  version: string;
  dictionaries: Omit<IDictionary, 'isOnline'>[];
}

class LanguageManager {
  protected serverDictionaries: IDictionary[] = [];
  protected onlineDictionaries: IDictionary[] = [];

  public ready: Promise<any>;

  /**
   * initialise the manager
   * mainly reading the definitions from the external extension
   */
  constructor(settingsRegistry: ISettingRegistry) {
    const loadSettings = settingsRegistry.load(extension.id).then(settings => {
      this.updateSettings(settings);
      settings.changed.connect(() => {
        this.updateSettings(settings);
      });
    });

    this.ready = Promise.all([
      this.fetchServerDictionariesList(),
      loadSettings
    ]).then(() => {
      console.debug('LanguageManager is ready');
    });
  }

  protected updateSettings(settings: ISettingRegistry.ISettings) {
    if (settings) {
      this.onlineDictionaries = (
        settings.get('onlineDictionaries').composite as Omit<
          IDictionary,
          'isOnline' | 'code'
        >[]
      ).map(dictionary => {
        return { ...dictionary, isOnline: true } as IDictionary;
      });
    }
  }

  /**
   * Read the list of languages from the server extension
   */
  protected fetchServerDictionariesList(): Promise<void> {
    return requestAPI<ILanguageManagerResponse>('language_manager').then(
      values => {
        console.debug('Dictionaries fetched from server');
        this.serverDictionaries = values.dictionaries.map(dictionary => {
          return {
            ...dictionary,
            isOnline: false
          } as IDictionary;
        });
      }
    );
  }

  get dictionaries(): IDictionary[] {
    return [...this.serverDictionaries, ...this.onlineDictionaries];
  }

  /**
   * get an array of languages, put "language" in front of the list
   * the list is alphabetically sorted
   */
  getChoices(language: IDictionary | undefined) {
    const options = language
      ? [language, ...this.dictionaries.filter(l => l.id !== language.id)]
      : this.dictionaries;
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * select the language by the identifier
   */
  getLanguageByIdentifier(identifier: string): IDictionary | undefined {
    const exactMatch = this.dictionaries.find(l => l.id === identifier);
    if (exactMatch) {
      return exactMatch;
    }
    // approximate matches support transition from the 0.5 version (and older)
    // that used incorrect codes as language identifiers
    const approximateMatch = this.dictionaries.find(
      l => l.id.toLowerCase() === identifier.replace('-', '_').toLowerCase()
    );
    if (approximateMatch) {
      console.warn(
        `Language identifier ${identifier} has a non-exact match, please update it to ${approximateMatch.id}`
      );
      return approximateMatch;
    }
  }
}

class StatusWidget extends ReactWidget {
  language_source: () => string;

  constructor(source: () => string) {
    super();
    this.language_source = source;
  }

  protected render() {
    return TextItem({ source: this.language_source() });
  }
}

/**
 * SpellChecker
 */
class SpellChecker {
  dictionary: any;
  suggestions_menu: Menu | null = null;
  status_widget: StatusWidget;
  status_msg: string;

  // Default Options
  check_spelling = true;
  language: IDictionary | undefined;
  language_manager: LanguageManager;
  ignored_tokens: Set<string> = new Set();
  settings: ISettingRegistry.ISettings | null = null;
  accepted_types: string[] = [];
  protected wordRegex = /([^-[\]{}():/!;&@$£%§<>"*+=?.,~\\^|_`#±\s\t])+/g;
  private _trans: TranslationBundle;
  readonly TEXT_SUGGESTIONS_AVAILABLE: string;
  readonly TEXT_NO_SUGGESTIONS: string;
  readonly PALETTE_CATEGORY: string;
  private _invalidate: StateEffectType<void>;
  private _invalidationCounter: StateField<number>;
  private _active = true;
  private _latestMimeType = '';

  constructor(
    protected app: JupyterFrontEnd,
    protected settingRegistry: ISettingRegistry,
    protected editorExtensionRegistry: IEditorExtensionRegistry,
    translator: ITranslator,
    protected palette?: ICommandPalette | null,
    protected statusBar?: IStatusBar | null,
    protected editorLanguages?: IEditorLanguageRegistry | null
  ) {
    // use the language_manager
    this.language_manager = new LanguageManager(settingRegistry);
    this._trans = translator.load('jupyterlab-spellchecker');

    this.status_msg = this._trans.__('Dictionary not loaded');
    this.TEXT_SUGGESTIONS_AVAILABLE = this._trans.__('Adjust spelling to');
    this.TEXT_NO_SUGGESTIONS = this._trans.__('No spellcheck suggestions');
    this.PALETTE_CATEGORY = this._trans.__('Spell Checker');

    // read the settings
    this.setup_settings();

    // setup the static content of the spellchecker UI
    this.setup_button();
    this.setup_suggestions();
    this.status_widget = new StatusWidget(() => {
      if (this._active) {
        return this.status_msg;
      } else {
        return this._trans.__('Spellcheck off');
      }
    });
    this.status_widget.addClass('jp-mod-highlighted');
    this.setup_language_picker();
    this.setup_ignore_action();
    this._invalidate = StateEffect.define<void>();
    this._invalidationCounter = StateField.define<number>({
      create: () => 0,
      update: (value, tr) => {
        for (const e of tr.effects) {
          if (e.is(this._invalidate)) {
            value += 1;
          }
        }
        return value;
      }
    });

    this.editorExtensionRegistry.addExtension({
      name: 'spellchecker',
      factory: options => {
        const spellchecker = linter(
          (view: EditorView) => {
            const check = this._switchContentType(options.model.mimeType);

            if (!check) {
              return [];
            }

            const isPlain = options.model.mimeType === 'text/plain';
            const checkComments =
              this.settings?.composite?.checkComments || true;
            const checkStrings =
              this.settings?.composite?.checkStrings || false;
            const diagnostics: Diagnostic[] = [];

            let tree = ensureSyntaxTree(view.state, view.state.doc.length);
            if (!tree) {
              tree = syntaxTree(view.state);
            }

            const content = [...view.state.sliceDoc(0, view.state.doc.length)];
            const commentTypes = new Set([
              'comment', // Python
              'blockcomment', // C-like languages
              'linecomment' // C-like languages
            ]);

            tree.iterate({
              mode: IterMode.IncludeAnonymous,
              enter: node => {
                const isLeaf = node.node.firstChild === null;

                if (isLeaf) {
                  const nodeType = node.name.toLowerCase();
                  if (
                    (checkComments && commentTypes.has(nodeType)) ||
                    (checkStrings && nodeType === 'string') ||
                    (isPlain && nodeType === '⚠') ||
                    nodeType === 'paragraph' ||
                    nodeType === 'document' // required for LaTeX
                  ) {
                    // do not mask these
                    return false;
                  }
                  // mask everything else
                  for (let i = node.from; i < node.to; i++) {
                    content[i] = ' ';
                  }
                }

                return true;
              }
            });

            for (const match of content.join('').matchAll(this.wordRegex)) {
              const word = match[0].replace(/(^')|('$)/g, '');
              if (
                word !== '' &&
                !word.match(/^\d+$/) &&
                this.dictionary !== undefined &&
                !this.dictionary.check(word) &&
                !this.ignored_tokens.has(word)
              ) {
                diagnostics.push({
                  from: match.index!,
                  to: match.index! + word.length,
                  severity: 'spell' as any,
                  message: ''
                  // Using "actions" could provide nicer UX for replacing the
                  // misspelt word with one of suggestions; the challenge is
                  // in making it only search for suggestions when tooltip
                  // gets open to avoid performance penalty.
                });
              }
            }

            return diagnostics;
          },
          {
            delay: (this.settings?.composite?.debounceTime as number) || 200,
            // disable tooltips (default positioning is off)
            tooltipFilter: () => [],
            needsRefresh: update => {
              const previous = update.startState.field(
                this._invalidationCounter
              );
              const current = update.state.field(this._invalidationCounter);
              return previous !== current;
            }
          }
        );

        const focusTracker = EditorView.domEventHandlers({
          focus: () => {
            this._switchContentType(options.model.mimeType);
          }
        });

        return EditorExtensionRegistry.createImmutableExtension([
          spellchecker,
          this._invalidationCounter,
          focusTracker
        ]);
      }
    });
  }

  /**
   * Update state to reflect spellchecker status, record MIME type in use.
   *
   * Returns true if spelling is enabled.
   */
  private _switchContentType(mimeType: string): boolean {
    const check = this.accepted_types.includes(mimeType);
    this._latestMimeType = mimeType;

    if (this._active !== check) {
      this._active = check;
      this.status_widget.update();
    }
    return check;
  }

  // move the load_dictionary into the setup routine, because then
  // we know that the values are set correctly!
  setup_settings() {
    Promise.all([
      this.settingRegistry.load(extension.id),
      this.app.restored,
      this.language_manager.ready
    ])
      .then(([settings]) => {
        this.update_settings(settings);
        settings.changed.connect(() => {
          this.update_settings(settings);
        });
      })
      .catch((reason: Error) => {
        console.error(reason.message);
      });
  }

  protected _set_theme(name: string) {
    document.body.setAttribute('data-jp-spellchecker-theme', name);
  }

  update_settings(settings: ISettingRegistry.ISettings) {
    this.settings = settings;
    const tokens = settings.get('ignore').composite as Array<string>;
    this.ignored_tokens = new Set(tokens);
    this.accepted_types = settings.get('mimeTypes').composite as Array<string>;
    const theme = settings.get('theme').composite as string;
    this._set_theme(theme);

    // read the saved language setting
    const language_id = settings.get('language').composite as string;
    const user_language =
      this.language_manager.getLanguageByIdentifier(language_id);
    if (user_language === undefined) {
      console.warn('The language ' + language_id + ' is not supported!');
    } else {
      if (user_language === this.language) {
        return;
      }
      this.language = user_language;
      // load the dictionary
      this.load_dictionary().catch(console.warn);
    }
  }

  toggle_spellcheck() {
    this.check_spelling = !this.check_spelling;
    console.log('Spell checking is currently: ', this.check_spelling);
  }

  setup_button() {
    this.app.commands.addCommand(CommandIDs.toggle, {
      label: this._trans.__('Toggle spellchecker'),
      execute: () => {
        this.toggle_spellcheck();
      }
    });
    if (this.palette) {
      this.palette.addItem({
        command: CommandIDs.toggle,
        category: this.PALETTE_CATEGORY
      });
    }
  }

  get_contextmenu_context(): IContext | null {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const event = this.app._contextMenuEvent as MouseEvent;
    const target = event.target as HTMLElement;
    const code_mirror_wrapper: any = target.closest('.cm-content');
    if (code_mirror_wrapper === null) {
      return null;
    }
    const editorView = code_mirror_wrapper.cmView.view as EditorView;
    const offset = editorView.posAtCoords({
      x: event.clientX,
      y: event.clientY
    });

    if (!offset) {
      return null;
    }

    return {
      editorView,
      offset
    };
  }

  /**
   * This is different from token as implemented in CodeMirror
   * and needed because Markdown does not tokenize words
   * (each letter outside of markdown features is a separate token!)
   */
  get_current_word(context: IContext): IWord {
    const { editorView, offset } = context;
    const range = editorView.state.wordAt(offset)!;
    return {
      range,
      text: editorView.state.sliceDoc(range.from, range.to)
    };
  }

  setup_suggestions() {
    this.suggestions_menu = new Menu({ commands: this.app.commands });
    this.suggestions_menu.title.label = this.TEXT_SUGGESTIONS_AVAILABLE;
    this.suggestions_menu.title.icon = spellcheckIcon.bindprops({
      stylesheet: 'menuItem'
    });

    // this command is not meant to be show - it is just menu trigger detection hack
    this.app.commands.addCommand(CommandIDs.updateSuggestions, {
      execute: args => {
        // no-op
      },
      isVisible: args => {
        this.prepare_suggestions();
        return false;
      }
    });
    this.app.contextMenu.addItem({
      selector: '.cm-lintRange-spell',
      command: CommandIDs.updateSuggestions
    });
    // end of the menu trigger detection hack

    this.app.contextMenu.addItem({
      selector: '.cm-lintRange-spell',
      submenu: this.suggestions_menu,
      type: 'submenu'
    });
    this.app.commands.addCommand(CommandIDs.applySuggestion, {
      execute: args => {
        this.apply_suggestion(args['name'] as string);
      },
      label: args => args['name'] as string
    });
  }

  setup_ignore_action() {
    this.app.commands.addCommand(CommandIDs.ignoreWord, {
      execute: () => {
        this.ignore();
      },
      label: this._trans.__('Ignore')
    });

    this.app.contextMenu.addItem({
      selector: '.cm-lintRange-spell',
      command: CommandIDs.ignoreWord
    });
  }

  async ignore() {
    const context = this.get_contextmenu_context();

    if (context === null) {
      console.log(
        'Could not ignore the word as the context was no longer available'
      );
    } else {
      const word = this.get_current_word(context);
      await this.settings!.set('ignore', [
        word.text.trim(),
        ...(this.settings!.get('ignore').composite as Array<string>)
      ]);
      this.load_dictionary();
      // force refresh editor to remove underline for now ignored word
      context.editorView.dispatch({
        effects: this._invalidate.of()
      });
    }
  }

  prepare_suggestions() {
    const context = this.get_contextmenu_context();
    let suggestions: string[];
    if (context === null) {
      // no context (e.g. the edit was applied and the token is no longer in DOM,
      // so we cannot find the parent editor
      suggestions = [];
    } else {
      const word = this.get_current_word(context);
      suggestions = this.dictionary.suggest(word.text);
    }
    const suggestions_menu = this.suggestions_menu;
    if (suggestions_menu === null) {
      throw Error('Suggestions menu not assigned');
    }
    suggestions_menu.clearItems();

    if (suggestions.length) {
      for (const suggestion of suggestions) {
        suggestions_menu.addItem({
          command: CommandIDs.applySuggestion,
          args: { name: suggestion }
        });
      }
      suggestions_menu.title.label = this.TEXT_SUGGESTIONS_AVAILABLE;
      suggestions_menu.title.className = '';
      suggestions_menu.setHidden(false);
    } else {
      suggestions_menu.title.className = 'lm-mod-disabled';
      suggestions_menu.title.label = this.TEXT_NO_SUGGESTIONS;
      suggestions_menu.setHidden(true);
    }
  }

  apply_suggestion(replacement: string) {
    const context = this.get_contextmenu_context();
    if (context === null) {
      console.warn(
        'Applying suggestion failed (probably was already applied earlier)'
      );
      return;
    }
    const word = this.get_current_word(context);
    const view = context.editorView;

    view.dispatch({
      changes: [
        {
          from: word.range.from,
          to: word.range.to,
          insert: replacement
        }
      ]
    });
  }

  load_dictionary() {
    const language = this.language;
    if (!language) {
      return new Promise((accept, reject) =>
        reject('Cannot load dictionary: no language set')
      );
    }
    this.status_msg = this._trans.__('Loading dictionary…');
    this.status_widget.update();
    return Promise.all([
      fetch(language.aff).then(res => res.text()),
      fetch(language.dic).then(res => res.text())
    ]).then(values => {
      this.dictionary = new Typo(language.name, values[0], values[1]);
      console.debug('Dictionary Loaded ', language.name, language.id);

      this.status_msg = language.name;
      // update the complete UI
      this.status_widget.update();
    });
  }

  choose_language() {
    const choices = this.language_manager.getChoices(this.language);

    const choiceStrings = choices.map(
      // note: two dictionaries may exist for a language with the same name,
      // so we append the actual id of the dictionary in the square brackets.
      dictionary =>
        dictionary.isOnline
          ? this._trans.__('%1 [%2] (online)', dictionary.name, dictionary.id)
          : this._trans.__('%1 [%2]', dictionary.name, dictionary.id)
    );

    InputDialog.getItem({
      title: this._trans.__('Choose spellchecker language'),
      items: choiceStrings
    }).then(value => {
      if (value.value !== null) {
        const index = choiceStrings.indexOf(value.value);
        const lang = this.language_manager.getLanguageByIdentifier(
          choices[index].id
        );
        if (!lang) {
          console.error(
            'Language could not be matched - please report this as an issue'
          );
          return;
        }
        this.language = lang;
        // the setup routine will load the dictionary
        this.settings!.set('language', this.language.id).catch(console.warn);
      }
    });
  }

  async maybeEnableSpelling(mimeType: string) {
    let language = mimeType;
    if (this.editorLanguages) {
      const editorLang = this.editorLanguages.findByMIME(mimeType);
      if (editorLang) {
        if (editorLang.displayName) {
          language = editorLang.displayName;
        } else {
          language = editorLang.name;
        }
      }
    }

    const response = await showDialog({
      title: this._trans.__('Enable spellchecking in %1?', language),
      body: this._trans.__(
        'The will apply to all editors with %1 content type.',
        mimeType
      ),
      buttons: [
        Dialog.okButton({ label: this._trans.__('Enable') }),
        Dialog.cancelButton()
      ],
      checkbox: {
        label: this._trans.__('Remember this decision.')
      }
    });
    if (response.button.accept === true) {
      this.accepted_types.push(mimeType);
      if (response.isChecked) {
        const rememberedMimeTypes = this.settings!.get('mimeTypes')
          .composite as string[];
        rememberedMimeTypes.push(mimeType);
        await this.settings!.set('mimeTypes', rememberedMimeTypes);
      }
    }
  }

  setup_language_picker() {
    this.status_widget.node.onclick = () => {
      if (!this._active && this._latestMimeType) {
        return this.maybeEnableSpelling(this._latestMimeType);
      }
      this.choose_language();
    };
    this.app.commands.addCommand(CommandIDs.chooseLanguage, {
      execute: args => this.choose_language(),
      label: this._trans.__('Choose spellchecker language')
    });

    if (this.palette) {
      this.palette.addItem({
        command: CommandIDs.chooseLanguage,
        category: this.PALETTE_CATEGORY
      });
    }

    if (this.statusBar) {
      this.statusBar.registerStatusItem('spellchecker:choose-language', {
        align: 'right',
        item: this.status_widget
      });
    }
  }
}

/**
 * Activate extension
 */
function activate(
  app: JupyterFrontEnd,
  settingRegistry: ISettingRegistry,
  editorExtensionRegistry: IEditorExtensionRegistry,
  translator: ITranslator | null,
  palette: ICommandPalette | null,
  statusBar: IStatusBar | null,
  editorLanguages: IEditorLanguageRegistry | null
): void {
  console.debug('Attempting to load spellchecker');
  const sp = new SpellChecker(
    app,
    settingRegistry,
    editorExtensionRegistry,
    translator || nullTranslator,
    palette,
    statusBar,
    editorLanguages
  );
  console.debug('Spellchecker loaded ', sp);
}

/**
 * Initialization data for the jupyterlab_spellchecker extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab-contrib/spellchecker:plugin',
  autoStart: true,
  requires: [ISettingRegistry, IEditorExtensionRegistry],
  optional: [ITranslator, ICommandPalette, IStatusBar, IEditorLanguageRegistry],
  activate: activate
};

export default extension;
