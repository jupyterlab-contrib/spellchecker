import {
    JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
    IEditorTracker
} from '@jupyterlab/fileeditor';

import {
    INotebookTracker
} from '@jupyterlab/notebook';


import {
  ICommandPalette
} from '@jupyterlab/apputils';


import '../style/index.css';

import * as CodeMirror from 'codemirror';

declare function require(name:string): any;
let Typo = require("typo-js");

/**
 * SpellChecker
 */
class SpellChecker {
    dictionary: any;
    dict_promise: any;
    app: JupyterLab;
    tracker: INotebookTracker;
    palette: ICommandPalette;
    editor_tracker: IEditorTracker;

    // Default Options
    check_spelling: boolean = true;
    aff_url: string = 'https://cdn.jsdelivr.net/codemirror.spell-checker/latest/en_US.aff';
    dict_url: string = 'https://cdn.jsdelivr.net/codemirror.spell-checker/latest/en_US.dic';
    lang_code: string = "en_Us";
    rx_word_char: RegExp     = /[^-\[\]{}():\/!;&@$£%§<>"*+=?.,~\\^|_`#±\s\t]/;
    rx_non_word_char: RegExp =  /[-\[\]{}():\/!;&@$£%§<>"*+=?.,~\\^|_`#±\s\t]/;
    accepted_types = [
        'text/plain',
        'text/x-ipythongfm',   // IPython GFM = GitHub Flavored Markdown, applies to all .md files
    ];

    constructor(app: JupyterLab, notebook_tracker: INotebookTracker, palette: ICommandPalette, editor_tracker: IEditorTracker){
        this.app = app;
        this.tracker = notebook_tracker;
        this.editor_tracker = editor_tracker;
        this.palette = palette;
        this.setup_button();
        this.load_dictionary();
        this.tracker.activeCellChanged.connect(this.onActiveCellChanged, this);

        this.editor_tracker.widgetAdded.connect((sender, widget) => {

            let file_editor = widget.content;

            if (this.accepted_types.indexOf(file_editor.model.mimeType) !== -1) {
                let editor = this.extract_editor(file_editor);
                this.setup_overlay(editor);
            }
        });
    }

    onActiveCellChanged(): void {
        let active_cell = this.tracker.activeCell;

        if ((active_cell !== null) && (active_cell.model.type == "markdown")) {
            let editor = this.extract_editor(active_cell);
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

    load_dictionary(){
        this.dict_promise = Promise.all([
            fetch(this.aff_url).then(res=>res.text()),
            fetch(this.dict_url).then(res=>res.text())
        ]).then((values) => {
            this.dictionary = new Typo(this.lang_code, values[0], values[1]);
            console.log("Dictionary Loaded ", this.lang_code);
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
}


/**
 * Activate extension
 */
function activate(app: JupyterLab, tracker: INotebookTracker, palette: ICommandPalette, editor_tracker: IEditorTracker) {
    console.log('Attempting to load spellchecker');
    const sp = new SpellChecker(app, tracker, palette, editor_tracker);
    console.log("Spellchecker Loaded ", sp);
};


/**
 * Initialization data for the jupyterlab_spellchecker extension.
 */
const extension: JupyterLabPlugin<void> = {
    id: 'jupyterlab_spellchecker',
    autoStart: true,
    requires: [INotebookTracker, ICommandPalette, IEditorTracker],
    activate: activate
};

export default extension;
