import {
    JupyterFrontEnd, JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
    FileEditor,
    IEditorTracker
} from '@jupyterlab/fileeditor';

import {
    INotebookTracker
} from '@jupyterlab/notebook';

import {
    LabIcon
} from '@jupyterlab/ui-components';

import {
    ICommandPalette, InputDialog, ReactWidget
} from '@jupyterlab/apputils';

import {
  Menu
} from '@lumino/widgets';

import '../style/index.css';

import * as CodeMirror from 'codemirror';
import { IStatusBar, TextItem } from "@jupyterlab/statusbar";

import spellcheckSvg from '../style/icons/ic-baseline-spellcheck.svg';
import { Cell } from "@jupyterlab/cells";

export const spellcheckIcon = new LabIcon({
    name: 'spellcheck:spellcheck',
    svgstr: spellcheckSvg
});

declare function require(name:string): any;
let Typo = require("typo-js");

const CMD_TOGGLE = "spellchecker:toggle-check-spelling";
const CMD_APPLY_SUGGESTION = "spellchecker:apply-suggestion";

const TEXT_SUGGESTIONS_AVAILABLE = 'Adjust spelling to'
const TEXT_NO_SUGGESTIONS = 'No spellcheck suggestions'

interface IWord {
    line: number;
    start: number;
    end: number;
    text: string;
}

interface IContext {
    editor: CodeMirror.Editor;
    position: CodeMirror.Position;
}

interface ILanguage {
    code: string;
    name: string;
    aff: string;
    dic: string;
}

// English dictionaries come from https://github.com/en-wl/wordlist
import en_aff from 'file-loader!../dictionaries/en_US.aff';
import en_dic from 'file-loader!../dictionaries/en_US.dic';

import en_gb_aff from 'file-loader!../dictionaries/en_GB-ise.aff';
import en_gb_dic from 'file-loader!../dictionaries/en_GB-ise.dic';

import en_ca_aff from 'file-loader!../dictionaries/en_CA.aff';
import en_ca_dic from 'file-loader!../dictionaries/en_CA.dic';

import en_au_aff from 'file-loader!../dictionaries/en_AU.aff';
import en_au_dic from 'file-loader!../dictionaries/en_AU.dic';


const languages: ILanguage[] = [
    {code: 'en-us', name: 'English (American)', aff: en_aff, dic: en_dic},
    {code: 'en-gb', name: 'English (British)', aff: en_gb_aff, dic: en_gb_dic},
    {code: 'en-ca', name: 'English (Canadian)', aff: en_ca_aff, dic: en_ca_dic},
    {code: 'en-au', name: 'English (Australian)', aff: en_au_aff, dic: en_au_dic},
]

class StatusWidget extends ReactWidget {

    language_source: () => string;

    constructor(source: () => string) {
        super();
        this.language_source = source
    }

    protected render() {
        return TextItem({source: this.language_source()});
    }
}

/**
 * SpellChecker
 */
class SpellChecker {
    dictionary: any;
    app: JupyterFrontEnd;
    tracker: INotebookTracker;
    palette: ICommandPalette;
    editor_tracker: IEditorTracker;
    suggestions_menu: Menu;
    status_bar: IStatusBar;
    status_widget: StatusWidget;

