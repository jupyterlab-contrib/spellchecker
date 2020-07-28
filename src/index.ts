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
    ICommandPalette, InputDialog, ReactWidget
} from '@jupyterlab/apputils';


import '../style/index.css';

import * as CodeMirror from 'codemirror';
import { IStatusBar, TextItem } from "@jupyterlab/statusbar";

declare function require(name:string): any;
let Typo = require("typo-js");

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
import { Cell } from "@jupyterlab/cells";


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

    extract_editor(cell_or_editor: any): any {
        let editor_temp: any = cell_or_editor.editor;
        return editor_temp._editor;
    }

    setup_overlay(editor: any, retry=true): void {
        let current_mode: string = editor.getOption("mode");

        if (current_mode == "null"){
            if(retry) {
                setTimeout(() => this.setup_overlay(editor, false), 0)
            }
            return;
        }

        if (this.check_spelling){
            editor.setOption("mode", this.define_mode(current_mode));
        }else{
            let original_mode = (current_mode.match(/^spellcheck_/)) ? current_mode.substr(11) : current_mode
            editor.setOption("mode", original_mode);
        }
    }

    toggle_spellcheck(){
        this.check_spelling = ! this.check_spelling;
        console.log("Spell checking is currently: ", this.check_spelling);
    }

    setup_button(){
        const command = "spellchecker:toggle-check-spelling";
        this.app.commands.addCommand(command,{
            label: "Check Spelling",
            execute: () => {
                this.toggle_spellcheck();
            }
        });
        this.palette.addItem( {command, category: "Toggle Spell Checker"} );
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
                    if (stream.eatWhile(me.rx_word_char)){
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