    // Default Options
    check_spelling: boolean = true;
    language: ILanguage;
    rx_word_char: RegExp     = /[^-\[\]{}():\/!;&@$£%§<>"*+=?.,~\\^|_`#±\s\t]/;
    rx_non_word_char: RegExp =  /[-\[\]{}():\/!;&@$£%§<>"*+=?.,~\\^|_`#±\s\t]/;
    accepted_types = [
        'text/plain',
        'text/x-ipythongfm',   // IPython GFM = GitHub Flavored Markdown, applies to all .md files
    ];

    constructor(
      app: JupyterFrontEnd, notebook_tracker: INotebookTracker, palette: ICommandPalette,
      editor_tracker: IEditorTracker, status_bar: IStatusBar
    ){
        this.language = languages[0];
        this.app = app;
        this.tracker = notebook_tracker;
        this.editor_tracker = editor_tracker;
        this.palette = palette;
        this.status_bar = status_bar;
        this.setup_button();
        this.setup_suggestions();
        this.setup_language_picker();
        this.load_dictionary().catch(console.warn);
        this.tracker.activeCellChanged.connect(() => this.setup_cell_editor(this.tracker.activeCell));
        this.editor_tracker.widgetAdded.connect((sender, widget) => this.setup_file_editor(widget.content));
    }

    setup_file_editor(file_editor: FileEditor): void {
        if (this.accepted_types.indexOf(file_editor.model.mimeType) !== -1) {
            let editor = this.extract_editor(file_editor);
            this.setup_overlay(editor);
        }
    }

    setup_cell_editor(cell: Cell): void {
        if ((cell !== null) && (cell.model.type == "markdown")) {
            let editor = this.extract_editor(cell);
            this.setup_overlay(editor);
        }
    }

    extract_editor(cell_or_editor: Cell | FileEditor): CodeMirror.Editor {
        let editor_temp = cell_or_editor.editor;
        // @ts-ignore
        return editor_temp._editor;
    }

    setup_overlay(editor: CodeMirror.Editor, retry=true): void {
        let current_mode = editor.getOption("mode") as string;

        if (current_mode == "null"){
            if(retry) {
                setTimeout(() => this.setup_overlay(editor, false), 0)
            }
            return;
        }

        if (this.check_spelling){
            editor.setOption("mode", this.define_mode(current_mode));
        } else{
            let original_mode = (current_mode.match(/^spellcheck_/)) ? current_mode.substr(11) : current_mode
            editor.setOption("mode", original_mode);
        }
    }

    toggle_spellcheck(){
        this.check_spelling = ! this.check_spelling;
        console.log("Spell checking is currently: ", this.check_spelling);
    }

    setup_button(){
        this.app.commands.addCommand(CMD_TOGGLE, {
            label: "Check Spelling",
            execute: () => {
                this.toggle_spellcheck();
            }
        });
        this.palette.addItem( {command: CMD_TOGGLE, category: "Toggle Spell Checker"} );
    }

    get_contextmenu_context(): IContext {
        // @ts-ignore
        let event = this.app._contextMenuEvent as MouseEvent;
        let target = event.target as HTMLElement;
        let code_mirror_wrapper: any = target.closest('.CodeMirror');
        let code_mirror = code_mirror_wrapper.CodeMirror as CodeMirror.Editor;
        let position = code_mirror.coordsChar({
            left: event.clientX,
            top: event.clientY
        }, );

        return {
            editor: code_mirror,
            position: position
        };
    }

    /**
     * This is different from token as implemented in CodeMirror
     * and needed because Markdown does not tokenize words
     * (each letter outside of markdown features is a separate token!)
     */
    get_current_word(): IWord {
        let { editor, position } = this.get_contextmenu_context();
        let line = editor.getDoc().getLine(position.line);
        let start = position.ch;
        while (start > 0 && line[start].match(this.rx_word_char)) {
            start--;
        }
        let end = position.ch;
        while (end < line.length && line[end].match(this.rx_word_char)) {
            end++;
        }
        return {
            line: position.line,
            start: start,
            end: end,
            text: line.substring(start, end)
        }
    }

    setup_suggestions() {
        this.suggestions_menu = new Menu({commands: this.app.commands});
        this.suggestions_menu.title.label = TEXT_SUGGESTIONS_AVAILABLE;
        this.suggestions_menu.title.icon = spellcheckIcon.bindprops({ stylesheet: 'menuItem' });
        let CMD_UPDATE_SUGGESTIONS = 'spellchecker:update-suggestions';

        // this command is not meant to be show - it is just menu trigger detection hack
        this.app.commands.addCommand(CMD_UPDATE_SUGGESTIONS, {
            execute: args => {},
            isVisible: (args) => {
                this.prepare_suggestions();
                return false;
            }
        });
        this.app.contextMenu.addItem({
            selector: '.cm-spell-error',
            command: CMD_UPDATE_SUGGESTIONS
        });
        // end of the menu trigger detection hack

        this.app.contextMenu.addItem({
            selector: '.cm-spell-error',
            submenu: this.suggestions_menu,
            type: 'submenu'
        });
        this.app.commands.addCommand(CMD_APPLY_SUGGESTION, {
            execute: args => {
                this.apply_suggestion(args['name'] as string);
            },
            label: args => args['name'] as string
        });
    }

    prepare_suggestions() {
        let word = this.get_current_word();
        let suggestions: string[] = this.dictionary.suggest(word.text);
        this.suggestions_menu.clearItems();

        if (suggestions.length) {
            for (let suggestion of suggestions) {
                this.suggestions_menu.addItem({
                    command: CMD_APPLY_SUGGESTION,
                    args: { name: suggestion }
                });
            }
            this.suggestions_menu.title.label = TEXT_SUGGESTIONS_AVAILABLE;
            this.suggestions_menu.title.className = ''
            this.suggestions_menu.setHidden(false)
        } else {
            this.suggestions_menu.title.className = 'lm-mod-disabled'
            this.suggestions_menu.title.label = TEXT_NO_SUGGESTIONS;
            this.suggestions_menu.setHidden(true)
        }
    }

    apply_suggestion(replacement: string) {
        let { editor } = this.get_contextmenu_context();
        let word = this.get_current_word();

        editor.getDoc().replaceRange(
          replacement,
          {
              ch: word.start,
              line: word.line
          },
          {
              ch: word.end,
              line: word.line
          }
        )
    }

    load_dictionary() {
        return Promise.all([
            fetch(this.language.aff).then(res => res.text()),
            fetch(this.language.dic).then(res => res.text())
        ]).then((values) => {
            this.dictionary = new Typo(this.language.name, values[0], values[1]);
            console.log("Dictionary Loaded ", this.language.name, this.language.code);
        });
    }

    define_mode = (original_mode_spec: string) => {
        if (original_mode_spec.indexOf("spellcheck_") == 0){
            return original_mode_spec;
        }
        var me = this;
        var new_mode_spec = 'spellcheck_' + original_mode_spec;
        CodeMirror.defineMode(new_mode_spec, (config:any) => {
            var spellchecker_overlay = {
                name: new_mode_spec,
                token: function (stream:any, state:any) {
                    if (stream.eatWhile(me.rx_word_char)) {
                        var word = stream.current().replace(/(^')|('$)/g, '');
                        if (!word.match(/^\d+$/) && (me.dictionary !== undefined) && !me.dictionary.check(word)) {
                            return 'spell-error';
                        }
                    }
                    stream.eatWhile(me.rx_non_word_char);
                    return null;
                }
            };
            return CodeMirror.overlayMode(
                CodeMirror.getMode(config, original_mode_spec), spellchecker_overlay, true);
        });
        return new_mode_spec;
    }

    choose_language() {
        // show the current language first, then all others
        const choices = [this.language, ...languages.filter(l => l.name != this.language.name)]

        InputDialog.getItem({
            title: 'Choose spellchecker language',
            items: choices.map(language => language.name)
        }).then(value => {
            if (value != null) {
                this.language = languages.filter(l => l.name == value.value)[0];
                this.load_dictionary().then(() => {
                    this.status_widget.update();

                    // update the active cell (if any)
                    if (this.tracker.activeCell != null) {
                        this.setup_cell_editor(this.tracker.activeCell);
                    }

                    // update the current file editor (if any)
                    if (this.editor_tracker.currentWidget != null) {
                        this.setup_file_editor(this.editor_tracker.currentWidget.content);
                    }
                });
            }
        });
    }

    setup_language_picker() {
        this.status_widget = new StatusWidget(() => this.language.name);
        this.status_widget.node.onclick = () => {
            this.choose_language();
        }
        this.status_bar.registerStatusItem(
          'spellchecker:choose-language',
          {
              align: 'right',
              item: this.status_widget
          }
        )

    }
}


/**
 * Activate extension
 */
function activate(app: JupyterFrontEnd, tracker: INotebookTracker, palette: ICommandPalette, editor_tracker: IEditorTracker, status_bar: IStatusBar) {
    console.log('Attempting to load spellchecker');
    const sp = new SpellChecker(app, tracker, palette, editor_tracker, status_bar);
    console.log("Spellchecker Loaded ", sp);
};


/**
 * Initialization data for the jupyterlab_spellchecker extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab_spellchecker',
    autoStart: true,
    requires: [INotebookTracker, ICommandPalette, IEditorTracker, IStatusBar],
    activate: activate
};

export default extension;
